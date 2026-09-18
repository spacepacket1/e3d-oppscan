import type { MetadataRoute } from "next";

import { getCanonicalUrl } from "@/lib/seo";

const sitemapPaths = ["/", "/free", "/example"] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  return sitemapPaths.map((path) => ({
    url: getCanonicalUrl(path),
    changeFrequency: "weekly",
    priority: path === "/" ? 1 : 0.8,
  }));
}
