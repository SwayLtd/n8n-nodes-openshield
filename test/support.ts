import type { IDataObject, IExecuteFunctions, IHttpRequestOptions, INode } from 'n8n-workflow';

/** One call the node made to the HTTP layer. */
export interface Sent {
	credential: string;
	request: IHttpRequestOptions;
}

/** What the stubbed HTTP layer answers: a status, a body and headers, or a function of the request. */
export type Answer =
	| { statusCode: number; body: unknown; headers?: IDataObject }
	| ((request: IHttpRequestOptions) => Promise<{ statusCode: number; body: unknown; headers?: IDataObject }>);

const node: INode = {
	id: 'test-node',
	name: 'OpenShield',
	type: 'n8n-nodes-openshield.openShield',
	typeVersion: 1,
	position: [0, 0],
	parameters: {},
};

/**
 * A stand-in for n8n's execution context: one input item, the given parameters, an image in the `data` binary field,
 * the given credential, and an HTTP layer that keeps every request and gives `answer`.
 */
export function context(
	parameters: IDataObject,
	answer: Answer,
	options: { credentials?: IDataObject; continueOnFail?: boolean; binary?: { data: Buffer; mimeType: string } } = {},
): { fn: IExecuteFunctions; sent: Sent[] } {
	const sent: Sent[] = [];
	const binary = options.binary ?? { data: Buffer.from([0x89, 0x50, 0x4e, 0x47]), mimeType: 'image/png' };
	const fn = {
		getInputData: () => [{ json: {} }],
		getNode: () => node,
		getCredentials: async () => options.credentials ?? { apiKey: 'om_live_test', baseUrl: 'https://api.openshield.dev' },
		getNodeParameter: (name: string, _index: number, fallback?: unknown) => {
			if (name in parameters) return parameters[name];
			if (fallback !== undefined) return fallback;
			throw new Error(`no parameter ${name}`);
		},
		continueOnFail: () => options.continueOnFail ?? false,
		helpers: {
			assertBinaryData: () => ({ data: '', mimeType: binary.mimeType }),
			getBinaryDataBuffer: async () => binary.data,
			httpRequestWithAuthentication: async function (credential: string, request: IHttpRequestOptions) {
				sent.push({ credential, request });
				return typeof answer === 'function' ? answer(request) : answer;
			},
		},
	} as unknown as IExecuteFunctions;
	return { fn, sent };
}
