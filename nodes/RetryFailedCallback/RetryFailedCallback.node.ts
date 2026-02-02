import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
} from 'n8n-workflow';
import {
  ensureBunqSession,
  getBunqBaseUrl,
  signData,
} from '../../utils/bunqApiHelpers';

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class RetryFailedCallback implements INodeType {
  usableAsTool: boolean = true;
  description: INodeTypeDescription = {
    displayName: 'Bunq Retry Failed Callback',
    name: 'retryFailedCallback',
    icon: 'file:../../assets/Bunq-logo.svg',
    group: ['transform'],
    version: 1,
    description: 'Request a retry for previously failed callbacks via the Bunq API',
    defaults: {
      name: 'Retry Failed Callback'
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
        displayName: 'Notification IDs',
        name: 'notificationIds',
        type: 'string',
        default: '',
        required: true,
        description: 'Comma-separated list of failed notification IDs to retry',
        placeholder: '1,2,3',
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

    try {
      const serviceName = this.getNodeParameter('serviceName', 0) as string;
      const credentials = await this.getCredentials('bunqApi');
      const environment = credentials.environment as string;
      const privateKey = credentials.privateKey as string;
      const baseUrl = getBunqBaseUrl(environment);

      // Ensure we have a valid session
      const sessionData = await ensureBunqSession.call(
        this,
        credentials,
        serviceName,
        false
      );

      for (let i = 0; i < items.length; i++) {
        const notificationIds = this.getNodeParameter('notificationIds', i) as string;

        // Prepare request body
        const payload = JSON.stringify({
          notification_filter_failed_ids: notificationIds,
        });

        // Sign the request
        const signature = signData(payload, privateKey);

        // Make API request to retry failed callbacks
        const response = await this.helpers.httpRequest({
          method: 'POST',
          url: `${baseUrl}/user/${sessionData.userId}/notification-filter-failure`,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'User-Agent': serviceName,
            'X-Bunq-Language': 'en_US',
            'X-Bunq-Region': 'nl_NL',
            'X-Bunq-Client-Authentication': sessionData.sessionToken!,
            'X-Bunq-Client-Signature': signature,
          },
          body: payload,
        });

        returnData.push({
          json: {
            success: true,
            notificationIds,
            response: response.Response || response,
            environment,
          },
          pairedItem: {
            item: i,
          },
        });
      }

      return this.prepareOutputData(returnData);

    } catch (error) {
      if (this.continueOnFail()) {
        const returnData: INodeExecutionData[] = items.map((_, i) => ({
          json: {
            error: error.message,
            success: false,
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
