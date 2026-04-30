import Link from "next/link";
import {
  Anchor,
  Bell,
  BookOpen,
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
import { WorkspaceFilterSync } from "@/components/workspace-filter-sync";
import { VirSyncRegistrar } from "@/components/vir-sync-registrar";
import { WorkspaceNav } from "@/components/workspace-nav";
import {
  buildWorkspaceHref,
  getVirSession,
  getVirWorkspaceFilter,
  workspaceAccent,
  workspaceLabel,
  workspaceNavigation,
  workspaceShortLabel,
} from "@/lib/vir/session";

export const metadata = {
  title: "PMSLink Inspection Reports",
  description: "ERP-style vessel inspection platform with office and vessel workspaces, questionnaire execution, findings workflow, imports, and dashboards.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const session = await getVirSession();
  const workspaceFilter = session ? await getVirWorkspaceFilter() : null;

  return (
    <html lang="en">
      <body>
        <VirSyncRegistrar />
        {session ? <WorkspaceFilterSync workspace={session.workspace} /> : null}
        {session ? (
          <div className="erp-shell">
            <aside className="erp-sidebar">
              <div className="sidebar-profile">
                <div>
                  <div className="brand-title brand-title-large">PMSLink IR</div>
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

              <WorkspaceNav items={workspaceNavigation(session.workspace, workspaceFilter)} />

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
                  <h1 className="app-title">Inspection Reports</h1>
                </div>

                <div className="topbar-utility-nav">
                  <Link
                    aria-label="Dashboard"
                    className="topbar-icon-link"
                    href={buildWorkspaceHref("/", session.workspace, workspaceFilter)}
                    title="Dashboard"
                  >
                    <House size={18} />
                  </Link>
                  <Link
                    aria-label="Vessel list"
                    className="topbar-icon-link"
                    href={buildWorkspaceHref("/vessels", session.workspace, workspaceFilter)}
                    title="Vessel list"
                  >
                    <Anchor size={18} />
                  </Link>
                  <Link
                    aria-label="Approved inspections"
                    className="topbar-icon-link"
                    href={buildWorkspaceHref("/inspections?scope=approved", session.workspace, workspaceFilter)}
                    title="Approved inspections"
                  >
                    <ShieldCheck size={18} />
                  </Link>
                  <Link
                    aria-label="Inspection history"
                    className="topbar-icon-link"
                    href={buildWorkspaceHref("/inspections?scope=history", session.workspace, workspaceFilter)}
                    title="Inspection history"
                  >
                    <History size={18} />
                  </Link>
                  <Link
                    aria-label="Inspection Calendar"
                    className="topbar-icon-link"
                    href={buildWorkspaceHref("/schedule", session.workspace, workspaceFilter)}
                    title="Inspection Calendar"
                  >
                    <CalendarDays size={18} />
                  </Link>
                  <Link
                    aria-label="Analytics Boards"
                    className="topbar-icon-link"
                    href={buildWorkspaceHref("/dashboards", session.workspace, workspaceFilter)}
                    title="Analytics Boards"
                  >
                    <Grid2x2 size={18} />
                  </Link>
                  {session.workspace === "OFFICE" ? (
                    <Link
                      aria-label="Library Register"
                      className="topbar-icon-link"
                      href="/register"
                      title="Library Register"
                    >
                      <BookOpen size={18} />
                    </Link>
                  ) : null}
                  <button aria-label="Notifications" className="topbar-icon-link" title="Notifications" type="button">
                    <Bell size={18} />
                  </button>
                  <Link
                    aria-label="Help"
                    className="topbar-help-link"
                    href={buildWorkspaceHref("/instruction", session.workspace, workspaceFilter)}
                    rel="noreferrer"
                    target="_blank"
                    title="Help"
                  >
                    <HelpCircle size={18} />
                    <span>Help</span>
                  </Link>
                  <form action={logoutAction}>
                    <button aria-label="Logout" className="topbar-icon-link topbar-icon-link-danger" title="Logout" type="submit">
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
