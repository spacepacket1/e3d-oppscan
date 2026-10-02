"use client";

import { usePathname } from "next/navigation";
import { useEffect } from "react";

import {
  FUTCO_META_PIXEL_ID,
  ensureMetaPixel,
  trackMetaPixelEvent,
} from "@/lib/meta-pixel";

// Only the public marketing pages. /hvac and HVAC reports fire their own
// events; /intake, /report, /account and /admin are deliberately excluded
// because their URLs can carry a Stripe session id or report token, and the
// pixel reports the page URL to Meta.
const TRACKED_PATHS = new Set(["/", "/free", "/example"]);

export function SiteMetaPixel() {
  const pathname = usePathname();

  useEffect(() => {
    if (!TRACKED_PATHS.has(pathname)) return;
    ensureMetaPixel(FUTCO_META_PIXEL_ID);
    trackMetaPixelEvent("PageView");
    if (pathname === "/") trackMetaPixelEvent("ViewContent");
  }, [pathname]);

  return null;
}
