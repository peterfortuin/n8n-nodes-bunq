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
export class MonetaryAccounts implements INodeType {
  usableAsTool: boolean = true;
  description: INodeTypeDescription = {
    displayName: 'Bunq Monetary Accounts',
    name: 'monetaryAccounts',
    icon: 'file:../../assets/Bunq-logo.svg',
    group: ['transform'],
    version: 1,
    description: 'Retrieve a list of Monetary Accounts from Bunq API with type filtering',
    defaults: {
      name: 'Monetary Accounts'
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
        displayName: 'Account Types',
        name: 'accountTypes',
        type: 'multiOptions',
        default: ['bank', 'savings', 'joint'],
        description: 'Select which types of monetary accounts to retrieve. Each account type has its own characteristics:<br><br><strong>Bank:</strong> Classic personal or business bank accounts<br><strong>Savings:</strong> Regular or auto-savings accounts (including VAT accounts)<br><strong>Joint:</strong> Shared accounts with other bunq users (legal co-owners).',
        options: [
          {
            name: 'Bank',
            value: 'bank',
            description: 'Classic personal or business bank accounts',
          },
          {
            name: 'Savings',
            value: 'savings',
            description: 'Regular or auto-savings accounts (including VAT accounts)',
          },
          {
            name: 'Joint',
            value: 'joint',
            description: 'Shared accounts with other bunq users',
          },
        ],
      },
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    try {
      // Get node parameters
      const accountTypes = this.getNodeParameter('accountTypes', 0) as string[];

      // Ensure we have a valid Bunq session
      const sessionData = await ensureBunqSession.call(this, false);
      
      if (!sessionData.sessionToken || !sessionData.userId) {
        throw new NodeOperationError(this.getNode(), 'Failed to establish Bunq session');
      }

      // Create HTTP client
      const client = new BunqHttpClient(this);

      // Fetch accounts for each selected type
      const allAccounts: Array<Record<string, any>> = [];
      
      for (const accountType of accountTypes) {
        let endpoint = '';
        
        switch (accountType) {
          case 'bank':
            endpoint = `/user/${sessionData.userId}/monetary-account-bank`;
            break;
          case 'savings':
            endpoint = `/user/${sessionData.userId}/monetary-account-savings`;
            break;
          case 'joint':
            endpoint = `/user/${sessionData.userId}/monetary-account-joint`;
            break;
          default:
            throw new NodeOperationError(this.getNode(), `Unknown account type: ${accountType}`);
        }

        // Make API request
        const response = await client.request({
          method: 'GET',
          url: endpoint,
          sessionToken: sessionData.sessionToken,
        });

        // Extract accounts from response
        if (response.Response && Array.isArray(response.Response)) {
          for (const item of response.Response) {
            // Each item is an object with the account type as the key
            const accountKey = Object.keys(item)[0];
            if (accountKey) {
              const accountData = item[accountKey];
              // Add account type to the data for clarity
              accountData.account_type = accountType;
              allAccounts.push(accountData);
            }
          }
        }
      }

      // Return each account as a separate n8n item
      for (const account of allAccounts) {
        returnData.push({
          json: account,
        });
      }

      // If no accounts were found, return empty result for each input item
      if (returnData.length === 0) {
        for (let i = 0; i < items.length; i++) {
          returnData.push({
            json: {
              message: 'No monetary accounts found for the selected types',
              accountTypes,
            },
            pairedItem: {
              item: i,
            },
          });
        }
      }

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
