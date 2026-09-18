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
  "candidates" | "report" | "baseScore" | "potentialScore"
>;

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

type MemoryRecord = {
  lease?: { ownerId: string; expiresAt: number };
  settledSpendAt?: string;
  completed?: ScannerCompletedReport;
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
      if (entry.completed?.tokenHash === tokenHash) return entry.completed;
    }
    return null;
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
