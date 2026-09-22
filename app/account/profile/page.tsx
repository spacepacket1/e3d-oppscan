import type { Metadata } from "next";
import { headers } from "next/headers";

import { DeleteAccountButton } from "@/components/delete-account-button";
import { E3dLoginForm } from "@/components/e3d-login-form";
import { E3dLogoutButton } from "@/components/e3d-logout-button";
import { getE3dSessionUser } from "@/lib/e3d-session";

export const dynamic = "force-dynamic";
export const metadata: Metadata = {
  title: "Account | Oppscan",
  robots: { index: false, follow: false },
};

export default async function ProfilePage() {
  const headerList = await headers();
  const session = await getE3dSessionUser(headerList.get("cookie") || "");

  if (!session.authenticated) {
    return (
      <main className="page-main">
        <section className="page-section">
          <div className="container">
            <div className="content-panel">
              <h1>Sign in to manage your account</h1>
              <E3dLoginForm />
            </div>
          </div>
        </section>
      </main>
    );
  }

  return (
    <main className="page-main">
      <section className="page-section">
        <div className="container">
          <div className="content-panel">
            <h1>Account</h1>
            <p>Signed in as {session.email}.</p>
            <E3dLogoutButton />
          </div>
          <div className="content-panel danger-zone">
            <h2>Danger zone</h2>
            <p>Permanently delete your e3d.ai account and everything tied to it.</p>
            <DeleteAccountButton email={session.email} />
          </div>
        </div>
      </section>
    </main>
  );
}
