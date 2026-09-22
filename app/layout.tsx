import type { Metadata } from "next";
import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { Archivo, IBM_Plex_Mono, Inter } from "next/font/google";

import { contactDetails, siteIdentity } from "@/content/site-config";
import { E3dSessionProvider } from "@/components/e3d-session-context";
import { HeaderAccountStatus } from "@/components/header-account-status";
import { buildRootMetadata } from "@/lib/seo";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-sans",
  weight: ["400", "500", "600"],
});

const archivo = Archivo({
  subsets: ["latin"],
  variable: "--font-heading",
  weight: ["600", "700", "800"],
});

const plexMono = IBM_Plex_Mono({
  subsets: ["latin"],
  variable: "--font-mono-face",
  weight: ["500", "600"],
});

export function generateMetadata(): Metadata {
  return buildRootMetadata();
}

type RootLayoutProps = {
  children: ReactNode;
};

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html className={`${inter.variable} ${archivo.variable} ${plexMono.variable}`} lang="en">
      <body>
        <E3dSessionProvider>
          <div className="site-root">
            <a className="skip-link" href="#main-content">
              Skip to content
            </a>
            <header className="oppscan-header">
              <div className="container oppscan-header__inner">
                <Link className="site-header__brand" href="/">
                  <Image
                    alt="FutCo"
                    className="site-header__brand-mark"
                    height={44}
                    src="/futco-logo.png"
                    width={44}
                  />
                  <span className="oppscan-header__wordmark">AI Opportunity Scanner</span>
                </Link>
                <nav aria-label="Primary" className="oppscan-header__nav">
                  <Link className="oppscan-header__nav-link" href="/readiness-score">
                    AI readiness score
                  </Link>
                  <Link className="oppscan-header__nav-link" href="/free">
                    Free opportunity summary
                  </Link>
                </nav>
                <HeaderAccountStatus />
              </div>
            </header>
            <div id="main-content">{children}</div>
            <footer className="oppscan-footer">
              <div className="container oppscan-footer__inner">
                <p>{siteIdentity.footerTagline}</p>
                <nav className="oppscan-footer__links" aria-label="Footer">
                  <a href={`mailto:${contactDetails.email}`}>{contactDetails.email}</a>
                  <a href="https://applied.futco.ai/privacy">Privacy</a>
                  <a href="https://applied.futco.ai/terms">Terms</a>
                </nav>
              </div>
            </footer>
          </div>
        </E3dSessionProvider>
      </body>
    </html>
  );
}
