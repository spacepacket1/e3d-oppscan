import Link from "next/link";

import { DeleteReportButton } from "@/components/delete-report-button";
import { deleteReport, toggleReportRevoked } from "@/lib/admin-actions";
import type { ScannerReportForAdmin } from "@/lib/scanner-report-store";

export function AdminReportsTable({
  reports,
}: {
  reports: ScannerReportForAdmin[];
}) {
  const sorted = [...reports].sort((a, b) =>
    b.completedAt.localeCompare(a.completedAt),
  );

  return (
    <table className="scanner-opportunity-index">
      <thead>
        <tr>
          <th scope="col">Company</th>
          <th scope="col">Completed</th>
          <th scope="col">Checkout email</th>
          <th scope="col">Base / Potential</th>
          <th scope="col">Status</th>
          <th scope="col">Actions</th>
        </tr>
      </thead>
      <tbody>
        {sorted.map((report) => (
          <tr key={report.scanId}>
            <td>{report.companyName ?? "(unknown)"}</td>
            <td>{new Date(report.completedAt).toLocaleString()}</td>
            <td>{report.checkoutEmail ?? "(unknown)"}</td>
            <td>
              {report.baseScore ?? "—"}/100 · {report.potentialScore ?? "—"}/100
            </td>
            <td>{report.revoked ? "Revoked" : "Active"}</td>
            <td>
              <Link href={`/admin/report/${report.scanId}`}>View</Link>{" "}
              <Link href={`/admin/report/${report.scanId}/download`}>
                Download
              </Link>{" "}
              <form
                action={toggleReportRevoked.bind(
                  null,
                  report.scanId,
                  !report.revoked,
                )}
                style={{ display: "inline" }}
              >
                <button className="link-action" type="submit">
                  {report.revoked ? "Restore" : "Revoke"}
                </button>
              </form>{" "}
              <DeleteReportButton action={deleteReport} scanId={report.scanId} />
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
