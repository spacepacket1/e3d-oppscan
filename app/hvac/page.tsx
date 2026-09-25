import type { Metadata } from "next";
import Script from "next/script";

import { HvacLiteForm } from "@/components/hvac-lite-form";
import { SectionHeading } from "@/components/section-heading";
import { hvacLiteContent } from "@/content/hvac-content";
import { emptyHvacLiteIntakeValues } from "@/lib/scanner-lite-intake";
import { buildPageMetadata } from "@/lib/seo";

import { submitHvacLiteIntake } from "./actions";

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/hvac",
    title: hvacLiteContent.meta.title,
    description: hvacLiteContent.meta.description,
  });
}

export default function HvacLiteScannerPage() {
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
            description={hvacLiteContent.hero.description}
            eyebrow={hvacLiteContent.hero.eyebrow}
            title={hvacLiteContent.hero.heading}
            titleId="page-title"
          />
        </div>
      </section>

      <section className="page-section">
        <div className="container contact-layout">
          <HvacLiteForm
            action={submitHvacLiteIntake}
            initialState={{
              status: "idle",
              values: emptyHvacLiteIntakeValues,
              errors: {},
            }}
            turnstileSiteKey={turnstileSiteKey}
          />
        </div>
      </section>
    </main>
  );
}
