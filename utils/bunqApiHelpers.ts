import { IExecuteFunctions, IHookFunctions, ICredentialDataDecryptedObject, NodeApiError } from 'n8n-workflow';
import * as crypto from 'crypto';
import { BunqHttpClient } from './BunqHttpClient';

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
 * @param serviceName - Name of the service/application
 * @returns Installation token and server public key
 */
export async function createInstallation(
  this: BunqApiContext,
  baseUrl: string,
  publicKey: string,
  serviceName: string
): Promise<{ token: string; serverPublicKey: string }> {
  const payload = JSON.stringify({ client_public_key: publicKey });

  const client = new BunqHttpClient(this);
  const response = await client.request({
    method: 'POST',
    url: '/installation',
    body: payload,
    serviceName,
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
 * @param serviceName - Name of the service/application
 * @returns Device ID
 */
export async function registerDevice(
  this: BunqApiContext,
  baseUrl: string,
  installationToken: string,
  apiKey: string,
  serviceName: string
): Promise<string> {
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
    serviceName,
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
 * @param serviceName - Name of the service/application
 * @returns Session token and user ID
 */
export async function createSession(
  this: BunqApiContext,
  baseUrl: string,
  installationToken: string,
  apiKey: string,
  serviceName: string
): Promise<{ token: string; userId: string }> {
  const payload = JSON.stringify({ secret: apiKey });

  const client = new BunqHttpClient(this);
  const response = await client.request({
    method: 'POST',
    url: '/session-server',
    body: payload,
    sessionToken: installationToken,
    serviceName,
  });

  // Extract token and user ID from response
  const responseData = response.Response;
  let token = '';
  let userId = '';

  for (const item of responseData) {
    if (item.Token) {
      token = item.Token.token;
    }
    if (item.UserPerson) {
      userId = item.UserPerson.id.toString();
    } else if (item.UserCompany) {
      userId = item.UserCompany.id.toString();
    } else if (item.UserApiKey) {
      userId = item.UserApiKey.id.toString();
    }
  }

  if (!token) {
    throw new NodeApiError(this.getNode(), {
      message: 'Failed to extract session token from response',
      description: 'The session response did not contain the expected data',
    });
  }

  return { token, userId };
}

/**
 * Check if session is expired (older than 89 days)
 */
export function isSessionExpired(createdAt: number): boolean {
  // Bunq sessions typically expire after 90 days, but can be extended
  // We'll check if the session is older than 89 days (to be safe)
  const maxAge = 89 * 24 * 60 * 60 * 1000; // 89 days in milliseconds
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
  userId?: string;
}

/**
 * Ensure Bunq session is created and valid
 * This function manages the complete session lifecycle: installation, device registration, and session creation.
 * Each step is only performed if required (e.g., installation only if no token exists).
 * 
 * @param executeFunctions - The n8n execution context (IExecuteFunctions or IHookFunctions)
 * @param credentials - The Bunq API credentials object from getCredentials('bunqApi')
 * @param serviceName - Name of the service/application
 * @param forceRecreate - Whether to force recreation of the session
 * @returns Session data with all tokens and IDs
 */
export async function ensureBunqSession(
  this: BunqApiContext,
  credentials: ICredentialDataDecryptedObject,
  serviceName: string,
  forceRecreate: boolean = false
): Promise<IBunqSessionData> {
  const apiKey = credentials.apiKey as string;
  const publicKey = credentials.publicKey as string;
  const environment = credentials.environment as string;
  const baseUrl = getBunqBaseUrl(environment);

  // Get or initialize session data from workflow static data
  const workflowStaticData = this.getWorkflowStaticData('node');
  let sessionData: IBunqSessionData = workflowStaticData.bunqSession as IBunqSessionData || {};

  // If force recreate is true, clear all session data
  if (forceRecreate) {
    sessionData = {};
    workflowStaticData.bunqSession = sessionData;
  }

  // Step 1: Create installation if needed
  if (!sessionData.installationToken || !sessionData.serverPublicKey) {
    const installationResult = await createInstallation.call(this, baseUrl, publicKey, serviceName);
    sessionData.installationToken = installationResult.token;
    sessionData.serverPublicKey = installationResult.serverPublicKey;
    workflowStaticData.bunqSession = sessionData;
  }

  // Step 2: Register device if needed
  if (!sessionData.deviceServerId) {
    const deviceId = await registerDevice.call(
      this,
      baseUrl,
      sessionData.installationToken!,
      apiKey,
      serviceName
    );
    sessionData.deviceServerId = deviceId;
    workflowStaticData.bunqSession = sessionData;
  }

  // Step 3: Create session if needed or if expired
  const shouldCreateSession = !sessionData.sessionToken || 
    !sessionData.sessionCreatedAt ||
    isSessionExpired(sessionData.sessionCreatedAt);

  if (shouldCreateSession) {
    const sessionResult = await createSession.call(
      this,
      baseUrl,
      sessionData.installationToken!,
      apiKey,
      serviceName
    );
    sessionData.sessionToken = sessionResult.token;
    sessionData.sessionCreatedAt = Date.now();
    sessionData.userId = sessionResult.userId;
    workflowStaticData.bunqSession = sessionData;
  }

  return sessionData;
}
