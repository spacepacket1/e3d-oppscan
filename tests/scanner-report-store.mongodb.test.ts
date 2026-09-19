import { randomUUID } from "node:crypto";

import { MongoClient, type Collection, type MongoServerError } from "mongodb";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import { MongoScannerReportStore } from "@/lib/mongodb-scanner-report-store";
import type { ScannerReportCompletionInput } from "@/lib/scanner-report-store";

const DATABASE_NAME = "ai_opportunity_scanner_test";
const COLLECTION_NAME = "scanner_reports";
const MONGO_URL =
  process.env.SCANNER_MONGO_URL?.trim() || "mongodb://127.0.0.1:27017";
const MONGO_ENDPOINT_LABEL = process.env.SCANNER_MONGO_URL?.trim()
  ? "SCANNER_MONGO_URL"
  : "mongodb://127.0.0.1:27017";
const suitePrefix = `phase2-${randomUUID()}`;

const completion: ScannerReportCompletionInput = {
  candidates: [
    {
      id: "candidate-one",
      title: "Automate intake",
      summary: "Reduce manual intake work.",
      outcomeType: "automation",
      impact: 5,
      feasibility: 4,
      timeToValue: 3,
      confidence: 4,
      risk: 1,
      evidence: ["Repeated manual entry"],
      firstStep: "Map the intake flow.",
      score: 93,
      rank: 1,
      pointValue: 10,
    },
  ],
  report: {
    executiveSummary: "Automate the repetitive intake flow.",
    recommendedStartingPoint: "Map the current process.",
    opportunities: [
      {
        candidateId: "candidate-one",
        headline: "Automate intake",
        whyItMatters: "It saves time.",
        practicalApproach: ["Start with one source."],
        considerations: ["Review exceptions"],
      },
    ],
    consultationPreparation: ["Bring a sample form"],
    closingNote: "Measure the first workflow before expanding.",
  },
  baseScore: 50,
  potentialScore: 60,
};

const client = new MongoClient(MONGO_URL, { serverSelectionTimeoutMS: 10_000 });
type TestDocument = {
  _id: string;
  lease?: { owner: string; expiresAt: Date };
  settledSpendAt?: Date;
  completed?: boolean;
  tokenHash?: string;
};

let collection!: Collection<TestDocument>;
let store!: MongoScannerReportStore;

beforeAll(async () => {
  try {
    await client.connect();
    const hello = await client.db("admin").command({ hello: 1 });
    if (typeof hello.setName !== "string" || hello.setName.length === 0) {
      throw new Error("the connected MongoDB server is not a replica set");
    }

    collection = client
      .db(DATABASE_NAME)
      .collection<TestDocument>(COLLECTION_NAME);
    await collection.createIndex(
      { tokenHash: 1 },
      { unique: true, sparse: true, name: "tokenHash_1" },
    );
    store = new MongoScannerReportStore(collection as unknown as Collection);
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error);
    throw new Error(
      `MongoDB integration setup failed for ${MONGO_ENDPOINT_LABEL}. A reachable local replica set is required: ${detail}`,
      { cause: error },
    );
  }
}, 15_000);

afterEach(async () => {
  if (collection) {
    await collection.deleteMany({ _id: { $regex: `^${suitePrefix}-` } });
  }
});

afterAll(async () => {
  try {
    if (collection) {
      await collection.deleteMany({ _id: { $regex: `^${suitePrefix}-` } });
    }
  } finally {
    await client.close();
  }
});

describe("MongoScannerReportStore with a real replica set", () => {
  it("persists and retrieves a completed report by scan id and token hash", async () => {
    const scanId = testScanId("lookup-complete");
    const settledAt = "2026-09-14T10:00:00.000Z";
    const completedAt = "2026-09-14T11:00:00.000Z";
    const tokenHash = `token-${randomUUID()}`;

    await store.markSpendSettled(scanId, settledAt);
    expect(await store.acquireGenerationLease(scanId, "owner", 100, 200)).toBe(
      "acquired",
    );
    const completed = await store.completeReport(
      scanId,
      "owner",
      completion,
      tokenHash,
      completedAt,
    );

    const expected = {
      scanId,
      settledSpendAt: settledAt,
      completedAt,
      tokenHash,
      ...completion,
    };
    expect(completed).toEqual(expected);
    await expect(store.getByScanId(scanId)).resolves.toEqual(expected);
    await expect(store.getByTokenHash(tokenHash)).resolves.toEqual(expected);
  });

  it("does not expose lease-only, spend-only, or telemetry-only documents", async () => {
    const leaseOnly = testScanId("lease-only");
    const spendOnly = testScanId("spend-only");
    const telemetryOnly = testScanId("telemetry-only");

    await store.acquireGenerationLease(leaseOnly, "owner", 100, 200);
    await store.markSpendSettled(spendOnly, "2026-09-14T10:00:00.000Z");
    await store.claimTelemetryEvent(telemetryOnly, "viewed");

    await expect(store.getByScanId(leaseOnly)).resolves.toBeNull();
    await expect(store.getByScanId(spendOnly)).resolves.toBeNull();
    await expect(store.getByScanId(telemetryOnly)).resolves.toBeNull();
    await expect(store.getByTokenHash("not-completed")).resolves.toBeNull();
  });

  it("allows incomplete documents without token hashes and propagates token conflicts", async () => {
    const firstScanId = testScanId("token-first");
    const secondScanId = testScanId("token-second");
    const thirdIncomplete = testScanId("token-incomplete");
    const tokenHash = `shared-${randomUUID()}`;

    await Promise.all([
      store.acquireGenerationLease(firstScanId, "owner-one", 100, 200),
      store.acquireGenerationLease(secondScanId, "owner-two", 100, 200),
      store.markSpendSettled(thirdIncomplete, "2026-09-14T10:00:00.000Z"),
    ]);
    expect(
      await collection.countDocuments({
        _id: { $in: [firstScanId, secondScanId, thirdIncomplete] },
        tokenHash: { $exists: false },
      }),
    ).toBe(3);

    await store.completeReport(
      firstScanId,
      "owner-one",
      completion,
      tokenHash,
      "2026-09-14T11:00:00.000Z",
    );
    await expect(
      store.completeReport(
        secondScanId,
        "owner-two",
        completion,
        tokenHash,
        "2026-09-14T11:01:00.000Z",
      ),
    ).rejects.toSatisfy((error: MongoServerError) => {
      return error.code === 11000 && /tokenHash_1/.test(error.message);
    });
    await expect(store.getByScanId(secondScanId)).resolves.toBeNull();
  });

  it("honors lease ownership, renewal, supplied expiry, release, and completion", async () => {
    const scanId = testScanId("lease-lifecycle");
    const absentScanId = testScanId("lease-absent");

    await expect(store.releaseGenerationLease(absentScanId, "nobody")).resolves
      .toBeUndefined;
    expect(await collection.countDocuments({ _id: absentScanId })).toBe(0);

    await expect(
      store.acquireGenerationLease(scanId, "owner-one", 100, 200),
    ).resolves.toBe("acquired");
    await expect(
      store.acquireGenerationLease(scanId, "owner-one", 150, 300),
    ).resolves.toBe("acquired");
    await expect(
      store.acquireGenerationLease(scanId, "owner-two", 299, 400),
    ).resolves.toBe("busy");

    await store.releaseGenerationLease(scanId, "owner-two");
    expect((await collection.findOne({ _id: scanId }))?.lease?.owner).toBe(
      "owner-one",
    );

    await expect(
      store.acquireGenerationLease(scanId, "owner-two", 300, 400),
    ).resolves.toBe("acquired");
    await store.releaseGenerationLease(scanId, "owner-two");
    expect((await collection.findOne({ _id: scanId }))?.lease).toBeUndefined();

    await expect(
      store.acquireGenerationLease(scanId, "owner-three", 350, 450),
    ).resolves.toBe("acquired");
    await store.completeReport(
      scanId,
      "owner-three",
      completion,
      `token-${randomUUID()}`,
      "2026-09-14T11:00:00.000Z",
    );
    await expect(
      store.acquireGenerationLease(scanId, "owner-four", 500, 600),
    ).resolves.toBe("complete");
  });

  it("allows exactly one concurrent first-write lease winner", async () => {
    const scanId = testScanId("lease-race");
    const owners = ["owner-a", "owner-b"] as const;

    const results = await Promise.all(
      owners.map((owner) =>
        store.acquireGenerationLease(scanId, owner, 100, 200),
      ),
    );
    expect([...results].sort()).toEqual(["acquired", "busy"]);

    const winner = owners[results.indexOf("acquired")];
    const persisted = await collection.findOne({ _id: scanId });
    expect(persisted?.lease).toMatchObject({ owner: winner });
  });

  it("settles concurrent first writes once and keeps the original timestamp", async () => {
    const scanId = testScanId("spend-race");
    const timestamps = ["2026-09-14T10:00:00.000Z", "2026-09-14T10:01:00.000Z"];

    const results = await Promise.allSettled(
      timestamps.map((timestamp) => store.markSpendSettled(scanId, timestamp)),
    );
    expect(results.every((result) => result.status === "fulfilled")).toBe(true);
    await expect(store.hasSettledSpend(scanId)).resolves.toBe(true);

    const firstPersisted = (await collection.findOne({ _id: scanId }))
      ?.settledSpendAt as Date;
    expect(timestamps).toContain(firstPersisted.toISOString());

    await store.markSpendSettled(scanId, "2026-09-14T10:02:00.000Z");
    const afterRepeat = (await collection.findOne({ _id: scanId }))
      ?.settledSpendAt as Date;
    expect(afterRepeat.toISOString()).toBe(firstPersisted.toISOString());
  });

  it("requires the active owner, removes its lease, and never overwrites completion", async () => {
    const scanId = testScanId("completion-contract");
    const tokenHash = `token-${randomUUID()}`;

    await store.acquireGenerationLease(scanId, "owner", 100, 200);
    await expect(
      store.completeReport(
        scanId,
        "not-owner",
        completion,
        tokenHash,
        "2026-09-14T11:00:00.000Z",
      ),
    ).rejects.toThrow("Generation lease is not owned.");

    const first = await store.completeReport(
      scanId,
      "owner",
      completion,
      tokenHash,
      "2026-09-14T11:00:00.000Z",
    );
    const persisted = await collection.findOne({ _id: scanId });
    expect(persisted?.lease).toBeUndefined();
    expect(persisted?.completed).toBe(true);

    const later = await store.completeReport(
      scanId,
      "any-owner",
      alternateCompletion(),
      `different-${randomUUID()}`,
      "2026-09-14T12:00:00.000Z",
    );
    expect(later).toEqual(first);
    await expect(store.getByScanId(scanId)).resolves.toEqual(first);
  });

  it("persists only one payload from concurrent same-owner completions", async () => {
    const scanId = testScanId("completion-race");
    const inputs = [completion, alternateCompletion()] as const;
    const tokenHashes = [`token-a-${randomUUID()}`, `token-b-${randomUUID()}`];

    await store.acquireGenerationLease(scanId, "owner", 100, 200);
    const results = await Promise.all(
      inputs.map((input, index) =>
        store.completeReport(
          scanId,
          "owner",
          input,
          tokenHashes[index],
          `2026-09-14T11:0${index}:00.000Z`,
        ),
      ),
    );

    expect(results[0]).toEqual(results[1]);
    expect(tokenHashes).toContain(results[0].tokenHash);
    await expect(store.getByScanId(scanId)).resolves.toEqual(results[0]);
    expect(
      await collection.countDocuments({ _id: scanId, completed: true }),
    ).toBe(1);
  });

  it("claims the same telemetry event once while allowing distinct events", async () => {
    const scanId = testScanId("telemetry-race");

    const results = await Promise.all(
      Array.from({ length: 8 }, () =>
        store.claimTelemetryEvent(scanId, "report-generated"),
      ),
    );
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(results.filter((result) => !result)).toHaveLength(7);

    await expect(
      store.claimTelemetryEvent(scanId, "report-viewed"),
    ).resolves.toBe(true);
    await expect(
      store.claimTelemetryEvent(scanId, "report-viewed"),
    ).resolves.toBe(false);
  });

  it("claims event names that would collide or throw as raw MongoDB dotted paths", async () => {
    // A raw "telemetryEvents.<eventName>" path lets "." nest a sub-document
    // and a leading "$" be read as an update operator, so a prefix pair like
    // "report" / "report.viewed" would collide or throw against a literal
    // path -- distinct from the in-memory reference store's plain Set,
    // which has no such interpretation. Today's real event names never
    // contain these characters, but the encoding must not depend on that.
    const scanId = testScanId("telemetry-special-chars");

    await expect(store.claimTelemetryEvent(scanId, "report")).resolves.toBe(
      true,
    );
    await expect(
      store.claimTelemetryEvent(scanId, "report.viewed"),
    ).resolves.toBe(true);
    await expect(
      store.claimTelemetryEvent(scanId, "$set"),
    ).resolves.toBe(true);

    await expect(store.claimTelemetryEvent(scanId, "report")).resolves.toBe(
      false,
    );
    await expect(
      store.claimTelemetryEvent(scanId, "report.viewed"),
    ).resolves.toBe(false);
    await expect(
      store.claimTelemetryEvent(scanId, "$set"),
    ).resolves.toBe(false);
  });
});

function testScanId(label: string) {
  return `${suitePrefix}-${label}-${randomUUID()}`;
}

function alternateCompletion(): ScannerReportCompletionInput {
  const alternate = structuredClone(completion);
  alternate.candidates[0].title = "Augment intake review";
  alternate.report.executiveSummary = "Keep a reviewer in the loop.";
  return alternate;
}
