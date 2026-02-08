import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
  NodeOperationError,
} from 'n8n-workflow';
import {
  ensureBunqSession,
} from '../../utils/bunqApiHelpers';
import { BunqHttpClient } from '../../utils/BunqHttpClient';

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class Payments implements INodeType {
  usableAsTool: boolean = true;
  description: INodeTypeDescription = {
    displayName: 'Bunq Payments',
    name: 'payments',
    icon: 'file:../../assets/Bunq-logo.svg',
    group: ['transform'],
    version: 1,
    description: 'Retrieve payments from a Bunq Monetary Account with pagination and date filtering',
    defaults: {
      name: 'Get Payments'
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
        displayName: 'Monetary Account ID',
        name: 'monetaryAccountId',
        type: 'number',
        default: 0,
        required: true,
        description: 'The ID of the monetary account to retrieve payments from',
      },
      {
        displayName: 'Additional Options',
        name: 'additionalOptions',
        type: 'collection',
        placeholder: 'Add Option',
        default: {},
        options: [
          {
            displayName: 'Limit',
            name: 'limit',
            type: 'number',
            typeOptions: {
              minValue: 1,
            },
            default: 50,
            description: 'Max number of results to return',
          },
          {
            displayName: 'Last X Days',
            name: 'lastDays',
            type: 'number',
            default: 30,
            description: 'Only return payments from the last X days',
          },
          {
            displayName: 'Items Per Page',
            name: 'itemsPerPage',
            type: 'number',
            default: 50,
            description: 'Number of items to retrieve per page from the Bunq API (max 200)',
            typeOptions: {
              minValue: 1,
              maxValue: 200,
            },
          },
        ],
      },
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    // Process each input item
    for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
      try {
        // Get node parameters
        const monetaryAccountId = this.getNodeParameter('monetaryAccountId', itemIndex) as number;
        const additionalOptions = this.getNodeParameter('additionalOptions', itemIndex, {}) as {
          limit?: number;
          lastDays?: number;
          itemsPerPage?: number;
        };

        // If limit is not provided or is 0, we return all results
        const limit = additionalOptions.limit || 0;
        const returnAll = limit === 0;

        // Ensure we have a valid Bunq session
        const sessionData = await ensureBunqSession.call(this, false);
        
        if (!sessionData.sessionToken || !sessionData.userId) {
          throw new NodeOperationError(this.getNode(), 'Failed to establish Bunq session');
        }

        // Create HTTP client
        const client = new BunqHttpClient(this);

        // Calculate date filter if specified
        let dateFilter: Date | null = null;
        if (additionalOptions.lastDays) {
          dateFilter = new Date();
          dateFilter.setDate(dateFilter.getDate() - additionalOptions.lastDays);
        }

        // Set up pagination parameters
        const itemsPerPage = additionalOptions.itemsPerPage || 50;
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        let allPayments: any[] = [];
        let nextUrl: string | null = `/user/${sessionData.userId}/monetary-account/${monetaryAccountId}/payment?count=${itemsPerPage}`;
        let shouldContinue = true;

        // Fetch payments with pagination
        while (shouldContinue && nextUrl) {
          const response = await client.request({
            method: 'GET',
            url: nextUrl,
            sessionToken: sessionData.sessionToken,
          });

          // Extract payments from response
          if (response.Response && Array.isArray(response.Response)) {
            for (const item of response.Response) {
              // Each item is an object with 'Payment' as the key
              if (item.Payment) {
                const payment = item.Payment;
                
                // Apply date filter if specified
                if (dateFilter) {
                  const paymentDate = new Date(payment.created);
                  if (paymentDate < dateFilter) {
                    // Payments are returned in reverse chronological order (newest first)
                    // If we hit a payment older than our filter, we can stop fetching
                    shouldContinue = false;
                    break;
                  }
                }
                
                allPayments.push(payment);

                // Check if we've reached the limit (if not returning all)
                if (!returnAll && allPayments.length >= limit) {
                  shouldContinue = false;
                  break;
                }
              }
            }
          }

          // Get the next page URL from pagination
          if (shouldContinue && response.Pagination && response.Pagination.older_url) {
            // The older_url from Bunq API includes /v1/ prefix, but our baseUrl already has it
            // So we need to strip the /v1 prefix to avoid /v1/v1/ in the final URL
            let paginationUrl = response.Pagination.older_url;
            if (paginationUrl.startsWith('/v1/')) {
              paginationUrl = paginationUrl.substring(3); // Remove '/v1' prefix
            }
            nextUrl = paginationUrl;
          } else {
            shouldContinue = false;
          }
        }

        // Apply limit if not returning all
        if (!returnAll && allPayments.length > limit) {
          allPayments = allPayments.slice(0, limit);
        }

        // Return each payment as a separate n8n item
        for (const payment of allPayments) {
          returnData.push({
            json: payment,
            pairedItem: {
              item: itemIndex,
            },
          });
        }

        // If no payments were found for this item, return a message
        if (allPayments.length === 0) {
          returnData.push({
            json: {
              message: 'No payments found for the specified monetary account',
              monetaryAccountId,
            },
            pairedItem: {
              item: itemIndex,
            },
          });
        }

      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              error: error.message,
            },
            pairedItem: {
              item: itemIndex,
            },
          });
        } else {
          throw error;
        }
      }
    }

    return this.prepareOutputData(returnData);
  }
}
