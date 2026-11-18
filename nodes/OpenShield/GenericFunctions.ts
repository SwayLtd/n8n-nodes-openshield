import type { IDataObject, IHttpRequestOptions } from 'n8n-workflow';

export const DEFAULT_BASE_URL = 'https://api.openshield.dev';
const BILLING_URL = 'https://www.openshield.dev/dashboard/billing';
const DASHBOARD_URL = 'https://www.openshield.dev/dashboard';

/** The optional fields every check takes: the workflow (`default` when empty) and your own id for the content. */
export interface CheckOptions {
	workflow?: string;
	ref?: string;
}

/** The base URL without a trailing slash, the documented production one when empty. */
export function baseUrlOf(value: unknown): string {
	const text = typeof value === 'string' ? value.trim() : '';
	return (text === '' ? DEFAULT_BASE_URL : text).replace(/\/+$/, '');
}

/** Only the options that are set: an empty workflow lets the API use `default`. */
function checkQuery(options: CheckOptions): IDataObject {
	const query: IDataObject = {};
	if (options.workflow) query.workflow = options.workflow;
	if (options.ref) query.ref = options.ref;
	return query;
}

/** Every request reads the answer whatever its status: the node turns a refusal into a clear error itself. */
const answered = { ignoreHttpStatusErrors: true, returnFullResponse: true } as const;

/** `POST /v1/image?url=...`: the API fetches a public image itself; the body is empty. */
export function imageByUrlRequest(baseUrl: string, imageUrl: string, options: CheckOptions): IHttpRequestOptions {
	return {
		method: 'POST',
		url: `${baseUrl}/v1/image`,
		qs: { ...checkQuery(options), url: imageUrl },
		json: true,
		...answered,
	};
}

/** `POST /v1/image` with the image's bytes as the raw body; the API reads the format from the bytes. */
export function imageBinaryRequest(
	baseUrl: string,
	data: Buffer,
	mimeType: string | undefined,
	options: CheckOptions,
): IHttpRequestOptions {
	return {
		method: 'POST',
		url: `${baseUrl}/v1/image`,
		qs: checkQuery(options),
		body: data,
		headers: { 'Content-Type': mimeType || 'application/octet-stream' },
		json: false,
		...answered,
	};
}

/** `POST /v1/text` with a JSON body; `context` is sent only when given. */
export function textRequest(
	baseUrl: string,
	text: string,
	options: CheckOptions & { context?: string },
): IHttpRequestOptions {
	const body: IDataObject = { text, ...checkQuery(options) };
	if (options.context) body.context = options.context;
	return { method: 'POST', url: `${baseUrl}/v1/text`, body, json: true, ...answered };
}

/** `POST /fraud/v1/decide` with the event as the JSON body. */
export function fraudDecideRequest(baseUrl: string, event: IDataObject): IHttpRequestOptions {
	return { method: 'POST', url: `${baseUrl}/fraud/v1/decide`, body: event, json: true, ...answered };
}

/** The fraud event: its type, then only the fields that are set, under the API's own names. */
export function fraudEvent(type: string, fields: IDataObject): IDataObject {
	const event: IDataObject = { type };
	for (const [name, value] of Object.entries(fields)) {
		if (value === undefined || value === null || value === '') continue;
		if (typeof value === 'object' && !Array.isArray(value) && Object.keys(value).length === 0) continue;
		event[name] = value;
	}
	return event;
}

/** A body the API answered, as an object: JSON text or bytes are parsed, anything unreadable is kept as `raw`. */
export function jsonOf(body: unknown): IDataObject {
	if (body === undefined || body === null || body === '') return {};
	if (typeof body === 'object' && !Buffer.isBuffer(body)) return body as IDataObject;
	const text = Buffer.isBuffer(body) ? body.toString('utf8') : String(body);
	try {
		const parsed: unknown = JSON.parse(text);
		return parsed !== null && typeof parsed === 'object' ? (parsed as IDataObject) : { raw: text };
	} catch {
		return { raw: text };
	}
}

/** The answer as the API gave it, with `decision` on top: a check's `summary.action`, a fraud call's own `decision`. */
export function withDecision(kind: 'moderation' | 'fraud', answer: IDataObject): IDataObject {
	const summary = answer.summary as IDataObject | undefined;
	const decision = kind === 'fraud' ? answer.decision : summary?.action;
	return { ...answer, decision: decision ?? null };
}

/** What a refusal tells the person who runs the workflow. */
export interface Refusal {
	message: string;
	description: string;
}

/** The refusal of an answer that is not 2xx, from its status, its `error.type` and the `Retry-After` header. */
export function refusalOf(status: number, body: IDataObject, retryAfter?: string): Refusal {
	const error = (body.error ?? {}) as IDataObject;
	const type = typeof error.type === 'string' ? error.type : '';
	const said = typeof error.message === 'string' ? error.message : '';
	const wait = retryAfter ? ` Retry after ${retryAfter} seconds.` : '';
	const detail = said ? ` OpenShield said: ${said}` : '';

	// The error type decides first, whatever the status: it says what to do.
	if (type === 'fraud_not_enabled') {
		return {
			message: 'Fraud prevention is not turned on for this OpenShield organization',
			description: `An owner or an admin turns it on in the OpenShield dashboard (${DASHBOARD_URL}) under Fraud prevention, then uses a key with fraud access. The instance starts in a few seconds.`,
		};
	}
	if (type === 'quota_exceeded') {
		return {
			message: 'The OpenShield balance is used up',
			description: `Top up at ${BILLING_URL}, or wait for next month's free use.${detail}${wait}`,
		};
	}
	if (type === 'sandbox_quota_exceeded') {
		return {
			message: 'The sandbox quota of this test key is used up',
			description: `Use a live key (om_live_) in the OpenShield API credential.${wait}`,
		};
	}
	if (status === 401) {
		return {
			message: 'OpenShield refused the API key',
			description: `Check the API key in the OpenShield API credential: a live key (om_live_), not revoked or expired.${detail}`,
		};
	}
	if (status === 429) {
		return {
			message: `OpenShield is rate limiting these calls (${type || 'rate_limited'})`,
			description: `Slow down or retry later.${wait}${detail}`,
		};
	}
	if (status === 403) {
		return {
			message: `OpenShield refused this call (${type || 'forbidden'})`,
			description: `The key may lack the scope for this call (image, text, fraud or fraud_events) or the workflow, or the organization is suspended.${detail}`,
		};
	}
	if (status >= 500) {
		return {
			message: `OpenShield could not answer (${status}${type ? ` ${type}` : ''})`,
			description: `A temporary problem: retry in a few seconds.${wait}${detail}`,
		};
	}
	return {
		message: `OpenShield refused the request (${status}${type ? ` ${type}` : ''})`,
		description: said || 'See the error in the response.',
	};
}
