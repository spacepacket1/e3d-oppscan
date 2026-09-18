import type { MetadataRoute } from "next";

import { getCanonicalUrl } from "@/lib/seo";

const sitemapPaths = ["/"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths.map((path) => ({
    url: getCanonicalUrl(path),
    changeFrequency: "weekly",
    priority: 1,
  }));
}
