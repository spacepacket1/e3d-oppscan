"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";

import { getE3dSessionUser, isE3dAdmin } from "@/lib/e3d-session";
import { getScannerReportStore } from "@/lib/scanner-report-store";

// Re-checks the admin session inside the action itself -- a server action
// is directly callable regardless of which page rendered the button that
// triggers it, so the page-level gate alone isn't enough here.
export async function toggleReportRevoked(scanId: string, revoked: boolean) {
  const headerList = await headers();
  const session = await getE3dSessionUser(headerList.get("cookie") || "");
  if (!isE3dAdmin(session)) {
    throw new Error("Not authorized.");
  }

  const store = getScannerReportStore();
  await store.setReportRevoked(scanId, revoked);
  revalidatePath("/admin");
  revalidatePath(`/admin/report/${scanId}`);
}
