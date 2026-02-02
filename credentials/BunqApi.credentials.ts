import {
  ICredentialType,
  INodeProperties,
  Icon,
  ICredentialTestRequest,
} from 'n8n-workflow';

export class BunqApi implements ICredentialType {
  name = 'bunqApi';
  displayName = 'Bunq API';
  documentationUrl = 'https://doc.bunq.com';
  icon: Icon = 'file:../assets/Bunq-logo.svg';
  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.environment === "sandbox" ? "https://public-api.sandbox.bunq.com" : "https://api.bunq.com"}}',
      url: '/v1/installation',
      method: 'GET',
    },
  };
  properties: INodeProperties[] = [
    {
      displayName: 'Environment',
      name: 'environment',
      type: 'options',
      options: [
        {
          name: 'Sandbox',
          value: 'sandbox',
        },
        {
          name: 'Production',
          value: 'production',
        },
      ],
      default: 'sandbox',
      description: 'The Bunq API environment to use',
    },
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