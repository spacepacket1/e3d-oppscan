import type { MetadataRoute } from "next";

import { getCanonicalUrl, isIndexableDeployment } from "@/lib/seo";

// Named explicitly so this site's openness to AI answer engines and agents is a
// deliberate, auditable choice rather than an implicit side effect of the "*" rule.
export const AI_AGENT_USER_AGENTS = [
  "GPTBot",
  "ChatGPT-User",
  "OAI-SearchBot",
  "ClaudeBot",
  "Claude-User",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "CCBot",
  "Amazonbot",
  "meta-externalagent",
  "meta-externalfetcher",
] as const;

export default function robots(): MetadataRoute.Robots {
  const sitemapUrl = getCanonicalUrl("/sitemap.xml");

  if (!isIndexableDeployment()) {
    return {
      rules: {
        userAgent: "*",
        disallow: "/",
      },
      sitemap: sitemapUrl,
    };
  }

  return {
    rules: [
      {
        userAgent: "*",
        allow: "/",
        disallow: "/report",
      },
      ...AI_AGENT_USER_AGENTS.map((userAgent) => ({
        userAgent,
        allow: "/",
        disallow: "/report",
      })),
    ],
    sitemap: sitemapUrl,
  };
}
