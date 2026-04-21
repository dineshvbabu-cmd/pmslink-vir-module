import { NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { uploadToR2 } from "@/lib/r2";
import { canAccessVessel, getVirSession } from "@/lib/vir/session";

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
        dataUrl: z.string().startsWith("data:"),
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

  const syncedIds: string[] = [];
  const conflicts: Array<{ id: string; reason: string }> = [];

  for (const item of payload.data.items) {
    if (item.findingId) {
      const finding = await prisma.virFinding.findUnique({
        where: { id: item.findingId },
        select: { id: true, status: true },
      });

      if (finding && finding.status === "CLOSED") {
        conflicts.push({
          id: item.id,
          reason: "Target finding is already closed in the shared record. Re-link the photo to another finding or discard it.",
        });
        continue;
      }
    }

    const existingPhoto = await prisma.virPhoto.findFirst({
      where: {
        inspectionId: inspection.id,
        fileName: item.fileName,
        caption: item.caption ?? null,
      },
      select: { id: true },
    });

    if (existingPhoto) {
      conflicts.push({
        id: item.id,
        reason: "A matching evidence item already exists in the shared inspection log. Server copy kept to avoid duplication.",
      });
      continue;
    }

    let answerId = item.questionId ? answerMap.get(item.questionId) ?? null : null;

    if (!answerId && item.questionId) {
      const createdAnswer = await prisma.virAnswer.upsert({
        where: {
          inspectionId_questionId: {
            inspectionId: inspection.id,
            questionId: item.questionId,
          },
        },
        update: {},
        create: {
          inspectionId: inspection.id,
          questionId: item.questionId,
          comment: "Evidence uploaded before answer text entry.",
          answeredBy: session.actorName,
          answeredAt: new Date(),
        },
        select: {
          id: true,
        },
      });

      answerId = createdAnswer.id;
      answerMap.set(item.questionId, createdAnswer.id);
    }

    const [, base64Payload = ""] = item.dataUrl.split(",", 2);
    const upload = await uploadToR2({
      prefix: `evidence/${inspection.id}`,
      fileName: item.fileName,
      contentType: item.contentType,
      body: Buffer.from(base64Payload, "base64"),
    });

    await prisma.virPhoto.create({
      data: {
        inspectionId: inspection.id,
        findingId: item.findingId ?? null,
        answerId,
        url: upload?.url ?? item.dataUrl,
        storageKey: upload?.storageKey ?? null,
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

    syncedIds.push(item.id);
  }

  return NextResponse.json({
    ok: true,
    synced: syncedIds.length,
    syncedIds,
    conflicts,
  });
}
