import type { Metadata } from "next";
import { cookies, headers } from "next/headers";

import { AdminReportsTable } from "@/components/admin-reports-table";
import { E3dLoginForm } from "@/components/e3d-login-form";
import { getE3dSessionUser, isE3dAdmin } from "@/lib/e3d-session";
import {
  buildReportUrl,
  deriveReportAccessToken,
  deriveReportEmailProof,
  getScannerReportStore,
  reportEmailCookieName,
} from "@/lib/scanner-report-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Your Reports | Oppscan",
  robots: { index: false, follow: false },
};

export default async function AccountPage() {
  const headerList = await headers();
  const session = await getE3dSessionUser(headerList.get("cookie") || "");

  if (!session.authenticated) {
    return (
      <main className="page-main">
        <section className="page-section">
          <div className="container">
            <div className="content-panel">
              <h1>Sign in to see your reports</h1>
              <p>Oppscan reports are tied to your e3d.ai account.</p>
              <E3dLoginForm />
            </div>
          </div>
        </section>
      </main>
    );
  }

  const store = getScannerReportStore();
  const reports = await store.listReportsByCheckoutEmail(session.email);

  // Since we've already confirmed ownership of this email via the e3d.ai
  // session, proactively set each report's own email-verified cookie so
  // "View report" goes straight in instead of asking for the email again.
  const cookieStore = await cookies();
  for (const report of reports) {
    const token = deriveReportAccessToken(report.scanId);
    cookieStore.set(
      reportEmailCookieName(),
      deriveReportEmailProof(report.scanId, report.checkoutEmail),
      {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax",
        path: `/report/${token}`,
        maxAge: 60 * 60 * 24 * 30,
      },
    );
  }

  return (
    <main className="page-main">
      <section className="page-section">
        <div className="container">
          <div className="content-panel">
            <h1>Your reports</h1>
            {reports.length === 0 ? (
              <p>No completed scanner reports are on file for this email yet.</p>
            ) : (
              <ul>
                {reports.map((report) => (
                  <li key={report.scanId}>
                    <a href={buildReportUrl(report.scanId)}>
                      {report.companyName} — completed{" "}
                      {new Date(report.completedAt).toLocaleDateString()}
                    </a>{" "}
                    — AI Base Score {report.baseScore}/100, Potential Score{" "}
                    {report.potentialScore}/100
                  </li>
                ))}
              </ul>
            )}
          </div>
          {isE3dAdmin(session) ? (
            <div className="content-panel">
              <h2>All scanner reports (admin)</h2>
              <AdminReportsTable reports={await store.listAllReportsForAdmin()} />
            </div>
          ) : null}
        </div>
      </section>
    </main>
  );
}
