import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { canAccessVessel, getVirSession, isVesselSession } from "@/lib/vir/session";

const syncPayloadSchema = z.object({
  inspectionId: z.string().min(1),
  items: z
    .array(
      z.object({
        id: z.string().min(1),
        questionId: z.string().nullable().optional(),
        findingId: z.string().nullable().optional(),
        caption: z.string().nullable().optional(),
        fileName: z.string().min(1),
        contentType: z.string().min(1),
        fileSizeKb: z.number().nullable().optional(),
        takenAt: z.string().nullable().optional(),
        dataUrl: z.string().startsWith("data:image/"),
      })
    )
    .min(1)
    .max(10),
});

export async function POST(request: Request) {
  const session = await getVirSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  if (!isVesselSession(session)) {
    return NextResponse.json({ error: "Only vessel workspace can sync evidence." }, { status: 403 });
  }

  const payload = syncPayloadSchema.safeParse(await request.json());

  if (!payload.success) {
    return NextResponse.json({ error: "Evidence payload is invalid." }, { status: 400 });
  }

  const inspection = await prisma.virInspection.findUnique({
    where: { id: payload.data.inspectionId },
    select: {
      id: true,
      vesselId: true,
    },
  });

  if (!inspection || !canAccessVessel(session, inspection.vesselId)) {
    return NextResponse.json({ error: "Inspection was not found for this workspace." }, { status: 404 });
  }

  const questionIds = payload.data.items
    .map((item) => item.questionId)
    .filter((value): value is string => typeof value === "string" && value.length > 0);

  const answers = questionIds.length
    ? await prisma.virAnswer.findMany({
        where: {
          inspectionId: inspection.id,
          questionId: { in: questionIds },
        },
        select: {
          id: true,
          questionId: true,
        },
      })
    : [];

  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer.id]));

  for (const item of payload.data.items) {
    const answerId = item.questionId ? answerMap.get(item.questionId) ?? null : null;

    await prisma.virPhoto.create({
      data: {
        inspectionId: inspection.id,
        findingId: item.findingId ?? null,
        answerId,
        url: item.dataUrl,
        caption: item.caption ?? null,
        fileName: item.fileName,
        contentType: item.contentType,
        fileSizeKb: item.fileSizeKb ?? null,
        takenAt: item.takenAt ? new Date(item.takenAt) : new Date(),
        uploadedBy: session.actorName,
      },
    });

    if (answerId) {
      await prisma.virAnswer.update({
        where: { id: answerId },
        data: {
          evidenceCount: {
            increment: 1,
          },
        },
      });
    }
  }

  return NextResponse.json({
    ok: true,
    synced: payload.data.items.length,
  });
}
