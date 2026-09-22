import { readFileSync } from "node:fs";
import { join } from "node:path";

import { headers } from "next/headers";

import { scannerContent } from "@/content/scanner-content";
import { resolvePrimaryCtaHref } from "@/content/site-config";
import { getE3dSessionUser, isE3dAdmin } from "@/lib/e3d-session";
import {
  getScannerReportStore,
  type ScannerReportForAdmin,
} from "@/lib/scanner-report-store";

export const dynamic = "force-dynamic";

// A self-contained HTML download of the report. Deliberately NOT rendered
// via the ScannerReport React component + react-dom/server: that component
// renders next/link, whose default export is a client-component reference
// outside Next's own app-router request pipeline -- calling
// renderToStaticMarkup on it directly from a route handler throws ("it's on
// the client... it can only be rendered as a Component"). Plain string
// templates below mirror ScannerReport's structure instead, with every
// piece of user/model-supplied text escaped by hand since we lose React's
// automatic escaping doing it this way.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ scanId: string }> },
) {
  const { scanId } = await params;
  const headerList = await headers();
  const session = await getE3dSessionUser(headerList.get("cookie") || "");
  if (!isE3dAdmin(session)) {
    return new Response("Not found", { status: 404 });
  }

  const store = getScannerReportStore();
  const reports = await store.listAllReportsForAdmin();
  const record = reports.find((report) => report.scanId === scanId);
  if (!record) {
    return new Response("Not found", { status: 404 });
  }

  const css = readFileSync(join(process.cwd(), "app/globals.css"), "utf8");
  const title = `${record.companyName ?? "AI Opportunity"} Report`;
  const html =
    "<!DOCTYPE html>\n" +
    `<html lang="en"><head><meta charset="utf-8" />` +
    `<title>${escapeHtml(title)}</title>` +
    `<style>${css}</style></head>` +
    `<body><main class="page-main"><section class="page-section">` +
    `<div class="container page-stack">${renderReport(record)}</div>` +
    `</section></main></body></html>`;

  const safeName =
    (record.companyName || "report")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "report";

  return new Response(html, {
    headers: {
      "content-type": "text/html; charset=utf-8",
      "content-disposition": `attachment; filename="${safeName}-ai-opportunity-report.html"`,
    },
  });
}

function opportunityAnchorId(candidateId: string) {
  return `opportunity-${escapeAttr(candidateId)}`;
}

function paragraphs(text: string) {
  return text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${escapeHtml(p)}</p>`)
    .join("");
}

function practicalApproach(steps: string[] | string) {
  if (!Array.isArray(steps)) return `<p>${escapeHtml(steps)}</p>`;
  return `<ol>${steps.map((step) => `<li>${escapeHtml(step)}</li>`).join("")}</ol>`;
}

function list(items: string[]) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function renderReport(record: ScannerReportForAdmin) {
  const copyByCandidate = new Map(
    record.report.opportunities.map((item) => [item.candidateId, item]),
  );

  const scoreSummary =
    record.baseScore !== null && record.potentialScore !== null
      ? `<section class="content-panel scanner-score-summary">
          <div><p class="section-heading__eyebrow">AI BASE SCORE</p>
          <p class="scanner-score-summary__value">${record.baseScore}/100</p>
          <p>Where your business stands today.</p></div>
          <div><p class="section-heading__eyebrow">POTENTIAL SCORE</p>
          <p class="scanner-score-summary__value">${record.potentialScore}/100</p>
          <p>What adopting every opportunity below could get you to — there is always more beyond any single scan, so this never reaches 100.</p></div>
        </section>`
      : "";

  const indexRows = record.candidates
    .map((candidate) => {
      const copy = copyByCandidate.get(candidate.id);
      if (!copy) return "";
      return `<tr><td><a href="#${opportunityAnchorId(candidate.id)}">${escapeHtml(copy.headline)}</a></td><td>${escapeHtml(candidate.outcomeType)}</td><td>${candidate.score}</td></tr>`;
    })
    .join("");

  const opportunitySections = record.candidates
    .map((candidate) => {
      const copy = copyByCandidate.get(candidate.id);
      if (!copy) return "";
      const pointValue =
        typeof candidate.pointValue === "number"
          ? `+${candidate.pointValue}`
          : "—";
      return `<section class="content-panel" id="${opportunityAnchorId(candidate.id)}">
        <p class="section-heading__eyebrow">Opportunity ${candidate.rank}</p>
        <h2>${escapeHtml(copy.headline)}</h2>
        <p>${escapeHtml(candidate.title)}</p>
        <p>${escapeHtml(candidate.summary)}</p>
        <dl class="scanner-candidate-stats">
          <div><dt>Score</dt><dd>${candidate.score}</dd></div>
          <div><dt>Outcome type</dt><dd>${escapeHtml(candidate.outcomeType)}</dd></div>
          <div><dt>Impact</dt><dd>${candidate.impact}/5</dd></div>
          <div><dt>Feasibility</dt><dd>${candidate.feasibility}/5</dd></div>
          <div><dt>Time to value</dt><dd>${candidate.timeToValue}/5</dd></div>
          <div><dt>Confidence</dt><dd>${candidate.confidence}/5</dd></div>
          <div><dt>Risk</dt><dd>${candidate.risk}/5</dd></div>
          <div><dt>Points toward 100</dt><dd>${pointValue}</dd></div>
        </dl>
        <h3>Why it matters</h3>
        ${paragraphs(copy.whyItMatters)}
        <h3>Evidence</h3>
        ${list(candidate.evidence)}
        <h3>Practical approach</h3>
        ${practicalApproach(copy.practicalApproach)}
        <h3>First step</h3>
        <p>${escapeHtml(candidate.firstStep)}</p>
        <h3>Considerations</h3>
        ${list(copy.considerations)}
      </section>`;
    })
    .join("");

  const competitiveLandscape = record.report.competitiveLandscape
    ? `<section class="content-panel">
        <h2>Competitive landscape</h2>
        ${list(record.report.competitiveLandscape.competitors)}
        <p>${escapeHtml(record.report.competitiveLandscape.analysis)}</p>
      </section>`
    : "";

  const nextStepsBlock = record.report.nextSteps
    ? `<h3>What a paid engagement digs into further</h3><p>${escapeHtml(record.report.nextSteps)}</p>`
    : "";

  const consultationHref = resolvePrimaryCtaHref();

  return `<header class="content-panel">
      <p class="section-heading__eyebrow">AI OPPORTUNITY SCANNER</p>
      <h1>Your practical AI opportunity report</h1>
      <p>This report turns your submitted business context into a ranked starting point. It is preparation for the consultation included with your scanner purchase.</p>
    </header>
    ${scoreSummary}
    <section class="content-panel">
      <h2>Executive summary</h2>
      ${paragraphs(record.report.executiveSummary)}
      <h3>Recommended starting point</h3>
      ${paragraphs(record.report.recommendedStartingPoint)}
    </section>
    <section class="content-panel">
      <h2>AI Opportunities</h2>
      <table class="scanner-opportunity-index">
        <thead><tr><th scope="col">Opportunity</th><th scope="col">Type</th><th scope="col">Score</th></tr></thead>
        <tbody>${indexRows}</tbody>
      </table>
    </section>
    ${opportunitySections}
    ${competitiveLandscape}
    <section class="content-panel">
      <h2>${escapeHtml(scannerContent.reportImplementation.heading)}</h2>
      ${scannerContent.reportImplementation.body.map((p) => `<p>${escapeHtml(p)}</p>`).join("")}
    </section>
    <section class="content-panel">
      <h2>Next steps</h2>
      <h3>Prepare for your consultation</h3>
      ${list(record.report.consultationPreparation)}
      ${nextStepsBlock}
      <p>${escapeHtml(record.report.closingNote)}</p>
      <a class="button button--primary" href="${escapeAttr(consultationHref)}">Book your included consultation</a>
      <p>If booking is not configured, this action opens the established contact page so you can arrange the consultation directly.</p>
    </section>`;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttr(value: string) {
  return escapeHtml(value);
}
