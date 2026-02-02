import { IExecuteFunctions, NodeApiError } from 'n8n-workflow';
import * as crypto from 'crypto';

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
 */
export async function createInstallation(
  this: IExecuteFunctions,
  baseUrl: string,
  publicKey: string,
  serviceName: string
): Promise<{ token: string; serverPublicKey: string }> {
  const payload = JSON.stringify({ client_public_key: publicKey });

  const headers = {
    'Content-Type': 'application/json',
    'User-Agent': serviceName,
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'X-Bunq-Geolocation': '0 0 0 0 000',
    'Cache-Control': 'no-cache',
  };

  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/installation`,
    headers,
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
 */
export async function registerDevice(
  this: IExecuteFunctions,
  baseUrl: string,
  installationToken: string,
  apiKey: string,
  serviceName: string,
  privateKey: string
): Promise<string> {
  // Using wildcard IP ('*') to allow API calls from any IP address.
  // This is recommended by Bunq for Wildcard API Keys to avoid IP binding issues.
  // See: https://doc.bunq.com/tutorials/your-first-payment/creating-the-api-context/device-registration
  const payload = JSON.stringify({
    description: serviceName,
    secret: apiKey,
    permitted_ips: ['*']
  });

  const signature = signData(payload, privateKey);

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'User-Agent': serviceName,
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'X-Bunq-Geolocation': '0 0 0 0 000',
    'X-Bunq-Client-Authentication': installationToken,
    'X-Bunq-Client-Signature': signature,
  };

  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/device-server`,
    headers,
    body: payload,
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
 */
export async function createSession(
  this: IExecuteFunctions,
  baseUrl: string,
  installationToken: string,
  apiKey: string,
  serviceName: string,
  privateKey: string
): Promise<{ token: string; userId: string }> {
  const payload = JSON.stringify({ secret: apiKey });

  const signature = signData(payload, privateKey);

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'User-Agent': serviceName,
    'X-Bunq-Language': 'en_US',
    'X-Bunq-Region': 'nl_NL',
    'X-Bunq-Geolocation': '0 0 0 0 000',
    'X-Bunq-Client-Authentication': installationToken,
    'X-Bunq-Client-Signature': signature,
  };

  const response = await this.helpers.httpRequest({
    method: 'POST',
    url: `${baseUrl}/session-server`,
    headers,
    body: payload,
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
