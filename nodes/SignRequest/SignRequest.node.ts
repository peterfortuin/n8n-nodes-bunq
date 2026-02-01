import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData
} from 'n8n-workflow';
import * as crypto from 'crypto';

// eslint-disable-next-line @n8n/community-nodes/node-usable-as-tool
export class BunqSignRequest implements INodeType {
  usableAsTool: boolean = true;
  description: INodeTypeDescription = {
    displayName: 'Bunq Signing',
    name: 'signRequest',
    icon: 'file:Bunq-logo.svg',
    group: ['transform'],
    version: 1,
    description: 'Signs a request body using a private key credential',
    defaults: {
      name: 'Sign Request'
    },
    inputs: ['main'],
    outputs: ['main'],
    credentials: [
      {
        name: 'bunqDevicePrivateKeyApi',
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

    // Load private key from bunqDevicePrivateKeyApi credential
    const credentials = await this.getCredentials('bunqDevicePrivateKeyApi');
    const privateKey = credentials.privateKey as string;

    for (let i = 0; i < items.length; i++) {
      const body = this.getNodeParameter('body', i) as string;

      // Sign with RSA-SHA256
      const signer = crypto.createSign('RSA-SHA256');
      signer.update(body);
      signer.end();

      const signature = signer.sign(privateKey, 'base64');

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