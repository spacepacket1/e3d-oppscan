import type { Metadata } from "next";

import { siteIdentity } from "@/content/site-config";

const DEFAULT_SITE_URL = "https://oppscan.e3d.ai";

type PageMetadataInput = {
  path: string;
  title: string;
  description: string;
};

export function getSiteUrl() {
  const configuredUrl = process.env.NEXT_PUBLIC_SITE_URL?.trim() || DEFAULT_SITE_URL;

  try {
    return new URL(configuredUrl);
  } catch {
    return new URL(DEFAULT_SITE_URL);
  }
}

export function getCanonicalUrl(path = "/") {
  return new URL(path, getSiteUrl()).toString();
}

export function isIndexableDeployment() {
  const host = getSiteUrl().hostname;
  const deploymentEnvironment = process.env.VERCEL_ENV;

  if (deploymentEnvironment && deploymentEnvironment !== "production") {
    return false;
  }

  return host === "oppscan.e3d.ai";
}

export function buildPageMetadata({
  path,
  title,
  description,
}: PageMetadataInput): Metadata {
  const canonicalUrl = getCanonicalUrl(path);
  const shouldIndex = isIndexableDeployment();

  return {
    title,
    description,
    alternates: {
      canonical: canonicalUrl,
    },
    openGraph: {
      type: "website",
      siteName: siteIdentity.name,
      url: canonicalUrl,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
      description,
    },
    robots: shouldIndex
      ? {
          index: true,
          follow: true,
        }
      : {
          index: false,
          follow: false,
          nocache: true,
          googleBot: {
            index: false,
            follow: false,
            noimageindex: true,
          },
        },
  };
}

export function buildRootMetadata(): Metadata {
  return {
    metadataBase: getSiteUrl(),
    applicationName: siteIdentity.name,
  };
}
