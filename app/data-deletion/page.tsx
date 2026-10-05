import type { Metadata } from "next";

import { SectionHeading } from "@/components/section-heading";
import { contactDetails } from "@/content/site-config";
import { buildPageMetadata } from "@/lib/seo";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/data-deletion",
    title: "Data deletion | Oppscan",
    description:
      "How to ask FutCo LLC to delete the personal information you gave Oppscan, and what happens next.",
  });
}

const deletionSubject = "Data deletion request";

export default function DataDeletionPage() {
  const mailto = `mailto:${contactDetails.email}?subject=${encodeURIComponent(deletionSubject)}`;

  return (
    <main className="page-main">
      <section className="page-section page-section--hero">
        <div className="container page-stack">
          <SectionHeading
            align="left"
            as="h1"
            description="Oppscan is operated by FutCo LLC. This page explains how to ask us to delete the personal information you gave us, and what happens when you do."
            eyebrow="PRIVACY"
            title="Delete your data"
            titleId="page-title"
          />
        </div>
      </section>

      <section className="page-section">
        <div className="container page-stack">
          <div className="content-panel">
            <h2>What we may hold about you</h2>
            <ul>
              <li>The business website address and work email you submitted.</li>
              <li>The optional software you told us your business uses, if you selected any.</li>
              <li>Whether you agreed to receive occasional messages from FutCo.</li>
              <li>The report we generated from your public website.</li>
              <li>If you bought a report: your checkout email and account details.</li>
            </ul>
          </div>

          <div className="content-panel">
            <h2>Facebook and Instagram</h2>
            <p>
              Oppscan does not use Facebook Login and does not store any data from your Facebook
              or Instagram account. If you arrived from a Facebook or Instagram ad, our
              advertising measurement tools may have recorded that you visited. You can limit
              that in your Facebook and Instagram ad preferences, and you can ask us to delete
              the information we hold using the steps below.
            </p>
          </div>

          <div className="content-panel">
            <h2>How to request deletion</h2>
            <ol>
              <li>
                Email <a href={mailto}>{contactDetails.email}</a> with the subject &ldquo;
                {deletionSubject}&rdquo;.
              </li>
              <li>
                Send it from the email address you used with Oppscan, and include the website
                address you submitted, so we can find your records.
              </li>
              <li>
                We will confirm the request and delete your reports and contact records within
                30 days.
              </li>
            </ol>
            <p>
              We may keep limited records where the law or our business requires it, for example
              payment records, or information needed to prevent abuse of the service.
            </p>
          </div>

          <div className="content-panel">
            <h2>Have an account?</h2>
            <p>
              If you created an account to buy a report, you can also delete it yourself from
              your account page.
            </p>
          </div>
        </div>
      </section>
    </main>
  );
}
