import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { HvacLiteReport } from "@/components/hvac-lite-report";
import {
  HideDefaultSiteChrome,
  IteraBrandFooter,
  IteraBrandHeader,
} from "@/components/itera-brand-chrome";
import { ScannerCampaignPixel } from "@/components/scanner-campaign-pixel";
import { ScannerReport } from "@/components/scanner-report";
import { hvacLiteContent } from "@/content/hvac-content";
import { getScannerCampaign } from "@/lib/scanner-campaigns";
import {
  authorizeScannerReportToken,
  getScannerReportStore,
  reportEmailCookieName,
  reportEmailProofMatches,
} from "@/lib/scanner-report-store";
import { claimAndEmitScannerTelemetry } from "@/lib/scanner-telemetry";

import { verifyReportEmail } from "./actions";
import { ReportEmailGate } from "./report-email-gate";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ token: string }>;
}): Promise<Metadata> {
  const { token } = await params;
  const authorized = await loadAuthorizedReport(token);
  const campaign = getScannerCampaign(authorized?.record.campaign?.source);
  const reportTitle = authorized?.record.report.reportTitle;
  return {
    title: campaign
      ? `${reportTitle ?? hvacLiteContent.brand.productName} | ${hvacLiteContent.brand.company}`
      : "AI Opportunity Scanner Report | Oppscan",
    robots: { index: false, follow: false },
  };
}

export default async function ScannerReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const authorized = await loadAuthorizedReport(token);
  if (!authorized) notFound();
  const { store, record } = authorized;
  const campaign = getScannerCampaign(record.campaign?.source);
  const isHvacLite = campaign?.source === "hvac_lite";

  const cookieStore = await cookies();
  const emailProof = cookieStore.get(reportEmailCookieName())?.value || "";
  const emailVerified =
    emailProof &&
    reportEmailProofMatches(record.scanId, record.checkoutEmail, emailProof);
  if (!emailVerified) {
    return (
      <>
        {isHvacLite ? <HideDefaultSiteChrome /> : null}
        {isHvacLite ? <IteraBrandHeader /> : null}
        <ReportEmailGate action={verifyReportEmail.bind(null, token)} />
        {isHvacLite ? <IteraBrandFooter /> : null}
      </>
    );
  }

  try {
    await claimAndEmitScannerTelemetry(store, {
      scanId: record.scanId,
      eventName: "scanner_report_viewed",
      timestamp: new Date().toISOString(),
    });
  } catch {}
  return (
    <>
      {isHvacLite ? <HideDefaultSiteChrome /> : null}
      {isHvacLite ? <IteraBrandHeader /> : null}
      <main className="page-main">
        {campaign ? <ScannerCampaignPixel pixelId={campaign.metaPixelId} /> : null}
        <section className="page-section">
          <div className="container">
            {isHvacLite ? (
              <HvacLiteReport
                campaignPixelId={campaign?.metaPixelId}
                consultationHref={`/report/${token}/consultation`}
                record={record}
              />
            ) : (
              <ScannerReport
                consultationHref={`/report/${token}/consultation`}
                record={record}
              />
            )}
          </div>
        </section>
      </main>
      {isHvacLite ? <IteraBrandFooter /> : null}
    </>
  );
}

async function loadAuthorizedReport(token: string) {
  try {
    const store = getScannerReportStore();
    const record = await authorizeScannerReportToken(token, store);
    return record ? { store, record } : null;
  } catch {
    return null;
  }
}
