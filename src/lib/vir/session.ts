import { createHmac, timingSafeEqual } from "node:crypto";
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
  username: string;
  exp: number;
};

export type WorkspaceNavItem = {
  href: string;
  label: string;
  note: string;
};

const officeNavigation: WorkspaceNavItem[] = [
  { href: "/", label: "Control Tower", note: "Fleet dashboard" },
  { href: "/schedule", label: "Scheduling Board", note: "Calendar and gantt" },
  { href: "/inspections?scope=shore-review", label: "Review Queue", note: "Office actions" },
  { href: "/inspections", label: "Inspection Register", note: "Fleet-wide" },
  { href: "/inspections/new", label: "Create VIR", note: "Schedule or launch" },
  { href: "/templates", label: "Template Library", note: "Questionnaires" },
  { href: "/imports", label: "Import Engine", note: "External reports" },
  { href: "/reports/management", label: "Management Pack", note: "Printable review" },
];

const vesselNavigation: WorkspaceNavItem[] = [
  { href: "/", label: "My Workspace", note: "Vessel dashboard" },
  { href: "/schedule", label: "Schedule", note: "My upcoming plan" },
  { href: "/inspections?scope=my-drafts", label: "My VIR Queue", note: "Draft and return" },
  { href: "/inspections", label: "Inspection Register", note: "Assigned to vessel" },
  { href: "/inspections/new", label: "Start VIR", note: "Self assessment" },
];

function secret() {
  return process.env.NEXTAUTH_SECRET ?? process.env.SEED_SECRET ?? "demo-vir-secret";
}

function base64UrlEncode(value: string) {
  return Buffer.from(value, "utf8").toString("base64url");
}

function base64UrlDecode(value: string) {
  return Buffer.from(value, "base64url").toString("utf8");
}

function sign(value: string) {
  return createHmac("sha256", secret()).update(value).digest("base64url");
}

export function createSessionToken(session: Omit<VirSession, "exp">, maxAgeSeconds = 60 * 60 * 12) {
  const header = base64UrlEncode(JSON.stringify({ alg: "HS256", typ: "JWT" }));
  const payload = base64UrlEncode(
    JSON.stringify({
      ...session,
      exp: Math.floor(Date.now() / 1000) + maxAgeSeconds,
    } satisfies VirSession)
  );
  const signature = sign(`${header}.${payload}`);
  return `${header}.${payload}.${signature}`;
}

export function parseVirSession(token: string | undefined | null): VirSession | null {
  if (!token) {
    return null;
  }

  const parts = token.split(".");

  if (parts.length !== 3) {
    return null;
  }

  const [header, payload, signature] = parts;
  const expectedSignature = sign(`${header}.${payload}`);

  try {
    if (!timingSafeEqual(Buffer.from(signature), Buffer.from(expectedSignature))) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(base64UrlDecode(payload)) as Partial<VirSession>;

    if (
      (parsed.workspace !== "OFFICE" && parsed.workspace !== "VESSEL") ||
      typeof parsed.actorName !== "string" ||
      typeof parsed.actorRole !== "string" ||
      typeof parsed.username !== "string" ||
      typeof parsed.exp !== "number"
    ) {
      return null;
    }

    if (parsed.exp <= Math.floor(Date.now() / 1000)) {
      return null;
    }

    return {
      workspace: parsed.workspace,
      actorName: parsed.actorName,
      actorRole: parsed.actorRole,
      vesselId: typeof parsed.vesselId === "string" ? parsed.vesselId : null,
      vesselName: typeof parsed.vesselName === "string" ? parsed.vesselName : null,
      username: parsed.username,
      exp: parsed.exp,
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
