import type { Metadata } from "next";
import Script from "next/script";

import { FreeScannerForm } from "@/components/free-scanner-form";
import { SectionHeading } from "@/components/section-heading";
import { emptyFreeScannerIntakeValues } from "@/lib/scanner-free-intake";
import { buildPageMetadata } from "@/lib/seo";

import { submitFreeScannerIntake } from "./actions";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/free",
    title: "Free AI Opportunity Summary | Oppscan",
    description:
      "Get a free, simplified summary of your top AI opportunities in minutes. No payment required. Upgrade to the paid scan for the full ranked report and a consultation with FutCo.",
  });
}

export default function FreeScannerPage() {
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
            description="Answer six quick questions and get a free, simplified summary of where AI could help your business — no payment, no account. Want the full ranked report, evidence, first steps, and a consultation with FutCo? Upgrade to the paid scan any time."
            eyebrow="FREE SUMMARY"
            title="Try the free AI opportunity summary"
            titleId="page-title"
          />
        </div>
      </section>

      <section className="page-section">
        <div className="container contact-layout">
          <FreeScannerForm
            action={submitFreeScannerIntake}
            initialState={{
              status: "idle",
              values: emptyFreeScannerIntakeValues,
              errors: {},
            }}
            turnstileSiteKey={turnstileSiteKey}
          />
        </div>
      </section>
    </main>
  );
}
