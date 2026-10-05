import { NextRequest } from "next/server";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { GET } from "../app/api/ops/events/route";
import { buildHvacLeadContext } from "@/lib/hvac-fit";
import { checkOpsFeedAuth } from "@/lib/ops-feed-auth";
import {
  buildOpsFeedEvent,
  decodeFeedCursor,
  encodeFeedCursor,
  parsePageSize,
} from "@/lib/ops-feed";
import {
  InMemoryScannerReportStore,
  setScannerReportStoreForTests,
  type ScannerReportCompletionInput,
} from "@/lib/scanner-report-store";

const TOKEN = "t".repeat(40);
const SECRET = "test-scanner-report-token-secret-32-bytes";

function completion(
  overrides: Partial<ScannerReportCompletionInput> = {},
): ScannerReportCompletionInput {
  return {
    candidates: [],
    report: {
      executiveSummary: "SECRET-REPORT-BODY",
      recommendedStartingPoint: "Start",
      opportunities: [],
      consultationPreparation: ["Prepare"],
      closingNote: "Close",
    },
    baseScore: 50,
    potentialScore: 60,
    checkoutEmail: "lead@private-example.com",
    companyName: "Redwood HVAC",
    ...overrides,
  };
}

async function seed(
  store: InMemoryScannerReportStore,
  scanId: string,
  completedAt: string,
  overrides: Partial<ScannerReportCompletionInput> = {},
) {
  await store.acquireGenerationLease(scanId, "owner", 0, 1e15);
  await store.completeReport(scanId, "owner", completion(overrides), "hash-" + scanId, completedAt);
}

function request(path = "", headers: Record<string, string> = {}) {
  return new NextRequest(`https://oppscan.futco.ai/api/ops/events${path}`, {
    headers: { authorization: `Bearer ${TOKEN}`, ...headers },
  });
}

describe("checkOpsFeedAuth", () => {
  it("fails closed when no token, or a too-short token, is configured", () => {
    expect(checkOpsFeedAuth(`Bearer ${TOKEN}`, undefined)).toBe("disabled");
    expect(checkOpsFeedAuth("Bearer short", "short")).toBe("disabled");
  });

  it("accepts the right token and rejects everything else", () => {
    expect(checkOpsFeedAuth(`Bearer ${TOKEN}`, TOKEN)).toBe("ok");
    expect(checkOpsFeedAuth(`bearer ${TOKEN}`, TOKEN)).toBe("ok");
    expect(checkOpsFeedAuth(`Bearer ${"x".repeat(40)}`, TOKEN)).toBe("unauthorized");
    expect(checkOpsFeedAuth(null, TOKEN)).toBe("unauthorized");
    expect(checkOpsFeedAuth(TOKEN, TOKEN)).toBe("unauthorized");
  });
});

describe("cursor and page size helpers", () => {
  it("round-trips a cursor and rejects garbage", () => {
    const cursor = { completedAt: "2026-10-01T00:00:00.000Z", scanId: "scan_a" };
    expect(decodeFeedCursor(encodeFeedCursor(cursor))).toEqual(cursor);
    expect(decodeFeedCursor("not-base64-json")).toBeNull();
    expect(decodeFeedCursor(Buffer.from('{"t":"nope","i":"x"}').toString("base64url"))).toBeNull();
  });

  it("defaults and caps the page size", () => {
    expect(parsePageSize(null)).toBe(100);
    expect(parsePageSize("0")).toBe(100);
    expect(parsePageSize("25")).toBe(25);
    expect(parsePageSize("999999")).toBe(500);
  });
});

describe("buildOpsFeedEvent", () => {
  it("hashes the scan id and carries lead context", () => {
    const leadContext = buildHvacLeadContext(
      { companyName: "Redwood HVAC", industry: "HVAC", companyDescription: "heating and cooling" },
      ["jobber"],
      { platform: null, onlineBooking: true, chatWidget: false },
    );
    const event = buildOpsFeedEvent(
      {
        scanId: "scan_lite_abc123",
        completedAt: "2026-10-01T00:00:00.000Z",
        companyName: "Redwood HVAC",
        campaign: { source: "hvac_lite", leadContext },
        revoked: false,
      },
      SECRET,
    );
    expect(event.id).toMatch(/^rep_[0-9a-f]{24}$/);
    expect(JSON.stringify(event)).not.toContain("scan_lite_abc123");
    expect(event.data).toMatchObject({
      product: "hvac_lite",
      fitTier: "strong",
      primaryPlatform: "jobber",
      toolsReportedByOwner: ["jobber"],
    });
  });

  it("is stable per scan id and different across scan ids", () => {
    const base = { completedAt: "2026-10-01T00:00:00.000Z", companyName: null, revoked: false };
    const a1 = buildOpsFeedEvent({ ...base, scanId: "a" }, SECRET).id;
    const a2 = buildOpsFeedEvent({ ...base, scanId: "a" }, SECRET).id;
    const b = buildOpsFeedEvent({ ...base, scanId: "b" }, SECRET).id;
    expect(a1).toBe(a2);
    expect(a1).not.toBe(b);
  });
});

describe("GET /api/ops/events", () => {
  let store: InMemoryScannerReportStore;

  beforeEach(() => {
    vi.stubEnv("OPS_FEED_TOKEN", TOKEN);
    vi.stubEnv("SCANNER_REPORT_TOKEN_SECRET", SECRET);
    store = new InMemoryScannerReportStore();
    setScannerReportStoreForTests(store);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    setScannerReportStoreForTests(undefined);
  });

  it("is disabled (503) when no token is configured, even with a header", async () => {
    vi.stubEnv("OPS_FEED_TOKEN", "");
    expect((await GET(request())).status).toBe(503);
  });

  it("requires the bearer token (401)", async () => {
    const response = await GET(request("", { authorization: "Bearer wrong" }));
    expect(response.status).toBe(401);
    expect(response.headers.get("www-authenticate")).toBe("Bearer");
    expect((await GET(new NextRequest("https://oppscan.futco.ai/api/ops/events"))).status).toBe(401);
  });

  it("never exposes the email, report body, token hash, or raw scan id", async () => {
    await seed(store, "scan_lite_secretid", "2026-10-01T00:00:00.000Z");
    const response = await GET(request());
    const text = await response.text();
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    expect(text).not.toContain("lead@private-example.com");
    expect(text).not.toContain("SECRET-REPORT-BODY");
    expect(text).not.toContain("hash-scan_lite_secretid");
    expect(text).not.toContain("scan_lite_secretid");
    expect(JSON.parse(text).events).toHaveLength(1);
  });

  it("pages oldest-first with a cursor and reports hasMore", async () => {
    await seed(store, "scan_b", "2026-10-02T00:00:00.000Z");
    await seed(store, "scan_a", "2026-10-01T00:00:00.000Z");
    await seed(store, "scan_c", "2026-10-03T00:00:00.000Z");

    const first = await (await GET(request("?limit=2"))).json();
    expect(first.events.map((e: { occurredAt: string }) => e.occurredAt)).toEqual([
      "2026-10-01T00:00:00.000Z",
      "2026-10-02T00:00:00.000Z",
    ]);
    expect(first.hasMore).toBe(true);

    const second = await (await GET(request(`?limit=2&cursor=${first.nextCursor}`))).json();
    expect(second.events.map((e: { occurredAt: string }) => e.occurredAt)).toEqual([
      "2026-10-03T00:00:00.000Z",
    ]);
    expect(second.hasMore).toBe(false);

    // Caught up: no events, and the caller keeps its cursor.
    const third = await (await GET(request(`?cursor=${second.nextCursor}`))).json();
    expect(third.events).toEqual([]);
    expect(third.nextCursor).toBe(second.nextCursor);
  });

  it("breaks timestamp ties by scan id without skipping or repeating", async () => {
    const at = "2026-10-01T00:00:00.000Z";
    await seed(store, "scan_1", at);
    await seed(store, "scan_2", at);
    await seed(store, "scan_3", at);
    const first = await (await GET(request("?limit=1"))).json();
    const second = await (await GET(request(`?limit=1&cursor=${first.nextCursor}`))).json();
    const third = await (await GET(request(`?limit=1&cursor=${second.nextCursor}`))).json();
    const ids = [first, second, third].flatMap((page) => page.events.map((e: { id: string }) => e.id));
    expect(new Set(ids).size).toBe(3);
  });

  describe("free_leads stream", () => {
    async function seedLead(leadId: string, createdAt: string, email = "lead@private-example.com") {
      await store.saveFreeLead({
        leadId,
        createdAt,
        email,
        marketingOptIn: true,
        websiteHost: "redwood.example.com",
        opportunityTitles: ["One", "Two", "Three"],
        deliveryStatus: "sent",
      });
    }

    it("returns lead events without the email or the raw lead id", async () => {
      await seedLead("free_lead_secretid", "2026-10-01T00:00:00.000Z");
      const response = await GET(request("?stream=free_leads"));
      const text = await response.text();
      expect(response.status).toBe(200);
      expect(text).not.toContain("lead@private-example.com");
      expect(text).not.toContain("free_lead_secretid");
      const body = JSON.parse(text);
      expect(body.stream).toBe("free_leads");
      expect(body.events[0]).toMatchObject({
        type: "oppscan.free_lead_captured",
        source: "oppscan.futco.ai",
        data: { product: "free_summary", websiteHost: "redwood.example.com", marketingOptIn: true, opportunityCount: 3, deliveryStatus: "sent" },
      });
      expect(body.events[0].id).toMatch(/^lead_[0-9a-f]{24}$/);
    });

    it("pages oldest-first with its own cursor and stays separate from the reports stream", async () => {
      await seedLead("free_lead_b", "2026-10-02T00:00:00.000Z", "b@private-example.com");
      await seedLead("free_lead_a", "2026-10-01T00:00:00.000Z", "a@private-example.com");
      await seed(store, "scan_report", "2026-10-03T00:00:00.000Z");

      const first = await (await GET(request("?stream=free_leads&limit=1"))).json();
      expect(first.events.map((e: { occurredAt: string }) => e.occurredAt)).toEqual(["2026-10-01T00:00:00.000Z"]);
      expect(first.hasMore).toBe(true);
      const second = await (await GET(request(`?stream=free_leads&limit=1&cursor=${first.nextCursor}`))).json();
      expect(second.events.map((e: { occurredAt: string }) => e.occurredAt)).toEqual(["2026-10-02T00:00:00.000Z"]);
      expect(second.hasMore).toBe(false);

      const reports = await (await GET(request())).json();
      expect(reports.events.map((e: { type: string }) => e.type)).toEqual(["oppscan.report_completed"]);
    });

    it("rejects an unknown stream (400)", async () => {
      expect((await GET(request("?stream=everything"))).status).toBe(400);
    });
  });

  it("rejects a malformed cursor (400)", async () => {
    expect((await GET(request("?cursor=garbage"))).status).toBe(400);
  });
});
