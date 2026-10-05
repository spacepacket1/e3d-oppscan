import type { HvacLiteAttemptOutcome } from "@/lib/scanner-lite-attempt-log";
import type { HvacLiteFormState } from "@/lib/scanner-lite-intake";

// Runs report generation for an already-accepted /hvac submission. The
// visitor has been told "success", so a failure here is invisible to them: it
// is retried where that can help, and always reported to the log. A
// `companyWebsite` error (the site could not be analyzed) is not retried --
// repeating it cannot succeed.
//
// Lives outside app/hvac/actions.ts on purpose: every export of a "use
// server" file can become a callable endpoint, and this should never be one.
const DEFAULT_RETRY_DELAY_MS = 30_000;
const MAX_ATTEMPTS = 2;

export async function runHvacLiteBackground(
  run: () => Promise<HvacLiteFormState>,
  report: (outcome: HvacLiteAttemptOutcome, reason?: string) => void,
  { retryDelayMs = DEFAULT_RETRY_DELAY_MS }: { retryDelayMs?: number } = {},
): Promise<void> {
  let lastReason = "unknown";

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      const result = await run();
      if (result.status === "success") {
        report("succeeded", attempt > 1 ? `retry_${attempt - 1}` : undefined);
        return;
      }
      lastReason = Object.keys(result.errors).join(",") || "unknown";
      if (result.errors.companyWebsite) break;
    } catch {
      lastReason = "exception";
    }
    if (attempt < MAX_ATTEMPTS) {
      await new Promise((resolve) => setTimeout(resolve, retryDelayMs));
    }
  }
  report("failed", lastReason);
}
