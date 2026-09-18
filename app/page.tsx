import type { Metadata } from "next";
import Link from "next/link";

import { SectionHeading } from "@/components/section-heading";
import { scannerContent } from "@/content/scanner-content";
import { buildPageMetadata } from "@/lib/seo";
import { getScannerOffer } from "@/lib/scanner-payments";

import { startScannerCheckout } from "./actions";

type ScannerPageProps = {
  searchParams?: Promise<{
    stripe_cancelled?: string;
    checkout_error?: string;
  }>;
};

export function generateMetadata(): Metadata {
  return buildPageMetadata({
    path: "/",
    title: "Oppscan | AI Opportunity Scanner",
    description:
      "Buy a manual AI opportunity scan with a short business intake, a written report, and roughly an hour with FutCo to discuss the findings.",
  });
}

export default async function AiOpportunityScannerPage({
  searchParams,
}: ScannerPageProps) {
  const [offer, resolvedSearchParams] = await Promise.all([
    getScannerOffer(),
    searchParams,
  ]);
  const notice =
    resolvedSearchParams?.checkout_error === "1"
      ? scannerContent.notices.failed
      : resolvedSearchParams?.stripe_cancelled === "1"
        ? scannerContent.notices.cancelled
        : null;

  return (
    <main className="page-main">
      <section className="page-section page-section--hero">
        <div className="container scanner-stack">
          <div className="scanner-hero">
            <SectionHeading
              align="left"
              as="h1"
              description={scannerContent.hero.description}
              eyebrow={scannerContent.hero.eyebrow}
              title={scannerContent.hero.heading}
              titleId="page-title"
            />
            <div className="scanner-price-card">
              <p className="scanner-price-card__label">Price</p>
              <p className="scanner-price-card__amount">{offer.formattedPrice}</p>
              <p className="scanner-price-card__detail">
                {offer.pack.description}. Complete payment first, then submit the short
                intake.
              </p>
              <form action={startScannerCheckout}>
                <button className="button button--primary" type="submit">
                  {scannerContent.hero.ctaLabel}
                </button>
              </form>
              <Link className="button button--secondary" href="/free">
                Try a free simplified summary first
              </Link>
            </div>
          </div>
          {notice ? (
            <p className="development-note" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </section>

      <section className="page-section">
        <div className="container scanner-grid">
          <article className="content-panel">
            <div className="content-panel__body">
              <h2 className="content-panel__title">{scannerContent.includes.heading}</h2>
              <ul className="qualification-checklist">
                {scannerContent.includes.items.map((item) => (
                  <li className="qualification-checklist__item" key={item}>
                    <span
                      aria-hidden="true"
                      className="qualification-checklist__marker"
                    >
                      ✓
                    </span>
                    <span>{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          </article>

          <article className="content-panel">
            <div className="content-panel__body">
              <h2 className="content-panel__title">{scannerContent.process.heading}</h2>
              <ol className="scanner-steps">
                {scannerContent.process.items.map((item, index) => (
                  <li className="process-step" key={item}>
                    <span className="process-step__marker" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="process-step__content">
                      <p>{item}</p>
                    </div>
                  </li>
                ))}
              </ol>
            </div>
          </article>
        </div>
      </section>

      <section className="page-section page-section--tinted">
        <div className="container scanner-grid">
          <article className="content-panel">
            <div className="content-panel__body">
              <h2 className="content-panel__title">{scannerContent.intake.heading}</h2>
              <p>{scannerContent.intake.description}</p>
            </div>
          </article>
          <article className="content-panel">
            <div className="content-panel__body">
              <h2 className="content-panel__title">{scannerContent.privacy.heading}</h2>
              <p>{scannerContent.privacy.body}</p>
            </div>
          </article>
        </div>
      </section>

      <section className="page-section">
        <div className="container homepage-final-cta">
          <SectionHeading
            align="center"
            description={scannerContent.footer.description}
            title={scannerContent.footer.heading}
          />
        </div>
      </section>
    </main>
  );
}
