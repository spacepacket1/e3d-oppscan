---
head_sha: 7fb3a637c90a3f63f11d58e442229aaba1a3358f
focus: revenue
implementation_run_id: impl-17100e68160f-repo-20260922164753
---

# Findings

## Local State

Approved idea `idea-17100e68160f` is being implemented for `/Users/mini/e3d-oppscan`.

## External Context

Add a new /readiness-score page: a short, well-defined form of dropdowns/ranges (the same five maturity dimensions already defined in src/lib/scanner-scoring.ts -- toolAdoption, processIntegration, dataReadiness, technicalCapacity, governance, each 1-5) that computes a 0-100 AI Readiness Score entirely client-/server-side via the existing computeBaseScore() function -- no LLM call, no rate limiting, no Turnstile needed, since the computation is free and deterministic. This is deliberately distinct from the existing /free flow (app/free/page.tsx), which takes freeform text intake and runs an LLM analysis pipeline to produce ranked opportunity candidates; that flow is costed and rate-limited per submission. The calculator is a zero-cost, instant, shareable top-of-funnel page whose sole job is to produce a readiness score and a single clear CTA: 'See your specific opportunities and a full plan -- unlock the $99 scan' (linking to /free for a more tailored free summary, or straight to checkout). Score bands (e.g. 0-40 'Early', 41-70 'Developing', 71-100 'Advanced') should each carry a short, generic-but-credible blurb and the same $99-scan CTA, framed as a quick self-assessment rather than a personalized analysis (the personalization is reserved for /free and the paid scan, so the free calculator doesn't cannibalize their perceived value). Implementation should reuse computeBaseScore/ScannerMaturity/SCANNER_MATURITY_DIMENSIONS from src/lib/scanner-scoring.ts as-is rather than duplicating the scoring logic, add a new route + form component following the existing app/free and src/components/free-scanner-form.tsx conventions (Next.js App Router, server action, no account/payment required), and link to it from the site's primary nav/CTAs alongside the existing /free link.
