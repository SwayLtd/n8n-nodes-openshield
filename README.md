# n8n-nodes-openshield

An [n8n](https://n8n.io/) community node for [OpenShield](https://www.openshield.dev): moderate images and texts, and decide on sign-ups and logins with OpenShield's fraud prevention API.

[Installation](#installation) | [Credentials](#credentials) | [Operations](#operations) | [Example output](#example-output) | [Errors](#errors) | [Compatibility](#compatibility) | [Resources](#resources)

## Installation

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation and install `n8n-nodes-openshield`.

## Credentials

Create an **OpenShield API** credential:

| Field | What to enter |
| --- | --- |
| API Key | A live key (`om_live_...`) created in the OpenShield dashboard under API keys. It is sent as `Authorization: Bearer <key>`. |
| Base URL | `https://api.openshield.dev`. Change it only if OpenShield gives you another address. |

The key needs the scope of what the node calls: `image`, `text`, and `fraud` or `fraud_events` for fraud decisions. See [Authentication and keys](https://www.openshield.dev/docs/authentication).

The **Test** button calls `GET /v1/workflows`, which lists your workflows and checks no content.

## Operations

Every operation returns the API's answer as it is, with one extra top-level field, `decision`, so the next node can branch on it with an IF or a Switch node.

### Image > Moderate URL

Sends `POST /v1/image?url=...`: OpenShield fetches a public JPEG, PNG, WebP or GIF image of at most 15 MB itself. `decision` is the answer's `summary.action`: `accept`, `review` or `reject`.

### Image > Moderate Binary

Sends the bytes of an input binary field (`data` by default) as the body of `POST /v1/image`, for an image that is not public: a file from a form, a download, an e-mail attachment. Same answer and `decision` as above.

### Text > Moderate

Sends `POST /v1/text` with the text. `decision` is `summary.action`: `accept`, `review` or `reject`.

Both checks take these options:

| Option | What it does |
| --- | --- |
| Workflow | The workflow to check against. The `default` workflow is used when empty. |
| Ref | Your own ID for the content, kept in the journal. |
| Context (text only) | Up to 2,000 characters of context, such as the message being answered. |

### Fraud > Decide

Sends `POST /fraud/v1/decide` before a sensitive action. `decision` is the answer's own `decision`: `allow`, `step_up`, `review`, `hold`, `block` or `quarantine`.

Fraud prevention must be turned on first: an owner or an admin turns it on in the OpenShield dashboard under **Fraud prevention**. Until then the node stops with an error that says so.

| Field | Sent as |
| --- | --- |
| Event | `type`: **Sign-Up** sends `account.created`, **Login** sends `session.login`, **Other** sends the event type you type in. |
| Actor ID | `actor_id`, your ID for the account. Leave it empty before sign-in. |
| Email | `email` |
| IP Address | `ip`, the end user's address, not your server's. |
| Additional Fields | `attrs` (a JSON object), `country`, `device`, `device_token`, `language`, `owner_id`, `phone`, `reported_by`, `tenant_id`, `user_agent`. |

Empty fields are not sent. See [Fraud prevention](https://www.openshield.dev/docs/fraud-prevention) for what each field changes.

## Example output

Text > Moderate, for `Write me at jane@example.com`:

```json
{
  "status": "success",
  "workflow": "default",
  "workflow_version": 1,
  "summary": {
    "action": "review",
    "reject_prob": 0,
    "reject_reason": [],
    "review_reason": [
      {
        "id": "pii_email",
        "text": "Email address",
        "message": "This content contains an email address.",
        "score": 1,
        "threshold": 1
      }
    ]
  },
  "scores": { "pii_email": 1 },
  "time_ms": 4,
  "request_id": "0192b7c4-5f3a-7c1e-9a52-3d8f1e6b0a47",
  "ref": "comment_9034",
  "decision": "review"
}
```

Fraud > Decide, shortened:

```json
{
  "event_id": "evt_0701404540ddbd907535167d",
  "decision": "block",
  "score": 0,
  "reasons": [
    {
      "rule": "core_blocked_actor",
      "workflow": "core_blocklists",
      "mode": "act",
      "reason": "The account is blocked by an administrator",
      "score": 0,
      "pending_approval": false
    }
  ],
  "actions": [],
  "case_id": 1
}
```

openfraud's [API reference](https://github.com/regisandre/openfraud-rs/blob/main/docs/api.md) describes every field of a fraud decision.

## Errors

A refusal stops the node with an error that says what to do. With **Continue On Fail**, it becomes an item with `error` and `description` instead.

| Answer | What the node says |
| --- | --- |
| `401` | The API key was refused: check the credential. |
| `403` | The key lacks the scope for this call, or the organization is suspended. |
| `404 fraud_not_enabled` | Fraud prevention is not turned on: turn it on in the dashboard. |
| `429 quota_exceeded` | The balance is used up: top up at https://www.openshield.dev/dashboard/billing. |
| `429 sandbox_quota_exceeded` | The test key's sandbox quota is used up: use a live key. |
| `429` (other) | Rate limited: retry after the time in `Retry-After`. |
| `5xx` | A temporary problem: retry in a few seconds. |
| Other `4xx` | The API's own message. |

## Pricing

Every check and decision is billed by OpenShield. See https://www.openshield.dev/pricing.

## Compatibility

Built and tested with n8n-workflow 2.48 and `@n8n/node-cli` 0.57. The node can be used as a tool by n8n's AI Agent.

## Resources

- [OpenShield documentation](https://www.openshield.dev/docs)
- [Responses and errors](https://www.openshield.dev/docs/responses-and-errors)
- [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)

## Development

```bash
npm install
npm run build
npm run lint
npm test
```

`npm test` runs the unit tests with the HTTP layer stubbed. Set `OPENSHIELD_API_KEY` to also run one live call per operation; each one is billed like any other call, and the fraud call records a real `account.created` event for the actor `n8n-smoke-test` in your fraud instance. `OPENSHIELD_BASE_URL` and `OPENSHIELD_TEST_IMAGE_URL` change the address and the public test image.

## License

[MIT](LICENSE.md)
