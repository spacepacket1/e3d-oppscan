// Registry of ad-campaign-specific scanner variants (HVAC Lite is the
// first). A completed report optionally tags itself with a campaign source
// (see ScannerCompletedReport.campaign in scanner-report-store.ts); the
// report page and consultation redirect look the rest of the config up
// here rather than persisting it per-record, so a Pixel ID or booking link
// can be corrected without touching stored data. Reports with no campaign
// (every paid FutCo report) are untouched by any of this.
export type ScannerCampaignConfig = {
  source: string;
  label: string;
  metaPixelId: string;
  bookingUrl: string;
};

const SCANNER_CAMPAIGNS: Record<string, ScannerCampaignConfig> = {
  hvac_lite: {
    source: "hvac_lite",
    label: "HVAC Lite",
    metaPixelId: "1421449840175396",
    bookingUrl: "https://calendly.com/itera-support/oppscan-ai-strategy-call",
  },
};

export function getScannerCampaign(
  source: string | null | undefined,
): ScannerCampaignConfig | null {
  if (!source) return null;
  return SCANNER_CAMPAIGNS[source] ?? null;
}
