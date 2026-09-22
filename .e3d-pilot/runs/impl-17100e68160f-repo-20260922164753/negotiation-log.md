---
run_id: impl-17100e68160f-repo-20260922164753
---

# Negotiation Log

## Round 1

### Draft Before Round

```text
# AI Readiness Score Calculator

## Overview

Add a public `/readiness-score` self-assessment that collects the five existing maturity dimensions through dropdowns and returns an instant deterministic 0–100 score. It must reuse the repository’s scoring implementation, make no LLM or other external-service calls, and direct visitors toward the paid $99 Oppscan.

## Goals

- Provide a fast, no-account AI readiness self-assessment.
- Reuse `computeBaseScore`, `ScannerMaturity`, and `SCANNER_MATURITY_DIMENSIONS` without changing or duplicating the scoring formula.
- Explain results using the Early, Developing, and Advanced bands.
- Present one clear paid-scan CTA after every successful result.
- Expose the calculator through site navigation, homepage discovery, metadata, and the sitemap.
- Cover validation, scoring, rendering, accessibility, and discovery with automated tests.

## Non-Goals

- Do not call an LLM, Turnstile, payment API, intake-prefill API, or any other external service.
- Do not persist answers, collect contact information, create accounts, apply rate limits, or emit personalized opportunity recommendations.
- Do not change the paid scan, `/free` summary, scoring weights, maturity types, or checkout behavior.
- Do not add analytics, result history, social integrations, or downloadable reports.
- Do not describe the result as a professional assessment or personalized analysis.

## Existing Files

- `src/lib/scanner-scoring.ts` owns `ScannerMaturity`, `SCANNER_MATURITY_DIMENSIONS`, and `computeBaseScore`; these are the authoritative scoring primitives and must remain unchanged.
- `app/free/page.tsx` and `src/components/free-scanner-form.tsx` demonstrate the App Router page and form conventions, but their LLM, Turnstile, and rate-limiting behavior does not apply here.
- `app/layout.tsx` owns the shared header and footer.
- `app/page.tsx` contains the paid offer and existing links to `/free` and `/example`.
- `app/globals.css` contains the shared responsive visual system.
- `app/sitemap.ts` lists the public routes.
- `tests/scanner-page.test.ts` covers paid landing-page content and metadata.
- `tests/scanner-scoring.test.ts` covers the deterministic candidate-ranking logic.

## Shared Constraints

- Keep the implementation within 10 changed files and 1,200 changed lines.
- Preserve the existing scoring module as-is and import its exported maturity type, dimension list, and score function.
- Treat every submitted maturity value as untrusted input; accept only one integer from 1 through 5 for every required dimension.
- Render readable field-level or form-level validation errors without throwing on malformed or missing form data.
- Use semantic labels, native selects, keyboard-accessible controls, visible focus states, and an announced result region.
- Use existing design tokens and responsive conventions; do not add dependencies or generated assets.
- Keep all calculator copy generic and explicitly frame the result as a quick self-assessment.
- The result CTA must lead to the existing paid offer at `/` and identify it as the $99 scan.
- Do not modify anything under `ops/**` or matching `.env*`.

## Phase 1 - Build And Integrate The Readiness Calculator

<!-- runner:model=claude:sonnet -->
<!-- pilot:touches=app/readiness-score/** -->
<!-- pilot:touches=src/components/readiness-score-form.tsx -->
<!-- pilot:touches=app/layout.tsx -->
<!-- pilot:touches=app/page.tsx -->
<!-- pilot:touches=app/globals.css -->
<!-- pilot:touches=app/sitemap.ts -->
<!-- pilot:touches=tests/readiness-score*.test.ts -->
<!-- pilot:touches=tests/scanner-page.test.ts -->
<!-- runner:read=src/lib/scanner-scoring.ts -->
<!-- runner:read=app/free/page.tsx -->
<!-- runner:read=src/components/free-scanner-form.tsx -->
<!-- runner:read=tests/scanner-page.test.ts -->
<!-- runner:verify=npm install && npm run lint && npm run typecheck && npm test && npm run build -->

### Requirements

1. Add `app/readiness-score/page.tsx` with canonical metadata for `/readiness-score`, a clear “quick self-assessment” explanation, and the readiness form. State plainly that the calculator is generic, requires no account or payment, and does not provide personalized opportunity analysis.
2. Add a server action under `app/readiness-score/` that:
   - Iterates `SCANNER_MATURITY_DIMENSIONS` rather than maintaining a second list of dimension keys.
   - Parses all five submitted values and rejects missing, non-numeric, fractional, or out-of-range values.
   - Constructs a `ScannerMaturity` only after validation.
   - Calls the existing `computeBaseScore` function exactly once for a valid submission.
   - Returns serializable success or validation state without persistence, network calls, redirects, or environment dependencies.
3. Assign result bands using inclusive boundaries:
   - `0–40`: `Early`
   - `41–70`: `Developing`
   - `71–100`: `Advanced`
   Each band must have a short, credible explanation that remains generic and does not claim to identify specific opportunities.
4. Add `src/components/readiness-score-form.tsx` as the interactive form:
   - Render one required, labeled select for each entry in `SCANNER_MATURITY_DIMENSIONS`.
   - Offer explicit choices 1 through 5 with concise human-readable maturity descriptions and an unselected prompt.
   - Preserve submitted selections after validation errors and successful scoring.
   - Show actionable validation feedback associated with the relevant fields.
   - Show the score as `N/100`, the band name, the band explanation, and a single prominent “unlock the $99 scan” CTA linking to `/`.
   - Announce updated errors and results to assistive technology and avoid implying that an LLM or personalized analysis was used.
5. Add calculator-specific styles to `app/globals.css` using the existing tokens. The form, score presentation, and CTA must remain usable without horizontal scrolling on narrow screens and must retain visible keyboard focus.
6. Update `app/layout.tsx` with a responsive primary navigation containing links to the readiness calculator and the existing `/free` flow. Preserve the brand link and account-status control, and give the navigation an accessible label.
7. Add a readiness-calculator link alongside the existing free-summary discovery CTA on `app/page.tsx` without changing checkout behavior or hardcoding a replacement product price.
8. Add `/readiness-score` to `app/sitemap.ts` with the same public secondary-page priority convention used for `/free` and `/example`.
9. Add focused tests that verify:
   - Valid all-1, representative, and all-5 submissions return scores from the existing formula.
   - Every dimension is required and malformed, fractional, and out-of-range inputs fail safely.
   - Exact band boundaries map to the required labels.
   - The form exposes five labeled selects with choices 1–5.
   - A successful interaction renders the score, band, generic explanation, and paid CTA.
   - Validation feedback is accessible and preserves submitted values.
   - The page publishes canonical metadata and contains no Turnstile, LLM, account, or payment dependency.
   - The homepage and shared navigation expose the new route, and the sitemap includes it.
10. Keep existing `/free`, paid checkout, report, account, and deterministic-scoring tests passing.

### Acceptance Criteria

- Visiting `/readiness-score` presents all five maturity questions without requiring an account, payment, CAPTCHA, or external request.
- A valid submission produces the exact score returned by `computeBaseScore` and the correct inclusive result band.
- Invalid submissions do not calculate a score and provide accessible validation feedback.
- The result is framed as a generic self-assessment and presents one prominent CTA to the existing $99 paid scan.
- The route is discoverable from the shared primary navigation, the paid landing page, and the sitemap.
- No scoring formula or maturity-dimension list is duplicated or modified.
- `npm install && npm run lint && npm run typecheck && npm test && npm run build` succeeds.

```

### Reviewer 1: grok-build

Status: approved

Reason: The draft is internally consistent and implementable: it reuses the existing score primitives, defines inclusive bands, validation, accessibility, discovery, and verification without contradictions.

Raw Response:

```text
---STATUS---
status: approved
reason: The draft is internally consistent and implementable: it reuses the existing score primitives, defines inclusive bands, validation, accessibility, discovery, and verification without contradictions.
```

### Reviewer 2: claude

Status: approved

Reason: Spec is internally consistent, reuses existing scoring code without duplication, defines exact band boundaries, scopes files/tests clearly, and excludes all external services.

Raw Response:

```text
---STATUS---
status: approved
reason: Spec is internally consistent, reuses existing scoring code without duplication, defines exact band boundaries, scopes files/tests clearly, and excludes all external services.
```

### Reviewer 3: codex

Status: revise

Reason: The test requiring the page to contain no account dependency conflicts with the required shared layout account-status control.

Replacement Spec:

```spec
# AI Readiness Score Calculator

## Overview

Add a public `/readiness-score` self-assessment that collects the five existing maturity dimensions through dropdowns and returns an instant deterministic 0–100 score. It must reuse the repository’s scoring implementation, make no LLM or other external-service calls, and direct visitors toward the paid $99 Oppscan.

## Goals

- Provide a fast, no-account AI readiness self-assessment.
- Reuse `computeBaseScore`, `ScannerMaturity`, and `SCANNER_MATURITY_DIMENSIONS` without changing or duplicating the scoring formula.
- Explain results using the Early, Developing, and Advanced bands.
- Present one clear paid-scan CTA after every successful result.
- Expose the calculator through site navigation, homepage discovery, metadata, and the sitemap.
- Cover validation, scoring, rendering, accessibility, and discovery with automated tests.

## Non-Goals

- Do not call an LLM, Turnstile, payment API, intake-prefill API, or any other external service.
- Do not persist answers, collect contact information, create accounts, apply rate limits, or emit personalized opportunity recommendations.
- Do not change the paid scan, `/free` summary, scoring weights, maturity types, or checkout behavior.
- Do not add analytics, result history, social integrations, or downloadable reports.
- Do not describe the result as a professional assessment or personalized analysis.

## Existing Files

- `src/lib/scanner-scoring.ts` owns `ScannerMaturity`, `SCANNER_MATURITY_DIMENSIONS`, and `computeBaseScore`; these are the authoritative scoring primitives and must remain unchanged.
- `app/free/page.tsx` and `src/components/free-scanner-form.tsx` demonstrate the App Router page and form conventions, but their LLM, Turnstile, and rate-limiting behavior does not apply here.
- `app/layout.tsx` owns the shared header and footer.
- `app/page.tsx` contains the paid offer and existing links to `/free` and `/example`.
- `app/globals.css` contains the shared responsive visual system.
- `app/sitemap.ts` lists the public routes.
- `tests/scanner-page.test.ts` covers paid landing-page content and metadata.
- `tests/scanner-scoring.test.ts` covers the deterministic candidate-ranking logic.

## Shared Constraints

- Keep the implementation within 10 changed files and 1,200 changed lines.
- Preserve the existing scoring module as-is and import its exported maturity type, dimension list, and score function.
- Treat every submitted maturity value as untrusted input; accept only one integer from 1 through 5 for every required dimension.
- Render readable field-level or form-level validation errors without throwing on malformed or missing form data.
- Use semantic labels, native selects, keyboard-accessible controls, visible focus states, and an announced result region.
- Use existing design tokens and responsive conventions; do not add dependencies or generated assets.
- Keep all calculator copy generic and explicitly frame the result as a quick self-assessment.
- The result CTA must lead to the existing paid offer at `/` and identify it as the $99 scan.
- Do not modify anything under `ops/**` or matching `.env*`.

## Phase 1 - Build And Integrate The Readiness Calculator

<!-- runner:model=claude:sonnet -->
<!-- pilot:touches=app/readiness-score/** -->
<!-- pilot:touches=src/components/readiness-score-form.tsx -->
<!-- pilot:touches=app/layout.tsx -->
<!-- pilot:touches=app/page.tsx -->
<!-- pilot:touches=app/globals.css -->
<!-- pilot:touches=app/sitemap.ts -->
<!-- pilot:touches=tests/readiness-score*.test.ts -->
<!-- pilot:touches=tests/scanner-page.test.ts -->
<!-- runner:read=src/lib/scanner-scoring.ts -->
<!-- runner:read=app/free/page.tsx -->
<!-- runner:read=src/components/free-scanner-form.tsx -->
<!-- runner:read=tests/scanner-page.test.ts -->
<!-- runner:verify=npm install && npm run lint && npm run typecheck && npm test && npm run build -->

### Requirements

1. Add `app/readiness-score/page.tsx` with canonical metadata for `/readiness-score`, a clear “quick self-assessment” explanation, and the readiness form. State plainly that the calculator is generic, requires no account or payment, and does not provide personalized opportunity analysis.
2. Add a server action under `app/readiness-score/` that:
   - Iterates `SCANNER_MATURITY_DIMENSIONS` rather than maintaining a second list of dimension keys.
   - Parses all five submitted values and rejects missing, non-numeric, fractional, or out-of-range values.
   - Constructs a `ScannerMaturity` only after validation.
   - Calls the existing `computeBaseScore` function exactly once for a valid submission.
   - Returns serializable success or validation state without persistence, network calls, redirects, or environment dependencies.
3. Assign result bands using inclusive boundaries:
   - `0–40`: `Early`
   - `41–70`: `Developing`
   - `71–100`: `Advanced`
   Each band must have a short, credible explanation that remains generic and does not claim to identify specific opportunities.
4. Add `src/components/readiness-score-form.tsx` as the interactive form:
   - Render one required, labeled select for each entry in `SCANNER_MATURITY_DIMENSIONS`.
   - Offer explicit choices 1 through 5 with concise human-readable maturity descriptions and an unselected prompt.
   - Preserve submitted selections after validation errors and successful scoring.
   - Show actionable validation feedback associated with the relevant fields.
   - Show the score as `N/100`, the band name, the band explanation, and a single prominent “unlock the $99 scan” CTA linking to `/`.
   - Announce updated errors and results to assistive technology and avoid implying that an LLM or personalized analysis was used.
5. Add calculator-specific styles to `app/globals.css` using the existing tokens. The form, score presentation, and CTA must remain usable without horizontal scrolling on narrow screens and must retain visible keyboard focus.
6. Update `app/layout.tsx` with a responsive primary navigation containing links to the readiness calculator and the existing `/free` flow. Preserve the brand link and account-status control, and give the navigation an accessible label.
7. Add a readiness-calculator link alongside the existing free-summary discovery CTA on `app/page.tsx` without changing checkout behavior or hardcoding a replacement product price.
8. Add `/readiness-score` to `app/sitemap.ts` with the same public secondary-page priority convention used for `/free` and `/example`.
9. Add focused tests that verify:
   - Valid all-1, representative, and all-5 submissions return scores from the existing formula.
   - Every dimension is required and malformed, fractional, and out-of-range inputs fail safely.
   - Exact band boundaries map to the required labels.
   - The form exposes five labeled selects with choices 1–5.
   - A successful interaction renders the score, band, generic explanation, and paid CTA.
   - Validation feedback is accessible and preserves submitted values.
   - The page publishes canonical metadata and states that no account or payment is required.
   - The calculator page, form, and server action introduce no Turnstile, LLM, payment-service, or other external-service integration; the shared layout’s existing account-status control is explicitly permitted.
   - The homepage and shared navigation expose the new route, and the sitemap includes it.
10. Keep existing `/free`, paid checkout, report, account, and deterministic-scoring tests passing.

### Acceptance Criteria

- Visiting `/readiness-score` presents all five maturity questions without requiring an account, payment, CAPTCHA, or external request.
- A valid submission produces the exact score returned by `computeBaseScore` and the correct inclusive result band.
- Invalid submissions do not calculate a score and provide accessible validation feedback.
- The result is framed as a generic self-assessment and presents one prominent CTA to the existing $99 paid scan.
- The route is discoverable from the shared primary navigation, the paid landing page, and the sitemap.
- No scoring formula or maturity-dimension list is duplicated or modified.
- `npm install && npm run lint && npm run typecheck && npm test && npm run build` succeeds.
```

Raw Response:

```text
---STATUS---
status: revise
reason: The test requiring the page to contain no account dependency conflicts with the required shared layout account-status control.
```spec
# AI Readiness Score Calculator

## Overview

Add a public `/readiness-score` self-assessment that collects the five existing maturity dimensions through dropdowns and returns an instant deterministic 0–100 score. It must reuse the repository’s scoring implementation, make no LLM or other external-service calls, and direct visitors toward the paid $99 Oppscan.

## Goals

- Provide a fast, no-account AI readiness self-assessment.
- Reuse `computeBaseScore`, `ScannerMaturity`, and `SCANNER_MATURITY_DIMENSIONS` without changing or duplicating the scoring formula.
- Explain results using the Early, Developing, and Advanced bands.
- Present one clear paid-scan CTA after every successful result.
- Expose the calculator through site navigation, homepage discovery, metadata, and the sitemap.
- Cover validation, scoring, rendering, accessibility, and discovery with automated tests.

## Non-Goals

- Do not call an LLM, Turnstile, payment API, intake-prefill API, or any other external service.
- Do not persist answers, collect contact information, create accounts, apply rate limits, or emit personalized opportunity recommendations.
- Do not change the paid scan, `/free` summary, scoring weights, maturity types, or checkout behavior.
- Do not add analytics, result history, social integrations, or downloadable reports.
- Do not describe the result as a professional assessment or personalized analysis.

## Existing Files

- `src/lib/scanner-scoring.ts` owns `ScannerMaturity`, `SCANNER_MATURITY_DIMENSIONS`, and `computeBaseScore`; these are the authoritative scoring primitives and must remain unchanged.
- `app/free/page.tsx` and `src/components/free-scanner-form.tsx` demonstrate the App Router page and form conventions, but their LLM, Turnstile, and rate-limiting behavior does not apply here.
- `app/layout.tsx` owns the shared header and footer.
- `app/page.tsx` contains the paid offer and existing links to `/free` and `/example`.
- `app/globals.css` contains the shared responsive visual system.
- `app/sitemap.ts` lists the public routes.
- `tests/scanner-page.test.ts` covers paid landing-page content and metadata.
- `tests/scanner-scoring.test.ts` covers the deterministic candidate-ranking logic.

## Shared Constraints

- Keep the implementation within 10 changed files and 1,200 changed lines.
- Preserve the existing scoring module as-is and import its exported maturity type, dimension list, and score function.
- Treat every submitted maturity value as untrusted input; accept only one integer from 1 through 5 for every required dimension.
- Render readable field-level or form-level validation errors without throwing on malformed or missing form data.
- Use semantic labels, native selects, keyboard-accessible controls, visible focus states, and an announced result region.
- Use existing design tokens and responsive conventions; do not add dependencies or generated assets.
- Keep all calculator copy generic and explicitly frame the result as a quick self-assessment.
- The result CTA must lead to the existing paid offer at `/` and identify it as the $99 scan.
- Do not modify anything under `ops/**` or matching `.env*`.

## Phase 1 - Build And Integrate The Readiness Calculator

<!-- runner:model=claude:sonnet -->
<!-- pilot:touches=app/readiness-score/** -->
<!-- pilot:touches=src/components/readiness-score-form.tsx -->
<!-- pilot:touches=app/layout.tsx -->
<!-- pilot:touches=app/page.tsx -->
<!-- pilot:touches=app/globals.css -->
<!-- pilot:touches=app/sitemap.ts -->
<!-- pilot:touches=tests/readiness-score*.test.ts -->
<!-- pilot:touches=tests/scanner-page.test.ts -->
<!-- runner:read=src/lib/scanner-scoring.ts -->
<!-- runner:read=app/free/page.tsx -->
<!-- runner:read=src/components/free-scanner-form.tsx -->
<!-- runner:read=tests/scanner-page.test.ts -->
<!-- runner:verify=npm install && npm run lint && npm run typecheck && npm test && npm run build -->

### Requirements

1. Add `app/readiness-score/page.tsx` with canonical metadata for `/readiness-score`, a clear “quick self-assessment” explanation, and the readiness form. State plainly that the calculator is generic, requires no account or payment, and does not provide personalized opportunity analysis.
2. Add a server action under `app/readiness-score/` that:
   - Iterates `SCANNER_MATURITY_DIMENSIONS` rather than maintaining a second list of dimension keys.
   - Parses all five submitted values and rejects missing, non-numeric, fractional, or out-of-range values.
   - Constructs a `ScannerMaturity` only after validation.
   - Calls the existing `computeBaseScore` function exactly once for a valid submission.
   - Returns serializable success or validation state without persistence, network calls, redirects, or environment dependencies.
3. Assign result bands using inclusive boundaries:
   - `0–40`: `Early`
   - `41–70`: `Developing`
   - `71–100`: `Advanced`
   Each band must have a short, credible explanation that remains generic and does not claim to identify specific opportunities.
4. Add `src/components/readiness-score-form.tsx` as the interactive form:
   - Render one required, labeled select for each entry in `SCANNER_MATURITY_DIMENSIONS`.
   - Offer explicit choices 1 through 5 with concise human-readable maturity descriptions and an unselected prompt.
   - Preserve submitted selections after validation errors and successful scoring.
   - Show actionable validation feedback associated with the relevant fields.
   - Show the score as `N/100`, the band name, the band explanation, and a single prominent “unlock the $99 scan” CTA linking to `/`.
   - Announce updated errors and results to assistive technology and avoid implying that an LLM or personalized analysis was used.
5. Add calculator-specific styles to `app/globals.css` using the existing tokens. The form, score presentation, and CTA must remain usable without horizontal scrolling on narrow screens and must retain visible keyboard focus.
6. Update `app/layout.tsx` with a responsive primary navigation containing links to the readiness calculator and the existing `/free` flow. Preserve the brand link and account-status control, and give the navigation an accessible label.
7. Add a readiness-calculator link alongside the existing free-summary discovery CTA on `app/page.tsx` without changing checkout behavior or hardcoding a replacement product price.
8. Add `/readiness-score` to `app/sitemap.ts` with the same public secondary-page priority convention used for `/free` and `/example`.
9. Add focused tests that verify:
   - Valid all-1, representative, and all-5 submissions return scores from the existing formula.
   - Every dimension is required and malformed, fractional, and out-of-range inputs fail safely.
   - Exact band boundaries map to the required labels.
   - The form exposes five labeled selects with choices 1–5.
   - A successful interaction renders the score, band, generic explanation, and paid CTA.
   - Validation feedback is accessible and preserves submitted values.
   - The page publishes canonical metadata and states that no account or payment is required.
   - The calculator page, form, and server action introduce no Turnstile, LLM, payment-service, or other external-service integration; the shared layout’s existing account-status control is explicitly permitted.
   - The homepage and shared navigation expose the new route, and the sitemap includes it.
10. Keep existing `/free`, paid checkout, report, account, and deterministic-scoring tests passing.

### Acceptance Criteria

- Visiting `/readiness-score` presents all five maturity questions without requiring an account, payment, CAPTCHA, or external request.
- A valid submission produces the exact score returned by `computeBaseScore` and the correct inclusive result band.
- Invalid submissions do not calculate a score and provide accessible validation feedback.
- The result is framed as a generic self-assessment and presents one prominent CTA to the existing $99 paid scan.
- The route is discoverable from the shared primary navigation, the paid landing page, and the sitemap.
- No scoring formula or maturity-dimension list is duplicated or modified.
- `npm install && npm run lint && npm run typecheck && npm test && npm run build` succeeds.
```
```

### Reviewer 4: devin

Status: approved

Reason: Spec is internally consistent, complete, and implementable; requirements map cleanly to acceptance criteria with no ambiguities or contradictions.

Raw Response:

```text
---STATUS---
status: approved
reason: Spec is internally consistent, complete, and implementable; requirements map cleanly to acceptance criteria with no ambiguities or contradictions.
```

### Reviewer 5: local

Status: approved

Reason: The draft meets all the specified requirements and constraints.

Raw Response:

```text
---STATUS---
status: approved
reason: The draft meets all the specified requirements and constraints.
```

Round Result: not converged

At least one reviewer requested revision in round 1.

## Round 2

### Draft Before Round

```text
# AI Readiness Score Calculator

## Overview

Add a public `/readiness-score` self-assessment that collects the five existing maturity dimensions through dropdowns and returns an instant deterministic 0–100 score. It must reuse the repository’s scoring implementation, make no LLM or other external-service calls, and direct visitors toward the paid $99 Oppscan.

## Goals

- Provide a fast, no-account AI readiness self-assessment.
- Reuse `computeBaseScore`, `ScannerMaturity`, and `SCANNER_MATURITY_DIMENSIONS` without changing or duplicating the scoring formula.
- Explain results using the Early, Developing, and Advanced bands.
- Present one clear paid-scan CTA after every successful result.
- Expose the calculator through site navigation, homepage discovery, metadata, and the sitemap.
- Cover validation, scoring, rendering, accessibility, and discovery with automated tests.

## Non-Goals

- Do not call an LLM, Turnstile, payment API, intake-prefill API, or any other external service.
- Do not persist answers, collect contact information, create accounts, apply rate limits, or emit personalized opportunity recommendations.
- Do not change the paid scan, `/free` summary, scoring weights, maturity types, or checkout behavior.
- Do not add analytics, result history, social integrations, or downloadable reports.
- Do not describe the result as a professional assessment or personalized analysis.

## Existing Files

- `src/lib/scanner-scoring.ts` owns `ScannerMaturity`, `SCANNER_MATURITY_DIMENSIONS`, and `computeBaseScore`; these are the authoritative scoring primitives and must remain unchanged.
- `app/free/page.tsx` and `src/components/free-scanner-form.tsx` demonstrate the App Router page and form conventions, but their LLM, Turnstile, and rate-limiting behavior does not apply here.
- `app/layout.tsx` owns the shared header and footer.
- `app/page.tsx` contains the paid offer and existing links to `/free` and `/example`.
- `app/globals.css` contains the shared responsive visual system.
- `app/sitemap.ts` lists the public routes.
- `tests/scanner-page.test.ts` covers paid landing-page content and metadata.
- `tests/scanner-scoring.test.ts` covers the deterministic candidate-ranking logic.

## Shared Constraints

- Keep the implementation within 10 changed files and 1,200 changed lines.
- Preserve the existing scoring module as-is and import its exported maturity type, dimension list, and score function.
- Treat every submitted maturity value as untrusted input; accept only one integer from 1 through 5 for every required dimension.
- Render readable field-level or form-level validation errors without throwing on malformed or missing form data.
- Use semantic labels, native selects, keyboard-accessible controls, visible focus states, and an announced result region.
- Use existing design tokens and responsive conventions; do not add dependencies or generated assets.
- Keep all calculator copy generic and explicitly frame the result as a quick self-assessment.
- The result CTA must lead to the existing paid offer at `/` and identify it as the $99 scan.
- Do not modify anything under `ops/**` or matching `.env*`.

## Phase 1 - Build And Integrate The Readiness Calculator

<!-- runner:model=claude:sonnet -->
<!-- pilot:touches=app/readiness-score/** -->
<!-- pilot:touches=src/components/readiness-score-form.tsx -->
<!-- pilot:touches=app/layout.tsx -->
<!-- pilot:touches=app/page.tsx -->
<!-- pilot:touches=app/globals.css -->
<!-- pilot:touches=app/sitemap.ts -->
<!-- pilot:touches=tests/readiness-score*.test.ts -->
<!-- pilot:touches=tests/scanner-page.test.ts -->
<!-- runner:read=src/lib/scanner-scoring.ts -->
<!-- runner:read=app/free/page.tsx -->
<!-- runner:read=src/components/free-scanner-form.tsx -->
<!-- runner:read=tests/scanner-page.test.ts -->
<!-- runner:verify=npm install && npm run lint && npm run typecheck && npm test && npm run build -->

### Requirements

1. Add `app/readiness-score/page.tsx` with canonical metadata for `/readiness-score`, a clear “quick self-assessment” explanation, and the readiness form. State plainly that the calculator is generic, requires no account or payment, and does not provide personalized opportunity analysis.
2. Add a server action under `app/readiness-score/` that:
   - Iterates `SCANNER_MATURITY_DIMENSIONS` rather than maintaining a second list of dimension keys.
   - Parses all five submitted values and rejects missing, non-numeric, fractional, or out-of-range values.
   - Constructs a `ScannerMaturity` only after validation.
   - Calls the existing `computeBaseScore` function exactly once for a valid submission.
   - Returns serializable success or validation state without persistence, network calls, redirects, or environment dependencies.
3. Assign result bands using inclusive boundaries:
   - `0–40`: `Early`
   - `41–70`: `Developing`
   - `71–100`: `Advanced`
   Each band must have a short, credible explanation that remains generic and does not claim to identify specific opportunities.
4. Add `src/components/readiness-score-form.tsx` as the interactive form:
   - Render one required, labeled select for each entry in `SCANNER_MATURITY_DIMENSIONS`.
   - Offer explicit choices 1 through 5 with concise human-readable maturity descriptions and an unselected prompt.
   - Preserve submitted selections after validation errors and successful scoring.
   - Show actionable validation feedback associated with the relevant fields.
   - Show the score as `N/100`, the band name, the band explanation, and a single prominent “unlock the $99 scan” CTA linking to `/`.
   - Announce updated errors and results to assistive technology and avoid implying that an LLM or personalized analysis was used.
5. Add calculator-specific styles to `app/globals.css` using the existing tokens. The form, score presentation, and CTA must remain usable without horizontal scrolling on narrow screens and must retain visible keyboard focus.
6. Update `app/layout.tsx` with a responsive primary navigation containing links to the readiness calculator and the existing `/free` flow. Preserve the brand link and account-status control, and give the navigation an accessible label.
7. Add a readiness-calculator link alongside the existing free-summary discovery CTA on `app/page.tsx` without changing checkout behavior or hardcoding a replacement product price.
8. Add `/readiness-score` to `app/sitemap.ts` with the same public secondary-page priority convention used for `/free` and `/example`.
9. Add focused tests that verify:
   - Valid all-1, representative, and all-5 submissions return scores from the existing formula.
   - Every dimension is required and malformed, fractional, and out-of-range inputs fail safely.
   - Exact band boundaries map to the required labels.
   - The form exposes five labeled selects with choices 1–5.
   - A successful interaction renders the score, band, generic explanation, and paid CTA.
   - Validation feedback is accessible and preserves submitted values.
   - The page publishes canonical metadata and states that no account or payment is required.
   - The calculator page, form, and server action introduce no Turnstile, LLM, payment-service, or other external-service integration; the shared layout’s existing account-status control is explicitly permitted.
   - The homepage and shared navigation expose the new route, and the sitemap includes it.
10. Keep existing `/free`, paid checkout, report, account, and deterministic-scoring tests passing.

### Acceptance Criteria

- Visiting `/readiness-score` presents all five maturity questions without requiring an account, payment, CAPTCHA, or external request.
- A valid submission produces the exact score returned by `computeBaseScore` and the correct inclusive result band.
- Invalid submissions do not calculate a score and provide accessible validation feedback.
- The result is framed as a generic self-assessment and presents one prominent CTA to the existing $99 paid scan.
- The route is discoverable from the shared primary navigation, the paid landing page, and the sitemap.
- No scoring formula or maturity-dimension list is duplicated or modified.
- `npm install && npm run lint && npm run typecheck && npm test && npm run build` succeeds.

```

### Reviewer 1: grok-build

Status: approved

Reason: The draft is internally consistent and implementable: it reuses the existing scoring primitives, defines inclusive bands and validation, and specifies accessibility, discovery, and verification without scope conflicts.

Raw Response:

```text
---STATUS---
status: approved
reason: The draft is internally consistent and implementable: it reuses the existing scoring primitives, defines inclusive bands and validation, and specifies accessibility, discovery, and verification without scope conflicts.
```

### Reviewer 2: claude

Status: approved

Reason: Spec is scoped, reuses existing scoring logic without duplication, defines clear bands and tests, and stays within stated constraints.

Raw Response:

```text
---STATUS---
status: approved
reason: Spec is scoped, reuses existing scoring logic without duplication, defines clear bands and tests, and stays within stated constraints.
```

### Reviewer 3: codex

Status: approved

Reason: The draft is complete, internally consistent, implementation-ready, and defines clear validation, accessibility, integration, testing, and scope constraints.

Raw Response:

```text
---STATUS---
status: approved
reason: The draft is complete, internally consistent, implementation-ready, and defines clear validation, accessibility, integration, testing, and scope constraints.
```

### Reviewer 4: devin

Status: approved

Reason: Spec is internally consistent, fully constrains scope, references existing primitives correctly, and acceptance criteria are measurable and complete.

Raw Response:

```text
---STATUS---
status: approved
reason: Spec is internally consistent, fully constrains scope, references existing primitives correctly, and acceptance criteria are measurable and complete.
```

### Reviewer 5: local

Status: approved

Reason: The draft meets all the specified requirements and constraints.

Raw Response:

```text
---STATUS---
status: approved
reason: The draft meets all the specified requirements and constraints.
```

## Final Outcome

Converged in round 2.
## Round 1

### Draft Before Round

```text
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

```

### Reviewer 1: grok-build

Status: approved

Reason: The draft is internally consistent and specific enough to implement the calculator, discovery, and tests without changing scoring or adjacent flows.

Raw Response:

```text
---STATUS---
status: approved
reason: The draft is internally consistent and specific enough to implement the calculator, discovery, and tests without changing scoring or adjacent flows.
```

### Reviewer 2: claude

Status: approved

Reason: Spec is internally consistent, well-scoped, reuses existing scoring logic, and has clear acceptance criteria and test coverage.

Raw Response:

```text
---STATUS---
status: approved
reason: Spec is internally consistent, well-scoped, reuses existing scoring logic, and has clear acceptance criteria and test coverage.
```

### Reviewer 3: codex

Status: approved

Reason: The draft is complete, internally consistent, testable, and sufficiently precise for implementation.

Raw Response:

```text
---STATUS---
status: approved
reason: The draft is complete, internally consistent, testable, and sufficiently precise for implementation.
```

### Reviewer 4: devin

Status: approved

Reason: Spec accurately maps to codebase — correct imports from scanner-scoring.ts, achievable band boundaries, no duplicate scoring logic, test assertions at 41/70 correctly target the band-classifier helper rather than maturity inputs, and all acceptance criteria are implementable without external calls.

Raw Response:

```text
---STATUS---
status: approved
reason: Spec accurately maps to codebase — correct imports from scanner-scoring.ts, achievable band boundaries, no duplicate scoring logic, test assertions at 41/70 correctly target the band-classifier helper rather than maturity inputs, and all acceptance criteria are implementable without external calls.
```

### Reviewer 5: local

Status: approved

Reason: The draft meets all the specified requirements and constraints.

Raw Response:

```text
---STATUS---
status: approved
reason: The draft meets all the specified requirements and constraints.
```

## Final Outcome

Converged in round 1.
