import type { ScannerAnalysisFailureCategory } from "@/lib/scanner-analysis";
import type { ScannerReportStore } from "@/lib/scanner-report-store";

export type ScannerTelemetryEvent =
  | { scanId: string; eventName: "scanner_analysis_started"; timestamp: string }
  | {
      scanId: string;
      eventName: "scanner_analysis_completed";
      timestamp: string;
      candidateCount: number;
    }
  | {
      scanId: string;
      eventName: "scanner_analysis_failed";
      timestamp: string;
      failureCategory: ScannerAnalysisFailureCategory;
    }
  | { scanId: string; eventName: "scanner_report_viewed"; timestamp: string }
  | {
      scanId: string;
      eventName: "scanner_consultation_clicked";
      timestamp: string;
      destinationType: "booking" | "contact";
    };

export type ScannerTelemetrySink = (
  event: ScannerTelemetryEvent,
) => Promise<void> | void;

let testSink: ScannerTelemetrySink | undefined;

export function setScannerTelemetrySinkForTests(sink?: ScannerTelemetrySink) {
  if (process.env.NODE_ENV !== "test")
    throw new Error("Telemetry test injection is available only in tests.");
  testSink = sink;
}

// The spec requires these five events to be observable in production but
// names no external destination, and adding one isn't authorized here (no
// new required env vars). A structured stdout line is the minimal sink that
// is never silently discarded and matches the process's existing PM2 log
// capture, without inventing a new backend integration.
function defaultScannerTelemetrySink(event: ScannerTelemetryEvent): void {
  console.log(JSON.stringify({ scannerTelemetry: event }));
}

export function getScannerTelemetrySink(): ScannerTelemetrySink {
  return testSink ?? defaultScannerTelemetrySink;
}

export async function claimAndEmitScannerTelemetry(
  store: ScannerReportStore,
  event: ScannerTelemetryEvent,
  sink = getScannerTelemetrySink(),
) {
  const claimed = await store.claimTelemetryEvent(
    event.scanId,
    event.eventName,
  );
  if (!claimed) return false;
  try {
    await sink(event);
  } catch {
    // Claims intentionally provide at-most-once delivery; sink failures are non-fatal.
  }
  return true;
}
