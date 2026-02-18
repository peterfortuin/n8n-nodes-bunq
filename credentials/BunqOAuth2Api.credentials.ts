import {
  ICredentialType,
  INodeProperties,
  Icon,
  ICredentialTestRequest,
} from 'n8n-workflow';

export class BunqOAuth2Api implements ICredentialType {
  name = 'bunqOAuth2Api';
  displayName = 'Bunq OAuth2 API';
  documentationUrl = 'https://doc.bunq.com/basics/authentication/oauth';
  icon: Icon = 'file:../assets/Bunq-logo.svg';
  httpRequestNode = {
    name: 'Bunq OAuth2 API',
    docsUrl: 'https://doc.bunq.com/basics/authentication/oauth',
    hidden: true,
    apiBaseUrlPlaceholder: 'https://api.bunq.com/v1',
  };
  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.environment === "sandbox" ? "https://public-api.sandbox.bunq.com" : "https://api.bunq.com"}}',
      url: '/v1/user',
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
      displayName: 'OAuth Access Token',
      name: 'accessToken',
      type: 'string',
      typeOptions: {
        password: true,
      },
      default: '',
      required: true,
      description: 'OAuth Access Token obtained from Bunq. Follow the OAuth setup instructions in the documentation to obtain this token.',
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
      description: 'Your RSA private key in PEM format (required for request signing)',
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
      description: 'Your RSA public key in PEM format (required for installation)',
    },
  ];
}
