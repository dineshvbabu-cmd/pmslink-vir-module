import { createHmac, timingSafeEqual } from "node:crypto";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";

export const VIR_SESSION_COOKIE = "vir_workspace_session";
export const VIR_FILTER_COOKIE = "vir_workspace_filter";

export type VirWorkspace = "OFFICE" | "VESSEL";

export type VirSession = {
  workspace: VirWorkspace;
  actorName: string;
  actorRole: string;
  vesselId: string | null;
  vesselName: string | null;
  username: string;
  dashboardVesselCodes?: string[] | null;
  dashboardScopeLabel?: string | null;
  exp: number;
};

export type WorkspaceNavItem = {
  href: string;
  label: string;
  note: string;
};

export type VirWorkspaceFilter = {
  vesselId?: string | null;
  range?: string | null;
  fleet?: string | null;
  updatedAt?: number | null;
};

const officeNavigation: WorkspaceNavItem[] = [
  { href: "/", label: "Dashboard", note: "VIR dashboard" },
  { href: "/inspections?scope=approved", label: "Approved inspections", note: "Approved register" },
  { href: "/inspections?scope=history", label: "Inspection history", note: "All inspection records" },
  { href: "/schedule", label: "VIR Calendar", note: "Planner and compliance status" },
  { href: "/instruction", label: "Instruction", note: "Workflow and sync guidance" },
  { href: "/dashboards", label: "Analytics Boards", note: "Fleet, vessel, class, vetting" },
  { href: "/inspections?scope=shore-review", label: "Review Queue", note: "Office actions" },
  { href: "/inspections", label: "Inspection Register", note: "Fleet-wide" },
  { href: "/inspections/new", label: "Create VIR", note: "Schedule or launch" },
  { href: "/templates", label: "Template Library", note: "Questionnaires" },
  { href: "/imports", label: "Import Engine", note: "Checklist normalization" },
];

const vesselNavigation: WorkspaceNavItem[] = [
  { href: "/", label: "Dashboard", note: "Vessel dashboard" },
  { href: "/inspections?scope=history", label: "Inspection history", note: "My vessel record" },
  { href: "/schedule", label: "VIR Calendar", note: "My upcoming plan" },
  { href: "/instruction", label: "Instruction", note: "Execution and sync guidance" },
  { href: "/dashboards", label: "Analytics Boards", note: "My vessel boards" },
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
      dashboardVesselCodes: Array.isArray(parsed.dashboardVesselCodes)
        ? parsed.dashboardVesselCodes.filter((value): value is string => typeof value === "string" && value.length > 0)
        : null,
      dashboardScopeLabel: typeof parsed.dashboardScopeLabel === "string" ? parsed.dashboardScopeLabel : null,
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

function parseVirWorkspaceFilter(token: string | undefined | null): VirWorkspaceFilter | null {
  if (!token) {
    return null;
  }

  try {
    const parsed = JSON.parse(token) as VirWorkspaceFilter;
    const vesselId = typeof parsed.vesselId === "string" && parsed.vesselId.length > 0 ? parsed.vesselId : null;
    const range = typeof parsed.range === "string" && parsed.range.length > 0 ? parsed.range : null;
    const fleet = typeof parsed.fleet === "string" && parsed.fleet.length > 0 ? parsed.fleet : null;
    const updatedAt = typeof parsed.updatedAt === "number" ? parsed.updatedAt : null;

    if (!vesselId && !range && !fleet) {
      return null;
    }

    return {
      vesselId,
      range,
      fleet,
      updatedAt,
    };
  } catch {
    return null;
  }
}

export async function getVirWorkspaceFilter() {
  const cookieStore = await cookies();
  return parseVirWorkspaceFilter(cookieStore.get(VIR_FILTER_COOKIE)?.value);
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

export function isTsiSession(session: VirSession | null) {
  return Boolean(session && session.workspace === "OFFICE" && session.actorRole.toUpperCase().includes("TSI"));
}

export function canAccessVessel(session: VirSession, vesselId: string) {
  return session.workspace === "OFFICE" || session.vesselId === vesselId;
}

export function defaultDashboardScopedVesselCodes(session: VirSession | null) {
  if (!session) {
    return [];
  }

  if (session.workspace === "VESSEL" || isTsiSession(session)) {
    return session.dashboardVesselCodes ?? [];
  }

  return [];
}

export function workspaceLabel(workspace: VirWorkspace) {
  return workspace === "OFFICE" ? "Office Control Tower" : "Vessel Workspace";
}

export function workspaceShortLabel(workspace: VirWorkspace) {
  return workspace === "OFFICE" ? "Office" : "Vessel";
}

const vesselScopedRoutes = new Set(["/", "/inspections", "/schedule", "/dashboards"]);

export function buildWorkspaceHref(href: string, workspace: VirWorkspace, filter?: VirWorkspaceFilter | null) {
  if (workspace !== "OFFICE" || !filter) {
    return href;
  }

  const url = new URL(href, "https://pmslink.local");

  if (filter.vesselId && vesselScopedRoutes.has(url.pathname) && !url.searchParams.has("vesselId")) {
    url.searchParams.set("vesselId", filter.vesselId);
  }

  if (url.pathname === "/" && filter.fleet && !url.searchParams.has("fleet")) {
    url.searchParams.set("fleet", filter.fleet);
  }

  if ((url.pathname === "/" || url.pathname === "/dashboards") && filter.range && !url.searchParams.has("range")) {
    url.searchParams.set("range", filter.range);
  }

  const nextQuery = url.searchParams.toString();
  return `${url.pathname}${nextQuery ? `?${nextQuery}` : ""}`;
}

export function workspaceNavigation(workspace: VirWorkspace, filter?: VirWorkspaceFilter | null) {
  const source = workspace === "OFFICE" ? officeNavigation : vesselNavigation;
  return source.map((item) => ({
    ...item,
    href: buildWorkspaceHref(item.href, workspace, filter),
  }));
}

export function workspaceAccent(workspace: VirWorkspace) {
  return workspace === "OFFICE" ? "chip-info" : "chip-success";
}
