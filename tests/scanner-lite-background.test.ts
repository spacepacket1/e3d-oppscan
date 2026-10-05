import { describe, expect, it, vi } from "vitest";

import { runHvacLiteBackground } from "@/lib/scanner-lite-background";
import {
  hvacLiteErrorState,
  hvacLiteSuccessState,
  emptyHvacLiteIntakeValues,
} from "@/lib/scanner-lite-intake";

const ok = hvacLiteSuccessState(emptyHvacLiteIntakeValues);
const retryable = hvacLiteErrorState(emptyHvacLiteIntakeValues, { form: "try again" });
const badSite = hvacLiteErrorState(emptyHvacLiteIntakeValues, { companyWebsite: "bad" });

describe("runHvacLiteBackground", () => {
  it("reports success on the first attempt without retrying", async () => {
    const run = vi.fn().mockResolvedValue(ok);
    const report = vi.fn();
    await runHvacLiteBackground(run, report, { retryDelayMs: 0 });
    expect(run).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledExactlyOnceWith("succeeded", undefined);
  });

  it("retries a retryable failure once and reports the recovery", async () => {
    const run = vi.fn().mockResolvedValueOnce(retryable).mockResolvedValueOnce(ok);
    const report = vi.fn();
    await runHvacLiteBackground(run, report, { retryDelayMs: 0 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledExactlyOnceWith("succeeded", "retry_1");
  });

  it("gives up after two attempts and reports the error keys", async () => {
    const run = vi.fn().mockResolvedValue(retryable);
    const report = vi.fn();
    await runHvacLiteBackground(run, report, { retryDelayMs: 0 });
    expect(run).toHaveBeenCalledTimes(2);
    expect(report).toHaveBeenCalledExactlyOnceWith("failed", "form");
  });

  it("does not retry a site that cannot be analyzed", async () => {
    const run = vi.fn().mockResolvedValue(badSite);
    const report = vi.fn();
    await runHvacLiteBackground(run, report, { retryDelayMs: 0 });
    expect(run).toHaveBeenCalledOnce();
    expect(report).toHaveBeenCalledExactlyOnceWith("failed", "companyWebsite");
  });

  it("treats a thrown error as retryable and never rethrows", async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error("boom")).mockResolvedValueOnce(ok);
    const report = vi.fn();
    await expect(runHvacLiteBackground(run, report, { retryDelayMs: 0 })).resolves.toBeUndefined();
    expect(report).toHaveBeenCalledExactlyOnceWith("succeeded", "retry_1");

    const alwaysThrows = vi.fn().mockRejectedValue(new Error("boom"));
    const report2 = vi.fn();
    await runHvacLiteBackground(alwaysThrows, report2, { retryDelayMs: 0 });
    expect(report2).toHaveBeenCalledExactlyOnceWith("failed", "exception");
  });
});
