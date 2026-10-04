import { createHmac } from "node:crypto";

import type { HvacLeadContext } from "@/lib/hvac-fit";
import type {
  ScannerReportFeedCursor,
  ScannerReportFeedSummary,
} from "@/lib/scanner-report-store";

// Read-only event feed for FutCo's e3d-corp instance. It deliberately carries
// no email address, no raw scan ID (which derives from the lead's email), and
// no report text -- only what an operator needs to reason about funnel
// performance and lead quality. Event IDs are an HMAC of the scan ID, stable
// across requests but not reversible.
export const OPS_FEED_SCHEMA_VERSION = 1;
export const OPS_FEED_SOURCE = "oppscan.futco.ai";
export const DEFAULT_PAGE_SIZE = 100;
export const MAX_PAGE_SIZE = 500;

export type OpsFeedEvent = {
  id: string;
  type: "oppscan.report_completed";
  occurredAt: string;
  source: typeof OPS_FEED_SOURCE;
  data: {
    product: string;
    company: string | null;
    revoked: boolean;
    fitTier: HvacLeadContext["fit"]["tier"] | null;
    primaryPlatform: HvacLeadContext["primaryPlatform"];
    detectedPlatform: HvacLeadContext["detected"]["platform"];
    onlineBookingDetected: boolean | null;
    chatWidgetDetected: boolean | null;
    toolsReportedByOwner: HvacLeadContext["toolsUsed"];
  };
};

export function buildOpsFeedEvent(
  summary: ScannerReportFeedSummary,
  idSecret: string,
): OpsFeedEvent {
  const context = summary.campaign?.leadContext;
  return {
    id: `rep_${createHmac("sha256", idSecret).update(summary.scanId).digest("hex").slice(0, 24)}`,
    type: "oppscan.report_completed",
    occurredAt: summary.completedAt,
    source: OPS_FEED_SOURCE,
    data: {
      // Reports with no campaign tag are paid FutCo reports.
      product: summary.campaign?.source ?? "paid_report",
      company: summary.companyName,
      revoked: summary.revoked,
      fitTier: context?.fit.tier ?? null,
      primaryPlatform: context?.primaryPlatform ?? null,
      detectedPlatform: context?.detected.platform ?? null,
      onlineBookingDetected: context ? context.detected.onlineBooking : null,
      chatWidgetDetected: context ? context.detected.chatWidget : null,
      toolsReportedByOwner: context?.toolsUsed ?? [],
    },
  };
}

// Opaque to callers: base64url of the (completedAt, scanId) position. The
// scan ID inside is not secret to the feed's one authenticated consumer, but
// it is never echoed in any event.
export function encodeFeedCursor(cursor: ScannerReportFeedCursor): string {
  return Buffer.from(JSON.stringify({ t: cursor.completedAt, i: cursor.scanId })).toString(
    "base64url",
  );
}

export function decodeFeedCursor(value: string): ScannerReportFeedCursor | null {
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8"));
    if (
      typeof parsed?.t !== "string" ||
      typeof parsed?.i !== "string" ||
      Number.isNaN(Date.parse(parsed.t))
    ) {
      return null;
    }
    return { completedAt: parsed.t, scanId: parsed.i };
  } catch {
    return null;
  }
}

export function parsePageSize(value: string | null): number {
  const parsed = Number.parseInt(value ?? "", 10);
  if (!Number.isFinite(parsed) || parsed < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(parsed, MAX_PAGE_SIZE);
}
