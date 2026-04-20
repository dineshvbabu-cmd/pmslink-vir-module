"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSessionToken, VIR_SESSION_COOKIE, type VirSession } from "@/lib/vir/session";
import { toStringOrNull } from "@/lib/vir/workflow";

type OfficeUser = {
  username: string;
  password: string;
  actorName: string;
  actorRole: string;
  dashboardVesselCodes?: string[];
  dashboardScopeLabel?: string;
};

const OFFICE_USERS: OfficeUser[] = [
  { username: "office.qhse", password: "PMSLink@2026", actorName: "Office QHSE Desk", actorRole: "QHSE Superintendent" },
  { username: "office.marine", password: "PMSLink@2026", actorName: "Office Marine Desk", actorRole: "Marine Superintendent" },
  { username: "office.tech", password: "PMSLink@2026", actorName: "Office Technical Desk", actorRole: "Technical Superintendent" },
  {
    username: "office.tsi",
    password: "PMSLink@2026",
    actorName: "TSI Control Desk",
    actorRole: "TSI Superintendent",
    dashboardVesselCodes: ["UM-DMO-001", "UM-DMO-002"],
    dashboardScopeLabel: "TSI assigned vessels",
  },
];

const VESSEL_USERS = [
  { username: "master", password: "Vessel@2026", actorRole: "Master" },
  { username: "chief.engineer", password: "Vessel@2026", actorRole: "Chief Engineer" },
  { username: "chief.officer", password: "Vessel@2026", actorRole: "Chief Officer" },
] as const;

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 12,
  };
}

export async function loginAction(formData: FormData) {
  const workspace = toStringOrNull(formData.get("workspace"));
  const username = toStringOrNull(formData.get("username"))?.toLowerCase();
  const password = toStringOrNull(formData.get("password"));
  let session: Omit<VirSession, "exp"> | null = null;

  if (!username || !password) {
    throw new Error("Username and password are required.");
  }

  if (workspace === "OFFICE") {
    const matchedUser = OFFICE_USERS.find((user) => user.username === username && user.password === password);

    if (!matchedUser) {
      throw new Error("Invalid office credentials.");
    }

    session = {
      workspace: "OFFICE",
      actorName: matchedUser.actorName,
      actorRole: matchedUser.actorRole,
      vesselId: null,
      vesselName: null,
      username: matchedUser.username,
      dashboardVesselCodes: matchedUser.dashboardVesselCodes ?? null,
      dashboardScopeLabel: matchedUser.dashboardScopeLabel ?? null,
    };
  }

  if (workspace === "VESSEL") {
    const vesselId = toStringOrNull(formData.get("vesselId"));
    const matchedUser = VESSEL_USERS.find((user) => user.username === username && user.password === password);

    if (!matchedUser) {
      throw new Error("Invalid vessel credentials.");
    }

    if (!vesselId) {
      throw new Error("Select a vessel for vessel login.");
    }

    const vessel = await prisma.vessel.findUnique({
      where: { id: vesselId },
      select: { id: true, code: true, name: true },
    });

    if (!vessel) {
      throw new Error("Selected vessel could not be found.");
    }

    session = {
      workspace: "VESSEL",
      actorName: `${vessel.name} ${matchedUser.actorRole}`,
      actorRole: matchedUser.actorRole,
      vesselId: vessel.id,
      vesselName: vessel.name,
      username: matchedUser.username,
      dashboardVesselCodes: [vessel.code],
      dashboardScopeLabel: vessel.name,
    };
  }

  if (!session) {
    throw new Error("Invalid login selection.");
  }

  const cookieStore = await cookies();
  cookieStore.set(VIR_SESSION_COOKIE, createSessionToken(session), cookieOptions());
  redirect("/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(VIR_SESSION_COOKIE);
  redirect("/login");
}
