import { ConsultationCta } from "@/components/consultation-cta";
import { Paragraphs, opportunityAnchorId } from "@/components/scanner-report";
import { hvacLiteContent } from "@/content/hvac-content";
import type {
  HvacOpportunityConfidence,
  HvacOpportunityEase,
  HvacOpportunityFinancialLever,
  HvacOpportunityImpact,
} from "@/lib/scanner-analysis";
import type { ScannerCompletedReport } from "@/lib/scanner-report-store";

const FINANCIAL_LEVER_LABELS: Record<HvacOpportunityFinancialLever, string> = {
  revenue: "Revenue",
  "cost-savings": "Cost savings",
  capacity: "Capacity",
  "customer-experience": "Customer experience",
};

const IMPACT_LABELS: Record<HvacOpportunityImpact, string> = {
  high: "High",
  medium: "Medium",
  moderate: "Moderate",
};

const CONFIDENCE_LABELS: Record<HvacOpportunityConfidence, string> = {
  "strong-evidence": "Strong public evidence",
  "moderate-evidence": "Moderate public evidence",
  "limited-evidence": "Limited public evidence",
};

const EASE_LABELS: Record<HvacOpportunityEase, string> = {
  straightforward: "Straightforward",
  moderate: "Moderate",
  involved: "Involved",
};

// The HVAC Lite report is a distinct, business-case-first structure per
// the partner's spec (2026-09-26 + 2026-09-29 emails) -- forwardable to an
// owner/GM/budget holder, not an AI-capability writeup -- so it gets its
// own component rather than more conditionals bolted onto ScannerReport,
// which stays exactly as the paid flow needs it.
export function HvacLiteReport({
  record,
  consultationHref,
  campaignPixelId,
}: {
  record: Pick<ScannerCompletedReport, "candidates" | "report">;
  consultationHref: string;
  campaignPixelId?: string;
}) {
  const { report } = record;
  const copyByCandidate = new Map(
    report.opportunities.map((item) => [item.candidateId, item]),
  );

  return (
    <div className="page-stack scanner-report">
      <header className="content-panel">
        <p className="section-heading__eyebrow">{hvacLiteContent.brand.productName}</p>
        <h1>{report.reportTitle}</h1>
        {report.preparedForNote ? <p>{report.preparedForNote}</p> : null}
      </header>

      {report.whatWeObserved && report.whatWeObserved.length > 0 ? (
        <section className="content-panel">
          <h2>What we observed</h2>
          <ul>
            {report.whatWeObserved.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="content-panel">
        <p>{hvacLiteContent.valueProposition}</p>
        <h2>{hvacLiteContent.report.opportunitiesIntroHeading}</h2>
        <ul>
          {hvacLiteContent.report.opportunitiesIntroItems.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      </section>

      <section className="content-panel">
        <h2>Executive summary</h2>
        <Paragraphs text={report.executiveSummary} />
        <h3>Recommended starting point</h3>
        <Paragraphs text={report.recommendedStartingPoint} />
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
            <h2>{copy.headline}</h2>
            <p>{candidate.summary}</p>
            <dl className="scanner-candidate-stats">
              {copy.financialLever ? (
                <div>
                  <dt>Financial lever</dt>
                  <dd>{FINANCIAL_LEVER_LABELS[copy.financialLever]}</dd>
                </div>
              ) : null}
              {copy.potentialImpact ? (
                <div>
                  <dt>Potential impact</dt>
                  <dd>{IMPACT_LABELS[copy.potentialImpact]}</dd>
                </div>
              ) : null}
              {copy.confidence ? (
                <div>
                  <dt>Confidence</dt>
                  <dd>{CONFIDENCE_LABELS[copy.confidence]}</dd>
                </div>
              ) : null}
              {copy.easeOfImplementation ? (
                <div>
                  <dt>Ease of implementation</dt>
                  <dd>{EASE_LABELS[copy.easeOfImplementation]}</dd>
                </div>
              ) : null}
              {copy.timeToValue ? (
                <div>
                  <dt>Time to value</dt>
                  <dd>{copy.timeToValue}</dd>
                </div>
              ) : null}
            </dl>
            <h3>Why it matters</h3>
            <Paragraphs text={copy.whyItMatters} />
            <h3>Evidence</h3>
            <ul>
              {candidate.evidence.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3>Practical approach</h3>
            <ol>
              {copy.practicalApproach.map((step) => (
                <li key={step}>{step}</li>
              ))}
            </ol>
            {copy.recommendedPilot ? (
              <>
                <h3>Recommended pilot</h3>
                <p>{copy.recommendedPilot}</p>
              </>
            ) : null}
            {copy.valueCalculation ? (
              <>
                <h3>How to estimate the value</h3>
                <p>{copy.valueCalculation.formula}</p>
                <p className="development-note">Data needed to validate:</p>
                <ul>
                  {copy.valueCalculation.dataNeeded.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </>
            ) : null}
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
        <h2>{hvacLiteContent.report.implementationHeading}</h2>
        {hvacLiteContent.report.implementationBody.map((paragraph) => (
          <p key={paragraph}>{paragraph}</p>
        ))}
      </section>

      <section className="content-panel">
        <h2>Next steps</h2>
        <h3>Bring these numbers to your call</h3>
        <ul>
          {report.consultationPreparation.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
        <p>{report.closingNote}</p>
        <ConsultationCta
          href={consultationHref}
          label={hvacLiteContent.report.ctaLabel}
          pixelId={campaignPixelId}
        />
        <p>{hvacLiteContent.report.ctaSupportingText}</p>
        <p className="development-note">{hvacLiteContent.report.ctaHelperText}</p>
      </section>
    </div>
  );
}
