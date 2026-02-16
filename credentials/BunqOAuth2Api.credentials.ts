import {
  ICredentialType,
  INodeProperties,
  Icon,
} from 'n8n-workflow';

export class BunqOAuth2Api implements ICredentialType {
  name = 'bunqOAuth2Api';
  extends = ['oAuth2Api'];
  displayName = 'Bunq OAuth2 API';
  documentationUrl = 'https://doc.bunq.com/basics/authentication/oauth';
  icon: Icon = 'file:../assets/Bunq-logo.svg';
  httpRequestNode = {
    name: 'Bunq OAuth2 API',
    docsUrl: 'https://doc.bunq.com/basics/authentication/oauth',
    hidden: true,
    apiBaseUrlPlaceholder: 'https://api.bunq.com/v1',
  };
  properties: INodeProperties[] = [
    {
      displayName: 'Grant Type',
      name: 'grantType',
      type: 'hidden',
      default: 'authorizationCode',
    },
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
      displayName: 'Authorization URL',
      name: 'authUrl',
      type: 'hidden',
      default: '={{$self.environment === "sandbox" ? "https://oauth.sandbox.bunq.com/auth" : "https://oauth.bunq.com/auth"}}',
      required: true,
    },
    {
      displayName: 'Access Token URL',
      name: 'accessTokenUrl',
      type: 'hidden',
      default: '={{$self.environment === "sandbox" ? "https://oauth.sandbox.bunq.com/token" : "https://oauth.bunq.com/token"}}',
      required: true,
    },
    {
      displayName: 'Scope',
      name: 'scope',
      type: 'hidden',
      default: '',
    },
    {
      displayName: 'Auth URI Query Parameters',
      name: 'authQueryParameters',
      type: 'hidden',
      default: '',
    },
    {
      displayName: 'Authentication',
      name: 'authentication',
      type: 'hidden',
      default: 'body',
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
