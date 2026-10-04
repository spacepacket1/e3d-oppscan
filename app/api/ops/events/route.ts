import { NextResponse, type NextRequest } from "next/server";

import { checkOpsFeedAuth } from "@/lib/ops-feed-auth";
import {
  OPS_FEED_SCHEMA_VERSION,
  buildOpsFeedEvent,
  decodeFeedCursor,
  encodeFeedCursor,
  parsePageSize,
} from "@/lib/ops-feed";
import { getScannerReportStore } from "@/lib/scanner-report-store";

// Read-only, pull-based event feed for FutCo's e3d-corp instance. See
// src/lib/ops-feed.ts for what it does and does not expose. Not cached: it is
// request-time by default, and the Authorization header makes it dynamic.
const NO_STORE = { "Cache-Control": "no-store" };

export async function GET(request: NextRequest) {
  const auth = checkOpsFeedAuth(
    request.headers.get("authorization"),
    process.env.OPS_FEED_TOKEN,
  );
  if (auth === "disabled") {
    return NextResponse.json(
      { error: "The ops feed is not configured." },
      { status: 503, headers: NO_STORE },
    );
  }
  if (auth === "unauthorized") {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401, headers: { ...NO_STORE, "WWW-Authenticate": "Bearer" } },
    );
  }

  const idSecret = process.env.SCANNER_REPORT_TOKEN_SECRET?.trim();
  if (!idSecret) {
    return NextResponse.json(
      { error: "The ops feed is not configured." },
      { status: 503, headers: NO_STORE },
    );
  }

  const cursorParam = request.nextUrl.searchParams.get("cursor");
  const after = cursorParam ? decodeFeedCursor(cursorParam) : null;
  if (cursorParam && !after) {
    return NextResponse.json(
      { error: "Invalid cursor." },
      { status: 400, headers: NO_STORE },
    );
  }
  const limit = parsePageSize(request.nextUrl.searchParams.get("limit"));

  try {
    // Fetch one extra row to learn whether another page exists.
    const rows = await getScannerReportStore().listCompletedSummariesAfter(
      after,
      limit + 1,
    );
    const page = rows.slice(0, limit);
    const last = page[page.length - 1];
    return NextResponse.json(
      {
        schemaVersion: OPS_FEED_SCHEMA_VERSION,
        events: page.map((summary) => buildOpsFeedEvent(summary, idSecret)),
        // With no new events the caller keeps the cursor it sent.
        nextCursor: last
          ? encodeFeedCursor({ completedAt: last.completedAt, scanId: last.scanId })
          : cursorParam,
        hasMore: rows.length > limit,
      },
      { headers: NO_STORE },
    );
  } catch {
    return NextResponse.json(
      { error: "The ops feed is temporarily unavailable." },
      { status: 503, headers: NO_STORE },
    );
  }
}
