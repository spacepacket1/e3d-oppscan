import {
  FUTCO_GA_MEASUREMENT_ID,
  ensureGoogleAnalytics,
} from "@/lib/google-analytics";
import { trackMetaPixelEvent } from "@/lib/meta-pixel";

// Pre-submit funnel telemetry for the public forms. The server only logs a
// submission once it arrives, so "never tried" and "tried but the button or
// bot check got in the way" were indistinguishable. These events fill that gap.
//
// Non-personal by construction: only the form name, a step, and small
// diagnostic params (field *name*, milliseconds, error codes) -- never a field
// value. GA4 gets every step as `oppscan_<form>_<step>`; Meta only gets the
// two steps worth optimizing or building audiences on.
export type FunnelForm = "free" | "free_lead" | "hvac";

export type FunnelStep =
  | "form_start"
  | "submit_tap"
  | "check_ready"
  | "check_error"
  | "check_blocked"
  | "check_timeout"
  | "submit_success"
  | "submit_error";

const META_STEPS: Partial<Record<FunnelStep, string>> = {
  form_start: "FormStart",
  submit_tap: "FormSubmitTap",
};

export function trackFunnelEvent(
  form: FunnelForm,
  step: FunnelStep,
  params: Record<string, string | number | boolean> = {},
) {
  if (typeof window === "undefined") return;
  try {
    ensureGoogleAnalytics(FUTCO_GA_MEASUREMENT_ID);
    window.gtag?.("event", `oppscan_${form}_${step}`, {
      ...params,
      send_to: FUTCO_GA_MEASUREMENT_ID,
    });
    const metaEvent = META_STEPS[step];
    if (metaEvent) {
      trackMetaPixelEvent(metaEvent, { custom: true, params: { form } });
    }
  } catch {
    // Telemetry must never change what the visitor sees.
  }
}
