import { IExecuteFunctions, IHookFunctions, NodeApiError } from 'n8n-workflow';
import * as crypto from 'crypto';
import { BunqHttpClient } from './BunqHttpClient';
import { getErrorMessage } from './errorHelpers';
import packageJson from '../package.json';

/**
 * Module-level map that tracks in-progress session creation per credential.
 * Key: "{environment}:{credentialHash}"
 *
 * When two workflow runs detect an expired session simultaneously, the second
 * one waits for the first one's promise and reuses its result instead of
 * starting a redundant (and API-quota-consuming) creation flow.
 *
 * Note: this lock is process-local. Multi-worker n8n deployments can still
 * create duplicate sessions across worker boundaries, but the last writer
 * produces a valid session and Bunq accepts multiple concurrent sessions.
 */
const sessionCreationLocks: Map<string, Promise<IBunqSessionData>> = new Map();
const forceRecreateCreationLocks: Set<string> = new Set();

/**
 * Type for Bunq API context - supports both execution and hook contexts
 */
type BunqApiContext = IExecuteFunctions | IHookFunctions;

/**
 * Get the Bunq API base URL based on environment
 * @param environment - The environment ('sandbox' or 'production')
 * @returns The base URL for the specified environment
 * @throws Error if environment is invalid
 */
export function getBunqBaseUrl(environment: string): string {
  if (environment === 'sandbox') {
    return 'https://public-api.sandbox.bunq.com/v1';
  } else if (environment === 'production') {
    return 'https://api.bunq.com/v1';
  } else {
    throw new Error(`Invalid Bunq environment: ${environment}. Must be 'sandbox' or 'production'.`);
  }
}

/**
 * Sign data using RSA-SHA256
 */
export function signData(data: string, privateKey: string): string {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

/**
 * Create installation with Bunq API
 * @param publicKey - The client's public key for installation
 * @returns Installation token and server public key
 */
export async function createInstallation(
  this: BunqApiContext,
  publicKey: string
): Promise<{ token: string; serverPublicKey: string }> {
  const payload = JSON.stringify({ client_public_key: publicKey });

  const client = new BunqHttpClient(this);
  const response = await client.request({
    method: 'POST',
    url: '/installation',
    body: payload,
  });

  // Extract token and server public key from response
  const responseData = response.Response;
  let token = '';
  let serverPublicKey = '';

  for (const item of responseData) {
    if (item.Token) {
      token = item.Token.token;
    }
    if (item.ServerPublicKey) {
      serverPublicKey = item.ServerPublicKey.server_public_key;
    }
  }

  if (!token || !serverPublicKey) {
    throw new NodeApiError(this.getNode(), {
      message: 'Failed to extract installation token or server public key from response',
      description: 'The installation response did not contain the expected data',
    });
  }

  return { token, serverPublicKey };
}

/**
 * Register device with Bunq API
 * Note: By omitting the permitted_ips field, Bunq will automatically lock the device
 * to the IP address of the caller. This provides better security but requires that
 * API calls come from the same IP address. If your IP changes (e.g., dynamic IPs,
 * mobile networks, VPN), you'll need to re-register the device.
 * @param installationToken - Token from installation step
 * @param apiKey - The Bunq API key
 * @returns Device ID
 */
export async function registerDevice(
  this: BunqApiContext,
  installationToken: string,
  apiKey: string
): Promise<string> {
  // Use package name and version for device description
  const serviceName = `${packageJson.name}/${packageJson.version}`;
  
  // By not including permitted_ips, Bunq automatically locks device to caller's IP
  const payload = JSON.stringify({
    description: serviceName,
    secret: apiKey,
  });

  const client = new BunqHttpClient(this);
  const response = await client.request({
    method: 'POST',
    url: '/device-server',
    body: payload,
    sessionToken: installationToken,
  });

  // Extract device ID from response
  const responseData = response.Response;
  let deviceId = '';

  for (const item of responseData) {
    if (item.Id) {
      deviceId = item.Id.id.toString();
    }
  }

  if (!deviceId) {
    throw new NodeApiError(this.getNode(), {
      message: 'Failed to extract device ID from response',
      description: 'The device registration response did not contain the expected data',
    });
  }

  return deviceId;
}

/**
 * Create session with Bunq API
 * @param installationToken - Token from installation step
 * @param apiKey - The Bunq API key
 * @returns Session token, user ID, and session timeout (in seconds)
 */
export async function createSession(
  this: BunqApiContext,
  installationToken: string,
  apiKey: string
): Promise<{ token: string; userId: string; sessionTimeout: number }> {
  const payload = JSON.stringify({ secret: apiKey });

  const client = new BunqHttpClient(this);
  const response = await client.request({
    method: 'POST',
    url: '/session-server',
    body: payload,
    sessionToken: installationToken,
  });

  // Extract token, user ID, and session timeout from response
  const responseData = response.Response;
  let token = '';
  let userId = '';
  let sessionTimeout = 604800; // Default to 7 days (in seconds) if not provided

  for (const item of responseData) {
    if (item.Token) {
      token = item.Token.token;
    }
    if (item.UserPerson) {
      userId = item.UserPerson.id.toString();
      if (item.UserPerson.session_timeout) {
        sessionTimeout = item.UserPerson.session_timeout;
      }
    } else if (item.UserCompany) {
      userId = item.UserCompany.id.toString();
      if (item.UserCompany.session_timeout) {
        sessionTimeout = item.UserCompany.session_timeout;
      }
    } else if (item.UserApiKey) {
      userId = item.UserApiKey.id.toString();
      if (item.UserApiKey.session_timeout) {
        sessionTimeout = item.UserApiKey.session_timeout;
      }
    }
  }

  if (!token) {
    throw new NodeApiError(this.getNode(), {
      message: 'Failed to extract session token from response',
      description: 'The session response did not contain the expected data',
    });
  }

  return { token, userId, sessionTimeout };
}

/**
 * Check if session is expired based on user-configured session timeout
 * @param createdAt - Timestamp when the session was created (in milliseconds)
 * @param sessionTimeout - Session timeout from Bunq configuration (in seconds)
 * @returns True if session is expired (exceeded 50% of maximum allowed time)
 */
export function isSessionExpired(createdAt: number, sessionTimeout?: number): boolean {
  // Use 50% of the session timeout as safety margin
  // Default to 7 days (604800 seconds) if sessionTimeout is not provided
  const timeoutSeconds = sessionTimeout || 604800;
  const maxAge = (timeoutSeconds * 0.5) * 1000; // Convert to milliseconds and apply 50% safety margin
  return (Date.now() - createdAt) > maxAge;
}

/**
 * Session data interface
 */
export interface IBunqSessionData {
  installationToken?: string;
  serverPublicKey?: string;
  deviceServerId?: string;
  sessionToken?: string;
  sessionCreatedAt?: number;
  sessionTimeout?: number;
  userId?: string;
  environment?: string;
}

/**
 * Ensures a valid Bunq session exists or creates one if needed.
 * Manages the complete session lifecycle including installation, device registration, and session creation.
 * @param this - The Bunq API context (IExecuteFunctions or IHookFunctions)
 * @param forceRecreate - If true, forces recreation of all session data
 * @returns Session data with all tokens and IDs
 */
export async function ensureBunqSession(
  this: BunqApiContext,
  forceRecreate: boolean = false
): Promise<IBunqSessionData> {
  // Retrieve credentials from context
  const credentials = await this.getCredentials('bunqApi');

  const apiKey = credentials.apiKey as string;
  const publicKey = credentials.publicKey as string;
  const environment = credentials.environment as string;

  // Build a per-credential lock key using the API key and public key so
  // credentials that share an API key but use different keypairs do not
  // share installation/session creation locks.
  const credentialLockMaterial = `${apiKey}:${publicKey}`;
  const credHash = crypto
    .createHash('sha256')
    .update(credentialLockMaterial)
    .digest('hex')
    .substring(0, 16);
  const lockKey = `${environment}:${credHash}`;

  // Get or initialize session data from workflow static data
  // Use 'global' scope to share session across all Bunq nodes in the workflow
  const workflowStaticData = this.getWorkflowStaticData('global');
  let sessionData: IBunqSessionData = workflowStaticData.bunqSession as IBunqSessionData || {};

  // If a force-recreate flow is already running, always wait for it first so
  // callers don't return stale cached session data while credentials are being rebuilt.
  const inFlightCreation = sessionCreationLocks.get(lockKey);
  const shouldWaitForInFlightCreation =
    forceRecreate || forceRecreateCreationLocks.has(lockKey);
  if (inFlightCreation && shouldWaitForInFlightCreation) {
    await inFlightCreation;
    sessionData = workflowStaticData.bunqSession as IBunqSessionData || {};
  }

  // If force recreate is true, clear all session data
  if (forceRecreate) {
    sessionData = {};
    workflowStaticData.bunqSession = sessionData;
  }

  // Fast path: everything is valid and no creation needed
  const needsInstallation = !sessionData.installationToken || !sessionData.serverPublicKey;
  const needsDevice = !sessionData.deviceServerId;
  const needsSession =
    !sessionData.sessionToken ||
    !sessionData.sessionCreatedAt ||
    isSessionExpired(sessionData.sessionCreatedAt, sessionData.sessionTimeout);

  if (!needsInstallation && !needsDevice && !needsSession) {
    sessionData.environment = environment;
    return sessionData;
  }

  // If another concurrent call is already creating/refreshing the session for
  // this credential, wait for it and return its result.  This prevents
  // redundant installation/device/session-server calls when multiple nodes
  // or workflow runs detect an expired session at the same time.
  const existingCreation = sessionCreationLocks.get(lockKey);
  if (existingCreation && !forceRecreate) {
    return await existingCreation;
  }

  // We are the first caller to need a session; run the creation flow and let
  // any concurrent callers await the same promise.
  const creationPromise = (async (): Promise<IBunqSessionData> => {
    // Step 1: Create installation if needed
    if (!sessionData.installationToken || !sessionData.serverPublicKey) {
      const installationResult = await createInstallation.call(this, publicKey);
      sessionData.installationToken = installationResult.token;
      sessionData.serverPublicKey = installationResult.serverPublicKey;
      workflowStaticData.bunqSession = sessionData;
    }

    // Step 2: Register device if needed
    if (!sessionData.deviceServerId) {
      const deviceId = await registerDevice.call(
        this,
        sessionData.installationToken!,
        apiKey
      );
      sessionData.deviceServerId = deviceId;
      workflowStaticData.bunqSession = sessionData;
    }

    // Step 3: Create session if needed or if expired
    const shouldCreateSession =
      !sessionData.sessionToken ||
      !sessionData.sessionCreatedAt ||
      isSessionExpired(sessionData.sessionCreatedAt, sessionData.sessionTimeout);

    if (shouldCreateSession) {
      try {
        const sessionResult = await createSession.call(
          this,
          sessionData.installationToken!,
          apiKey
        );
        sessionData.sessionToken = sessionResult.token;
        sessionData.sessionCreatedAt = Date.now();
        sessionData.userId = sessionResult.userId;
        sessionData.sessionTimeout = sessionResult.sessionTimeout;
        workflowStaticData.bunqSession = sessionData;
      } catch (error) {
        // 466 means the cached installation token is stale (sandbox reset, key
        // rotation, or expired installation).  Clear it so the next attempt
        // re-runs the full installation flow instead of reusing the bad token.
        if (getErrorMessage(error).includes('status code 466') && sessionData.installationToken) {
          sessionData = {};
          workflowStaticData.bunqSession = sessionData;
        }
        throw error;
      }
    }

    // Always include environment in returned session data
    sessionData.environment = environment;
    return sessionData;
  })();

  sessionCreationLocks.set(lockKey, creationPromise);
  if (forceRecreate) {
    forceRecreateCreationLocks.add(lockKey);
  }
  try {
    return await creationPromise;
  } finally {
    sessionCreationLocks.delete(lockKey);
    forceRecreateCreationLocks.delete(lockKey);
  }
}
