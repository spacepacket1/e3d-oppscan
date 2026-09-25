import {
  MongoClient,
  type Collection,
  type Filter,
  type WithId,
} from "mongodb";

import type { ScannerReportCopy } from "@/lib/scanner-analysis";
import type { RankedScannerCandidate } from "@/lib/scanner-scoring";
import {
  normalizeReportEmail,
  type ScannerCompletedReport,
  type ScannerReportCompletionInput,
  type ScannerReportForAdmin,
  type ScannerReportStore,
} from "@/lib/scanner-report-store";

const MAJORITY_WRITE_CONCERN = { w: "majority" as const };
const DEFAULT_DATABASE = "ai_opportunity_scanner";
const COLLECTION_NAME = "scanner_reports";

type ScannerReportDocument = {
  _id: string;
  lease?: { owner: string; expiresAt: Date } | null;
  settledSpendAt?: Date;
  completed?: true;
  tokenHash?: string;
  completedAt?: Date;
  checkoutEmail?: string;
  companyName?: string;
  candidates?: RankedScannerCandidate[];
  report?: ScannerReportCopy;
  baseScore?: number;
  potentialScore?: number;
  campaign?: { source: string };
  revoked?: boolean;
  telemetryEvents?: Record<string, Date>;
};

type CollectionSource =
  Collection | (() => Promise<Collection<ScannerReportDocument>>);

export class MongoScannerReportStore implements ScannerReportStore {
  private collectionPromise?: Promise<Collection<ScannerReportDocument>>;

  constructor(private readonly collectionSource: CollectionSource) {
    if (typeof collectionSource !== "function") {
      this.collectionPromise = this.initializeCollection(
        collectionSource as unknown as Collection<ScannerReportDocument>,
      );
    }
  }

  private getCollection() {
    this.collectionPromise ??= (
      this.collectionSource as () => Promise<Collection<ScannerReportDocument>>
    )().then((collection) => this.initializeCollection(collection));
    return this.collectionPromise;
  }

  private async initializeCollection(
    collection: Collection<ScannerReportDocument>,
  ) {
    const resolved = collection;
    await resolved.createIndex(
      { tokenHash: 1 },
      { unique: true, sparse: true, name: "tokenHash_1" },
    );
    return resolved;
  }

  async getByScanId(scanId: string) {
    const collection = await this.getCollection();
    const document = await collection.findOne({ _id: scanId, completed: true });
    return document ? completedReportFromDocument(document) : null;
  }

  async getByTokenHash(tokenHash: string) {
    const collection = await this.getCollection();
    const document = await collection.findOne({
      tokenHash,
      completed: true,
      revoked: { $ne: true },
    });
    return document ? completedReportFromDocument(document) : null;
  }

  async setReportRevoked(scanId: string, revoked: boolean) {
    const collection = await this.getCollection();
    await collection.updateOne({ _id: scanId }, { $set: { revoked } });
  }

  async deleteReport(scanId: string) {
    const collection = await this.getCollection();
    await collection.deleteOne({ _id: scanId });
  }

  async listReportsByCheckoutEmail(email: string) {
    const collection = await this.getCollection();
    const documents = await collection
      .find({
        completed: true,
        revoked: { $ne: true },
        checkoutEmail: {
          $regex: `^${escapeRegExp(normalizeReportEmail(email))}$`,
          $options: "i",
        },
      })
      .toArray();
    return documents.map(completedReportFromDocument);
  }

  async listAllReportsForAdmin(): Promise<ScannerReportForAdmin[]> {
    const collection = await this.getCollection();
    const documents = await collection.find({ completed: true }).toArray();
    const reports: ScannerReportForAdmin[] = [];
    for (const document of documents) {
      // Older reports can predate a field this store now persists (e.g.
      // checkoutEmail, companyName, baseScore/potentialScore were all
      // added after some real reports were already completed). Unlike the
      // customer-facing path, admin should still see these -- with the
      // missing fields shown as unknown rather than fabricated or used to
      // hide the report entirely. Only truly unrenderable documents
      // (missing what the report content itself needs) are skipped.
      if (!document.tokenHash || !document.completedAt || !document.candidates || !document.report) {
        console.error(
          "listAllReportsForAdmin: skipping unrenderable report",
          document._id,
        );
        continue;
      }
      reports.push({
        scanId: document._id,
        ...(document.settledSpendAt
          ? { settledSpendAt: document.settledSpendAt.toISOString() }
          : {}),
        completedAt: document.completedAt.toISOString(),
        tokenHash: document.tokenHash,
        checkoutEmail: document.checkoutEmail ?? null,
        companyName: document.companyName ?? null,
        candidates: structuredClone(document.candidates),
        report: structuredClone(document.report),
        baseScore: typeof document.baseScore === "number" ? document.baseScore : null,
        potentialScore:
          typeof document.potentialScore === "number" ? document.potentialScore : null,
        ...(document.campaign ? { campaign: document.campaign } : {}),
        revoked: document.revoked === true,
      });
    }
    return reports;
  }

  async acquireGenerationLease(
    scanId: string,
    ownerId: string,
    now: number,
    expiresAt: number,
  ) {
    const collection = await this.getCollection();
    const condition = availableLeaseFilter(scanId, ownerId, now);
    const update = {
      $set: { lease: { owner: ownerId, expiresAt: new Date(expiresAt) } },
    };

    let allowUpsert = true;
    for (;;) {
      try {
        const result = await collection.updateOne(condition, update, {
          ...(allowUpsert ? { upsert: true } : {}),
          writeConcern: MAJORITY_WRITE_CONCERN,
        });
        if (result.matchedCount === 1 || result.upsertedCount === 1) {
          return "acquired";
        }
      } catch (error) {
        if (!allowUpsert || !isIdDuplicateKeyError(error)) throw error;
        allowUpsert = false;
        continue;
      }

      const current = await collection.findOne(
        { _id: scanId },
        { projection: { completed: 1, lease: 1 } },
      );
      if (current?.completed === true) return "complete";
      if (
        current?.lease &&
        current.lease.owner !== ownerId &&
        current.lease.expiresAt.getTime() > now
      ) {
        return "busy";
      }
      allowUpsert = current === null;
    }
  }

  async releaseGenerationLease(scanId: string, ownerId: string) {
    const collection = await this.getCollection();
    await collection.updateOne(
      { _id: scanId, "lease.owner": ownerId },
      { $unset: { lease: "" } },
    );
  }

  async markSpendSettled(scanId: string, settledAt: string) {
    const collection = await this.getCollection();
    const condition: Filter<ScannerReportDocument> = {
      _id: scanId,
      settledSpendAt: { $exists: false },
    };
    const update = { $set: { settledSpendAt: new Date(settledAt) } };

    let allowUpsert = true;
    for (;;) {
      try {
        const result = await collection.updateOne(condition, update, {
          ...(allowUpsert ? { upsert: true } : {}),
          writeConcern: MAJORITY_WRITE_CONCERN,
        });
        if (result.matchedCount === 1 || result.upsertedCount === 1) return;
      } catch (error) {
        if (!allowUpsert || !isIdDuplicateKeyError(error)) throw error;
        allowUpsert = false;
        continue;
      }

      const current = await collection.findOne(
        { _id: scanId },
        { projection: { settledSpendAt: 1 } },
      );
      if (current?.settledSpendAt) return;
      allowUpsert = current === null;
    }
  }

  async hasSettledSpend(scanId: string) {
    const collection = await this.getCollection();
    return Boolean(
      await collection.findOne(
        { _id: scanId, settledSpendAt: { $exists: true } },
        { projection: { _id: 1 } },
      ),
    );
  }

  async completeReport(
    scanId: string,
    ownerId: string,
    input: ScannerReportCompletionInput,
    tokenHash: string,
    completedAt: string,
  ) {
    const collection = await this.getCollection();
    const completed = await collection.findOneAndUpdate(
      {
        _id: scanId,
        completed: { $ne: true },
        "lease.owner": ownerId,
      },
      {
        $set: {
          completed: true,
          tokenHash,
          completedAt: new Date(completedAt),
          checkoutEmail: input.checkoutEmail,
          companyName: input.companyName,
          candidates: structuredClone(input.candidates),
          report: structuredClone(input.report),
          baseScore: input.baseScore,
          potentialScore: input.potentialScore,
          ...(input.campaign ? { campaign: input.campaign } : {}),
        },
        $unset: { lease: "" },
      },
      {
        returnDocument: "after",
        writeConcern: MAJORITY_WRITE_CONCERN,
      },
    );

    if (completed) return completedReportFromDocument(completed);

    const existing = await collection.findOne({ _id: scanId, completed: true });
    if (existing) return completedReportFromDocument(existing);
    throw new Error("Generation lease is not owned.");
  }

  async claimTelemetryEvent(scanId: string, eventName: string) {
    const collection = await this.getCollection();
    // A dotted MongoDB update path interprets the raw event name specially
    // (a "." nests a sub-path, a leading "$" is an operator), so two
    // distinct names in a prefix relationship (e.g. "report" and
    // "report.viewed") would collide or throw, unlike the in-memory
    // reference store's plain Set. Today's fixed, underscore-separated
    // event names never trigger this, but the field key must not depend on
    // that staying true -- hex-encode the name so no possible input can
    // ever produce a Mongo-special character.
    const eventPath = `telemetryEvents.${telemetryFieldKey(eventName)}` as const;
    const condition: Filter<ScannerReportDocument> = {
      _id: scanId,
      [eventPath]: { $exists: false },
    };
    const update = { $set: { [eventPath]: new Date() } };

    let allowUpsert = true;
    for (;;) {
      try {
        const result = await collection.updateOne(condition, update, {
          ...(allowUpsert ? { upsert: true } : {}),
        });
        if (result.matchedCount === 1 || result.upsertedCount === 1)
          return true;
      } catch (error) {
        if (!allowUpsert || !isIdDuplicateKeyError(error)) throw error;
        allowUpsert = false;
        continue;
      }

      const claimed = await collection.findOne(
        { _id: scanId, [eventPath]: { $exists: true } },
        { projection: { _id: 1 } },
      );
      if (claimed) return false;
      const current = await collection.findOne(
        { _id: scanId },
        { projection: { _id: 1 } },
      );
      allowUpsert = current === null;
    }
  }
}

export function createMongoScannerReportStore(
  mongoUrl: string,
): ScannerReportStore {
  const client = new MongoClient(mongoUrl);
  const databaseName = databaseNameFromMongoUrl(mongoUrl);
  const database = client.db(databaseName);
  return new MongoScannerReportStore(async () => {
    await client.connect();
    return database.collection<ScannerReportDocument>(COLLECTION_NAME);
  });
}

// Hex-encoding guarantees a [0-9a-f] output charset, so no event name can
// ever produce a "." (nests a sub-path) or a leading "$" (an update
// operator) in the resulting Mongo field key. The mapping only needs to be
// deterministic and collision-free, never reversible -- callers always
// already know the event name they're checking, and telemetryEvents is
// never surfaced back to any caller (completedReportFromDocument omits it).
function telemetryFieldKey(eventName: string): string {
  return Buffer.from(eventName, "utf8").toString("hex");
}

// Escapes a string for safe interpolation into a Mongo $regex pattern --
// used for a case-insensitive exact-match lookup, not partial search, so
// every regex metacharacter in the input must be treated literally.
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function availableLeaseFilter(
  scanId: string,
  ownerId: string,
  now: number,
): Filter<ScannerReportDocument> {
  return {
    _id: scanId,
    completed: { $ne: true },
    $or: [
      { lease: null },
      { "lease.expiresAt": { $lte: new Date(now) } },
      { "lease.owner": ownerId },
    ],
  };
}

// The WHATWG `URL` parser rejects valid multi-host replica-set connection
// strings (e.g. `mongodb://host1:27017,host2:27017/db`), which is exactly
// the shape a real production replica set uses -- it has no concept of a
// comma-separated host list in the authority section. Extract the path
// segment directly from the raw string instead: userinfo (user:pass@) and
// a host list can never contain an unescaped "/", so the first "/" after
// the scheme reliably starts the path regardless of how many hosts precede
// it. Reading the driver's own `MongoClient.options.dbName` would be
// simpler, but the driver defaults that to "test" both when the connection
// string has no path segment AND when it explicitly says `/test` --
// collapsing "unspecified" and "explicitly test" is indistinguishable there
// and would silently redirect an operator who really did configure `/test`
// into a different database. Only treat a database name as unspecified when
// the raw string truly has no path segment.
export function databaseNameFromMongoUrl(mongoUrl: string): string {
  const afterScheme = mongoUrl.replace(/^mongodb(\+srv)?:\/\//, "");
  const firstSlash = afterScheme.indexOf("/");
  if (firstSlash === -1) return DEFAULT_DATABASE;
  const pathSegment = afterScheme.slice(firstSlash + 1).split("?")[0];
  return pathSegment ? decodeURIComponent(pathSegment) : DEFAULT_DATABASE;
}

function completedReportFromDocument(
  document: WithId<ScannerReportDocument>,
): ScannerCompletedReport {
  if (
    document.completed !== true ||
    !document.tokenHash ||
    !document.completedAt ||
    !document.checkoutEmail ||
    !document.companyName ||
    !document.candidates ||
    !document.report ||
    typeof document.baseScore !== "number" ||
    typeof document.potentialScore !== "number"
  ) {
    throw new Error("Completed scanner report is malformed.");
  }

  return {
    scanId: document._id,
    ...(document.settledSpendAt
      ? { settledSpendAt: document.settledSpendAt.toISOString() }
      : {}),
    completedAt: document.completedAt.toISOString(),
    tokenHash: document.tokenHash,
    checkoutEmail: document.checkoutEmail,
    companyName: document.companyName,
    candidates: structuredClone(document.candidates),
    report: structuredClone(document.report),
    baseScore: document.baseScore,
    potentialScore: document.potentialScore,
    ...(document.campaign ? { campaign: document.campaign } : {}),
  };
}

function isIdDuplicateKeyError(error: unknown) {
  if (
    !error ||
    typeof error !== "object" ||
    !("code" in error) ||
    error.code !== 11000
  ) {
    return false;
  }

  const duplicate = error as {
    keyPattern?: Record<string, unknown>;
    keyValue?: Record<string, unknown>;
    message?: string;
  };
  if (duplicate.keyPattern) {
    return (
      Object.keys(duplicate.keyPattern).length === 1 &&
      Object.hasOwn(duplicate.keyPattern, "_id")
    );
  }
  if (duplicate.keyValue) {
    return (
      Object.keys(duplicate.keyValue).length === 1 &&
      Object.hasOwn(duplicate.keyValue, "_id")
    );
  }
  return (
    typeof duplicate.message === "string" &&
    /index:\s*_id_/i.test(duplicate.message)
  );
}
