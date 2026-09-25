// Dedicated rate limiting for the HVAC Lite flow, separate from both
// contact-security.ts's shared limiter and scanner-free-rate-limit.ts's
// budget -- this is meant to absorb a Meta ad campaign's traffic pattern
// without competing with (or being throttled by) unrelated /free traffic.

const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 3;
const MAX_PER_DAY = 300;

type PerIpState = {
  windowStart: number;
  windowCount: number;
};

const perIp = new Map<string, PerIpState>();
let dayKey = "";
let dayTotal = 0;

function dayKeyFor(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

export function isHvacLiteRateLimited(identifier: string, now = Date.now()) {
  const todayKey = dayKeyFor(now);
  if (dayKey !== todayKey) {
    dayKey = todayKey;
    dayTotal = 0;
    perIp.clear();
  }

  if (dayTotal >= MAX_PER_DAY) {
    return true;
  }

  const state = perIp.get(identifier);
  if (!state || now - state.windowStart >= WINDOW_MS) {
    perIp.set(identifier, { windowStart: now, windowCount: 1 });
    dayTotal += 1;
    return false;
  }

  if (state.windowCount >= MAX_PER_WINDOW) {
    return true;
  }

  state.windowCount += 1;
  dayTotal += 1;
  return false;
}

export function clearHvacLiteRateLimitForTests() {
  perIp.clear();
  dayKey = "";
  dayTotal = 0;
}
