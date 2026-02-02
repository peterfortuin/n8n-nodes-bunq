import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  NodeApiError,
} from 'n8n-workflow';
import * as crypto from 'crypto';

interface IBunqSessionData {
  installationToken?: string;
  serverPublicKey?: string;
  deviceServerId?: string;
  sessionToken?: string;
  sessionCreatedAt?: number;
  userId?: string;
}

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class BunqSession implements INodeType {
  usableAsTool: boolean = true;
  description: INodeTypeDescription = {
    displayName: 'Bunq Session',
    name: 'bunqSession',
    icon: 'file:../../assets/Bunq-logo.svg',
    group: ['transform'],
    version: 1,
    description: 'Create and manage Bunq API session (installation, device registration, session creation)',
    defaults: {
      name: 'Bunq Session'
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'bunqApiCredentialApi',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Environment',
        name: 'environment',
        type: 'options',
        options: [
          {
            name: 'Sandbox',
            value: 'sandbox',
          },
          {
            name: 'Production',
            value: 'production',
          },
        ],
        default: 'sandbox',
        description: 'The Bunq API environment to use',
      },
      {
        displayName: 'Force Recreate Session',
        name: 'forceRecreate',
        type: 'boolean',
        default: false,
        description: 'Whether to force recreation of the entire session (installation, device, and session)',
      },
      {
        displayName: 'Service Name',
        name: 'serviceName',
        type: 'string',
        default: 'n8n-bunq-integration',
        description: 'The name of your service/application for device registration',
      },
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    for (let i = 0; i < items.length; i++) {
      try {
        const environment = this.getNodeParameter('environment', i) as string;
        const forceRecreate = this.getNodeParameter('forceRecreate', i) as boolean;
        const serviceName = this.getNodeParameter('serviceName', i) as string;

        const credentials = await this.getCredentials('bunqApiCredentialApi');
        const apiKey = credentials.apiKey as string;
        const privateKey = credentials.privateKey as string;
        const publicKey = credentials.publicKey as string;

        const baseUrl = environment === 'sandbox' 
          ? 'https://public-api.sandbox.bunq.com/v1'
          : 'https://api.bunq.com/v1';

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
            serviceName,
            privateKey
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
            privateKey
          );
          sessionData.sessionToken = sessionResult.token;
          sessionData.sessionCreatedAt = Date.now();
          sessionData.userId = sessionResult.userId;
          workflowStaticData.bunqSession = sessionData;
        }

        returnData.push({
          json: {
            sessionToken: sessionData.sessionToken,
            installationToken: sessionData.installationToken,
            deviceServerId: sessionData.deviceServerId,
            userId: sessionData.userId,
            sessionCreatedAt: sessionData.sessionCreatedAt,
            sessionAge: sessionData.sessionCreatedAt ? Date.now() - sessionData.sessionCreatedAt : 0,
            environment,
          }
        });

      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error.message,
            },
            pairedItem: {
              item: i,
            },
          });
          continue;
        }
        throw error;
      }
    }

    return this.prepareOutputData(returnData);
  }
}

async function createInstallation(
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

async function registerDevice(
  this: IExecuteFunctions,
  baseUrl: string,
  installationToken: string,
  apiKey: string,
  serviceName: string,
  privateKey: string
): Promise<string> {
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

async function createSession(
  this: IExecuteFunctions,
  baseUrl: string,
  installationToken: string,
  apiKey: string,
  privateKey: string
): Promise<{ token: string; userId: string }> {
  const payload = JSON.stringify({ secret: apiKey }, null, 0);

  const signature = signData(payload, privateKey);

  const headers = {
    'Content-Type': 'application/json',
    'Cache-Control': 'no-cache',
    'User-Agent': 'n8n-bunq-integration',
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

function signData(data: string, privateKey: string): string {
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(data);
  signer.end();
  return signer.sign(privateKey, 'base64');
}

function isSessionExpired(createdAt: number): boolean {
  // Bunq sessions typically expire after 90 days, but can be extended
  // We'll check if the session is older than 89 days (to be safe)
  const maxAge = 89 * 24 * 60 * 60 * 1000; // 89 days in milliseconds
  return (Date.now() - createdAt) > maxAge;
}
