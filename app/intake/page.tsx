import type { Metadata } from "next";
import Script from "next/script";

import { ScannerIntakeForm } from "@/components/scanner-intake-form";
import { SectionHeading } from "@/components/section-heading";
import { scannerContent } from "@/content/scanner-content";
import { emptyScannerIntakeFormValues } from "@/lib/scanner-intake";
import { buildPageMetadata } from "@/lib/seo";

import { submitScannerIntakeForm } from "./actions";

type ScannerIntakePageProps = {
  searchParams?: Promise<{
    stripe_session_id?: string;
  }>;
};

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/intake",
    title: "Scanner Intake | Oppscan",
    description:
      "Unlock the paid AI opportunity scanner intake with the checkout payment key, confirm the report email, and submit the business context Chris needs for the manual report.",
  });
}

export default async function ScannerIntakePage({
  searchParams,
}: ScannerIntakePageProps) {
  const resolvedSearchParams = await searchParams;
  const turnstileSiteKey =
    process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY && process.env.TURNSTILE_SECRET_KEY
      ? process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY
      : "";

  return (
    <main className="page-main">
      {turnstileSiteKey ? (
        <Script
          async
          defer
          src="https://challenges.cloudflare.com/turnstile/v0/api.js"
          strategy="afterInteractive"
        />
      ) : null}

      <section className="page-section page-section--hero">
        <div className="container page-stack">
          <SectionHeading
            align="left"
            as="h1"
            description={scannerContent.intakePage.description}
            eyebrow={scannerContent.intakePage.eyebrow}
            title={scannerContent.intakePage.heading}
            titleId="page-title"
          />
        </div>
      </section>

      <section className="page-section">
        <div className="container contact-layout">
          <ScannerIntakeForm
            action={submitScannerIntakeForm}
            initialState={{
              status: "idle",
              values: emptyScannerIntakeFormValues,
              errors: {},
            }}
            stripeSessionId={resolvedSearchParams?.stripe_session_id || ""}
            turnstileSiteKey={turnstileSiteKey}
          />
        </div>
      </section>
    </main>
  );
}
