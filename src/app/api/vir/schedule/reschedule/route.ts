import { revalidatePath } from "next/cache";
import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canAccessVessel, getVirSession, isOfficeSession } from "@/lib/vir/session";

const payloadSchema = z.object({
  inspectionId: z.string().min(1),
  inspectionDate: z.string().min(1),
});

export async function POST(request: Request) {
  const session = await getVirSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  if (!isOfficeSession(session)) {
    return NextResponse.json({ error: "Office scheduling permissions are required." }, { status: 403 });
  }

  const payload = payloadSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Invalid scheduling payload." }, { status: 400 });
  }

  const inspection = await prisma.virInspection.findUnique({
    where: { id: payload.data.inspectionId },
    select: {
      id: true,
      title: true,
      vesselId: true,
    },
  });

  if (!inspection || !canAccessVessel(session, inspection.vesselId)) {
    return NextResponse.json({ error: "Inspection was not found." }, { status: 404 });
  }

  const nextDate = new Date(payload.data.inspectionDate);

  if (Number.isNaN(nextDate.getTime())) {
    return NextResponse.json({ error: "Inspection date is invalid." }, { status: 400 });
  }

  const updated = await prisma.virInspection.update({
    where: { id: inspection.id },
    data: {
      inspectionDate: nextDate,
      metadata: {
        updatedByScheduler: session.actorName,
        updatedFromWorkspace: session.workspace,
        updatedAt: new Date().toISOString(),
      },
    },
    select: {
      id: true,
      inspectionDate: true,
      title: true,
    },
  });

  revalidatePath("/schedule");
  revalidatePath("/");
  revalidatePath("/dashboards");
  revalidatePath(`/inspections/${inspection.id}`);

  return NextResponse.json({
    ok: true,
    inspectionId: updated.id,
    title: updated.title,
    inspectionDate: updated.inspectionDate.toISOString(),
  });
}
