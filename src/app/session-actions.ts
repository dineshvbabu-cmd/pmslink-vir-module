"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { VIR_SESSION_COOKIE, type VirSession } from "@/lib/vir/session";
import { toStringOrNull } from "@/lib/vir/workflow";

function cookieOptions() {
  return {
    httpOnly: true,
    sameSite: "lax" as const,
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 60 * 60 * 24 * 14,
  };
}

export async function loginAction(formData: FormData) {
  const workspace = toStringOrNull(formData.get("workspace"));
  const actorRole = toStringOrNull(formData.get("actorRole")) ?? (workspace === "OFFICE" ? "QHSE Superintendent" : "Master");
  let session: VirSession | null = null;

  if (workspace === "OFFICE") {
    session = {
      workspace: "OFFICE",
      actorName: "PMSLink Office Desk",
      actorRole,
      vesselId: null,
      vesselName: null,
    };
  }

  if (workspace === "VESSEL") {
    const vesselId = toStringOrNull(formData.get("vesselId"));

    if (!vesselId) {
      throw new Error("Select a vessel for vessel login.");
    }

    const vessel = await prisma.vessel.findUnique({
      where: { id: vesselId },
      select: { id: true, name: true },
    });

    if (!vessel) {
      throw new Error("Selected vessel could not be found.");
    }

    session = {
      workspace: "VESSEL",
      actorName: `${vessel.name} ${actorRole}`,
      actorRole,
      vesselId: vessel.id,
      vesselName: vessel.name,
    };
  }

  if (!session) {
    throw new Error("Invalid login selection.");
  }

  const cookieStore = await cookies();
  cookieStore.set(VIR_SESSION_COOKIE, JSON.stringify(session), cookieOptions());
  redirect("/");
}

export async function logoutAction() {
  const cookieStore = await cookies();
  cookieStore.delete(VIR_SESSION_COOKIE);
  redirect("/login");
}
