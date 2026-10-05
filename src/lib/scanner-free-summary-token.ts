import { createHmac, timingSafeEqual } from "node:crypto";

// The free summary lives only in the visitor's browser: nothing is stored when
// it is generated. To let the visitor ask for it by email, the server signs the
// summary it just produced and hands the signed token back; the capture step
// accepts only a token it signed itself. That way the email body is always a
// real summary we generated -- never text supplied by whoever calls the
// endpoint -- so the form cannot be used to send arbitrary content from our
// domain.
export type SignedSummaryOpportunity = { title: string; summary: string };

export type VerifiedFreeSummary = {
  websiteHost: string;
  totalFound: number;
  opportunities: SignedSummaryOpportunity[];
};

const MAX_AGE_MS = 2 * 60 * 60_000;
const MAX_TITLE = 200;
const MAX_SUMMARY = 600;
const MAX_OPPORTUNITIES = 5;
const MIN_SECRET_LENGTH = 16;

type Payload = {
  h: string;
  n: number;
  i: number;
  o: Array<{ t: string; s: string }>;
};

function toBase64Url(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function sign(encodedPayload: string, secret: string) {
  return createHmac("sha256", secret).update(encodedPayload).digest("hex");
}

export function signFreeSummary(
  summary: VerifiedFreeSummary,
  secret: string | undefined,
  now = Date.now(),
): string | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  const payload: Payload = {
    h: summary.websiteHost.slice(0, 100),
    n: summary.totalFound,
    i: now,
    o: summary.opportunities.slice(0, MAX_OPPORTUNITIES).map((opportunity) => ({
      t: opportunity.title.slice(0, MAX_TITLE),
      s: opportunity.summary.slice(0, MAX_SUMMARY),
    })),
  };
  const encoded = toBase64Url(JSON.stringify(payload));
  return `${encoded}.${sign(encoded, secret)}`;
}

export function verifyFreeSummary(
  token: string,
  secret: string | undefined,
  now = Date.now(),
): VerifiedFreeSummary | null {
  if (!secret || secret.length < MIN_SECRET_LENGTH) return null;
  const [encoded, signature, ...rest] = token.split(".");
  if (!encoded || !signature || rest.length > 0) return null;

  const expected = Buffer.from(sign(encoded, secret), "utf8");
  const given = Buffer.from(signature, "utf8");
  if (expected.length !== given.length || !timingSafeEqual(expected, given)) return null;

  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as Payload;
    if (
      typeof payload.i !== "number" ||
      now - payload.i > MAX_AGE_MS ||
      payload.i > now + 60_000 ||
      typeof payload.h !== "string" ||
      !Array.isArray(payload.o) ||
      payload.o.length === 0
    ) {
      return null;
    }
    return {
      websiteHost: payload.h,
      totalFound: typeof payload.n === "number" ? payload.n : payload.o.length,
      opportunities: payload.o
        .filter((entry) => typeof entry?.t === "string" && typeof entry?.s === "string")
        .map((entry) => ({ title: entry.t, summary: entry.s })),
    };
  } catch {
    return null;
  }
}
