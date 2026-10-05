import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { createMongoScannerReportStore } from "@/lib/mongodb-scanner-report-store";
import type { HvacLeadContext } from "@/lib/hvac-fit";
import type { ScannerReportCopy } from "@/lib/scanner-analysis";
import type { RankedScannerCandidate } from "@/lib/scanner-scoring";

// Ad-campaign tag on a completed report. `leadContext` (HVAC Lite only) holds
// the business's software stack and our internal fit assessment.
export type ScannerCampaignTag = {
  source: string;
  leadContext?: HvacLeadContext;
};

export type ScannerCompletedReport = {
  scanId: string;
  settledSpendAt?: string;
  completedAt: string;
  tokenHash: string;
  // The checkout email is required to view the report (see
  // authorizeScannerReportEmail below) -- the token alone is not enough,
  // since a leaked/forwarded link should not by itself grant access.
  checkoutEmail: string;
  // From the intake form, not the report copy -- shown in report listings
  // (customer and admin) so a report is identifiable at a glance.
  companyName: string;
  candidates: RankedScannerCandidate[];
  report: ScannerReportCopy;
  // Application-computed AI maturity score (0-100) and the score a
  // business could reach by adopting every listed opportunity. See
  // computeBaseScore/computePotentialScore in scanner-scoring.ts.
  baseScore: number;
  potentialScore: number;
  // Set only for reports generated through an ad-campaign variant (e.g.
  // HVAC Lite) -- undefined for every paid FutCo report. The report page
  // and consultation redirect look up the rest of the campaign's config
  // (Pixel ID, booking URL) from scanner-campaigns.ts by this source string
  // rather than persisting it here, so it can be corrected without a data
  // migration.
  campaign?: ScannerCampaignTag;
};

export type ScannerReportCompletionInput = Pick<
  ScannerCompletedReport,
  | "candidates"
  | "report"
  | "baseScore"
  | "potentialScore"
  | "checkoutEmail"
  | "companyName"
  | "campaign"
>;

// Admin sees every report, including ones completed before a given field
// existed (checkoutEmail, companyName, baseScore/potentialScore were all
// added after some real reports were already completed) -- those fields
// are null here rather than fabricated, since a maturity assessment that
// was never actually judged can't be honestly backfilled.
export type ScannerReportForAdmin = Omit<
  ScannerCompletedReport,
  "checkoutEmail" | "companyName" | "baseScore" | "potentialScore"
> & {
  revoked: boolean;
  checkoutEmail: string | null;
  companyName: string | null;
  baseScore: number | null;
  potentialScore: number | null;
};

// The narrow slice of a completed report that the read-only ops feed exposes
// (see app/api/ops/events/route.ts). Deliberately excludes the checkout
// email, the report body, and the access-token hash.
export type ScannerReportFeedSummary = {
  scanId: string;
  completedAt: string;
  companyName: string | null;
  campaign?: ScannerCampaignTag;
  revoked: boolean;
};

// Stable pagination position: completion time, with scanId breaking ties.
export type ScannerReportFeedCursor = {
  completedAt: string;
  scanId: string;
};

// A visitor who asked for their free summary by email. Stored durably before
// any email is sent, so a delivery failure never loses the lead. The email
// itself stays in the database (and the notification email); it is never part
// of the ops feed.
export type FreeLeadDeliveryStatus = "pending" | "sent" | "failed";

export type FreeLeadRecord = {
  leadId: string;
  createdAt: string;
  email: string;
  marketingOptIn: boolean;
  websiteHost: string;
  opportunityTitles: string[];
  deliveryStatus: FreeLeadDeliveryStatus;
};

export type FreeLeadFeedSummary = {
  leadId: string;
  createdAt: string;
  websiteHost: string;
  marketingOptIn: boolean;
  opportunityCount: number;
  deliveryStatus: FreeLeadDeliveryStatus;
};

export type FreeLeadFeedCursor = { createdAt: string; leadId: string };

export interface ScannerReportStore {
  getByScanId(scanId: string): Promise<ScannerCompletedReport | null>;
  getByTokenHash(tokenHash: string): Promise<ScannerCompletedReport | null>;
  acquireGenerationLease(
    scanId: string,
    ownerId: string,
    now: number,
    expiresAt: number,
  ): Promise<"acquired" | "busy" | "complete">;
  releaseGenerationLease(scanId: string, ownerId: string): Promise<void>;
  markSpendSettled(scanId: string, settledAt: string): Promise<void>;
  hasSettledSpend(scanId: string): Promise<boolean>;
  completeReport(
    scanId: string,
    ownerId: string,
    report: ScannerReportCompletionInput,
    tokenHash: string,
    completedAt: string,
  ): Promise<ScannerCompletedReport>;
  claimTelemetryEvent(scanId: string, eventName: string): Promise<boolean>;
  // Revoking a specific scan's link makes getByTokenHash treat it as not
  // found (report page and consultation redirect both 404) without
  // affecting any other report -- there is no per-report secret to rotate,
  // only one global SCANNER_REPORT_TOKEN_SECRET shared by every report, so
  // this is the only way to kill one specific leaked/forwarded link.
  // Reversible: setReportRevoked(scanId, false) restores access.
  setReportRevoked(scanId: string, revoked: boolean): Promise<void>;
  // For the customer-facing "your reports" account page. Case-insensitive,
  // excludes revoked reports (same as getByTokenHash).
  listReportsByCheckoutEmail(email: string): Promise<ScannerCompletedReport[]>;
  // For the FutCo admin listing only -- includes revoked reports (with
  // `revoked` exposed so the admin UI can show and toggle it), unlike every
  // other read path in this interface.
  listAllReportsForAdmin(): Promise<ScannerReportForAdmin[]>;
  // Oldest-first page of completed reports strictly after `after` (or from
  // the start when null), for the read-only ops feed. Includes revoked
  // reports (flagged), since a revoked link is still a lead.
  listCompletedSummariesAfter(
    after: ScannerReportFeedCursor | null,
    limit: number,
  ): Promise<ScannerReportFeedSummary[]>;
  // Saves a free-summary lead. `created` is false when the same email asked
  // for the same site's summary before -- the caller should then not email
  // again. Never overwrites an existing lead.
  saveFreeLead(lead: FreeLeadRecord): Promise<{ created: boolean }>;
  setFreeLeadDeliveryStatus(
    leadId: string,
    status: FreeLeadDeliveryStatus,
  ): Promise<void>;
  // Oldest-first page of free leads strictly after `after`, for the ops feed.
  listFreeLeadSummariesAfter(
    after: FreeLeadFeedCursor | null,
    limit: number,
  ): Promise<FreeLeadFeedSummary[]>;
  // Permanent, unlike setReportRevoked -- removes the record entirely
  // rather than just blocking the link. Admin-only.
  deleteReport(scanId: string): Promise<void>;
}

let testStore: ScannerReportStore | undefined;
let productionStore: ScannerReportStore | undefined;

export function setScannerReportStoreForTests(store?: ScannerReportStore) {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "Scanner report store test injection is available only in tests.",
    );
  }
  testStore = store;
}

export function getScannerReportStore(): ScannerReportStore {
  if (process.env.NODE_ENV === "test") {
    if (testStore) return testStore;
    throw new Error("A durable scanner report store is not configured.");
  }

  if (productionStore) return productionStore;
  const mongoUrl = process.env.SCANNER_MONGO_URL?.trim();
  if (!mongoUrl) {
    throw new Error("A durable scanner report store is not configured.");
  }

  try {
    productionStore = createMongoScannerReportStore(mongoUrl);
    return productionStore;
  } catch {
    throw new Error("A durable scanner report store is not configured.");
  }
}

export function deriveScanId(creditKey: string) {
  return `scan_${createHash("sha256").update(creditKey, "utf8").digest("hex").slice(0, 32)}`;
}

// Lite has no creditKey to derive identity from, so scanId comes from the
// normalized (email, website) pair instead -- same idempotency rationale as
// deriveScanId above: a duplicate submission (double-click, page refresh
// mid-generation) resolves to the same report rather than re-running the
// LLM pipeline and re-delivering the webhook a second time.
export function deriveLiteScanId(email: string, website: string) {
  const identity = `${normalizeReportEmail(email)}|${website.trim().toLowerCase()}`;
  return `scan_lite_${createHash("sha256").update(identity, "utf8").digest("hex").slice(0, 32)}`;
}

export function createLeaseOwnerId() {
  return randomBytes(16).toString("hex");
}

export function deriveReportAccessToken(scanId: string) {
  const secret = process.env.SCANNER_REPORT_TOKEN_SECRET?.trim() || "";
  if (!secret) throw new Error("Scanner report access is not configured.");
  if (
    process.env.NODE_ENV === "production" &&
    Buffer.byteLength(secret, "utf8") < 32
  ) {
    throw new Error("Scanner report access is not configured.");
  }
  return createHmac("sha256", secret)
    .update(`scanner-report:${scanId}`, "utf8")
    .digest("base64url");
}

export function hashReportAccessToken(token: string) {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isCanonicalReportAccessToken(token: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(token)) return false;
  try {
    const decoded = Buffer.from(token, "base64url");
    return decoded.length === 32 && decoded.toString("base64url") === token;
  } catch {
    return false;
  }
}

export function reportTokenMatchesHash(token: string, expectedHash: string) {
  if (!/^[a-f0-9]{64}$/.test(expectedHash)) return false;
  const actual = Buffer.from(hashReportAccessToken(token), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export function buildReportUrl(scanId: string) {
  return `/report/${deriveReportAccessToken(scanId)}`;
}

export async function authorizeScannerReportToken(
  token: string,
  store = getScannerReportStore(),
) {
  if (!isCanonicalReportAccessToken(token)) return null;
  const tokenHash = hashReportAccessToken(token);
  const record = await store.getByTokenHash(tokenHash);
  if (!record || !reportTokenMatchesHash(token, record.tokenHash)) return null;
  let expectedToken: string;
  try {
    expectedToken = deriveReportAccessToken(record.scanId);
  } catch {
    return null;
  }
  const actualBuffer = Buffer.from(token, "utf8");
  const expectedBuffer = Buffer.from(expectedToken, "utf8");
  if (
    actualBuffer.length !== expectedBuffer.length ||
    !timingSafeEqual(actualBuffer, expectedBuffer)
  )
    return null;
  return record;
}

export function normalizeReportEmail(email: string) {
  return email.trim().toLowerCase();
}

// A fixed name is fine (not per-token) because the cookie is always set
// scoped to this specific report's own path (/report/<token>), so the
// browser never sends it for a different report's path regardless of name.
export function reportEmailCookieName() {
  return "scanner_report_email_verified";
}

// A separate proof from deriveReportAccessToken (different namespace
// string, same secret) that the visitor already confirmed the checkout
// email for this specific scan. Stored in a cookie scoped to this report's
// own path -- unforgeable without the server secret, so a visitor can't
// just fabricate the cookie to skip the email check.
export function deriveReportEmailProof(scanId: string, checkoutEmail: string) {
  const secret = process.env.SCANNER_REPORT_TOKEN_SECRET?.trim() || "";
  if (!secret) throw new Error("Scanner report access is not configured.");
  return createHmac("sha256", secret)
    .update(
      `scanner-report-email:${scanId}:${normalizeReportEmail(checkoutEmail)}`,
      "utf8",
    )
    .digest("base64url");
}

export function reportEmailProofMatches(
  scanId: string,
  checkoutEmail: string,
  proof: string,
) {
  let expected: string;
  try {
    expected = deriveReportEmailProof(scanId, checkoutEmail);
  } catch {
    return false;
  }
  const actualBuffer = Buffer.from(proof, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    actualBuffer.length === expectedBuffer.length &&
    timingSafeEqual(actualBuffer, expectedBuffer)
  );
}

type MemoryRecord = {
  lease?: { ownerId: string; expiresAt: number };
  settledSpendAt?: string;
  completed?: ScannerCompletedReport;
  revoked?: boolean;
  events: Set<string>;
};

/** Explicit test double. Production code never selects or constructs this store. */
export class InMemoryScannerReportStore implements ScannerReportStore {
  private readonly freeLeads = new Map<string, FreeLeadRecord>();
  async saveFreeLead(lead: FreeLeadRecord) {
    if (this.freeLeads.has(lead.leadId)) return { created: false };
    this.freeLeads.set(lead.leadId, structuredClone(lead));
    return { created: true };
  }
  async setFreeLeadDeliveryStatus(leadId: string, status: FreeLeadDeliveryStatus) {
    const lead = this.freeLeads.get(leadId);
    if (lead) lead.deliveryStatus = status;
  }
  async listFreeLeadSummariesAfter(after: FreeLeadFeedCursor | null, limit: number) {
    return [...this.freeLeads.values()]
      .filter(
        (lead) =>
          !after ||
          lead.createdAt > after.createdAt ||
          (lead.createdAt === after.createdAt && lead.leadId > after.leadId),
      )
      .sort(
        (a, b) => a.createdAt.localeCompare(b.createdAt) || a.leadId.localeCompare(b.leadId),
      )
      .slice(0, limit)
      .map((lead) => ({
        leadId: lead.leadId,
        createdAt: lead.createdAt,
        websiteHost: lead.websiteHost,
        marketingOptIn: lead.marketingOptIn,
        opportunityCount: lead.opportunityTitles.length,
        deliveryStatus: lead.deliveryStatus,
      }));
  }
  private records = new Map<string, MemoryRecord>();

  async getByScanId(scanId: string) {
    return this.records.get(scanId)?.completed ?? null;
  }
  async getByTokenHash(tokenHash: string) {
    for (const entry of this.records.values()) {
      if (entry.revoked) continue;
      if (entry.completed?.tokenHash === tokenHash) return entry.completed;
    }
    return null;
  }
  async setReportRevoked(scanId: string, revoked: boolean) {
    const record = this.ensure(scanId);
    record.revoked = revoked;
  }
  async deleteReport(scanId: string) {
    this.records.delete(scanId);
  }
  async listReportsByCheckoutEmail(email: string) {
    const normalized = normalizeReportEmail(email);
    const results: ScannerCompletedReport[] = [];
    for (const entry of this.records.values()) {
      if (entry.revoked || !entry.completed) continue;
      if (normalizeReportEmail(entry.completed.checkoutEmail) === normalized) {
        results.push(entry.completed);
      }
    }
    return results;
  }
  async listCompletedSummariesAfter(
    after: ScannerReportFeedCursor | null,
    limit: number,
  ) {
    const summaries: ScannerReportFeedSummary[] = [];
    for (const [scanId, entry] of this.records.entries()) {
      if (!entry.completed) continue;
      summaries.push({
        scanId,
        completedAt: entry.completed.completedAt,
        companyName: entry.completed.companyName ?? null,
        ...(entry.completed.campaign ? { campaign: entry.completed.campaign } : {}),
        revoked: Boolean(entry.revoked),
      });
    }
    return summaries
      .filter(
        (summary) =>
          !after ||
          summary.completedAt > after.completedAt ||
          (summary.completedAt === after.completedAt && summary.scanId > after.scanId),
      )
      .sort(
        (a, b) =>
          a.completedAt.localeCompare(b.completedAt) || a.scanId.localeCompare(b.scanId),
      )
      .slice(0, limit);
  }
  async listAllReportsForAdmin() {
    const results: ScannerReportForAdmin[] = [];
    for (const entry of this.records.values()) {
      if (entry.completed) {
        results.push({ ...entry.completed, revoked: Boolean(entry.revoked) });
      }
    }
    return results;
  }
  async acquireGenerationLease(
    scanId: string,
    ownerId: string,
    now: number,
    expiresAt: number,
  ) {
    const record = this.ensure(scanId);
    if (record.completed) return "complete" as const;
    if (
      record.lease &&
      record.lease.expiresAt > now &&
      record.lease.ownerId !== ownerId
    ) {
      return "busy" as const;
    }
    record.lease = { ownerId, expiresAt };
    return "acquired" as const;
  }
  async releaseGenerationLease(scanId: string, ownerId: string) {
    const record = this.records.get(scanId);
    if (record?.lease?.ownerId === ownerId) delete record.lease;
  }
  async markSpendSettled(scanId: string, settledAt: string) {
    const record = this.ensure(scanId);
    record.settledSpendAt ??= settledAt;
  }
  async hasSettledSpend(scanId: string) {
    return Boolean(this.records.get(scanId)?.settledSpendAt);
  }
  async completeReport(
    scanId: string,
    ownerId: string,
    input: ScannerReportCompletionInput,
    tokenHash: string,
    completedAt: string,
  ) {
    const record = this.ensure(scanId);
    if (record.completed) return record.completed;
    if (record.lease?.ownerId !== ownerId)
      throw new Error("Generation lease is not owned.");
    record.completed = {
      scanId,
      ...(record.settledSpendAt
        ? { settledSpendAt: record.settledSpendAt }
        : {}),
      completedAt,
      tokenHash,
      checkoutEmail: input.checkoutEmail,
      companyName: input.companyName,
      candidates: structuredClone(input.candidates),
      report: structuredClone(input.report),
      baseScore: input.baseScore,
      potentialScore: input.potentialScore,
      ...(input.campaign ? { campaign: input.campaign } : {}),
    };
    delete record.lease;
    return record.completed;
  }
  async claimTelemetryEvent(scanId: string, eventName: string) {
    const record = this.ensure(scanId);
    if (record.events.has(eventName)) return false;
    record.events.add(eventName);
    return true;
  }
  private ensure(scanId: string) {
    let record = this.records.get(scanId);
    if (!record) {
      record = { events: new Set() };
      this.records.set(scanId, record);
    }
    return record;
  }
}
