import { hvacLiteContent } from "@/content/hvac-content";

// The site-wide header/footer in app/layout.tsx is FutCo/Oppscan-branded
// and wraps every route -- there's no per-route or per-record layout
// override mechanism in the App Router for a decision that (for the report
// page) depends on data only known after the page fetches its record. This
// hides that default chrome via CSS and renders itera.works-branded chrome
// in its place, reusing the same oppscan-header/oppscan-footer classes (and
// their existing styling) so visual layout stays consistent. `:not(...)`
// keeps the hide rule from also hiding the replacement chrome below, since
// both share the base class for styling.
export function HideDefaultSiteChrome() {
  return (
    <style>
      {".oppscan-header:not(.itera-brand-chrome), .oppscan-footer:not(.itera-brand-chrome) { display: none; }"}
    </style>
  );
}

export function IteraBrandHeader() {
  return (
    <header className="oppscan-header itera-brand-chrome">
      <div className="container oppscan-header__inner">
        <a className="site-header__brand" href={hvacLiteContent.brand.homeHref}>
          <span className="oppscan-header__wordmark">{hvacLiteContent.brand.productName}</span>
        </a>
      </div>
    </header>
  );
}

export function IteraBrandFooter() {
  return (
    <footer className="oppscan-footer itera-brand-chrome">
      <div className="container oppscan-footer__inner">
        <p>{hvacLiteContent.brand.footerTagline}</p>
        <nav className="oppscan-footer__links" aria-label="Footer">
          <a href={`mailto:${hvacLiteContent.brand.contactEmail}`}>
            {hvacLiteContent.brand.contactEmail}
          </a>
        </nav>
      </div>
    </footer>
  );
}
