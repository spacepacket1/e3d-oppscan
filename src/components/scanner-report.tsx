import Link from "next/link";

import { scannerContent } from "@/content/scanner-content";
import type { ScannerCompletedReport } from "@/lib/scanner-report-store";

function opportunityAnchorId(candidateId: string) {
  return `opportunity-${candidateId}`;
}

// Reports completed before practicalApproach became a list of steps still
// have it stored as a single string -- render both shapes rather than
// requiring a data migration for already-delivered reports.
function PracticalApproach({ steps }: { steps: string[] | string }) {
  if (!Array.isArray(steps)) return <p>{steps}</p>;
  return (
    <ol>
      {steps.map((step) => (
        <li key={step}>{step}</li>
      ))}
    </ol>
  );
}

export function ScannerReport({
  record,
  consultationHref,
  ctaLabel = "Book your included consultation",
  ctaHelperText = "If booking is not configured, this action opens the established contact page so you can arrange the consultation directly.",
}: {
  record: ScannerCompletedReport;
  consultationHref: string;
  ctaLabel?: string;
  ctaHelperText?: string;
}) {
  const copyByCandidate = new Map(
    record.report.opportunities.map((item) => [item.candidateId, item]),
  );
  return (
    <div className="page-stack scanner-report">
      <header className="content-panel">
        <p className="section-heading__eyebrow">AI OPPORTUNITY SCANNER</p>
        <h1>Your practical AI opportunity report</h1>
        <p>
          This report turns your submitted business context into a ranked
          starting point. It is preparation for the consultation included with
          your scanner purchase.
        </p>
      </header>
      <section className="content-panel scanner-score-summary">
        <div>
          <p className="section-heading__eyebrow">AI BASE SCORE</p>
          <p className="scanner-score-summary__value">{record.baseScore}/100</p>
          <p>Where your business stands today.</p>
        </div>
        <div>
          <p className="section-heading__eyebrow">POTENTIAL SCORE</p>
          <p className="scanner-score-summary__value">{record.potentialScore}/100</p>
          <p>
            What adopting every opportunity below could get you to — there is
            always more beyond any single scan, so this never reaches 100.
          </p>
        </div>
      </section>
      <section className="content-panel">
        <h2>Executive summary</h2>
        <p>{record.report.executiveSummary}</p>
        <h3>Recommended starting point</h3>
        <p>{record.report.recommendedStartingPoint}</p>
      </section>
      <section className="content-panel">
        <h2>AI Opportunities</h2>
        <table className="scanner-opportunity-index">
          <thead>
            <tr>
              <th scope="col">Opportunity</th>
              <th scope="col">Type</th>
              <th scope="col">Score</th>
            </tr>
          </thead>
          <tbody>
            {record.candidates.map((candidate) => {
              const copy = copyByCandidate.get(candidate.id);
              if (!copy) return null;
              return (
                <tr key={candidate.id}>
                  <td>
                    <a href={`#${opportunityAnchorId(candidate.id)}`}>
                      {copy.headline}
                    </a>
                  </td>
                  <td>{candidate.outcomeType}</td>
                  <td>{candidate.score}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </section>
      {record.candidates.map((candidate) => {
        const copy = copyByCandidate.get(candidate.id);
        if (!copy) return null;
        return (
          <section
            className="content-panel"
            id={opportunityAnchorId(candidate.id)}
            key={candidate.id}
          >
            <p className="section-heading__eyebrow">
              Opportunity {candidate.rank}
            </p>
            <h2>{copy.headline}</h2>
            <p>{candidate.title}</p>
            <p>{candidate.summary}</p>
            <dl className="scanner-candidate-stats">
              <div>
                <dt>Score</dt>
                <dd>{candidate.score}</dd>
              </div>
              <div>
                <dt>Outcome type</dt>
                <dd>{candidate.outcomeType}</dd>
              </div>
              <div>
                <dt>Impact</dt>
                <dd>{candidate.impact}/5</dd>
              </div>
              <div>
                <dt>Feasibility</dt>
                <dd>{candidate.feasibility}/5</dd>
              </div>
              <div>
                <dt>Time to value</dt>
                <dd>{candidate.timeToValue}/5</dd>
              </div>
              <div>
                <dt>Confidence</dt>
                <dd>{candidate.confidence}/5</dd>
              </div>
              <div>
                <dt>Risk</dt>
                <dd>{candidate.risk}/5</dd>
              </div>
              <div>
                <dt>Points toward 100</dt>
                <dd>+{candidate.pointValue}</dd>
              </div>
            </dl>
            <h3>Why it matters</h3>
            <p>{copy.whyItMatters}</p>
            <h3>Evidence</h3>
            <ul>
              {candidate.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>Practical approach</h3>
            <PracticalApproach steps={copy.practicalApproach} />
            <h3>First step</h3>
            <p>{candidate.firstStep}</p>
            <h3>Considerations</h3>
            <ul>
              {copy.considerations.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        );
      })}
      <section className="content-panel">
        <h2>{scannerContent.reportImplementation.heading}</h2>
        {scannerContent.reportImplementation.body.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>
      <section className="content-panel">
        <h2>Prepare for your consultation</h2>
        <ul>
          {record.report.consultationPreparation.map((question) => (
            <li key={question}>{question}</li>
          ))}
        </ul>
        <p>{record.report.closingNote}</p>
        <Link className="button button--primary" href={consultationHref}>
          {ctaLabel}
        </Link>
        <p>{ctaHelperText}</p>
      </section>
    </div>
  );
}
