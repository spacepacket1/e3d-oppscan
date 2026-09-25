"use client";

import { useEffect } from "react";

import { ensureMetaPixel, trackMetaPixelEvent } from "@/lib/meta-pixel";

// Renders nothing -- fires the campaign's Meta Pixel "report viewed" event
// once per mount. Only ever rendered when the report carries a campaign tag
// (see scanner-report-store.ts's ScannerCompletedReport.campaign); every
// paid FutCo report renders without this entirely.
export function ScannerCampaignPixel({ pixelId }: { pixelId: string }) {
  useEffect(() => {
    ensureMetaPixel(pixelId);
    trackMetaPixelEvent("ViewContent");
  }, [pixelId]);

  return null;
}
