import type { IExecuteFunctions, IHookFunctions } from 'n8n-workflow';
import { createHash } from 'crypto';

/**
 * Type for Bunq API context - supports both execution and hook contexts
 */
type BunqApiContext = IExecuteFunctions | IHookFunctions;

/**
 * Rate limit configuration for Bunq API
 * Based on: https://doc.bunq.com/#/rate-limiting
 */
export const RATE_LIMITS = {
	GET: {
		maxRequests: 3,
		windowMs: 3000, // 3 seconds
	},
	POST: {
		maxRequests: 5,
		windowMs: 3000, // 3 seconds
	},
	PUT: {
		maxRequests: 2,
		windowMs: 3000, // 3 seconds
	},
	SESSION_SERVER: {
		maxRequests: 1,
		windowMs: 30000, // 30 seconds
	},
};

/**
 * Rate limit state stored in module-level Map (process-wide)
 */
interface RateLimitState {
	windowStart: number;
	count: number;
	pendingPromise: Promise<void> | null;
}

/**
 * Module-level storage for rate limit state (shared across all workflows)
 * Key format: rateLimit:bunqApi:{credentialHash}:{method}
 */
const rateLimitState: Map<string, RateLimitState> = new Map();

/**
 * Sleep utility function
 * Uses a standard Promise with setTimeout, common in n8n nodes
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => {
		setTimeout(resolve, ms);
	});
}

/**
 * Enforces API rate limit for a specific endpoint and method.
 * Waits until the next request is allowed instead of throwing.
 * 
 * @param ctx - The n8n execution or hook context
 * @param method - The HTTP method (GET, POST, PUT, etc.)
 * @param url - The endpoint URL
 */
export async function enforceRateLimit(
	ctx: BunqApiContext,
	method: string,
	url: string,
): Promise<void> {
	// Get credentials to use as part of the rate limit key
	const creds = await ctx.getCredentials('bunqApi');

	if (!creds?.apiKey) {
		throw new Error('Missing API key in credentials for rate limit enforcement');
	}

	// Create a stable hash of the API key to use as credential identifier
	// This ensures rate limits are enforced per credential across all workflows
	const credentialHash = createHash('sha256')
		.update(creds.apiKey as string)
		.digest('hex')
		.substring(0, 16);

	// Determine which rate limit to apply
	// Extract the path for accurate endpoint detection (handle both relative and absolute URLs)
	let urlPath: string;
	try {
		// Try parsing as a full URL
		const parsedUrl = new URL(url, 'https://dummy.com');
		urlPath = parsedUrl.pathname;
	} catch {
		// If parsing fails, treat as a relative path and remove query params/fragments
		urlPath = url.split('?')[0].split('#')[0];
	}
	const isSessionServer = urlPath === '/session-server' || urlPath.endsWith('/session-server');
	let rateLimit: { maxRequests: number; windowMs: number };
	let key: string;

	if (isSessionServer) {
		// Special rate limit for session-server endpoint
		rateLimit = RATE_LIMITS.SESSION_SERVER;
		key = `rateLimit:bunqApi:${credentialHash}:session-server`;
	} else {
		// Per-method rate limits
		const upperMethod = method.toUpperCase();
		switch (upperMethod) {
			case 'GET':
				rateLimit = RATE_LIMITS.GET;
				break;
			case 'POST':
				rateLimit = RATE_LIMITS.POST;
				break;
			case 'PUT':
				rateLimit = RATE_LIMITS.PUT;
				break;
			default:
				// No rate limit for other methods (DELETE, PATCH, etc.)
				return;
		}
		key = `rateLimit:bunqApi:${credentialHash}:${upperMethod}`;
	}

	// Get or initialize rate limit state from module-level Map
	// This is process-wide storage that ensures rate limits are enforced across all workflows
	// for the same credential, as required by Bunq API's per-API-key limits.
	const now = Date.now();

	if (!rateLimitState.has(key)) {
		rateLimitState.set(key, {
			windowStart: now,
			count: 0,
			pendingPromise: null,
		});
		ctx.logger.debug(`Rate limit window started for ${key}`, {
			windowStart: now,
			maxRequests: rateLimit.maxRequests,
			windowMs: rateLimit.windowMs,
		});
	}

	const state = rateLimitState.get(key)!;

	// If there's already a pending wait, chain after it to serialize requests
	if (state.pendingPromise) {
		await state.pendingPromise;
	}

	// Reset window if expired
	if (now - state.windowStart >= rateLimit.windowMs) {
		ctx.logger.debug(`Rate limit window reset for ${key}`, {
			oldWindowStart: state.windowStart,
			newWindowStart: now,
			oldCount: state.count,
		});
		state.windowStart = now;
		state.count = 0;
	}

	// If limit reached → wait
	if (state.count >= rateLimit.maxRequests) {
		const waitMs = rateLimit.windowMs - (now - state.windowStart);

		if (waitMs > 0) {
			ctx.logger.debug(`Rate limit reached for ${key}, sleeping for ${waitMs}ms`, {
				currentCount: state.count,
				maxRequests: rateLimit.maxRequests,
				waitMs,
			});
			// Create a promise for this wait and store it so other requests can chain
			const waitPromise = sleep(waitMs);
			state.pendingPromise = waitPromise;
			await waitPromise;
			state.pendingPromise = null;
		}

		// Start new window after sleeping (use current time to account for any delays)
		const newWindowStart = Date.now();
		ctx.logger.debug(`Rate limit window reset after sleep for ${key}`, {
			oldWindowStart: state.windowStart,
			newWindowStart,
		});
		state.windowStart = newWindowStart;
		state.count = 0;
	}

	// Register this request
	state.count += 1;
}
