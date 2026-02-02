import {
  ICredentialType,
  INodeProperties,
  Icon,
  ICredentialTestRequest,
} from 'n8n-workflow';

export class BunqApiCredentialApi implements ICredentialType {
  name = 'bunqApiCredentialApi';
  displayName = 'Bunq API Credential API';
  documentationUrl = 'https://doc.bunq.com';
  icon: Icon = 'file:../assets/Bunq-logo.svg';
  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://api.bunq.com',
      url: '/v1/installation',
      method: 'GET',
    },
  };
  properties: INodeProperties[] = [
    {
      displayName: 'API Key',
      name: 'apiKey',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'The API key from your Bunq account',
    },
    {
      displayName: 'Private Key (PEM)',
      name: 'privateKey',
      type: 'string',
      typeOptions: {
        rows: 8,
        password: true,
      },
      default: '',
      required: true,
      description: 'Your RSA private key in PEM format',
    },
    {
      displayName: 'Public Key (PEM)',
      name: 'publicKey',
      type: 'string',
      typeOptions: {
        rows: 6,
      },
      default: '',
      required: true,
      description: 'Your RSA public key in PEM format',
    },
  ];
}