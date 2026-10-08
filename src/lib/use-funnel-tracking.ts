import { useCallback, useEffect, useRef } from "react";
import type { FocusEvent } from "react";

import { trackFunnelEvent, type FunnelForm } from "@/lib/funnel-events";

type FormStateLike = {
  status: string;
  errors?: Record<string, string | undefined>;
};

// Wires one form into the funnel events: the first time a visitor touches a
// field, each submit tap, and how a submission came out. A tap that Turnstile
// holds and then re-submits for the visitor fires onSubmit twice, so a tap is
// counted once until a result arrives.
export function useFunnelTracking(form: FunnelForm, state: FormStateLike) {
  const startedRef = useRef(false);
  const tapPendingRef = useRef(false);

  const onFocus = useCallback(
    (event: FocusEvent<HTMLFormElement>) => {
      if (startedRef.current) return;
      const target = event.target as { name?: string };
      // The honeypot is never focused by a person, but be explicit.
      if (target.name === "website") return;
      startedRef.current = true;
      trackFunnelEvent(form, "form_start", target.name ? { field: target.name } : {});
    },
    [form],
  );

  const trackTap = useCallback(() => {
    if (tapPendingRef.current) return;
    tapPendingRef.current = true;
    trackFunnelEvent(form, "submit_tap");
  }, [form]);

  useEffect(() => {
    if (state.status === "success") {
      tapPendingRef.current = false;
      trackFunnelEvent(form, "submit_success");
    } else if (state.status === "error") {
      tapPendingRef.current = false;
      trackFunnelEvent(form, "submit_error", {
        fields: Object.keys(state.errors ?? {}).join(",") || "none",
      });
    }
  }, [form, state]);

  return { onFocus, trackTap };
}
