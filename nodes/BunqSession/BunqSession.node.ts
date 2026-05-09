import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  JsonObject,
  NodeApiError,
  NodeConnectionTypes,
} from 'n8n-workflow';
import {
  ensureBunqSession,
} from '../../utils/bunqApiHelpers';
import { getErrorMessage } from '../../utils/errorHelpers';

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
    subtitle: 'Bunq API Session',
    defaults: {
      name: 'Bunq Session'
    },
    inputs: [NodeConnectionTypes.Main],
    outputs: [NodeConnectionTypes.Main],
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

      // Return the session data for all items
      const returnData: INodeExecutionData[] = items.map((_, itemIndex) => ({
        json: {
          sessionToken: sessionData.sessionToken,
          installationToken: sessionData.installationToken,
          deviceServerId: sessionData.deviceServerId,
          userId: sessionData.userId,
          sessionCreatedAt: sessionData.sessionCreatedAt,
          sessionAge: sessionData.sessionCreatedAt ? Date.now() - sessionData.sessionCreatedAt : 0,
          environment: sessionData.environment,
        },
        pairedItem: {
          item: itemIndex,
        },
      }));

      return this.prepareOutputData(returnData);

    } catch (error) {
      if (this.continueOnFail()) {
        // Return error data for all items if continueOnFail is enabled
        const returnData: INodeExecutionData[] = items.map((_, i) => ({
          json: {
            error: getErrorMessage(error),
          },
          pairedItem: {
            item: i,
          },
        }));
        return this.prepareOutputData(returnData);
      }
      throw new NodeApiError(this.getNode(), error as JsonObject);
    }
  }
}
