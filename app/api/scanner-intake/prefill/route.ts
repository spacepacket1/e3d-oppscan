import { createHash } from "node:crypto";

import { cookies, headers } from "next/headers";
import { NextResponse } from "next/server";

import { getE3dSessionUser, isE3dAdmin } from "@/lib/e3d-session";
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

  const internalServiceKey = process.env.E3D_SCANNER_INTERNAL_SERVICE_KEY?.trim() || "";
  if (!internalServiceKey) {
    console.error("Scanner intake prefill rejected: E3D_SCANNER_INTERNAL_SERVICE_KEY is not configured.");
    return NextResponse.json({ ok: false, reason: "service_unavailable" }, { status: 500 });
  }

  const requestHeaders = await headers();
  // Re-checked here from the request's own cookie header, independent of
  // any client-supplied flag or of whatever credit key cookie happens to be
  // set (including page.tsx's `admin-bypass:...` UI-convenience key, which
  // the upstream payments service has never heard of and would reject) --
  // same pattern as submitScannerIntakeForm's admin check for the final
  // submission. Admins skip the credit-gated endpoint entirely and use the
  // same crawl/summarize pipeline the free tier calls, gated by IP rate
  // limits instead of a balance.
  const session = await getE3dSessionUser(requestHeaders.get("cookie") || "");
  if (isE3dAdmin(session) && session.authenticated) {
    const forwardedFor = requestHeaders.get("x-forwarded-for") || "";
    const clientIp = forwardedFor.split(",")[0]?.trim() || "unknown";
    const ipHash = createHash("sha256").update(clientIp).digest("hex");
    console.error("Scanner intake prefill: admin bypass for", session.email);
    return proxyPrefill(
      `${getE3dApiBaseUrl()}/payments/scanner/intake-prefill-free`,
      { website, ipHash },
      internalServiceKey,
    );
  }

  const cookieStore = await cookies();
  const creditKey = cookieStore.get(SCANNER_CREDIT_KEY_COOKIE)?.value?.trim() || "";
  if (!creditKey) {
    console.error("Scanner intake prefill rejected: no credit key cookie present.");
    return NextResponse.json({ ok: false, reason: "invalid_key" }, { status: 401 });
  }
  // Matches productPaymentsService.js's hashKey() exactly (sha256 hex of the
  // raw key) so this can be diffed directly against the ledger's key_hash
  // column when tracking down which key a request actually used, without
  // ever logging the raw key itself.
  console.error(
    "Scanner intake prefill: using credit key hash",
    createHash("sha256").update(creditKey).digest("hex"),
  );

  const endpointUrl =
    process.env.E3D_SCANNER_PREFILL_URL?.trim() ||
    `${getE3dApiBaseUrl()}/payments/scanner/intake-prefill`;
  return proxyPrefill(endpointUrl, { creditKey, website }, internalServiceKey);
}

async function proxyPrefill(
  endpointUrl: string,
  body: Record<string, string>,
  internalServiceKey: string,
) {
  let response: Response;
  try {
    response = await fetch(endpointUrl, {
      method: "POST",
      cache: "no-store",
      headers: {
        "content-type": "application/json",
        authorization: `Internal ${internalServiceKey}`,
      },
      body: JSON.stringify(body),
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
