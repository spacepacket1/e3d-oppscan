import { notFound } from "next/navigation";
import { NextResponse } from "next/server";

import { primaryCta, resolvePrimaryCtaHref } from "@/content/site-config";
import {
  authorizeScannerReportToken,
  getScannerReportStore,
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
