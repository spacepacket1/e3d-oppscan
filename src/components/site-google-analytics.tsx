"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  FUTCO_GA_MEASUREMENT_ID,
  ensureGoogleAnalytics,
  trackGoogleAnalyticsPageView,
} from "@/lib/google-analytics";

// Same allow-list rationale as SiteMetaPixel: /intake, /report, /account and
// /admin URLs can carry a Stripe session id or report token, which GA would
// record as the page location. /hvac is included (its reports are not).
const TRACKED_PATHS = new Set(["/", "/free", "/example", "/hvac"]);

export function SiteGoogleAnalytics() {
  const pathname = usePathname();

  useEffect(() => {
    if (!TRACKED_PATHS.has(pathname)) return;
    ensureGoogleAnalytics(FUTCO_GA_MEASUREMENT_ID);
    trackGoogleAnalyticsPageView(FUTCO_GA_MEASUREMENT_ID);
  }, [pathname]);

  return null;
}
