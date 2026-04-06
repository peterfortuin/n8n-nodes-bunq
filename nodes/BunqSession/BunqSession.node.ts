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

      // Return non-sensitive session metadata only.
      // Tokens (sessionToken, installationToken) are intentionally excluded
      // from the output because n8n stores execution data in its database and
      // may surface it in logs or downstream webhook payloads.  The tokens are
      // cached in workflowStaticData and used automatically by other Bunq nodes.
      const returnData: INodeExecutionData[] = items.map(() => ({
        json: {
          userId: sessionData.userId,
          deviceServerId: sessionData.deviceServerId,
          sessionCreatedAt: sessionData.sessionCreatedAt,
          sessionAge: sessionData.sessionCreatedAt ? Date.now() - sessionData.sessionCreatedAt : 0,
          environment: sessionData.environment,
          hasSessionToken: Boolean(sessionData.sessionToken),
          hasInstallationToken: Boolean(sessionData.installationToken),
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
