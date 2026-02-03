import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  NodeApiError,
} from 'n8n-workflow';
import {
  ensureBunqSession,
  getBunqBaseUrl,
  signData,
} from '../../utils/bunqApiHelpers';

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class BunqRetryFailedCallback implements INodeType {
  readonly usableAsTool: boolean = true;
  description: INodeTypeDescription = {
    displayName: 'Bunq Retry Failed Callback',
    name: 'bunqRetryFailedCallback',
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
        description: 'Comma-separated list of failed notification IDs to retry (e.g., "1,2,3")',
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
    let environment = '';

    try {
      const serviceName = this.getNodeParameter('serviceName', 0) as string;
      const credentials = await this.getCredentials('bunqApi');
      environment = credentials.environment as string;
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

        // Validate the format of notification IDs (should be comma-separated integers)
        const trimmedIds = notificationIds.trim();
        if (!trimmedIds) {
          throw new NodeApiError(this.getNode(), {
            message: 'Notification IDs cannot be empty',
            description: 'Please provide at least one notification ID to retry',
          });
        }
        
        // Check if the format is valid (comma-separated numbers)
        const idPattern = /^\d+(,\s*\d+)*$/;
        if (!idPattern.test(trimmedIds)) {
          throw new NodeApiError(this.getNode(), {
            message: 'Invalid notification IDs format',
            description: 'Notification IDs must be comma-separated integers (e.g., "1,2,3" or "1, 2, 3")',
          });
        }

        // Prepare request body
        const payload = JSON.stringify({
          notification_filter_failed_ids: trimmedIds,
        });

        // Sign the request
        const signature = signData(payload, privateKey);

        // Generate unique request ID using timestamp in milliseconds
        const requestId = Date.now().toString();
        const endpoint = `/user/${sessionData.userId}/notification-filter-failure`;

        // Make API request to retry failed callbacks
        const response = await this.helpers.httpRequest({
          method: 'POST',
          url: `${baseUrl}${endpoint}`,
          headers: {
            'Content-Type': 'application/json',
            'Cache-Control': 'no-cache',
            'User-Agent': serviceName,
            'X-Bunq-Language': 'en_US',
            'X-Bunq-Region': 'nl_NL',
            'X-Bunq-Client-Authentication': sessionData.sessionToken!,
            'X-Bunq-Client-Signature': signature,
            'X-Bunq-Client-Request-Id': requestId,
          },
          body: payload,
          returnFullResponse: true,
        });

        returnData.push({
          json: {
            success: true,
            notificationIds: trimmedIds,
            response: response.body.Response || response.body,
            environment,
          },
          pairedItem: {
            item: i,
          },
        });
      }

      return this.prepareOutputData(returnData);

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
        error.message = `${error.message}\n\nAPI Response Details:\n${JSON.stringify(errorDetails, null, 2)}`;
      }

      if (this.continueOnFail()) {
        const returnData: INodeExecutionData[] = items.map((_, i) => ({
          json: {
            error: error.message,
            success: false,
            statusCode: error.response?.status,
            responseData: error.response?.data,
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
