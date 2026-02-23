import { IExecuteFunctions, IHookFunctions, NodeApiError } from 'n8n-workflow';
import * as crypto from 'crypto';
import { BunqHttpClient } from './BunqHttpClient';
import packageJson from '../package.json';

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
 * @param baseUrl - The Bunq API base URL (production or sandbox)
 * @param publicKey - The client's public key for installation
 * @returns Installation token and server public key
 */
export async function createInstallation(
  this: BunqApiContext,
  baseUrl: string,
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
 * @param baseUrl - The Bunq API base URL (production or sandbox)
 * @param installationToken - Token from installation step
 * @param apiKey - The Bunq API key
 * @returns Device ID
 */
export async function registerDevice(
  this: BunqApiContext,
  baseUrl: string,
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
 * @param baseUrl - The Bunq API base URL (production or sandbox)
 * @param installationToken - Token from installation step
 * @param apiKey - The Bunq API key
 * @returns Session token, user ID, and session timeout (in seconds)
 */
export async function createSession(
  this: BunqApiContext,
  baseUrl: string,
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
 * Ensures a valid Bunq session exists or creates one if needed (OAuth flow).
 * For OAuth, we need installation (for request signing), device registration, and session creation.
 * The OAuth access token is used like an API key throughout the flow.
 * @param this - The Bunq API context (IExecuteFunctions or IHookFunctions)
 * @param forceRecreate - If true, forces recreation of session data
 * @returns Session data with session token and user ID
 */
async function ensureBunqSessionOAuth(
  this: BunqApiContext,
  forceRecreate: boolean = false
): Promise<IBunqSessionData> {
  // Retrieve OAuth credentials from context
  const credentials = await this.getCredentials('bunqOAuth2Api');
  
  // Get the access token directly from credentials (manual OAuth)
  const accessToken = credentials.accessToken as string;
  const publicKey = credentials.publicKey as string;
  const environment = credentials.environment as string;
  const baseUrl = getBunqBaseUrl(environment);

  if (!accessToken) {
    throw new NodeApiError(this.getNode(), {
      message: 'OAuth access token not found',
      description: 'Please provide a valid OAuth access token in your Bunq OAuth2 credentials',
    });
  }

  // Get or initialize session data from workflow static data
  const workflowStaticData = this.getWorkflowStaticData('global');
  let sessionData: IBunqSessionData = (workflowStaticData.bunqSessionOAuth as IBunqSessionData) || {};

  // If force recreate is true, clear session data
  if (forceRecreate) {
    sessionData = {};
    workflowStaticData.bunqSessionOAuth = sessionData;
  }

  // Step 1: Create installation if needed (for request signing)
  if (!sessionData.installationToken || !sessionData.serverPublicKey) {
    const installationResult = await createInstallation.call(this, baseUrl, publicKey);
    sessionData.installationToken = installationResult.token;
    sessionData.serverPublicKey = installationResult.serverPublicKey;
    workflowStaticData.bunqSessionOAuth = sessionData;
  }

  // Step 2: Register device if needed
  if (!sessionData.deviceServerId) {
    const deviceId = await registerDevice.call(
      this,
      baseUrl,
      sessionData.installationToken!,
      accessToken
    );
    sessionData.deviceServerId = deviceId;
    workflowStaticData.bunqSessionOAuth = sessionData;
  }

  // Step 3: Create session if needed or if expired
  const shouldCreateSession = !sessionData.sessionToken || 
    !sessionData.sessionCreatedAt ||
    isSessionExpired(sessionData.sessionCreatedAt, sessionData.sessionTimeout);

  if (shouldCreateSession) {
    // Use the OAuth access token like an API key to create a session
    const sessionResult = await createSession.call(
      this,
      baseUrl,
      sessionData.installationToken!,
      accessToken
    );
    sessionData.sessionToken = sessionResult.token;
    sessionData.sessionCreatedAt = Date.now();
    sessionData.userId = sessionResult.userId;
    sessionData.sessionTimeout = sessionResult.sessionTimeout;
    workflowStaticData.bunqSessionOAuth = sessionData;
  }

  // Always include environment in returned session data
  sessionData.environment = environment;
  
  return sessionData;
}

/**
 * Ensures a valid Bunq session exists or creates one if needed.
 * Automatically detects whether to use API Key or OAuth authentication.
 * Manages the complete session lifecycle including installation, device registration, and session creation.
 * @param this - The Bunq API context (IExecuteFunctions or IHookFunctions)
 * @param forceRecreate - If true, forces recreation of all session data
 * @returns Session data with all tokens and IDs
 */
export async function ensureBunqSession(
  this: BunqApiContext,
  forceRecreate: boolean = false
): Promise<IBunqSessionData> {
  // Simplified to only use OAuth2 authentication
  const oauthCredentials = await this.getCredentials('bunqOAuth2Api');
  
  // Check if access token is provided
  if (!oauthCredentials.accessToken) {
    throw new NodeApiError(this.getNode(), {
      message: 'OAuth access token is required',
      description: 'Please provide a valid OAuth access token in your Bunq OAuth2 API credentials. See the README for instructions on how to obtain an access token.',
    });
  }
  
  // Use OAuth flow
  return await ensureBunqSessionOAuth.call(this, forceRecreate);
}
