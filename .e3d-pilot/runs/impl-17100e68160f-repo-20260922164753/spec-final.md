# AI Readiness Score Calculator

## Overview

Add a public `/readiness-score` self-assessment that collects the five existing maturity dimensions through dropdowns and returns an instant deterministic 0–100 score. The calculator must reuse the existing scoring implementation, make no LLM or other external requests, and direct users toward the paid AI Opportunity Scan.

## Goals

- Provide a fast, zero-cost AI readiness self-assessment requiring no account, payment, rate limiting, or bot challenge.
- Reuse `computeBaseScore`, `ScannerMaturity`, and `SCANNER_MATURITY_DIMENSIONS` without duplicating their scoring formula.
- Explain Early, Developing, and Advanced results with concise, non-personalized guidance.
- Promote the paid scan with a clear `$99` CTA linking to the existing purchase page.
- Make the calculator discoverable from the site header, homepage, and sitemap.
- Cover scoring, validation, rendering, metadata, navigation, and accessibility behavior with automated tests.

## Non-Goals

- Do not call an LLM, analyze freeform text, inspect websites, or generate opportunity recommendations.
- Do not replace or materially change the existing `/free` summary flow.
- Do not collect or persist calculator answers, personal information, analytics, or leads.
- Do not add authentication, payment processing, Turnstile, rate limiting, database storage, or new dependencies.
- Do not encode answers or results into shareable URLs.
- Do not alter the scoring formula or paid-report maturity behavior.

## Existing Files

- `src/lib/scanner-scoring.ts` defines the maturity type, dimension keys, and deterministic base-score calculation.
- `app/free/page.tsx` and `src/components/free-scanner-form.tsx` demonstrate the existing App Router page, form, result, and CTA conventions.
- `app/layout.tsx` contains the shared header and account status.
- `app/page.tsx` contains the existing free-summary CTA beside the paid offer.
- `app/globals.css` contains shared form, button, panel, header, and responsive styles.
- `app/sitemap.ts` enumerates public routes.
- `src/lib/seo.ts` supplies canonical page metadata helpers.
- `tests/scanner-scoring.test.ts` and `tests/scanner-page.test.ts` demonstrate deterministic and rendered-page test conventions.

## Shared Constraints

- Keep the implementation within 30 changed files and 3,200 changed lines.
- Do not modify `ops/**` or `.env*`.
- Preserve the behavior and API of the existing scoring, free-summary, checkout, and report flows.
- Use strict TypeScript and the repository’s existing formatting and import conventions.
- Treat all submitted values as untrusted even though calculation is deterministic.
- Accept only integer maturity values from 1 through 5 for every required dimension.
- Keep result language explicitly framed as a quick self-assessment, not personalized advice or an opportunity analysis.
- Reuse existing visual primitives where practical and add only calculator-specific CSS needed for a polished responsive layout.
- Preserve keyboard operation, visible labels, focus behavior, semantic headings, and accessible status/error announcements.

## Phase 1 - Build and Integrate the AI Readiness Calculator

<!-- runner:model=codex:gpt-5.4 -->
<!-- pilot:touches=app/readiness-score/page.tsx -->
<!-- pilot:touches=app/readiness-score/actions.ts -->
<!-- pilot:touches=src/components/readiness-score-form.tsx -->
<!-- pilot:touches=src/lib/readiness-score.ts -->
<!-- pilot:touches=app/layout.tsx -->
<!-- pilot:touches=app/page.tsx -->
<!-- pilot:touches=app/sitemap.ts -->
<!-- pilot:touches=app/globals.css -->
<!-- pilot:touches=tests/readiness-score.test.ts -->
<!-- pilot:touches=tests/scanner-scoring.test.ts -->
<!-- runner:read=src/lib/scanner-scoring.ts -->
<!-- runner:read=app/free/page.tsx -->
<!-- runner:read=src/components/free-scanner-form.tsx -->
<!-- runner:read=src/lib/seo.ts -->
<!-- runner:read=tests/scanner-page.test.ts -->
<!-- runner:verify=npm install && npm run lint && npm run typecheck && npm test && npm run build -->

### Requirements

1. Add `src/lib/readiness-score.ts` containing the calculator-specific domain configuration:
   - Define presentation metadata for all and only the keys in `SCANNER_MATURITY_DIMENSIONS`.
   - Give each dimension a plain-language label, short prompt, and five meaningful ordered option labels mapped to integer values `1` through `5`.
   - Define exactly these inclusive score bands: `0–40` Early, `41–70` Developing, and `71–100` Advanced.
   - Give every band a concise, credible, generic explanation that does not claim personalized analysis or specific opportunity discovery.
   - Provide typed helpers for validating a complete set of submitted dimension values and resolving a valid score to its band.
   - Import and use the existing scoring types/constants; do not recreate the maturity dimension list or base-score formula.

2. Add `app/readiness-score/actions.ts` as a server action:
   - Accept the previous form state and submitted `FormData`.
   - Require each existing maturity dimension exactly once as an integer from `1` through `5`.
   - Return a structured error state for missing, malformed, fractional, duplicated, or out-of-range values without throwing or producing a score.
   - Preserve valid submitted selections when returning validation errors.
   - For a valid submission, construct a `ScannerMaturity`, call the existing `computeBaseScore`, resolve the band through the calculator helper, and return the score and band.
   - Perform no network, LLM, database, telemetry, authentication, Turnstile, rate-limit, or payment calls.

3. Add `src/components/readiness-score-form.tsx` as a client form using the server action:
   - Render one explicitly labeled dropdown for each configured maturity dimension.
   - Begin each dropdown with a non-answer prompt so users must deliberately select a value.
   - Render field-level validation messages and an accessible form-level error summary.
   - Disable the submit control while pending and communicate calculation progress without losing selections.
   - On success, prominently display the numeric score as `N/100`, the matching band name, and its generic explanation.
   - Announce a newly returned result using an appropriate live/status region.
   - Include one visually dominant result CTA reading `See your specific opportunities — unlock the $99 scan` and link it to `/`.
   - Explain near the result that the readiness score is a quick self-assessment and that the paid scan supplies specific opportunities and a full plan.
   - Allow users to adjust answers and recalculate without reloading the route.
   - Do not add Turnstile, freeform business fields, contact fields, or opportunity-result content.

4. Add `app/readiness-score/page.tsx`:
   - Publish canonical metadata for `/readiness-score` with a distinct title and description.
   - Present the tool as a free, instant AI readiness self-assessment requiring no account.
   - Clearly distinguish it from personalized analysis.
   - Render the calculator with a complete idle initial state.
   - Use the repository’s existing page, section-heading, panel, form, and button conventions.

5. Integrate discovery without displacing existing flows:
   - Update `app/layout.tsx` with a semantic primary navigation containing links to `/readiness-score` and `/free`, while preserving the brand link and account status behavior.
   - Update `app/page.tsx` to add a readiness-score link alongside the existing free-summary and example-report options in the offer card.
   - Use concise link text that distinguishes the instant readiness score from the tailored free opportunity summary.
   - Add `/readiness-score` to `app/sitemap.ts` with the same public-route treatment as `/free`.

6. Extend `app/globals.css` only as needed to:
   - Lay out the calculator fields and result clearly on wide and narrow screens.
   - Integrate the new primary navigation with the existing header.
   - Preserve usable wrapping, spacing, and tap targets on mobile.
   - Provide a prominent but non-misleading score/result presentation.
   - Reuse current tokens, controls, panels, and buttons instead of introducing a separate design system.

7. Add or extend automated coverage:
   - In `tests/scanner-scoring.test.ts`, cover `computeBaseScore` boundaries and at least one representative intermediate maturity set, demonstrating that all-1 values produce `0`, all-5 values produce `100`, and an intermediate set is deterministically mapped.
   - In `tests/readiness-score.test.ts`, cover complete valid parsing, every invalid-value class, score-band boundaries at `0`, `40`, `41`, `70`, `71`, and `100`, and the server action’s use of deterministic scoring.
   - Render the new page/form sufficiently to verify all five dimension controls, the no-account/self-assessment framing, canonical metadata, result score and band, the paid-scan CTA target, and the absence of Turnstile and freeform intake fields.
   - Verify the shared header/homepage discovery links and sitemap entry without weakening existing assertions.

### Acceptance Criteria

- `/readiness-score` renders a responsive five-dropdown self-assessment with no authentication or payment prerequisite.
- Submitting valid values produces the same 0–100 result as `computeBaseScore` and the documented inclusive band.
- Invalid or incomplete submissions show accessible errors, preserve valid choices, and never produce a score.
- The calculator performs no LLM, network-service, database, telemetry, Turnstile, or rate-limit work.
- Result copy remains generic and clearly reserves specific opportunities and the full plan for the paid scan.
- The result includes the required `$99` paid-scan CTA linking to `/`.
- The header, homepage offer card, and sitemap expose `/readiness-score` while retaining the existing `/free` path.
- Canonical metadata points to `/readiness-score`.
- `npm install && npm run lint && npm run typecheck && npm test && npm run build` completes successfully.
