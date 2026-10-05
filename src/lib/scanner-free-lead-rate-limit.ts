// Rate limiting for the free summary's email capture. Tighter than the summary
// itself: every accepted request can send an email to an address the caller
// chose, so this is the abuse surface (it could otherwise be pointed at
// someone else's inbox).
const WINDOW_MS = 10 * 60_000;
const MAX_PER_WINDOW = 3;
const MAX_PER_DAY = 300;

type PerIpState = { windowStart: number; windowCount: number };

const perIp = new Map<string, PerIpState>();
let dayKey = "";
let dayTotal = 0;

export function isFreeLeadRateLimited(identifier: string, now = Date.now()) {
  const todayKey = new Date(now).toISOString().slice(0, 10);
  if (dayKey !== todayKey) {
    dayKey = todayKey;
    dayTotal = 0;
    perIp.clear();
  }
  if (dayTotal >= MAX_PER_DAY) return true;

  const state = perIp.get(identifier);
  if (!state || now - state.windowStart >= WINDOW_MS) {
    perIp.set(identifier, { windowStart: now, windowCount: 1 });
    dayTotal += 1;
    return false;
  }
  if (state.windowCount >= MAX_PER_WINDOW) return true;
  state.windowCount += 1;
  dayTotal += 1;
  return false;
}

export function clearFreeLeadRateLimitForTests() {
  perIp.clear();
  dayKey = "";
  dayTotal = 0;
}
