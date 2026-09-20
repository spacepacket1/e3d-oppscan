import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";

import { AdminReportsTable } from "@/components/admin-reports-table";
import { getE3dSessionUser, isE3dAdmin } from "@/lib/e3d-session";
import { getScannerReportStore } from "@/lib/scanner-report-store";

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

  return (
    <main className="page-main">
      <section className="page-section">
        <div className="container">
          <div className="content-panel">
            <h1>All scanner reports</h1>
            <AdminReportsTable reports={reports} />
          </div>
        </div>
      </section>
    </main>
  );
}
