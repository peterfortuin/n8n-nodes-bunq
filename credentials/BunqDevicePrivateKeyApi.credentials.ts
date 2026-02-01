import {
  ICredentialType,
  INodeProperties,
  Icon,
  ICredentialTestRequest,
} from 'n8n-workflow';

export class BunqDevicePrivateKeyApi implements ICredentialType {
  name = 'bunqDevicePrivateKeyApi';
  displayName = 'Bunq Device Private Key API';
  documentationUrl = 'https://doc.bunq.com';
  icon: Icon = 'file:Bunq-logo.svg';
  test: ICredentialTestRequest = {
    request: {
      baseURL: 'https://api.bunq.com',
      url: '/v1/installation',
      method: 'GET',
    },
  };
  properties: INodeProperties[] = [
    {
      displayName: 'Private Key (PEM)',
      name: 'privateKey',
      type: 'string',
      typeOptions: {
        rows: 8,
        password: true,
      },
      default: '',
    },
  ];
}