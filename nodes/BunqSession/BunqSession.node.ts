import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
} from 'n8n-workflow';
import {
  ensureBunqSession,
} from '../../utils/bunqApiHelpers';

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
        required: false,
      },
      {
        name: 'bunqOAuth2Api',
        required: false,
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
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();

    try {
      // Session creation logic (runs once, not per item)
      const forceRecreate = this.getNodeParameter('forceRecreate', 0) as boolean;

      // Use the shared session management function
      const sessionData = await ensureBunqSession.call(
        this,
        forceRecreate
      );

      // Return the session data for all items
      const returnData: INodeExecutionData[] = items.map(() => ({
        json: {
          sessionToken: sessionData.sessionToken,
          installationToken: sessionData.installationToken,
          deviceServerId: sessionData.deviceServerId,
          userId: sessionData.userId,
          sessionCreatedAt: sessionData.sessionCreatedAt,
          sessionAge: sessionData.sessionCreatedAt ? Date.now() - sessionData.sessionCreatedAt : 0,
          environment: sessionData.environment,
        }
      }));

      return this.prepareOutputData(returnData);

    } catch (error) {
      if (this.continueOnFail()) {
        // Return error data for all items if continueOnFail is enabled
        const returnData: INodeExecutionData[] = items.map((_, i) => ({
          json: {
            error: error.message,
          },
          pairedItem: {
            item: i,
          },
        }));
        return this.prepareOutputData(returnData);
      }
      throw error;
    }
  }
}
