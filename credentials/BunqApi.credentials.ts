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
  /**
   * Credential test: POST to /installation with the configured public key.
   *
   * This verifies two things:
   *   1. The Bunq API server is reachable for the selected environment.
   *   2. The Public Key (PEM) is accepted as a valid RSA key by Bunq.
   *
   * Limitation: the API Key and Private Key cannot be validated here because
   * Bunq's authentication is a multi-step flow (installation → device
   * registration → session creation) that cannot be expressed as a single HTTP
   * request. Those credentials are validated on first node execution.
   */
  test: ICredentialTestRequest = {
    request: {
      baseURL: '={{$credentials.environment === "sandbox" ? "https://public-api.sandbox.bunq.com/v1" : "https://api.bunq.com/v1"}}',
      url: '/installation',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache',
        'User-Agent': 'n8n-nodes-bunq/credential-test',
        'X-Bunq-Language': 'en_US',
        'X-Bunq-Region': 'nl_NL',
        'X-Bunq-Client-Request-Id': '={{"credential-test-" + Date.now()}}',
      },
      body: '={{ { client_public_key: $credentials.publicKey } }}',
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
      description: 'Your RSA public key in PEM format. This key is validated by the credential test.',
    },
  ];
}
