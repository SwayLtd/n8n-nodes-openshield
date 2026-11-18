import type {
	IDataObject,
	IExecuteFunctions,
	IHttpRequestOptions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import { properties } from './descriptions';
import {
	baseUrlOf,
	fraudDecideRequest,
	fraudEvent,
	imageBinaryRequest,
	imageByUrlRequest,
	jsonOf,
	refusalOf,
	textRequest,
	withDecision,
} from './GenericFunctions';

// Programmatic style: an image is sent as the raw bytes of an input binary, which declarative routing cannot send.
export class OpenShield implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'OpenShield',
		name: 'openShield',
		icon: { light: 'file:openshield.svg', dark: 'file:openshield.dark.svg' },
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["operation"] + ": " + $parameter["resource"]}}',
		description: 'Moderate images and texts and decide on fraud with OpenShield',
		defaults: { name: 'OpenShield' },
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [{ name: 'openShieldApi', required: true }],
		properties,
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];
		const credentials = await this.getCredentials('openShieldApi');
		const baseUrl = baseUrlOf(credentials.baseUrl);

		for (let i = 0; i < items.length; i++) {
			try {
				const resource = this.getNodeParameter('resource', i) as string;
				const operation = this.getNodeParameter('operation', i) as string;
				let request: IHttpRequestOptions;
				let kind: 'moderation' | 'fraud' = 'moderation';

				if (resource === 'image' || resource === 'text') {
					const options = this.getNodeParameter('options', i, {}) as IDataObject;
					const check = { workflow: options.workflow as string | undefined, ref: options.ref as string | undefined };
					if (resource === 'text') {
						const text = this.getNodeParameter('text', i) as string;
						request = textRequest(baseUrl, text, { ...check, context: options.context as string | undefined });
					} else if (operation === 'moderateUrl') {
						request = imageByUrlRequest(baseUrl, this.getNodeParameter('imageUrl', i) as string, check);
					} else {
						const property = this.getNodeParameter('binaryPropertyName', i) as string;
						const binary = this.helpers.assertBinaryData(i, property);
						const data = await this.helpers.getBinaryDataBuffer(i, property);
						request = imageBinaryRequest(baseUrl, data, binary.mimeType, check);
					}
				} else if (resource === 'fraud') {
					kind = 'fraud';
					const event = this.getNodeParameter('event', i) as string;
					const type = event === 'custom' ? (this.getNodeParameter('eventType', i) as string) : event;
					const fields: IDataObject = {
						actor_id: this.getNodeParameter('actorId', i, '') as string,
						email: this.getNodeParameter('email', i, '') as string,
						ip: this.getNodeParameter('ip', i, '') as string,
						...(this.getNodeParameter('additionalFields', i, {}) as IDataObject),
					};
					if (typeof fields.attrs === 'string') {
						try {
							fields.attrs = fields.attrs.trim() === '' ? undefined : (JSON.parse(fields.attrs) as IDataObject);
						} catch {
							throw new NodeOperationError(this.getNode(), 'Attributes must be a JSON object', { itemIndex: i });
						}
					}
					request = fraudDecideRequest(baseUrl, fraudEvent(type, fields));
				} else {
					throw new NodeOperationError(this.getNode(), `Unknown resource: ${resource}`, { itemIndex: i });
				}

				const response = (await this.helpers.httpRequestWithAuthentication.call(
					this,
					'openShieldApi',
					request,
				)) as { statusCode: number; headers?: IDataObject; body: unknown };
				const body = jsonOf(response.body);
				if (response.statusCode < 200 || response.statusCode >= 300) {
					const retryAfter = response.headers?.['retry-after'];
					const refusal = refusalOf(response.statusCode, body, retryAfter === undefined ? undefined : String(retryAfter));
					throw new NodeApiError(this.getNode(), body as JsonObject, {
						message: refusal.message,
						description: refusal.description,
						httpCode: String(response.statusCode),
						itemIndex: i,
					});
				}
				returnData.push({ json: withDecision(kind, body), pairedItem: { item: i } });
			} catch (error) {
				const failure =
					error instanceof NodeApiError || error instanceof NodeOperationError
						? error
						: new NodeOperationError(this.getNode(), error as Error, { itemIndex: i });
				if (this.continueOnFail()) {
					returnData.push({
						json: { error: failure.message, description: failure.description ?? null },
						pairedItem: { item: i },
					});
					continue;
				}
				throw failure;
			}
		}
		return [returnData];
	}
}
