import { cookies } from "next/headers";
import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { primaryCta, resolvePrimaryCtaHref } from "@/content/site-config";
import {
  authorizeScannerReportToken,
  getScannerReportStore,
  reportEmailCookieName,
  reportEmailProofMatches,
} from "@/lib/scanner-report-store";
import { claimAndEmitScannerTelemetry } from "@/lib/scanner-telemetry";

export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  let store;
  let record;
  try {
    store = getScannerReportStore();
    record = await authorizeScannerReportToken(token, store);
  } catch {
    notFound();
  }
  if (!record) notFound();

  // Same email-confirmation gate as the report page itself -- otherwise
  // this route would let a leaked link trigger the consultation redirect
  // (and its telemetry) without ever passing that check.
  const cookieStore = await cookies();
  const emailProof = cookieStore.get(reportEmailCookieName())?.value || "";
  if (
    !emailProof ||
    !reportEmailProofMatches(record.scanId, record.checkoutEmail, emailProof)
  ) {
    return NextResponse.redirect(new URL(`/report/${token}`, request.url), 302);
  }

  const destination = resolvePrimaryCtaHref();
  try {
    await claimAndEmitScannerTelemetry(store, {
      scanId: record.scanId,
      eventName: "scanner_consultation_clicked",
      timestamp: new Date().toISOString(),
      destinationType:
        destination === primaryCta.fallbackHref ? "contact" : "booking",
    });
  } catch {}
  return NextResponse.redirect(new URL(destination, request.url), 302);
}
