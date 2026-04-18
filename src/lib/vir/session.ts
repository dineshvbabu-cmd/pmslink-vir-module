import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export const VIR_SESSION_COOKIE = "vir_workspace_session";

export type VirWorkspace = "OFFICE" | "VESSEL";

export type VirSession = {
  workspace: VirWorkspace;
  actorName: string;
  actorRole: string;
  vesselId: string | null;
  vesselName: string | null;
};

export type WorkspaceNavItem = {
  href: string;
  label: string;
  note: string;
};

const officeNavigation: WorkspaceNavItem[] = [
  { href: "/", label: "Control Tower", note: "Fleet dashboard" },
  { href: "/inspections?scope=shore-review", label: "Review Queue", note: "Office actions" },
  { href: "/inspections", label: "Inspection Register", note: "Fleet-wide" },
  { href: "/inspections/new", label: "Create VIR", note: "Schedule or launch" },
  { href: "/templates", label: "Template Library", note: "Questionnaires" },
  { href: "/imports", label: "Import Engine", note: "External reports" },
];

const vesselNavigation: WorkspaceNavItem[] = [
  { href: "/", label: "My Workspace", note: "Vessel dashboard" },
  { href: "/inspections?scope=my-drafts", label: "My VIR Queue", note: "Draft and return" },
  { href: "/inspections", label: "Inspection Register", note: "Assigned to vessel" },
  { href: "/inspections/new", label: "Start VIR", note: "Self assessment" },
];

export function parseVirSession(value: string | undefined | null): VirSession | null {
  if (!value) {
    return null;
  }

  try {
    const parsed = JSON.parse(value) as Partial<VirSession>;

    if (
      (parsed.workspace !== "OFFICE" && parsed.workspace !== "VESSEL") ||
      typeof parsed.actorName !== "string" ||
      typeof parsed.actorRole !== "string"
    ) {
      return null;
    }

    return {
      workspace: parsed.workspace,
      actorName: parsed.actorName,
      actorRole: parsed.actorRole,
      vesselId: typeof parsed.vesselId === "string" ? parsed.vesselId : null,
      vesselName: typeof parsed.vesselName === "string" ? parsed.vesselName : null,
    };
  } catch {
    return null;
  }
}

export async function getVirSession() {
  const cookieStore = await cookies();
  return parseVirSession(cookieStore.get(VIR_SESSION_COOKIE)?.value);
}

export async function requireVirSession() {
  const session = await getVirSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

export function isOfficeSession(session: VirSession | null): session is VirSession & { workspace: "OFFICE" } {
  return session?.workspace === "OFFICE";
}

export function isVesselSession(session: VirSession | null): session is VirSession & { workspace: "VESSEL" } {
  return session?.workspace === "VESSEL";
}

export function canAccessVessel(session: VirSession, vesselId: string) {
  return session.workspace === "OFFICE" || session.vesselId === vesselId;
}

export function workspaceLabel(workspace: VirWorkspace) {
  return workspace === "OFFICE" ? "Office Control Tower" : "Vessel Workspace";
}

export function workspaceShortLabel(workspace: VirWorkspace) {
  return workspace === "OFFICE" ? "Office" : "Vessel";
}

export function workspaceNavigation(workspace: VirWorkspace) {
  return workspace === "OFFICE" ? officeNavigation : vesselNavigation;
}

export function workspaceAccent(workspace: VirWorkspace) {
  return workspace === "OFFICE" ? "chip-info" : "chip-success";
}
