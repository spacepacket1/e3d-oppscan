import type { Metadata } from "next";
import { cookies } from "next/headers";
import { notFound } from "next/navigation";

import { ScannerReport } from "@/components/scanner-report";
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
export const metadata: Metadata = {
  title: "AI Opportunity Scanner Report | Oppscan",
  robots: { index: false, follow: false },
};

export default async function ScannerReportPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const authorized = await loadAuthorizedReport(token);
  if (!authorized) notFound();
  const { store, record } = authorized;

  const cookieStore = await cookies();
  const emailProof = cookieStore.get(reportEmailCookieName())?.value || "";
  const emailVerified =
    emailProof &&
    reportEmailProofMatches(record.scanId, record.checkoutEmail, emailProof);
  if (!emailVerified) {
    return <ReportEmailGate action={verifyReportEmail.bind(null, token)} />;
  }

  try {
    await claimAndEmitScannerTelemetry(store, {
      scanId: record.scanId,
      eventName: "scanner_report_viewed",
      timestamp: new Date().toISOString(),
    });
  } catch {}
  return (
    <main className="page-main">
      <section className="page-section">
        <div className="container">
          <ScannerReport
            consultationHref={`/report/${token}/consultation`}
            record={record}
          />
        </div>
      </section>
    </main>
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
