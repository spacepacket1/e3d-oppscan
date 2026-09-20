import {
  createHash,
  createHmac,
  randomBytes,
  timingSafeEqual,
} from "node:crypto";

import { createMongoScannerReportStore } from "@/lib/mongodb-scanner-report-store";
import type { ScannerReportCopy } from "@/lib/scanner-analysis";
import type { RankedScannerCandidate } from "@/lib/scanner-scoring";

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
};

export type ScannerReportCompletionInput = Pick<
  ScannerCompletedReport,
  | "candidates"
  | "report"
  | "baseScore"
  | "potentialScore"
  | "checkoutEmail"
  | "companyName"
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
