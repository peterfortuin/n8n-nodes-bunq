import type { IExecuteFunctions, IHookFunctions } from 'n8n-workflow';

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
 * Rate limit state stored in workflow static data
 */
interface RateLimitState {
	windowStart: number;
	count: number;
}

/**
 * Sleep utility function
 */
function sleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
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

	if (!creds?.id) {
		// No credentials = no rate limit enforcement
		return;
	}

	// Determine which rate limit to apply
	const isSessionServer = url.endsWith('/session-server');
	let rateLimit: { maxRequests: number; windowMs: number };
	let key: string;

	if (isSessionServer) {
		// Special rate limit for session-server endpoint
		rateLimit = RATE_LIMITS.SESSION_SERVER;
		key = `rateLimit:bunqApi:${creds.id}:session-server`;
	} else {
		// Per-method rate limits
		const upperMethod = method.toUpperCase();
		if (upperMethod === 'GET') {
			rateLimit = RATE_LIMITS.GET;
		} else if (upperMethod === 'POST') {
			rateLimit = RATE_LIMITS.POST;
		} else if (upperMethod === 'PUT') {
			rateLimit = RATE_LIMITS.PUT;
		} else {
			// No rate limit for other methods (DELETE, PATCH, etc.)
			return;
		}
		key = `rateLimit:bunqApi:${creds.id}:${upperMethod}`;
	}

	// Get or initialize rate limit state from workflow static data
	const staticData = ctx.getWorkflowStaticData('global');
	const now = Date.now();

	if (!staticData[key]) {
		staticData[key] = {
			windowStart: now,
			count: 0,
		} as RateLimitState;
	}

	const state = staticData[key] as RateLimitState;

	// Reset window if expired
	if (now - state.windowStart >= rateLimit.windowMs) {
		state.windowStart = now;
		state.count = 0;
	}

	// If limit reached → wait
	if (state.count >= rateLimit.maxRequests) {
		const waitMs = rateLimit.windowMs - (now - state.windowStart);

		if (waitMs > 0) {
			await sleep(waitMs);
		}

		// Reset window to the next expected window boundary
		state.windowStart = state.windowStart + rateLimit.windowMs;
		state.count = 0;
	}

	// Register this request
	state.count += 1;
}
