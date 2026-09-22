import type { Metadata } from "next";

import { ReadinessScoreForm } from "@/components/readiness-score-form";
import { SectionHeading } from "@/components/section-heading";
import { buildPageMetadata } from "@/lib/seo";
import { emptyReadinessScoreState } from "@/lib/readiness-score";

import { submitReadinessScore } from "./actions";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/readiness-score",
    title: "Free AI Readiness Score | Oppscan",
    description:
      "Take a free, instant AI readiness self-assessment with five dropdown questions. No account required. Get a generic score now, then unlock tailored opportunities with the paid scan.",
  });
}

export default function ReadinessScorePage() {
  return (
    <main className="page-main">
      <section className="page-section page-section--hero">
        <div className="container page-stack">
          <SectionHeading
            align="left"
            as="h1"
            description="Get a free, instant AI readiness self-assessment with no account. This calculator gives a generic score only; it does not inspect your business or return personalized opportunities."
            eyebrow="FREE SELF-ASSESSMENT"
            title="Check your AI readiness in under a minute"
            titleId="page-title"
          />
        </div>
      </section>

      <section className="page-section">
        <div className="container contact-layout">
          <ReadinessScoreForm
            action={submitReadinessScore}
            initialState={emptyReadinessScoreState}
          />
        </div>
      </section>
    </main>
  );
}
