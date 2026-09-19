"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import {
  authorizeScannerReportToken,
  deriveReportEmailProof,
  getScannerReportStore,
  normalizeReportEmail,
  reportEmailCookieName,
} from "@/lib/scanner-report-store";

export type ReportEmailGateState = {
  status: "idle" | "error";
  message?: string;
};

export async function verifyReportEmail(
  token: string,
  _previousState: ReportEmailGateState,
  formData: FormData,
): Promise<ReportEmailGateState> {
  const email = String(formData.get("email") || "").trim();
  if (!email) {
    return { status: "error", message: "Enter the email used at checkout." };
  }

  const store = getScannerReportStore();
  const record = await authorizeScannerReportToken(token, store);
  if (!record) {
    return {
      status: "error",
      message: "This report link is no longer valid.",
    };
  }

  if (normalizeReportEmail(email) !== normalizeReportEmail(record.checkoutEmail)) {
    return {
      status: "error",
      message: "That email doesn't match our records for this report.",
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(
    reportEmailCookieName(),
    deriveReportEmailProof(record.scanId, record.checkoutEmail),
    {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: `/report/${token}`,
      maxAge: 60 * 60 * 24 * 30,
    },
  );
  redirect(`/report/${token}`);
}
