import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { NextResponse } from "next/server";

import { getE3dApiBaseUrl } from "@/lib/scanner-payments";
import {
  FREE_PREFILLABLE_FIELDS,
  type FreeScannerIntakeDraft,
} from "@/lib/scanner-free-intake";
import { isFreePrefillRateLimited } from "@/lib/scanner-free-rate-limit";

type PrefillRequest = {
  website?: string;
};

type UpstreamPrefillResponse =
  | {
      ok: true;
      draft?: Record<string, string | null>;
      sources?: Array<{ url: string; chars: number }>;
      model?: string;
      truncated?: boolean;
    }
  | {
      ok: false;
      reason?: string;
    };

export async function POST(request: Request) {
  const requestHeaders = await headers();
  const forwardedFor = requestHeaders.get("x-forwarded-for") || "";
  const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";
  const ipHash = createHash("sha256").update(clientIp).digest("hex");

  if (isFreePrefillRateLimited(clientIp)) {
    console.error("Free intake prefill rejected: rate limited, ip hash", ipHash);
    return NextResponse.json(
      { ok: false, reason: "rate_limited" },
      { status: 429 },
    );
  }

  const payload = (await request.json()) as PrefillRequest;
  const website = payload.website?.trim() || "";

  if (!website) {
    return NextResponse.json({ ok: false, reason: "missing_website" }, { status: 400 });
  }

  const internalServiceKey = process.env.E3D_SCANNER_INTERNAL_SERVICE_KEY?.trim() || "";
  if (!internalServiceKey) {
    console.error("Free intake prefill rejected: E3D_SCANNER_INTERNAL_SERVICE_KEY is not configured.");
    return NextResponse.json({ ok: false, reason: "service_unavailable" }, { status: 500 });
  }

  const endpointUrl = `${getE3dApiBaseUrl()}/payments/scanner/intake-prefill-free`;

  let response: Response;
  try {
    response = await fetch(endpointUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        authorization: `Internal ${internalServiceKey}`,
      },
      body: JSON.stringify({ website, ipHash }),
    });
  } catch (error) {
    console.error("Free intake prefill: upstream fetch threw:", endpointUrl, error);
    return NextResponse.json({ ok: false, reason: "network_error" }, { status: 502 });
  }

  let upstreamPayload: UpstreamPrefillResponse;
  try {
    upstreamPayload = (await response.json()) as UpstreamPrefillResponse;
  } catch (error) {
    console.error(
      "Free intake prefill: upstream response was not valid JSON, status",
      response.status,
      error,
    );
    return NextResponse.json({ ok: false, reason: "prefill_failed" }, { status: 502 });
  }

  if (!response.ok || !upstreamPayload.ok) {
    console.error(
      "Free intake prefill: upstream rejected the request, status",
      response.status,
      "website",
      website,
      "payload",
      upstreamPayload,
    );
    return NextResponse.json({
      ok: false,
      reason:
        "reason" in upstreamPayload && typeof upstreamPayload.reason === "string"
          ? upstreamPayload.reason
          : "prefill_failed",
    });
  }

  return NextResponse.json({
    ok: true,
    draft: sanitizeFreeDraft(upstreamPayload.draft),
    model: typeof upstreamPayload.model === "string" ? upstreamPayload.model : null,
  });
}

function sanitizeFreeDraft(
  draft: Record<string, string | null> | undefined,
): FreeScannerIntakeDraft {
  if (!draft || typeof draft !== "object") {
    return {};
  }

  const prefillable = new Set<string>(FREE_PREFILLABLE_FIELDS);
  return Object.fromEntries(
    Object.entries(draft).filter(
      ([key, value]) => prefillable.has(key) && (typeof value === "string" || value === null),
    ),
  ) as FreeScannerIntakeDraft;
}
