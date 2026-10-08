import type { Metadata } from "next";
import Script from "next/script";

import { FreeScannerForm } from "@/components/free-scanner-form";
import { SectionHeading } from "@/components/section-heading";
import { emptyFreeScannerIntakeValues } from "@/lib/scanner-free-intake";
import { buildPageMetadata } from "@/lib/seo";

import { submitFreeLeadCapture, submitFreeScannerIntake } from "./actions";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/free",
    title: "Free AI Opportunity Summary | Oppscan",
    description:
      "Enter your website and get a free summary of your top AI opportunities in about a minute. No payment, no account. Upgrade to the paid scan for the full ranked report and a consultation with FutCo.",
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

      <section className="page-section page-section--hero page-section--compact-bottom">
        <div className="container page-stack">
          <SectionHeading
            align="left"
            as="h1"
            description="Enter your website and see where AI could help your business, in about a minute. Free, no account."
            eyebrow="FREE SUMMARY"
            title="Try the free AI opportunity summary"
            titleId="page-title"
          />
        </div>
      </section>

      <section className="page-section page-section--flush-top">
        <div className="container contact-layout">
          <FreeScannerForm
            action={submitFreeScannerIntake}
            initialState={{
              status: "idle",
              values: emptyFreeScannerIntakeValues,
              errors: {},
            }}
            leadAction={submitFreeLeadCapture}
            turnstileSiteKey={turnstileSiteKey}
          />
        </div>
      </section>
    </main>
  );
}
