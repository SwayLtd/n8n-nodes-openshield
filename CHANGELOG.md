# Changelog

## 0.1.1

- Published by Sway SRL through npm trusted publishing (OIDC); no change to the node.

## 0.1.0

First version.

- OpenShield API credential: API key and base URL, tested with `GET /v1/workflows`.
- Image > Moderate URL and Image > Moderate Binary (`POST /v1/image`).
- Text > Moderate (`POST /v1/text`).
- Fraud > Decide (`POST /fraud/v1/decide`) for sign-ups, logins and any other event type.
- Every answer is returned as it is, plus a top-level `decision`.
- Clear errors for a refused key, a missing scope, fraud prevention turned off, an empty balance, rate limits and server errors.
- Usable as a tool by n8n's AI Agent.
