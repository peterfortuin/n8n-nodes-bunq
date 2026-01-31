import {
  IExecuteFunctions,
  INodeType,
  INodeTypeDescription,
  INodeExecutionData
} from 'n8n-workflow';
import * as crypto from 'crypto';

export class BunqSignRequest implements INodeType {
  description: INodeTypeDescription = {
    displayName: 'Bunq Signing',
    name: 'signRequest',
    icon: { light: 'file:Bunq-logo.svg', dark: 'file:Bunq-logo.svg' },
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
        name: 'bunqDevicePrivateKey',
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

    // Load private key from bunqDevicePrivateKey credential
    const credentials = await this.getCredentials('bunqDevicePrivateKey');
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