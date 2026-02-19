import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData,
} from 'n8n-workflow';
import { signData } from '../../utils/bunqApiHelpers';

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class SignRequest implements INodeType {
  usableAsTool: boolean = true;
  description: INodeTypeDescription = {
    displayName: 'Bunq Signing',
    name: 'signRequest',
    icon: 'file:../../assets/Bunq-logo.svg',
    group: ['transform'],
    version: 1,
    description: 'Signs a request body using a private key from OAuth2 credentials.',
    defaults: {
      name: 'Sign Request'
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'bunqOAuth2Api',
        required: true,
      },
    ],
    properties: [
      {
        displayName: 'Request Body',
        name: 'body',
        type: 'string',
        typeOptions: {
          rows: 8,
        },
        default: '',
        description: 'Paste the request body to be signed (any string)',
        required: true,
      }
    ]
  };

  async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
    const items = this.getInputData();
    const returnData: INodeExecutionData[] = [];

    // Load private key from OAuth2 credentials
    const credentials = await this.getCredentials('bunqOAuth2Api');
    const privateKey = credentials.privateKey as string;

    for (let i = 0; i < items.length; i++) {
      const body = this.getNodeParameter('body', i) as string;

      // Sign with RSA-SHA256 using shared helper
      const signature = signData(body, privateKey);

      returnData.push({
        json: {
          body,
          signature
        }
      });
    }

    return this.prepareOutputData(returnData);
  }
}