/* eslint-disable @n8n/community-nodes/no-restricted-imports -- tests run under Node, outside n8n, and are not published */
import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { IDataObject, IHttpRequestOptions } from 'n8n-workflow';
import { NodeApiError } from 'n8n-workflow';

import { OpenShield } from '../nodes/OpenShield/OpenShield.node';
import { context } from './support';

const moderation = {
	status: 'success',
	workflow: 'default',
	workflow_version: 1,
	summary: { action: 'review', reject_prob: 0, reject_reason: [], review_reason: [{ id: 'pii_email', score: 1, threshold: 1 }] },
	scores: { pii_email: 1 },
	time_ms: 4,
	request_id: 'req_1',
	ref: null,
};
const decision = { event_id: 'evt_1', decision: 'step_up', score: 40, reasons: [] };

test('each operation sends what the API documents and answers the response with its decision on top', async () => {
	const png = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
	const cases: Array<{
		name: string;
		parameters: IDataObject;
		credentials?: IDataObject;
		answer: IDataObject;
		request: Partial<IHttpRequestOptions>;
		decision: string;
	}> = [
		{
			name: 'an image by URL, with no option',
			parameters: { resource: 'image', operation: 'moderateUrl', imageUrl: 'https://example.com/a.jpg' },
			answer: moderation,
			request: { method: 'POST', url: 'https://api.openshield.dev/v1/image', qs: { url: 'https://example.com/a.jpg' }, json: true },
			decision: 'review',
		},
		{
			name: 'an image from a binary field, with a workflow and a ref, on a base URL with a trailing slash',
			parameters: { resource: 'image', operation: 'moderateBinary', binaryPropertyName: 'data', options: { workflow: 'avatars', ref: 'u_1' } },
			credentials: { apiKey: 'om_live_test', baseUrl: 'https://api.example.test/' },
			answer: { ...moderation, summary: { ...moderation.summary, action: 'reject' } },
			request: {
				method: 'POST',
				url: 'https://api.example.test/v1/image',
				qs: { workflow: 'avatars', ref: 'u_1' },
				body: png,
				headers: { 'Content-Type': 'image/png' },
				json: false,
			},
			decision: 'reject',
		},
		{
			name: 'a text with its context, and an empty workflow left out',
			parameters: { resource: 'text', operation: 'moderate', text: 'hello', options: { workflow: '', context: 'a reply' } },
			answer: { ...moderation, summary: { ...moderation.summary, action: 'accept' } },
			request: { method: 'POST', url: 'https://api.openshield.dev/v1/text', body: { text: 'hello', context: 'a reply' }, json: true },
			decision: 'accept',
		},
		{
			name: 'a text alone: no option is sent',
			parameters: { resource: 'text', operation: 'moderate', text: 'hello' },
			answer: moderation,
			request: { body: { text: 'hello' } },
			decision: 'review',
		},
		{
			name: 'a sign-up decision: the set fields only, the attributes parsed',
			parameters: {
				resource: 'fraud',
				operation: 'decide',
				event: 'account.created',
				actorId: 'u_1',
				email: 'someone@example.com',
				ip: '',
				additionalFields: { country: 'BE', attrs: '{"plan":"free"}', reported_by: 'server' },
			},
			answer: decision,
			request: {
				method: 'POST',
				url: 'https://api.openshield.dev/fraud/v1/decide',
				body: { type: 'account.created', actor_id: 'u_1', email: 'someone@example.com', country: 'BE', attrs: { plan: 'free' }, reported_by: 'server' },
				json: true,
			},
			decision: 'step_up',
		},
		{
			name: 'a login before sign-in: no actor, empty attributes left out',
			parameters: { resource: 'fraud', operation: 'decide', event: 'session.login', email: 'someone@example.com', ip: '203.0.113.9', additionalFields: { attrs: '{}' } },
			answer: { ...decision, decision: 'allow' },
			request: { url: 'https://api.openshield.dev/fraud/v1/decide', body: { type: 'session.login', email: 'someone@example.com', ip: '203.0.113.9' } },
			decision: 'allow',
		},
		{
			name: 'another event type, typed by hand',
			parameters: { resource: 'fraud', operation: 'decide', event: 'custom', eventType: 'challenge.succeeded', actorId: 'u_1' },
			answer: { ...decision, decision: 'allow' },
			request: { body: { type: 'challenge.succeeded', actor_id: 'u_1' } },
			decision: 'allow',
		},
	];

	for (const c of cases) {
		const { fn, sent } = context(c.parameters, { statusCode: 200, body: c.answer }, {
			credentials: c.credentials,
			binary: { data: png, mimeType: 'image/png' },
		});
		const [output] = await new OpenShield().execute.call(fn);
		assert.equal(sent.length, 1, `${c.name}: one request`);
		assert.equal(sent[0].credential, 'openShieldApi', `${c.name}: the OpenShield credential`);
		const request = sent[0].request;
		for (const [key, value] of Object.entries(c.request)) {
			assert.deepEqual(request[key as keyof IHttpRequestOptions], value, `${c.name}: ${key}`);
		}
		assert.equal(request.ignoreHttpStatusErrors, true, `${c.name}: refusals are read, not thrown by the HTTP layer`);
		assert.equal(request.returnFullResponse, true, `${c.name}: the status is read`);
		assert.deepEqual(output[0].json, { ...c.answer, decision: c.decision }, `${c.name}: the answer as-is, with its decision`);
	}
});

test('a refusal becomes a NodeApiError that says what to do, or an error item when the workflow continues on fail', async () => {
	const cases: Array<{ name: string; status: number; body: IDataObject; headers?: IDataObject; message: RegExp; description: RegExp }> = [
		{
			name: 'a refused key',
			status: 401,
			body: { status: 'failure', error: { type: 'unauthorized', code: 401, message: 'a valid API key is required' } },
			message: /refused the API key/,
			description: /credential/,
		},
		{
			name: 'fraud turned off',
			status: 404,
			body: { status: 'failure', error: { type: 'fraud_not_enabled', code: 404, message: 'turn it on in the dashboard' } },
			message: /Fraud prevention is not turned on/,
			description: /dashboard.*Fraud prevention/,
		},
		{
			name: 'fraud turned off, under another status',
			status: 403,
			body: { status: 'failure', error: { type: 'fraud_not_enabled', code: 403, message: 'turn it on in the dashboard' } },
			message: /Fraud prevention is not turned on/,
			description: /dashboard.*Fraud prevention/,
		},
		{
			name: 'a used-up test key',
			status: 429,
			body: { status: 'failure', error: { type: 'sandbox_quota_exceeded', code: 429, message: 'the sandbox quota is used up' } },
			message: /sandbox quota of this test key/,
			description: /live key \(om_live_\)/,
		},
		{
			name: 'an empty balance',
			status: 429,
			body: { status: 'failure', error: { type: 'quota_exceeded', code: 429, message: 'the balance is used up' } },
			headers: { 'retry-after': '3600' },
			message: /balance is used up/,
			description: /https:\/\/www\.openshield\.dev\/dashboard\/billing.*OpenShield said: the balance is used up.*3600 seconds/,
		},
		{
			name: 'a rate limit',
			status: 429,
			body: { status: 'failure', error: { type: 'rate_limited', code: 429, message: 'slow down' } },
			headers: { 'retry-after': '2' },
			message: /rate limiting these calls \(rate_limited\)/,
			description: /2 seconds/,
		},
		{
			name: 'a missing scope',
			status: 403,
			body: { status: 'failure', error: { type: 'forbidden', code: 403, message: 'the key may not check texts' } },
			message: /refused this call \(forbidden\)/,
			description: /scope.*may not check texts/,
		},
		{
			name: 'a paused fraud instance',
			status: 503,
			body: { status: 'failure', error: { type: 'fraud_waking', code: 503, message: 'retry in a few seconds' } },
			headers: { 'retry-after': '5' },
			message: /could not answer \(503 fraud_waking\)/,
			description: /retry.*5 seconds/,
		},
		{
			name: 'an answer that is not JSON',
			status: 502,
			body: { raw: 'Bad Gateway' },
			message: /could not answer \(502\)/,
			description: /retry/,
		},
		{
			name: "openfraud's own refusal, without status or code",
			status: 400,
			body: { error: { type: 'invalid_event', message: 'the `type` must be lowercase words' } },
			message: /refused the request \(400 invalid_event\)/,
			description: /lowercase words/,
		},
	];

	for (const c of cases) {
		const parameters = { resource: 'fraud', operation: 'decide', event: 'account.created', actorId: 'u_1' };
		const raw = c.body.raw ?? c.body;
		const { fn } = context(parameters, { statusCode: c.status, body: raw, headers: c.headers });
		await assert.rejects(
			new OpenShield().execute.call(fn),
			(error: unknown) => {
				assert.ok(error instanceof NodeApiError, `${c.name}: a NodeApiError`);
				assert.match(error.message, c.message, `${c.name}: message`);
				assert.match(String(error.description), c.description, `${c.name}: description`);
				assert.equal(error.httpCode, String(c.status), `${c.name}: the status`);
				return true;
			},
			`${c.name}: refused`,
		);

		const continuing = context(parameters, { statusCode: c.status, body: raw, headers: c.headers }, { continueOnFail: true });
		const [output] = await new OpenShield().execute.call(continuing.fn);
		assert.match(String(output[0].json.error), c.message, `${c.name}: the error item when continuing`);
	}

	// A JSON parameter that is not JSON is the user's mistake, said before any call.
	const { fn, sent } = context(
		{ resource: 'fraud', operation: 'decide', event: 'account.created', additionalFields: { attrs: '{plan' } },
		{ statusCode: 200, body: decision },
	);
	await assert.rejects(new OpenShield().execute.call(fn), /Attributes must be a JSON object/);
	assert.equal(sent.length, 0, 'no call with broken attributes');
});
