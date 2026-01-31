import {
  ICredentialType,
  INodeProperties,
  Icon,
} from 'n8n-workflow';

export class BunqDevicePrivateKey implements ICredentialType {
  name = 'bunqDevicePrivateKey';
  displayName = 'Bunq Device Private Key';
  icon: Icon = {
		light: 'file:Bunq-logo.svg',
		dark: 'file:Bunq-logo.svg',
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