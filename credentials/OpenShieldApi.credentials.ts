import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class OpenShieldApi implements ICredentialType {
	name = 'openShieldApi';

	displayName = 'OpenShield API';

	icon = { light: 'file:../nodes/OpenShield/openshield.svg', dark: 'file:../nodes/OpenShield/openshield.dark.svg' } as const;

	documentationUrl = 'https://www.openshield.dev/docs/authentication';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description:
				'A live key (om_live_...) from API keys in the OpenShield dashboard. Moderation needs the image or text scope; fraud decisions need fraud or fraud_events.',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.openshield.dev',
			description: 'The OpenShield API address. Keep the default unless OpenShield gave you another one.',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.apiKey}}',
			},
		},
	};

	// Lists the workflows the key may use: a read, not a check, so it uses no balance.
	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl}}',
			url: '/v1/workflows',
			method: 'GET',
		},
	};
}
