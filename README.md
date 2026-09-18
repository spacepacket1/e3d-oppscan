# Oppscan

AI Opportunity Scanner: a paid, manual-report product that takes a short
business intake, generates a ranked set of AI opportunity candidates via an
LLM pipeline, and delivers a written report plus a consultation booking —
extracted from Applied FutCo AI's consulting site into its own standalone
product at `oppscan.e3d.ai`.

## Stack

Next.js (App Router) + MongoDB (durable report store) + an OpenAI-compatible
chat-completions endpoint for analysis. Payments run through the shared
`e3d.ai` payments API (Stripe checkout, credit-based spend).

## Local development

```bash
npm install
npm run dev
```

Copy `.env.example` (if present) or see "Environment" below for the
variables needed to run the full flow locally; without them, checkout/report
generation will fail closed rather than silently degrade.

## Environment

- `SCANNER_MONGO_URL`, `SCANNER_REPORT_TOKEN_SECRET` — durable report store.
- `SCANNER_LLM_URL`, `SCANNER_LLM_API_KEY`, `SCANNER_LLM_MODEL` — analysis LLM.
- `SCANNER_INTAKE_PROVIDER`, `SCANNER_INTAKE_ENDPOINT_URL`, `SCANNER_INTAKE_ENDPOINT_AUTH_TOKEN` — intake-notify webhook.
- `E3D_SCANNER_INTERNAL_SERVICE_KEY`, `E3D_API_BASE_URL` — shared payments API auth/base URL.
- `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` — bot protection on the intake form.
- `NEXT_PUBLIC_BOOKING_URL` — consultation booking link (falls back to the parent site's contact page).
- `NEXT_PUBLIC_SITE_URL` — this site's own canonical origin (`https://oppscan.e3d.ai` in production).

## Testing

```bash
npm test          # everything except the live MongoDB integration test
npm run test:mongo  # requires a real MongoDB replica set at SCANNER_MONGO_URL
```

## Deployment

Runs via `ops/run/run-oppscan.sh` under PM2, behind nginx on
`oppscan.e3d.ai`. See the sibling `e3d-applied` repo's `ops/run/run-applied.sh`
for the same convention this mirrors.
