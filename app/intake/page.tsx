import { randomBytes } from "node:crypto";

import type { Metadata } from "next";
import { headers } from "next/headers";
import Script from "next/script";

import { ScannerIntakeForm } from "@/components/scanner-intake-form";
import { SectionHeading } from "@/components/section-heading";
import { scannerContent } from "@/content/scanner-content";
import { getE3dSessionUser, isE3dAdmin } from "@/lib/e3d-session";
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
      "Unlock the paid AI opportunity scanner intake with the checkout payment key, confirm the report email, and submit the business context FutCo needs for the manual report.",
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
  const stripeSessionId = resolvedSearchParams?.stripe_session_id || "";

  // An admin arriving without a Stripe session (i.e. via the homepage's
  // direct "go straight to intake" link, not a real checkout redirect)
  // skips the payment-key claim UI entirely. submitScannerIntakeForm
  // independently re-verifies admin status server-side before honoring
  // this -- this bypass key is only ever a UI convenience, never itself
  // a credential the server trusts.
  let initialVerifiedAccess: { creditKey: string; checkoutEmailHint: string; credits: number } | undefined;
  if (!stripeSessionId) {
    const headerList = await headers();
    const session = await getE3dSessionUser(headerList.get("cookie") || "");
    if (isE3dAdmin(session) && session.authenticated) {
      initialVerifiedAccess = {
        creditKey: `admin-bypass:${randomBytes(16).toString("hex")}`,
        checkoutEmailHint: session.email,
        credits: 1,
      };
    }
  }

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
            stripeSessionId={stripeSessionId}
            turnstileSiteKey={turnstileSiteKey}
            initialVerifiedAccess={initialVerifiedAccess}
          />
        </div>
      </section>
    </main>
  );
}
