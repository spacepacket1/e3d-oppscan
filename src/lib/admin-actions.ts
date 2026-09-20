"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";

import { getE3dSessionUser, isE3dAdmin } from "@/lib/e3d-session";
import { getScannerReportStore } from "@/lib/scanner-report-store";

async function requireAdmin() {
  const headerList = await headers();
  const session = await getE3dSessionUser(headerList.get("cookie") || "");
  if (!isE3dAdmin(session)) {
    throw new Error("Not authorized.");
  }
}

// Re-checks the admin session inside the action itself -- a server action
// is directly callable regardless of which page rendered the button that
// triggers it, so the page-level gate alone isn't enough here.
export async function toggleReportRevoked(scanId: string, revoked: boolean) {
  await requireAdmin();

  const store = getScannerReportStore();
  await store.setReportRevoked(scanId, revoked);
  revalidatePath("/admin");
  revalidatePath("/account");
  revalidatePath(`/admin/report/${scanId}`);
}

// Permanent -- unlike toggleReportRevoked, there's no undo. redirectTo
// covers being called from the standalone /admin/report/[scanId] page,
// where the current route would otherwise 404 after the record is gone.
export async function deleteReport(scanId: string, redirectTo?: string) {
  await requireAdmin();

  const store = getScannerReportStore();
  await store.deleteReport(scanId);
  revalidatePath("/admin");
  revalidatePath("/account");
  if (redirectTo) redirect(redirectTo);
}
