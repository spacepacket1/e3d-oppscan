import { cookies } from "next/headers";
import { NextResponse } from "next/server";

import {
  emptyScannerIntakeDraft,
  isScannerIntakeFieldKey,
  type ScannerIntakeDraft,
  type ScannerIntakePrefillSource,
} from "@/lib/scanner-intake-prefill";
import { getE3dApiBaseUrl } from "@/lib/scanner-payments";
import { SCANNER_CREDIT_KEY_COOKIE } from "@/lib/scanner-intake-session";

type PrefillRequest = {
  website?: string;
};

type UpstreamPrefillResponse =
  | {
      ok: true;
      draft?: Record<string, string | null>;
      sources?: ScannerIntakePrefillSource[];
      model?: string;
      truncated?: boolean;
    }
  | {
      ok: false;
      reason?: string;
    };

export async function POST(request: Request) {
  const payload = (await request.json()) as PrefillRequest;
  const website = payload.website?.trim() || "";

  if (!website) {
    return NextResponse.json({ ok: false, reason: "missing_website" }, { status: 400 });
  }

  const cookieStore = await cookies();
  const creditKey = cookieStore.get(SCANNER_CREDIT_KEY_COOKIE)?.value?.trim() || "";
  if (!creditKey) {
    console.error("Scanner intake prefill rejected: no credit key cookie present.");
    return NextResponse.json({ ok: false, reason: "invalid_key" }, { status: 401 });
  }

  const internalServiceKey = process.env.E3D_SCANNER_INTERNAL_SERVICE_KEY?.trim() || "";
  if (!internalServiceKey) {
    console.error("Scanner intake prefill rejected: E3D_SCANNER_INTERNAL_SERVICE_KEY is not configured.");
    return NextResponse.json({ ok: false, reason: "service_unavailable" }, { status: 500 });
  }

  const endpointUrl =
    process.env.E3D_SCANNER_PREFILL_URL?.trim() ||
    `${getE3dApiBaseUrl()}/payments/scanner/intake-prefill`;

  let response: Response;
  try {
    response = await fetch(endpointUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        authorization: `Internal ${internalServiceKey}`,
      },
      body: JSON.stringify({ creditKey, website }),
    });
  } catch (error) {
    console.error("Scanner intake prefill: upstream fetch threw:", endpointUrl, error);
    return NextResponse.json({ ok: false, reason: "network_error" }, { status: 502 });
  }

  let upstreamPayload: UpstreamPrefillResponse;
  try {
    upstreamPayload = (await response.json()) as UpstreamPrefillResponse;
  } catch (error) {
    console.error(
      "Scanner intake prefill: upstream response was not valid JSON, status",
      response.status,
      error,
    );
    return NextResponse.json({ ok: false, reason: "prefill_failed" }, { status: 502 });
  }

  if (!response.ok || !upstreamPayload.ok) {
    console.error(
      "Scanner intake prefill: upstream rejected the request, status",
      response.status,
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
    draft: sanitizeDraft(upstreamPayload.draft),
    sources: sanitizeSources(upstreamPayload.sources),
    model: typeof upstreamPayload.model === "string" ? upstreamPayload.model : null,
    truncated:
      typeof upstreamPayload.truncated === "boolean" ? upstreamPayload.truncated : null,
  });
}

function sanitizeDraft(draft: Record<string, string | null> | undefined): ScannerIntakeDraft {
  if (!draft || typeof draft !== "object") {
    return emptyScannerIntakeDraft();
  }

  return Object.fromEntries(
    Object.entries(draft).filter(
      ([key, value]) =>
        isScannerIntakeFieldKey(key) && (typeof value === "string" || value === null),
    ),
  ) as ScannerIntakeDraft;
}

function sanitizeSources(
  sources: ScannerIntakePrefillSource[] | undefined,
): ScannerIntakePrefillSource[] {
  if (!Array.isArray(sources)) {
    return [];
  }

  return sources
    .filter(
      (source) =>
        Boolean(source) &&
        typeof source.url === "string" &&
        Number.isFinite(source.chars),
    )
    .map((source) => ({
      url: source.url,
      chars: Number(source.chars),
    }));
}
