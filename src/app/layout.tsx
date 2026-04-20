import Link from "next/link";
import {
  Bell,
  CalendarDays,
  Grid2x2,
  HelpCircle,
  History,
  House,
  LogOut,
  ShieldCheck,
} from "lucide-react";
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
              <div className="sidebar-profile">
                <div>
                  <div className="brand-title brand-title-large">PMSLink VIR</div>
                  <div className="workspace-meta workspace-meta-strong">{session.username}</div>
                </div>
                <div className="profile-avatar">{session.actorName.slice(0, 1).toUpperCase()}</div>
              </div>

              <div className="workspace-card workspace-card-compact">
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
                <div className="sync-stamp">Last synced 20/04/2026</div>
                <Link className="nav-secondary-link" href="/login">
                  Switch workspace
                </Link>
              </div>
            </aside>

            <div className="erp-main">
              <header className="erp-topbar">
                <div className="topbar-title-block">
                  <div className="eyebrow">Enterprise workspace</div>
                  <h1 className="app-title">Vessel Inspection Report</h1>
                </div>

                <div className="topbar-utility-nav">
                  <Link aria-label="Dashboard" className="topbar-icon-link" href="/">
                    <House size={18} />
                  </Link>
                  <Link aria-label="Approved inspections" className="topbar-icon-link" href="/inspections?scope=approved">
                    <ShieldCheck size={18} />
                  </Link>
                  <Link aria-label="Inspection history" className="topbar-icon-link" href="/inspections?scope=history">
                    <History size={18} />
                  </Link>
                  <Link aria-label="VIR Calendar" className="topbar-icon-link" href="/schedule">
                    <CalendarDays size={18} />
                  </Link>
                  <Link aria-label="Analytics Boards" className="topbar-icon-link" href="/dashboards">
                    <Grid2x2 size={18} />
                  </Link>
                  <button aria-label="Notifications" className="topbar-icon-link" type="button">
                    <Bell size={18} />
                  </button>
                  <Link aria-label="Instruction" className="topbar-help-link" href="/instruction">
                    <HelpCircle size={18} />
                    <span>Help</span>
                  </Link>
                  <form action={logoutAction}>
                    <button aria-label="Logout" className="topbar-icon-link topbar-icon-link-danger" type="submit">
                      <LogOut size={18} />
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
