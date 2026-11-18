import type { INodeProperties } from 'n8n-workflow';

const show = (resource: string, operation?: string) => ({
	show: operation === undefined ? { resource: [resource] } : { resource: [resource], operation: [operation] },
});

/** The workflow, your own ref and, for a text, the context: the options every check takes. */
const checkOptions = (resource: 'image' | 'text'): INodeProperties => ({
	displayName: 'Options',
	name: 'options',
	type: 'collection',
	placeholder: 'Add Option',
	default: {},
	displayOptions: show(resource),
	options: [
		...(resource === 'text'
			? [
					{
						displayName: 'Context',
						name: 'context',
						type: 'string',
						typeOptions: { rows: 3 },
						default: '',
						description:
							'At most 2,000 characters of context, such as the message being answered. Read by the advanced reading after a first top-up, and not kept in the journal.',
					} as INodeProperties,
				]
			: []),
		{
			displayName: 'Ref',
			name: 'ref',
			type: 'string',
			default: '',
			description: 'Your own ID for the content, 1 to 128 characters, kept in the journal',
		},
		{
			displayName: 'Workflow',
			name: 'workflow',
			type: 'string',
			default: '',
			placeholder: 'default',
			description: 'The workflow to check against. The "default" workflow is used when empty.',
		},
	],
});

export const properties: INodeProperties[] = [
	{
		displayName: 'Resource',
		name: 'resource',
		type: 'options',
		noDataExpression: true,
		options: [
			{ name: 'Fraud', value: 'fraud' },
			{ name: 'Image', value: 'image' },
			{ name: 'Text', value: 'text' },
		],
		default: 'text',
	},

	// Image
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('image'),
		options: [
			{
				name: 'Moderate Binary',
				value: 'moderateBinary',
				description: 'Check an image from an input binary property',
				action: 'Moderate an image file',
			},
			{
				name: 'Moderate URL',
				value: 'moderateUrl',
				description: 'Check an image at a public URL',
				action: 'Moderate an image by URL',
			},
		],
		default: 'moderateUrl',
	},
	{
		displayName: 'Image URL',
		name: 'imageUrl',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'https://example.com/avatar.jpg',
		description: 'A public http or https address of a JPEG, PNG, WebP or GIF image of at most 15 MB',
		displayOptions: show('image', 'moderateUrl'),
	},
	{
		displayName: 'Input Binary Field',
		name: 'binaryPropertyName',
		type: 'string',
		required: true,
		default: 'data',
		hint: 'The name of the input binary field holding the image',
		description: 'A JPEG, PNG, WebP or GIF image of at most 15 MB',
		displayOptions: show('image', 'moderateBinary'),
	},
	checkOptions('image'),

	// Text
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('text'),
		options: [
			{
				name: 'Moderate',
				value: 'moderate',
				description: 'Check a text',
				action: 'Moderate a text',
			},
		],
		default: 'moderate',
	},
	{
		displayName: 'Text',
		name: 'text',
		type: 'string',
		typeOptions: { rows: 4 },
		required: true,
		default: '',
		description: 'The text to check: at most 5,000 characters before a first top-up, more after',
		displayOptions: show('text', 'moderate'),
	},
	checkOptions('text'),

	// Fraud
	{
		displayName: 'Operation',
		name: 'operation',
		type: 'options',
		noDataExpression: true,
		displayOptions: show('fraud'),
		options: [
			{
				name: 'Decide',
				value: 'decide',
				description: 'Decide on an event before acting on it',
				action: 'Decide on an event',
			},
		],
		default: 'decide',
	},
	{
		displayName: 'Fraud prevention must be turned on in the OpenShield dashboard, and the key needs the fraud or fraud_events scope',
		name: 'fraudNotice',
		type: 'notice',
		default: '',
		displayOptions: show('fraud'),
	},
	{
		displayName: 'Event',
		name: 'event',
		type: 'options',
		options: [
			{ name: 'Login', value: 'session.login', description: 'A sign-in (session.login)' },
			{ name: 'Other', value: 'custom', description: 'Another event type of the OpenShield fraud API' },
			{ name: 'Sign-Up', value: 'account.created', description: 'A new account (account.created)' },
		],
		default: 'account.created',
		displayOptions: show('fraud', 'decide'),
	},
	{
		displayName: 'Event Type',
		name: 'eventType',
		type: 'string',
		required: true,
		default: '',
		placeholder: 'challenge.succeeded',
		description: 'The event type, lowercase words joined by dots',
		displayOptions: { show: { resource: ['fraud'], operation: ['decide'], event: ['custom'] } },
	},
	{
		displayName: 'Actor ID',
		name: 'actorId',
		type: 'string',
		default: '',
		description: 'Your ID for the account. Leave empty before sign-in.',
		displayOptions: show('fraud', 'decide'),
	},
	{
		displayName: 'Email',
		name: 'email',
		type: 'string',
		placeholder: 'name@email.com',
		default: '',
		description: "The account's email address",
		displayOptions: show('fraud', 'decide'),
	},
	{
		displayName: 'IP Address',
		name: 'ip',
		type: 'string',
		default: '',
		description: "The end user's IP address, not your server's",
		displayOptions: show('fraud', 'decide'),
	},
	{
		displayName: 'Additional Fields',
		name: 'additionalFields',
		type: 'collection',
		placeholder: 'Add Field',
		default: {},
		displayOptions: show('fraud', 'decide'),
		options: [
			{
				displayName: 'Attributes (JSON)',
				name: 'attrs',
				type: 'json',
				default: '{}',
				description: 'Any facts of yours about the event, as a JSON object',
			},
			{
				displayName: 'Country',
				name: 'country',
				type: 'string',
				default: '',
				placeholder: 'BE',
				description: "The end user's country, two letters",
			},
			{
				displayName: 'Device',
				name: 'device',
				type: 'string',
				default: '',
				description: "Your ID for the end user's device",
			},
			{
				displayName: 'Device Token',
				name: 'device_token',
				type: 'string',
				typeOptions: { password: true },
				default: '',
				description: "The token of OpenShield's device script, when your page runs it",
			},
			{
				displayName: 'Language',
				name: 'language',
				type: 'string',
				default: '',
				placeholder: 'fr-BE,fr;q=0.9',
				description: "The end user's Accept-Language header or language tag",
			},
			{
				displayName: 'Owner ID',
				name: 'owner_id',
				type: 'string',
				default: '',
				description: 'The owner of what the event is about',
			},
			{
				displayName: 'Phone',
				name: 'phone',
				type: 'string',
				default: '',
				placeholder: '+32470123456',
				description: 'An international phone number',
			},
			{
				displayName: 'Reported By',
				name: 'reported_by',
				type: 'options',
				options: [
					{ name: 'Client', value: 'client', description: 'A page reported it: its account fields are dropped' },
					{ name: 'Server', value: 'server', description: 'Your backend saw it and knows who is signed in' },
				],
				default: 'server',
			},
			{
				displayName: 'Tenant ID',
				name: 'tenant_id',
				type: 'string',
				default: '',
				description: 'The organization or workspace the account acts in',
			},
			{
				displayName: 'User Agent',
				name: 'user_agent',
				type: 'string',
				default: '',
				description: "The end user's User-Agent header, not your server's",
			},
		],
	},
];
