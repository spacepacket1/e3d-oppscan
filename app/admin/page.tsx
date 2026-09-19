import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";

import { getE3dSessionUser, isE3dAdmin } from "@/lib/e3d-session";
import { getScannerReportStore } from "@/lib/scanner-report-store";

import { toggleReportRevoked } from "./actions";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Admin | Oppscan",
  robots: { index: false, follow: false },
};

export default async function AdminReportsPage() {
  const headerList = await headers();
  const session = await getE3dSessionUser(headerList.get("cookie") || "");
  // Same visible response whether signed out or signed in without the
  // admin role, so this route's existence isn't distinguishable to a
  // non-admin visitor from any other unknown path.
  if (!isE3dAdmin(session)) notFound();

  const store = getScannerReportStore();
  const reports = await store.listAllReportsForAdmin();
  reports.sort((a, b) => b.completedAt.localeCompare(a.completedAt));

  return (
    <main className="page-main">
      <section className="page-section">
        <div className="container">
          <div className="content-panel">
            <h1>All scanner reports</h1>
            <table className="scanner-opportunity-index">
              <thead>
                <tr>
                  <th scope="col">Completed</th>
                  <th scope="col">Checkout email</th>
                  <th scope="col">Base / Potential</th>
                  <th scope="col">Status</th>
                  <th scope="col">Actions</th>
                </tr>
              </thead>
              <tbody>
                {reports.map((report) => (
                  <tr key={report.scanId}>
                    <td>{new Date(report.completedAt).toLocaleString()}</td>
                    <td>{report.checkoutEmail}</td>
                    <td>
                      {report.baseScore}/100 · {report.potentialScore}/100
                    </td>
                    <td>{report.revoked ? "Revoked" : "Active"}</td>
                    <td>
                      <Link href={`/admin/report/${report.scanId}`}>View</Link>{" "}
                      <form
                        action={toggleReportRevoked.bind(
                          null,
                          report.scanId,
                          !report.revoked,
                        )}
                        style={{ display: "inline" }}
                      >
                        <button className="button button--ghost" type="submit">
                          {report.revoked ? "Restore" : "Revoke"}
                        </button>
                      </form>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </main>
  );
}
