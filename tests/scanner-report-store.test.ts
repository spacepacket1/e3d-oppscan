import type { Collection } from "mongodb";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  databaseNameFromMongoUrl,
  MongoScannerReportStore,
} from "@/lib/mongodb-scanner-report-store";
import {
  InMemoryScannerReportStore,
  type ScannerReportCompletionInput,
} from "@/lib/scanner-report-store";

const completion: ScannerReportCompletionInput = {
  candidates: [
    {
      id: "candidate",
      title: "Candidate",
      summary: "Summary",
      outcomeType: "automation",
      impact: 5,
      feasibility: 4,
      timeToValue: 3,
      confidence: 4,
      risk: 1,
      evidence: ["Evidence"],
      firstStep: "Start",
      score: 100,
      rank: 1,
      pointValue: 10,
    },
  ],
  report: {
    executiveSummary: "Summary",
    recommendedStartingPoint: "Start",
    opportunities: [],
    consultationPreparation: ["Prepare"],
    closingNote: "Close",
  },
  baseScore: 50,
  potentialScore: 60,
};

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  vi.resetModules();
});

describe("databaseNameFromMongoUrl", () => {
  it("resolves the database name from a valid multi-host replica-set URL", () => {
    // The WHATWG URL parser rejects this shape outright (comma-separated
    // hosts aren't valid authority syntax to it), which is exactly the
    // connection string a real production replica set uses.
    expect(
      databaseNameFromMongoUrl(
        "mongodb://host1:27017,host2:27017,host3:27017/scanner_prod?replicaSet=rs0",
      ),
    ).toBe("scanner_prod");
  });

  it("resolves the database name from a single-host URL", () => {
    expect(
      databaseNameFromMongoUrl("mongodb://127.0.0.1:27017/scanner_dev"),
    ).toBe("scanner_dev");
  });

  it("falls back to the app default when the URL has no path segment at all", () => {
    expect(databaseNameFromMongoUrl("mongodb://127.0.0.1:27017")).toBe(
      "ai_opportunity_scanner",
    );
    expect(databaseNameFromMongoUrl("mongodb://127.0.0.1:27017/")).toBe(
      "ai_opportunity_scanner",
    );
  });

  it("honors an explicitly configured database literally named 'test' rather than redirecting it", () => {
    // The MongoDB driver's own parser defaults `dbName` to "test" both when
    // the connection string has no path segment AND when it explicitly says
    // `/test`, making those two cases indistinguishable if we read the
    // driver's parsed options. An operator who really does point production
    // at `/test` must not be silently redirected elsewhere.
    expect(databaseNameFromMongoUrl("mongodb://127.0.0.1:27017/test")).toBe(
      "test",
    );
  });

  it("resolves the database name for a mongodb+srv URL", () => {
    expect(
      databaseNameFromMongoUrl(
        "mongodb+srv://cluster.example.mongodb.net/scanner_prod?retryWrites=true",
      ),
    ).toBe("scanner_prod");
  });
});

describe("scanner report store selection", () => {
  it("fails closed in tests unless an explicit store is injected", async () => {
    vi.stubEnv("NODE_ENV", "test");
    const storeModule = await import("@/lib/scanner-report-store");

    expect(() => storeModule.getScannerReportStore()).toThrow(
      "A durable scanner report store is not configured.",
    );

    const store = new storeModule.InMemoryScannerReportStore();
    storeModule.setScannerReportStoreForTests(store);
    expect(storeModule.getScannerReportStore()).toBe(store);
    storeModule.setScannerReportStoreForTests();
  });

  it("fails closed for missing or invalid production configuration", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SCANNER_MONGO_URL", "");
    let storeModule = await import("@/lib/scanner-report-store");
    expect(() => storeModule.getScannerReportStore()).toThrow(
      "A durable scanner report store is not configured.",
    );

    vi.resetModules();
    vi.stubEnv("SCANNER_MONGO_URL", "https://not-mongodb.example");
    storeModule = await import("@/lib/scanner-report-store");
    expect(() => storeModule.getScannerReportStore()).toThrow(
      "A durable scanner report store is not configured.",
    );
  });

  it("process-caches a lazily connected production MongoDB store", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("SCANNER_MONGO_URL", "mongodb://127.0.0.1:1/scanner_test");
    const storeModule = await import("@/lib/scanner-report-store");

    const first = storeModule.getScannerReportStore();
    expect(storeModule.getScannerReportStore()).toBe(first);
    expect(first.constructor.name).toBe("MongoScannerReportStore");
  });
});

describe("MongoScannerReportStore", () => {
  it("creates only the required unique sparse token index", async () => {
    const collection = fakeCollection();
    const store = new MongoScannerReportStore(collection.value);
    await store.hasSettledSpend("scan-index");

    expect(collection.createIndex).toHaveBeenCalledOnce();
    expect(collection.createIndex).toHaveBeenCalledWith(
      { tokenHash: 1 },
      { unique: true, sparse: true, name: "tokenHash_1" },
    );
  });

  it("requires completed documents for both lookups and maps persisted dates", async () => {
    const persisted = {
      _id: "scan-complete",
      completed: true,
      tokenHash: "token-hash",
      completedAt: new Date("2026-09-14T12:00:00.000Z"),
      settledSpendAt: new Date("2026-09-14T11:00:00.000Z"),
      ...completion,
    };
    const collection = fakeCollection({
      findOne: vi.fn().mockResolvedValue(persisted),
    });
    const store = new MongoScannerReportStore(collection.value);

    await expect(store.getByScanId("scan-complete")).resolves.toMatchObject({
      scanId: "scan-complete",
      completedAt: "2026-09-14T12:00:00.000Z",
      settledSpendAt: "2026-09-14T11:00:00.000Z",
    });
    await store.getByTokenHash("token-hash");

    expect(collection.findOne).toHaveBeenNthCalledWith(1, {
      _id: "scan-complete",
      completed: true,
    });
    expect(collection.findOne).toHaveBeenNthCalledWith(2, {
      tokenHash: "token-hash",
      completed: true,
    });
  });

  it("uses conditional majority writes for leases, spend, and completion", async () => {
    const completedDocument = {
      _id: "scan-writes",
      completed: true,
      tokenHash: "token-hash",
      completedAt: new Date("2026-09-14T12:00:00.000Z"),
      ...completion,
    };
    const collection = fakeCollection({
      updateOne: vi
        .fn()
        .mockResolvedValue({ matchedCount: 1, upsertedCount: 0 }),
      findOneAndUpdate: vi.fn().mockResolvedValue(completedDocument),
    });
    const store = new MongoScannerReportStore(collection.value);

    await expect(
      store.acquireGenerationLease("scan-writes", "owner", 10, 20),
    ).resolves.toBe("acquired");
    await store.markSpendSettled("scan-writes", "2026-09-14T11:00:00.000Z");
    await store.completeReport(
      "scan-writes",
      "owner",
      completion,
      "token-hash",
      "2026-09-14T12:00:00.000Z",
    );

    expect(collection.updateOne.mock.calls[0]?.[2]).toMatchObject({
      upsert: true,
      writeConcern: { w: "majority" },
    });
    expect(collection.updateOne.mock.calls[1]?.[2]).toMatchObject({
      upsert: true,
      writeConcern: { w: "majority" },
    });
    expect(collection.findOneAndUpdate.mock.calls[0]?.[2]).toMatchObject({
      returnDocument: "after",
      writeConcern: { w: "majority" },
    });
  });

  it("retries only _id duplicate-key upsert races", async () => {
    const duplicateId = Object.assign(new Error("index: _id_ dup key"), {
      code: 11000,
    });
    const collection = fakeCollection({
      updateOne: vi
        .fn()
        .mockRejectedValueOnce(duplicateId)
        .mockResolvedValueOnce({ matchedCount: 1, upsertedCount: 0 }),
    });
    const store = new MongoScannerReportStore(collection.value);

    await expect(
      store.markSpendSettled("scan-race", "2026-09-14T11:00:00.000Z"),
    ).resolves.toBeUndefined();
    expect(collection.updateOne).toHaveBeenCalledTimes(2);
    expect(collection.updateOne.mock.calls[1]?.[2]).not.toMatchObject({
      upsert: true,
    });

    const tokenDuplicate = Object.assign(
      new Error("index: tokenHash_1 dup key"),
      {
        code: 11000,
      },
    );
    collection.updateOne.mockReset().mockRejectedValueOnce(tokenDuplicate);
    await expect(
      store.markSpendSettled("scan-token", "2026-09-14T11:00:00.000Z"),
    ).rejects.toBe(tokenDuplicate);
  });

  it("releases only an owned lease and claims telemetry with a conditional upsert", async () => {
    const collection = fakeCollection({
      updateOne: vi
        .fn()
        .mockResolvedValueOnce({ matchedCount: 0, upsertedCount: 0 })
        .mockResolvedValueOnce({ matchedCount: 0, upsertedCount: 1 }),
    });
    const store = new MongoScannerReportStore(collection.value);

    await store.releaseGenerationLease("scan-events", "owner");
    await expect(
      store.claimTelemetryEvent("scan-events", "generated"),
    ).resolves.toBe(true);

    expect(collection.updateOne.mock.calls[0]).toEqual([
      { _id: "scan-events", "lease.owner": "owner" },
      { $unset: { lease: "" } },
    ]);
    // The field key is the event name hex-encoded (see telemetryFieldKey),
    // not the literal name, so a name containing "." or "$" can never be
    // read as a Mongo path separator or operator.
    const generatedKey = Buffer.from("generated", "utf8").toString("hex");
    expect(collection.updateOne.mock.calls[1]?.[0]).toMatchObject({
      _id: "scan-events",
      [`telemetryEvents.${generatedKey}`]: { $exists: false },
    });
    expect(collection.updateOne.mock.calls[1]?.[2]).toEqual({ upsert: true });
  });

  it("returns a winning completed report or throws the reference lease error", async () => {
    const collection = fakeCollection();
    const store = new MongoScannerReportStore(collection.value);

    await expect(
      store.completeReport(
        "scan-unowned",
        "owner",
        completion,
        "token-hash",
        "2026-09-14T12:00:00.000Z",
      ),
    ).rejects.toThrow("Generation lease is not owned.");
  });

  it("preserves the in-memory reference completion and idempotency contract", async () => {
    const store = new InMemoryScannerReportStore();
    expect(
      await store.acquireGenerationLease("scan-memory", "owner", 10, 20),
    ).toBe("acquired");
    expect(
      await store.acquireGenerationLease("scan-memory", "other", 11, 30),
    ).toBe("busy");
    await store.markSpendSettled("scan-memory", "2026-09-14T11:00:00.000Z");
    await store.markSpendSettled("scan-memory", "2026-09-14T11:30:00.000Z");
    const report = await store.completeReport(
      "scan-memory",
      "owner",
      completion,
      "token-hash",
      "2026-09-14T12:00:00.000Z",
    );

    expect(report.settledSpendAt).toBe("2026-09-14T11:00:00.000Z");
    expect(
      await store.acquireGenerationLease("scan-memory", "other", 21, 30),
    ).toBe("complete");
    expect(await store.claimTelemetryEvent("scan-memory", "generated")).toBe(
      true,
    );
    expect(await store.claimTelemetryEvent("scan-memory", "generated")).toBe(
      false,
    );
  });
});

function fakeCollection(
  overrides: Record<string, ReturnType<typeof vi.fn>> = {},
) {
  const createIndex =
    overrides.createIndex ?? vi.fn().mockResolvedValue("tokenHash_1");
  const findOne = overrides.findOne ?? vi.fn().mockResolvedValue(null);
  const updateOne =
    overrides.updateOne ??
    vi.fn().mockResolvedValue({ matchedCount: 0, upsertedCount: 0 });
  const findOneAndUpdate =
    overrides.findOneAndUpdate ?? vi.fn().mockResolvedValue(null);
  return {
    createIndex,
    findOne,
    updateOne,
    findOneAndUpdate,
    value: {
      createIndex,
      findOne,
      updateOne,
      findOneAndUpdate,
    } as unknown as Collection,
  };
}
