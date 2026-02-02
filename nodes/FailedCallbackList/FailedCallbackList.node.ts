import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
} from 'n8n-workflow';
import {
  ensureBunqSession,
  getBunqBaseUrl,
} from '../../utils/bunqApiHelpers';

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class FailedCallbackList implements INodeType {
  readonly usableAsTool: boolean = true;
  description: INodeTypeDescription = {
    displayName: 'Bunq Failed Callback List',
    name: 'failedCallbackList',
    icon: 'file:../../assets/Bunq-logo.svg',
    group: ['transform'],
    version: 1,
    description: 'Retrieve a list of failed callbacks from the Bunq API',
    defaults: {
      name: 'Failed Callback List'
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

    try {
      const serviceName = this.getNodeParameter('serviceName', 0) as string;
      const credentials = await this.getCredentials('bunqApi');
      const environment = credentials.environment as string;
      const baseUrl = getBunqBaseUrl(environment);

      // Ensure we have a valid session
      const sessionData = await ensureBunqSession.call(
        this,
        credentials,
        serviceName,
        false
      );

      // Make API request to list failed callbacks
      const response = await this.helpers.httpRequest({
        method: 'GET',
        url: `${baseUrl}/user/${sessionData.userId}/notification-filter-failure`,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': serviceName,
          'X-Bunq-Language': 'en_US',
          'X-Bunq-Region': 'nl_NL',
          'X-Bunq-Client-Authentication': sessionData.sessionToken!,
        },
      });

      // Extract the failed notifications from the response
      const failedNotifications = response.Response || [];

      // Return a single result with all failed notifications
      const returnData: INodeExecutionData[] = [{
        json: {
          failedNotifications,
          count: failedNotifications.length,
          environment,
        }
      }];

      return this.prepareOutputData(returnData);

    } catch (error) {
      if (this.continueOnFail()) {
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
