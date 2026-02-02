import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
} from 'n8n-workflow';
import {
  createInstallation,
  registerDevice,
  createSession,
  isSessionExpired,
} from '../../utils/bunqApiHelpers';

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
        name: 'bunqApi',
        required: true,
      },
    ],
    properties: [
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
        const forceRecreate = this.getNodeParameter('forceRecreate', i) as boolean;
        const serviceName = this.getNodeParameter('serviceName', i) as string;

        const credentials = await this.getCredentials('bunqApi');
        const apiKey = credentials.apiKey as string;
        const privateKey = credentials.privateKey as string;
        const publicKey = credentials.publicKey as string;
        const environment = credentials.environment as string;

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
            serviceName,
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
