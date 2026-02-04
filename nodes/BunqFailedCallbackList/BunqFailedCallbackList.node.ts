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
export class BunqFailedCallbackList implements INodeType {
  readonly usableAsTool: boolean = true;
  description: INodeTypeDescription = {
    displayName: 'Bunq Failed Callback List',
    name: 'bunqFailedCallbackList',
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
    let environment = '';

    try {
      const serviceName = this.getNodeParameter('serviceName', 0) as string;
      const credentials = await this.getCredentials('bunqApi');
      environment = credentials.environment as string;
      const baseUrl = getBunqBaseUrl(environment);

      // Ensure we have a valid session
      const sessionData = await ensureBunqSession.call(
        this,
        credentials,
        serviceName,
        false
      );

      const endpoint = `/user/${sessionData.userId}/notification-filter-failure`;

      // Make API request to list failed callbacks
      // Note: X-Bunq-Client-Request-Id is not included for GET requests (consistent with other nodes)
      const response = await this.helpers.httpRequest({
        method: 'GET',
        url: `${baseUrl}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'Cache-Control': 'no-cache',
          'User-Agent': serviceName,
          'X-Bunq-Language': 'en_US',
          'X-Bunq-Region': 'nl_NL',
          'X-Bunq-Client-Authentication': sessionData.sessionToken!,
        },
        returnFullResponse: true,
      });

      // Extract the failed notifications from the response
      const failedNotifications = response.body.Response || [];

      // Return a single result with all failed notifications
      const returnData: INodeExecutionData[] = [{
        json: {
          failedNotifications,
          count: failedNotifications.length,
          environment,
        }
      }];

      return [returnData];

    } catch (error) {
      // Enhance error message with response details if available
      if (error.response) {
        const statusCode = error.response.status;
        const responseId = error.response.headers?.['x-bunq-client-response-id'] || 'N/A';
        const requestId = error.config?.headers?.['X-Bunq-Client-Request-Id'] || 'N/A';
        const callTime = error.response.headers?.['date'] || new Date().toUTCString();
        const endpoint = error.config?.url || 'N/A';

        // Log error details for 4xx and 5xx errors
        if (statusCode >= 400) {
          this.logger.error('Bunq API Error', {
            environment,
            requestId,
            responseId,
            callTime,
            endpoint,
            statusCode,
            statusText: error.response.statusText,
            responseData: error.response.data,
          });
        }

        const errorDetails = {
          environment,
          requestId,
          responseId,
          callTime,
          endpoint,
          statusCode,
          statusText: error.response.statusText,
          data: error.response.data,
          method: error.config?.method,
        };
        
        // Safely stringify error details, handling circular references
        let errorDetailsString: string;
        try {
          errorDetailsString = JSON.stringify(errorDetails, null, 2);
        } catch {
          // If circular reference error, create a safe version with just primitives
          errorDetailsString = JSON.stringify({
            environment,
            requestId,
            responseId,
            callTime,
            endpoint,
            statusCode,
            statusText: error.response.statusText,
            data: typeof error.response.data === 'object' ? '[Complex Object]' : error.response.data,
            method: error.config?.method,
          }, null, 2);
        }
        
        error.message = `${error.message}\n\nAPI Response Details:\n${errorDetailsString}`;
      }

      if (this.continueOnFail()) {
        const returnData: INodeExecutionData[] = items.map((_, i) => ({
          json: {
            error: error.message,
            statusCode: error.response?.status,
            responseData: error.response?.data,
          },
          pairedItem: {
            item: i,
          },
        }));
        return [returnData];
      }
      throw error;
    }
  }
}
