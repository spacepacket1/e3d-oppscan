const rateLimitWindowMs = 60_000;
const maxSubmissionsPerWindow = 5;
const submissions = new Map<string, { count: number; resetAt: number }>();

export function isRateLimited(identifier: string, now = Date.now()) {
  const current = submissions.get(identifier);

  if (!current || current.resetAt <= now) {
    submissions.set(identifier, {
      count: 1,
      resetAt: now + rateLimitWindowMs,
    });
    return false;
  }

  current.count += 1;
  return current.count > maxSubmissionsPerWindow;
}

export function clearContactRateLimitForTests() {
  submissions.clear();
}

export function isTrustedServerActionOrigin(origin: string | null, host: string | null) {
  if (!origin || !host) {
    return false;
  }

  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

export async function verifyTurnstileToken(token: string, remoteIp?: string) {
  const secret = process.env.TURNSTILE_SECRET_KEY || "";

  if (!secret) {
    return true;
  }

  if (!token) {
    return false;
  }

  const body = new URLSearchParams({
    secret,
    response: token,
  });

  if (remoteIp) {
    body.set("remoteip", remoteIp);
  }

  const response = await fetch(
    "https://challenges.cloudflare.com/turnstile/v0/siteverify",
    {
      method: "POST",
      body,
    },
  );

  if (!response.ok) {
    return false;
  }

  const result = (await response.json()) as { success?: boolean };
  return result.success === true;
}
