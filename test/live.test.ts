/* eslint-disable @n8n/community-nodes/no-restricted-imports, @n8n/community-nodes/no-restricted-globals, @n8n/community-nodes/require-node-api-error -- tests run under Node, outside n8n, and are not published */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { IDataObject, IHttpRequestOptions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { OpenShield } from '../nodes/OpenShield/OpenShield.node';
import { context } from './support';

// One real call per operation, only when OPENSHIELD_API_KEY is set. Each call is billed like any other.
const apiKey = process.env.OPENSHIELD_API_KEY ?? '';
const baseUrl = process.env.OPENSHIELD_BASE_URL ?? 'https://api.openshield.dev';
const imageUrl = process.env.OPENSHIELD_TEST_IMAGE_URL ?? 'https://www.openshield.dev/og.png';
const skip = apiKey === '' ? 'OPENSHIELD_API_KEY is not set' : false;

// A 1x1 transparent PNG.
const png = Buffer.from(
	'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==',
	'base64',
);

/** The HTTP layer for real, with the credential's Bearer header, as n8n would send it. */
async function send(request: IHttpRequestOptions) {
	const url = new URL(request.url);
	for (const [name, value] of Object.entries(request.qs ?? {})) url.searchParams.set(name, String(value));
	const headers: Record<string, string> = { Authorization: `Bearer ${apiKey}`, ...(request.headers as Record<string, string>) };
	let body: string | Uint8Array | undefined;
	if (Buffer.isBuffer(request.body)) body = new Uint8Array(request.body);
	else if (request.body !== undefined) {
		body = JSON.stringify(request.body);
		headers['Content-Type'] = 'application/json';
	}
	const response = await fetch(url, { method: request.method, headers, body });
	return { statusCode: response.status, headers: { 'retry-after': response.headers.get('retry-after') ?? undefined }, body: await response.text() };
}

test('live: every operation gets an answer with its decision', { skip }, async () => {
	const credentials = { apiKey, baseUrl };
	const cases: Array<{ name: string; parameters: IDataObject; decisions: string[] }> = [
		{ name: 'image by URL', parameters: { resource: 'image', operation: 'moderateUrl', imageUrl }, decisions: ['accept', 'review', 'reject'] },
		{ name: 'image from binary', parameters: { resource: 'image', operation: 'moderateBinary', binaryPropertyName: 'data' }, decisions: ['accept', 'review', 'reject'] },
		{ name: 'text', parameters: { resource: 'text', operation: 'moderate', text: 'Hello, this is a smoke test.' }, decisions: ['accept', 'review', 'reject'] },
		{
			name: 'fraud decision',
			parameters: { resource: 'fraud', operation: 'decide', event: 'account.created', actorId: 'n8n-smoke-test', email: 'smoke@example.com' },
			decisions: ['allow', 'step_up', 'review', 'hold', 'block', 'quarantine'],
		},
	];
	for (const c of cases) {
		const { fn } = context(c.parameters, send, { credentials, binary: { data: png, mimeType: 'image/png' } });
		try {
			const [output] = await new OpenShield().execute.call(fn);
			assert.ok(c.decisions.includes(String(output[0].json.decision)), `${c.name}: decision ${String(output[0].json.decision)}`);
		} catch (error) {
			// An organization without fraud prevention answers the documented refusal: the node said what to do.
			if (c.name === 'fraud decision' && error instanceof NodeApiError && /not turned on/.test(error.message)) continue;
			throw error;
		}
	}
});
