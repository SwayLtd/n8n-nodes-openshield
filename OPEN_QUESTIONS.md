# Open questions

> Status: open, to answer before publishing 0.1.0
> Last checked: 2026-11-18

Points the public docs (`llms-full.txt`, `llms.txt`) leave unclear. The node does not guess on any of them: each one says what it does today.

1. **Payment events.** The docs say to call `decide` before a payment, but document no payment event type (only `account.created`, `session.login` and `challenge.*`). The node offers Sign-Up, Login and Other (any type typed in). Which type should a payment send, so the node can offer a Payment option?
2. **Decision values.** The overview lists four decisions (`allow`, `step_up`, `hold`, `block`); the fraud page lists six (adds `review` and `quarantine`). The node passes the value through untouched and the README lists six. Which list is right?
3. **Image Content-Type.** The docs say the raw body is the image, but not which `Content-Type` to send. The node sends the binary's MIME type, or `application/octet-stream` when it has none. Is any value accepted?
4. **Credential test.** The test calls `GET /v1/workflows`. Its cost and required scope are not documented. Is it free? Does a key with only the `fraud` or `fraud_events` scope get a `403` there, which would make the test fail for a fraud-only key?
5. **`fraud_not_enabled` and `quota_exceeded`.** The public docs name these error types but not their status codes or messages. The gateway source answers `404 fraud_not_enabled` and `429 quota_exceeded`; the node matches on the type whatever the status, so a change of status keeps the hint. Should the docs state the codes?
6. **Auth header for fraud.** One page says every endpoint takes `Authorization: Bearer` or `X-Api-Key`; the fraud page only shows Bearer. The node always sends Bearer. Does `/fraud/v1` take `X-Api-Key` too?
7. **`Idempotency-Key` and `dry_run`.** The gateway accepts both on `decide`, but the public docs do not mention them, so the node does not offer them. Should they be documented and added?
8. **Fraud example key.** The fraud curl uses `$OPENSHIELD_KEY`, the rest of the docs `$OPENSHIELD_API_KEY`. A docs fix, not a node question.
9. **`sandbox` field.** The docs list a `sandbox` field in moderation answers, but real answers never carry it. The node returns what the API sends; the README does not mention the field.
