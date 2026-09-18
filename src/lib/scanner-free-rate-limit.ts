// Dedicated, stricter rate limiting for the free scanner tier, separate
// from contact-security.ts's shared limiter (which stays sized for the
// paid intake). The free tier has no payment gate at all, so it needs its
// own tighter per-IP window plus a global daily circuit breaker that
// bounds worst-case cost even if per-IP limiting is bypassed (rotated
// IPs, many distinct callers).

type Window = {
  windowMs: number;
  maxPerWindow: number;
  maxPerDay: number;
};

type PerIpState = {
  windowStart: number;
  windowCount: number;
};

type Store = {
  perIp: Map<string, PerIpState>;
  dayKey: string;
  dayTotal: number;
};

function freshStore(): Store {
  return { perIp: new Map(), dayKey: "", dayTotal: 0 };
}

const analysisStore = freshStore();
const prefillStore = freshStore();

const ANALYSIS_WINDOW: Window = {
  windowMs: 10 * 60_000,
  maxPerWindow: 3,
  maxPerDay: 300,
};

const PREFILL_WINDOW: Window = {
  windowMs: 10 * 60_000,
  maxPerWindow: 5,
  maxPerDay: 300,
};

function dayKeyFor(now: number) {
  return new Date(now).toISOString().slice(0, 10);
}

function checkAndRecord(store: Store, window: Window, identifier: string, now = Date.now()) {
  const todayKey = dayKeyFor(now);
  if (store.dayKey !== todayKey) {
    store.dayKey = todayKey;
    store.dayTotal = 0;
    store.perIp.clear();
  }

  if (store.dayTotal >= window.maxPerDay) {
    return true;
  }

  const state = store.perIp.get(identifier);
  if (!state || now - state.windowStart >= window.windowMs) {
    store.perIp.set(identifier, { windowStart: now, windowCount: 1 });
    store.dayTotal += 1;
    return false;
  }

  if (state.windowCount >= window.maxPerWindow) {
    return true;
  }

  state.windowCount += 1;
  store.dayTotal += 1;
  return false;
}

export function isFreeAnalysisRateLimited(identifier: string, now = Date.now()) {
  return checkAndRecord(analysisStore, ANALYSIS_WINDOW, identifier, now);
}

export function isFreePrefillRateLimited(identifier: string, now = Date.now()) {
  return checkAndRecord(prefillStore, PREFILL_WINDOW, identifier, now);
}

export function clearFreeRateLimitsForTests() {
  analysisStore.perIp.clear();
  analysisStore.dayKey = "";
  analysisStore.dayTotal = 0;
  prefillStore.perIp.clear();
  prefillStore.dayKey = "";
  prefillStore.dayTotal = 0;
}
