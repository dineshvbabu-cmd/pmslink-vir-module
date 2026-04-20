import Link from "next/link";
import "./globals.css";
import { logoutAction } from "@/app/session-actions";
import { VirSyncRegistrar } from "@/components/vir-sync-registrar";
import { WorkspaceNav } from "@/components/workspace-nav";
import {
  getVirSession,
  workspaceAccent,
  workspaceLabel,
  workspaceNavigation,
  workspaceShortLabel,
} from "@/lib/vir/session";

export const metadata = {
  title: "PMSLink VIR Module",
  description: "ERP-style vessel inspection platform with office and vessel workspaces, questionnaire execution, findings workflow, imports, and dashboards.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getVirSession();

  return (
    <html lang="en">
      <body>
        <VirSyncRegistrar />
        {session ? (
          <div className="erp-shell">
            <aside className="erp-sidebar">
              <div className="brand-block">
                <div className="brand-mark">PL</div>
                <div>
                  <div className="eyebrow eyebrow-dark">PMSLink QHSE</div>
                  <div className="brand-title">VIR Operations</div>
                </div>
              </div>

              <div className="workspace-card">
                <span className={`chip ${workspaceAccent(session.workspace)}`}>{workspaceShortLabel(session.workspace)}</span>
                <h2 className="workspace-title">{workspaceLabel(session.workspace)}</h2>
                <div className="workspace-actor">{session.actorName}</div>
                <div className="workspace-meta">
                  {session.actorRole}
                  {session.vesselName ? ` / ${session.vesselName}` : ""}
                </div>
              </div>

              <WorkspaceNav items={workspaceNavigation(session.workspace)} />

              <div className="sidebar-footer">
                <Link className="nav-secondary-link" href="/PMSLink_VIR_Module_Spec_v1.html">
                  Original VIR spec
                </Link>
                <Link className="nav-secondary-link" href="/login">
                  Switch workspace
                </Link>
              </div>
            </aside>

            <div className="erp-main">
              <header className="erp-topbar">
                <div>
                  <div className="eyebrow">Enterprise workspace</div>
                  <h1 className="app-title">Vessel inspection execution and review</h1>
                  <p className="app-subtitle">
                    Role-based workflow for vessel execution, shore review, corrective closure, and import governance.
                  </p>
                </div>

                <div className="erp-topbar-actions">
                  <Link className="btn-secondary btn-compact" href="/dashboards">
                    Dashboards
                  </Link>
                  <Link className="btn-secondary btn-compact" href="/inspections">
                    Open register
                  </Link>
                  <Link className="btn btn-compact" href="/inspections/new">
                    New VIR
                  </Link>
                  <form action={logoutAction}>
                    <button className="btn-danger btn-compact" type="submit">
                      Logout
                    </button>
                  </form>
                </div>
              </header>

              <main className="content">{children}</main>
            </div>
          </div>
        ) : (
          <main className="login-shell">{children}</main>
        )}
      </body>
    </html>
  );
}
