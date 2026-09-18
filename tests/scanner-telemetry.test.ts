import { afterEach, describe, expect, it, vi } from "vitest";

import {
  getScannerTelemetrySink,
  setScannerTelemetrySinkForTests,
} from "@/lib/scanner-telemetry";

describe("scanner telemetry sink", () => {
  afterEach(() => {
    setScannerTelemetrySinkForTests(undefined);
    vi.restoreAllMocks();
  });

  it("emits a structured log line by default instead of silently discarding the event", () => {
    setScannerTelemetrySinkForTests(undefined);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const sink = getScannerTelemetrySink();
    sink({
      scanId: "scan_abc",
      eventName: "scanner_report_viewed",
      timestamp: "2026-09-10T00:00:00.000Z",
    });

    expect(logSpy).toHaveBeenCalledTimes(1);
    const logged = JSON.parse(logSpy.mock.calls[0][0] as string);
    expect(logged.scannerTelemetry).toEqual({
      scanId: "scan_abc",
      eventName: "scanner_report_viewed",
      timestamp: "2026-09-10T00:00:00.000Z",
    });
  });

  it("uses an injected test sink instead of the default when one is set", () => {
    const injected = vi.fn();
    setScannerTelemetrySinkForTests(injected);
    const logSpy = vi.spyOn(console, "log").mockImplementation(() => undefined);

    const sink = getScannerTelemetrySink();
    sink({
      scanId: "scan_def",
      eventName: "scanner_consultation_clicked",
      timestamp: "2026-09-10T00:00:01.000Z",
      destinationType: "booking",
    });

    expect(injected).toHaveBeenCalledTimes(1);
    expect(logSpy).not.toHaveBeenCalled();
  });
});
