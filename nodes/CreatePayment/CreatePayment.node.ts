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

/**
 * Interface for payment counterparty (recipient)
 */
interface ICounterparty {
  type: string;
  value: string;
  name?: string;
}

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class CreatePayment implements INodeType {
  usableAsTool: boolean = true;
  description: INodeTypeDescription = {
    displayName: 'Bunq Create Payment',
    name: 'createPayment',
    icon: 'file:../../assets/Bunq-logo.svg',
    group: ['transform'],
    version: 1,
    description: 'Create a payment or draft payment from a Bunq Monetary Account to any account (bunq or external)',
    defaults: {
      name: 'Create Payment'
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
        displayName: 'From Monetary Account ID',
        name: 'monetaryAccountId',
        type: 'number',
        default: 0,
        required: true,
        description: 'The ID of the monetary account to send money from',
      },
      {
        displayName: 'Payment Type',
        name: 'paymentType',
        type: 'options',
        options: [
          {
            name: 'Actual Payment (Execute Immediately)',
            value: 'actual',
            description: 'Payment is executed immediately',
          },
          {
            name: 'Draft Payment (Requires Manual Approval)',
            value: 'draft',
            description: 'Payment is created as a draft requiring manual approval in the bunq app',
          },
        ],
        default: 'actual',
        required: true,
        description: 'Whether to create an actual payment or a draft payment',
      },
      {
        displayName: 'Recipient Type',
        name: 'recipientType',
        type: 'options',
        options: [
          {
            name: 'IBAN',
            value: 'iban',
            description: 'Recipient identified by IBAN',
          },
          {
            name: 'Email',
            value: 'email',
            description: 'Recipient identified by email address',
          },
          {
            name: 'Phone Number',
            value: 'phone',
            description: 'Recipient identified by phone number',
          },
        ],
        default: 'iban',
        required: true,
        description: 'How to identify the recipient of the payment',
      },
      {
        displayName: 'Recipient IBAN',
        name: 'recipientIban',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            recipientType: ['iban'],
          },
        },
        placeholder: 'NL91ABNA0417164300',
        description: 'The IBAN of the recipient account',
      },
      {
        displayName: 'Recipient Email',
        name: 'recipientEmail',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            recipientType: ['email'],
          },
        },
        placeholder: 'recipient@example.com',
        description: 'The email address of the recipient',
      },
      {
        displayName: 'Recipient Phone Number',
        name: 'recipientPhone',
        type: 'string',
        default: '',
        required: true,
        displayOptions: {
          show: {
            recipientType: ['phone'],
          },
        },
        placeholder: '+31612345678',
        description: 'The phone number of the recipient (include country code)',
      },
      {
        displayName: 'Recipient Name',
        name: 'recipientName',
        type: 'string',
        default: '',
        displayOptions: {
          show: {
            recipientType: ['iban'],
          },
        },
        placeholder: 'John Doe',
        description: 'The name of the recipient (optional for IBAN transfers)',
      },
      {
        displayName: 'Amount',
        name: 'amount',
        type: 'string',
        default: '',
        required: true,
        placeholder: '10.00',
        description: 'The amount to transfer in EUR (e.g., "10.00")',
      },
      {
        displayName: 'Description',
        name: 'description',
        type: 'string',
        default: '',
        required: true,
        typeOptions: {
          rows: 2,
        },
        placeholder: 'Payment description',
        description: 'Description of the payment for bookkeeping purposes',
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
        const paymentType = this.getNodeParameter('paymentType', itemIndex) as string;
        const recipientType = this.getNodeParameter('recipientType', itemIndex) as string;
        const amount = this.getNodeParameter('amount', itemIndex) as string;
        const description = this.getNodeParameter('description', itemIndex) as string;

        // Validate amount format
        const amountRegex = /^\d+(\.\d{1,2})?$/;
        if (!amountRegex.test(amount)) {
          throw new NodeOperationError(
            this.getNode(),
            `Invalid amount format: "${amount}". Please use a number with up to 2 decimal places (e.g., "10.00" or "10")`,
          );
        }

        // Validate monetary account ID
        if (monetaryAccountId <= 0) {
          throw new NodeOperationError(
            this.getNode(),
            `Invalid monetary account ID: ${monetaryAccountId}. Must be a positive number.`,
          );
        }

        // Get recipient information based on type
        let recipientValue = '';
        let recipientApiType = ''; // API type: EMAIL, PHONE_NUMBER, or IBAN
        let recipientName = '';

        switch (recipientType) {
          case 'iban':
            recipientValue = this.getNodeParameter('recipientIban', itemIndex) as string;
            recipientApiType = 'IBAN';
            recipientName = this.getNodeParameter('recipientName', itemIndex, '') as string;
            
            // Basic IBAN validation
            if (!recipientValue || recipientValue.trim().length === 0) {
              throw new NodeOperationError(this.getNode(), 'Recipient IBAN is required');
            }
            // Remove spaces from IBAN
            recipientValue = recipientValue.replace(/\s/g, '');
            break;
          case 'email': {
            recipientValue = this.getNodeParameter('recipientEmail', itemIndex) as string;
            recipientApiType = 'EMAIL';
            
            if (!recipientValue || recipientValue.trim().length === 0) {
              throw new NodeOperationError(this.getNode(), 'Recipient email is required');
            }
            // Basic email validation
            const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
            if (!emailRegex.test(recipientValue)) {
              throw new NodeOperationError(
                this.getNode(),
                `Invalid email format: "${recipientValue}"`,
              );
            }
            break;
          }
          case 'phone':
            recipientValue = this.getNodeParameter('recipientPhone', itemIndex) as string;
            recipientApiType = 'PHONE_NUMBER';
            
            if (!recipientValue || recipientValue.trim().length === 0) {
              throw new NodeOperationError(this.getNode(), 'Recipient phone number is required');
            }
            break;
          default:
            throw new NodeOperationError(
              this.getNode(),
              `Unknown recipient type: ${recipientType}`,
            );
        }

        // Ensure we have a valid Bunq session
        const sessionData = await ensureBunqSession.call(this, false);
        
        if (!sessionData.sessionToken || !sessionData.userId) {
          throw new NodeOperationError(this.getNode(), 'Failed to establish Bunq session');
        }

        // Create HTTP client
        const client = new BunqHttpClient(this);

        // Determine endpoint based on payment type
        const endpoint = paymentType === 'draft'
          ? `/user/${sessionData.userId}/monetary-account/${monetaryAccountId}/draft-payment`
          : `/user/${sessionData.userId}/monetary-account/${monetaryAccountId}/payment`;

        // Build counterparty object with correct structure
        const counterparty: ICounterparty = {
          type: recipientApiType,
          value: recipientValue,
        };

        // Add name if provided (optional for all types, but especially useful for IBAN)
        if (recipientName && recipientName.trim().length > 0) {
          counterparty.name = recipientName.trim();
        }

        // Build payment request body - different structure for draft vs regular payments
        let requestBody: string;
        
        if (paymentType === 'draft') {
          // Draft payments use an "entries" array structure
          const draftPaymentData = {
            entries: [
              {
                amount: {
                  value: amount,
                  currency: 'EUR',
                },
                counterparty_alias: counterparty,
                description: description,
              },
            ],
            number_of_required_accepts: 1,
          };
          requestBody = JSON.stringify(draftPaymentData);
        } else {
          // Regular payments use direct structure
          const paymentData = {
            amount: {
              value: amount,
              currency: 'EUR',
            },
            counterparty_alias: counterparty,
            description: description,
          };
          requestBody = JSON.stringify(paymentData);
        }

        // Make API request to create payment
        const response = await client.request({
          method: 'POST',
          url: endpoint,
          body: requestBody,
          sessionToken: sessionData.sessionToken,
        });

        // Extract payment data from response
        let paymentResult = null;
        if (response.Response && Array.isArray(response.Response)) {
          for (const item of response.Response) {
            // Response can contain "Id", "Payment", or "DraftPayment" key
            if (item.Id) {
              // POST responses often just return an ID
              paymentResult = item.Id;
            } else if (item.Payment) {
              paymentResult = item.Payment;
            } else if (item.DraftPayment) {
              paymentResult = item.DraftPayment;
            }
          }
        }

        if (!paymentResult) {
          throw new NodeOperationError(
            this.getNode(),
            'Failed to extract payment data from API response',
          );
        }

        // Return payment result
        returnData.push({
          json: {
            success: true,
            paymentType: paymentType,
            payment: paymentResult,
            message: paymentType === 'draft'
              ? 'Draft payment created successfully. Please approve it in the bunq app.'
              : 'Payment created successfully.',
          },
          pairedItem: {
            item: itemIndex,
          },
        });

      } catch (error) {
        if (this.continueOnFail()) {
          returnData.push({
            json: {
              success: false,
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
