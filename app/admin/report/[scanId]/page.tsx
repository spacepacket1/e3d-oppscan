import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound } from "next/navigation";
import Link from "next/link";

import { DeleteReportButton } from "@/components/delete-report-button";
import { ScannerReport } from "@/components/scanner-report";
import { resolvePrimaryCtaHref } from "@/content/site-config";
import { getE3dSessionUser, isE3dAdmin } from "@/lib/e3d-session";
import { deleteReport, toggleReportRevoked } from "@/lib/admin-actions";
import { getScannerReportStore } from "@/lib/scanner-report-store";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Report | Admin | Oppscan",
  robots: { index: false, follow: false },
};

export default async function AdminReportDetailPage({
  params,
}: {
  params: Promise<{ scanId: string }>;
}) {
  const { scanId } = await params;
  const headerList = await headers();
  const session = await getE3dSessionUser(headerList.get("cookie") || "");
  if (!isE3dAdmin(session)) notFound();

  const store = getScannerReportStore();
  // listAllReportsForAdmin (unlike getByTokenHash) doesn't filter out
  // revoked reports and also exposes the revoked flag -- admin review
  // needs both, not just active ones with no way to tell.
  const reports = await store.listAllReportsForAdmin();
  const record = reports.find((report) => report.scanId === scanId);
  if (!record) notFound();

  return (
    <main className="page-main">
      <section className="page-section">
        <div className="container page-stack">
          <div className="content-panel">
            <Link href="/admin">&larr; All reports</Link>
            <p>
              Checkout email: {record.checkoutEmail ?? "(unknown)"} —
              status: {record.revoked ? "Revoked" : "Active"}
            </p>
            <form action={toggleReportRevoked.bind(null, scanId, !record.revoked)}>
              <button className="button button--ghost" type="submit">
                {record.revoked ? "Restore this link" : "Revoke this link"}
              </button>
            </form>{" "}
            <DeleteReportButton
              action={deleteReport}
              redirectTo="/admin"
              scanId={scanId}
            />
          </div>
          {/* The real /report/[token]/consultation route re-checks the
              customer's own email-proof cookie and records telemetry --
              neither makes sense from an admin session previewing someone
              else's report, so this links straight to the booking
              destination instead of through that customer-only gate. */}
          <ScannerReport
            consultationHref={resolvePrimaryCtaHref()}
            record={record}
          />
        </div>
      </section>
    </main>
  );
}
