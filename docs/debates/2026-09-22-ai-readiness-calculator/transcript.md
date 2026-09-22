# Debate

**Question:** Should e3d-oppscan (oppscan.e3d.ai, a paid $99 AI-opportunity-scan business) build a free, dropdown-driven "AI Readiness Score" calculator as a new top-of-funnel page, in addition to its existing free tier?

Context:

- Oppscan already has a paid flow: business intake -> LLM analysis pipeline -> ranked AI-opportunity report -> $99 unlock + consultation booking.
- Oppscan also already has a free tier at /free: freeform text intake (company website + a few text fields) run through an LLM analysis pipeline, producing a partial list of ranked opportunity candidates, gated by Turnstile bot-protection and rate-limited (each submission costs a real LLM call). It ends with a CTA to unlock the full $99 report.
- src/lib/scanner-scoring.ts already contains a deterministic, non-LLM function computeBaseScore(maturity) that maps 5 maturity dimensions (toolAdoption, processIntegration, dataReadiness, technicalCapacity, governance), each rated 1-5, to a 0-100 score. Today those 1-5 ratings are inferred by the LLM from free-text intake as part of the /free and paid pipelines.
- The proposed new idea: a separate /readiness-score page where the visitor picks all 5 maturity dimensions directly via dropdowns (no free text, no LLM call, no rate limiting/bot protection needed since it's a pure function), gets an instant 0-100 score with a banded blurb (e.g. Early/Developing/Advanced), and a single CTA pointing at /free (for a more tailored free summary) or straight to the $99 checkout. Estimated effort: low (reuses existing scoring function and existing form/page conventions, no new backend infra).
- Precedent elsewhere in this company's product portfolio: e3d-liquiditywatch (a free public score gauge as a lead magnet for a paid product) and e3d-netdoctor (free diagnostic gated to a paid report).

Question for the panel: is this worth building, or does it risk cannibalizing /free or diluting the "free = personalized analysis" positioning that currently justifies asking for money later? If you'd build it, what's the one thing most likely to make it fail to convert (e.g. band definitions, CTA placement, calculator feeling too disconnected from personalization)? If you would NOT build it, what should we do instead with that same low-effort budget to grow $99-scan conversion?

## Round 1 -- grok-build

I'll look at the existing scoring function, free tier, and funnel so the recommendation is grounded in how oppscan actually works today.I’ll pull oppscan’s idea ledger and the live product so the call is based on the actual funnel, not just the prompt.**Do not build it.** Spend the same budget making the existing `/free` result show `computeBaseScore` plus a dimension breakdown, then CTA to the $99 report.

Oppscan does not sell a maturity number. It sells ranked, business-specific opportunities plus an hour with FutCo. The homepage already frames that as a practitioner review, not a gadget. The example report’s hero is already “AI Base Score 15/100.” A 30-second self-rated quiz produces the same artifact with none of the evidence. Visitors will treat the number as the product and bounce; later the paid hero metric looks like what they already got.

LiquidityWatch is the wrong precedent: there the score *is* the product. Netdoctor is already what `/free` is (diagnostic of *you*, gated to paid). Self-scored 1–5s are also junk input: people inflate, and the LLM-inferred ratings from site + text are the only “we actually looked” moment in the funnel.

A third TOF page (`/readiness-score` → `/free` → $99) splits a $99 motion that already has two free doors. Cannibalization of `/free` is real; dilution of “free = personalized analysis” is worse.

**If you built it anyway, it fails because the calculator is disconnected from personalization:** self-grades in, generic band out, no company-specific opportunity on the page. High scorers feel done; low scorers don’t trust a quiz to justify $99.

**Do this instead:** on the `/free` result you already pay an LLM for, render the 0–100 score and five dimensions, then “this score is leaving ranked opportunities on the table — unlock the full list + consult.” Same function, same page conventions, no new surface, score attached to *their* scan.

Assumption: `/free` already infers those five ratings (or can expose them) and conversion is limited by demonstrated specificity, not missing a quiz.

## Round 1 -- claude

Build it — but treat it as a filter, not a funnel mirror.

**Why it doesn't cannibalize /free:** the two pages sell different things. /readiness-score sells a number (self-assessed, instant, no LLM). /free sells personalized findings (AI-inferred from your actual business, with specific opportunity candidates). Visitors who just want a gut-check number were never going to sit through /free's text intake anyway — you're not diverting existing /free traffic, you're catching a colder, more impatient segment that would otherwise bounce. computeBaseScore already exists as a pure function; this is genuinely near-zero marginal cost, so the bar to justify it is low.

**Load-bearing assumption:** most of your top-of-funnel traffic today is cold (ads, SEO, social) rather than warm referrals — a pure dropdown score is a lower-commitment entry point for cold traffic than "write about your company," which is exactly the liquiditywatch/netdoctor precedent.

**Single biggest failure mode:** the CTA gets sent to /free by default and visitors feel deceived — "I already gave you 5 answers and got a score, why do you need my company website and text fields now for basically the same thing?" It reads as a bait-and-switch rather than a natural upgrade. Fix: the /free CTA copy must explicitly reframe the ask as different in kind ("this was a self-rated estimate — get an AI-read analysis of *your actual* stack and specific opportunities"), and consider pre-filling /free's dimension priors from the dropdown answers so it feels like continuation, not restart.

Don't split the CTA between /free and checkout — one CTA (to /free) keeps the funnel linear and avoids diluting which page does the "ask for money" job.

## Round 1 -- codex

Yes—build it.

It adds a genuinely different acquisition step: instant, anonymous, zero-cost self-assessment for visitors unwilling to submit free text or wait for analysis. It should not cannibalize `/free` if positioned as a baseline, not a substitute:

“Your readiness score shows whether you can execute AI projects. The free scan identifies which projects are worth executing.”

Use one CTA: **“Find your best AI opportunities—free”** → `/free`. Don’t send calculator traffic directly to the $99 checkout; a generic five-input score has not created enough purchase intent.

The most likely conversion failure is a result that feels generic and terminal. A number plus “Developing” lets visitors satisfy their curiosity and leave. Make the result explain the weakest dimension, its practical consequence, and why opportunity selection still requires company-specific analysis. Example: “Your data readiness may limit automation ROI; identify opportunities that work with your current systems.”

Keep the questionnaire frictionless, show brief concrete anchors for each 1–5 choice, and preserve selections when users continue to `/free` if useful. Track calculator completion, calculator→`/free`, free-scan completion, and paid conversion by source.

Load-bearing assumption: meaningful traffic currently reaches educational or exploratory pages but does not begin `/free`. If nearly all visitors already complete `/free`, improving its result-to-purchase transition would be the better use of effort.

## Round 1 -- devin

**Build it. Low risk of cannibalization; real risk of failure from generic band copy.**

**Why the cannibalization fear is overblown:**
/free requires typing a company URL + text fields — that's a different intent signal (higher commitment). Dropdowns catch explorers who won't fill out /free at all. These are additive audiences, not the same funnel step twice.

**Why it won't dilute "personalized analysis" positioning:**
The score's weakness (self-reported, no company context) is actually your pitch. The page should state explicitly: *"This is your estimate. See how it applies to your actual business → [free analysis]."* Weakness becomes the CTA.

**The one thing most likely to kill conversion:**
Band blurbs that read like a rubric. "Developing (40–65): Your organization has some AI adoption but lacks integration." — nobody clicks from that. The blurbs must be specific enough to sting: "You're running manual processes your competitors automated 18 months ago. Here's what that's costing you." Generic = toy. Specific = urgency.

**Load-bearing assumptions:**
- CTA hierarchy is `/readiness-score` → `/free` (not directly to $99). The score warms intent; /free closes the personalization gap before asking for money.
- SEO/share potential exists for "AI readiness score" — worth targeting if you add a shareable result state.

**If I would NOT build it:** spend the same effort on exit-intent copy on `/free` — the existing funnel's biggest leak is likely abandonment after seeing the partial list, not top-of-funnel volume.

## Round 2 -- grok-build

I'll check the live funnel and scoring code so this round argues from how oppscan actually works, not just the last round's claims.I hold: do not build `/readiness-score`. Spend the budget rendering `computeBaseScore` and the five dimensions on the `/free` result, then CTA to the $99 report.

Claude, Codex, and Devin treat different inputs as a different product. Visitors remember the output. The quiz gives away the same 0–100 the paid pipeline already computes, then `/free` asks them to describe the business so an LLM can infer the ratings they just picked. “This was only a self-estimate” and “baseline vs opportunities” are the bait-and-switch Claude warns about. Prefill makes `/free` a second form for a score they already have.

The failure they all name — a generic, terminal number — is the product, not the blurb. Devin’s sting copy is worse than a rubric: self-scores inflate, so “competitors automated this 18 months ago” is often false, and false urgency teaches people to ignore the next CTA. Five dropdowns cannot name their stack or a real opportunity. Curiosity is spent on the page.

Low engineering cost was never the objection. A third door (`/readiness-score` → `/free` → $99) adds a step before a step that still does not ask for $99. Their case rests on a cold audience that will not start `/free`. That is unshown. Until it is, attach the score to a scan that already saw their site.

POSITION: Do not add a self-rated readiness calculator; show computeBaseScore on the existing /free result and CTA to the $99 report.
status: revise

## Round 2 -- claude

My prior position holds: build it, and grok-build's "don't build" case has a real weak point.

Grok's core claim — that the $99 hero metric is *the same artifact* as the free quiz score — is the strongest objection raised this round, and it's worth taking seriously: if visitors see "AI Base Score X/100" twice, once free and once paid, the second one can look like a repeat rather than an upgrade. But grok's own fix (render the score on /free's *existing* result page) doesn't resolve that risk, it just relocates it — you'd still be showing the same number pre- and post-paywall. The actual fix, which claude/codex/devin converge on, is CTA copy that names the difference in kind (self-rated estimate vs. AI-read analysis of your actual business), not avoiding the surface entirely.

Grok's "junk input" point (self-graded 1-5s are inflated) is real but not a reason to skip the page — it's a reason the band copy must lean on the weak dimension rather than the aggregate number, which is exactly devin's and codex's fix.

Where I'd now sharpen my own answer: grok is right that a *second* TOF page adds a real funnel-diagram cost that "near-zero marginal cost" undersells — someone has to write and maintain distinct positioning copy for two free surfaces, and if that copy is generic, grok's cannibalization risk materializes. So the build is only worth it if the CTA-copy work (the thing devin and I both flagged) actually ships, not just the calculator.

I'd act differently than grok-build's "don't build" — that's a real branch-point, not framing.

POSITION: Build /readiness-score with one CTA to /free, contingent on CTA copy explicitly distinguishing self-rated estimate from AI-read personalized analysis, and band blurbs anchored on the weakest dimension rather than a generic rubric description.
status: revise

## Round 2 -- codex

My position holds: build it as a measured acquisition experiment, with one CTA to `/free`.

Grok correctly identifies the strategic risk: the score could appear to duplicate the paid report’s hero metric. But that is a positioning problem, not a reason to reject a low-cost, zero-marginal-cost entry point. Label it clearly as a self-assessed execution-readiness estimate; reserve evidence-based scoring, ranked opportunities, and consultation for the personalized scan.

Claude and Devin are right that dropdowns serve lower-intent visitors who may never complete free-form intake. However, that claim is still an assumption. Launch only with source-level funnel tracking and compare calculator-assisted paid conversion against direct `/free` traffic.

The biggest failure remains a generic, terminal result—not merely weak CTA placement or bland band names. The result should identify the weakest dimension and explain its operational consequence, then create a clear information gap: readiness cannot reveal which AI projects fit this specific business.

I would not use Devin’s unsupported urgency language such as “competitors automated 18 months ago”; manufactured specificity damages trust. Nor would I prefill inferred maturity fields into `/free` unless the downstream model explicitly distinguishes self-ratings from evidence-derived ratings.

If calculator traffic does not produce incremental `/free` starts and eventual purchases, retire the page and move the score breakdown into `/free`, as Grok recommends.

POSITION: Build the self-assessed readiness calculator with one explicitly differentiated CTA to `/free`, instrumented as a reversible acquisition experiment.
status: revise

## Round 2 -- devin

My round-1 position holds. Addressing the disagreement directly:

**Against grok:** "Add computeBaseScore to /free result instead" is a good idea — but it's not an alternative, it's complementary. The calculator targets visitors who won't reach /free at all (no URL, no text fields, won't commit). The /free result improvement targets visitors who already committed. These are different intervention points; the budget easily covers both.

Grok's "third TOF door splits the funnel" concern would matter if we were routing the same traffic through three gates. We're not — the calculator is catching cold bounces, not diverting /free entries.

**Where claude and codex sharpen my position:** I agree on one CTA to /free (not split to $99). codex's framing is cleaner than mine: "the score shows whether you can execute AI projects; the scan identifies which projects." That's a reframe that makes /free feel necessary, not redundant.

**Remaining disagreement with claude on one point:** Pre-filling /free's dimension priors from dropdown answers is a good friction reducer but risks the "why are you asking again?" problem if the UI isn't careful. It's worth doing only if the /free intake visually acknowledges "continuing from your readiness score" — otherwise it reads as a broken restart.

**What I'm revising:** My band-blurb urgency framing still holds as the failure mode, but the fix is also structural — weakest-dimension callout (codex's point) is more actionable than just sharpening copy tone.

POSITION: Build /readiness-score as a zero-commitment top-of-funnel entry point for cold visitors, with a single CTA to /free, weakest-dimension callout in results, and simultaneously surface computeBaseScore on the /free result page.
status: revise


## Synthesis (claude)

FINAL ANSWER: Build /readiness-score as a low-cost, single-CTA-to-/free acquisition experiment for cold visitors who won't commit to text intake, but only if it ships with two non-negotiable safeguards: CTA copy that explicitly reframes /free as evidence-based analysis (not a repeat of the same score), and results anchored on the weakest dimension's operational consequence rather than a generic banded blurb. Simultaneously surface computeBaseScore + dimension breakdown on the existing /free result page, since that's cheap, uncontested, and directly addresses grok's strongest objection (the score looking duplicated). Instrument both with source-level funnel tracking and retire the calculator if it doesn't produce incremental /free starts.

CONSENSUS: majority
DISSENT: grok-build maintains build is unnecessary and risks cannibalization/bait-and-switch — the other four converge on "build, but only with differentiated CTA copy and weakest-dimension framing," treating grok's fixes as complementary rather than a reason not to build.
