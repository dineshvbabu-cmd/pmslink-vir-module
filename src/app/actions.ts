"use server";

import type {
  VirCorrectiveActionStatus,
  VirFindingStatus,
  VirInspectionStatus,
  VirSignOffStage,
} from "@prisma/client";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import {
  answerPayloadForQuestion,
  syncInspectionCounters,
  toDateOrNull,
  toStringOrNull,
} from "@/lib/vir/workflow";
import { normalizeVirTemplateImport } from "@/lib/vir/import";

function revalidateVirPaths(inspectionId?: string) {
  revalidatePath("/");
  revalidatePath("/inspections");
  revalidatePath("/templates");
  revalidatePath("/imports");

  if (inspectionId) {
    revalidatePath(`/inspections/${inspectionId}`);
  }
}

export async function createInspectionAction(formData: FormData) {
  const vesselId = toStringOrNull(formData.get("vesselId"));
  const inspectionTypeId = toStringOrNull(formData.get("inspectionTypeId"));
  const templateIdInput = toStringOrNull(formData.get("templateId"));
  const title = toStringOrNull(formData.get("title"));

  if (!vesselId || !inspectionTypeId || !title) {
    throw new Error("Vessel, inspection type, and title are required.");
  }

  let templateId = templateIdInput;

  if (!templateId) {
    const latestTemplate = await prisma.virTemplate.findFirst({
      where: { inspectionTypeId },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });

    templateId = latestTemplate?.id ?? null;
  }

  const inspection = await prisma.virInspection.create({
    data: {
      vesselId,
      inspectionTypeId,
      templateId,
      title,
      inspectionDate: toDateOrNull(formData.get("inspectionDate")) ?? new Date(),
      port: toStringOrNull(formData.get("port")),
      country: toStringOrNull(formData.get("country")),
      inspectorName: toStringOrNull(formData.get("inspectorName")),
      inspectorCompany: toStringOrNull(formData.get("inspectorCompany")),
      externalReference: toStringOrNull(formData.get("externalReference")),
      summary: toStringOrNull(formData.get("summary")),
      status: "DRAFT",
    },
    select: { id: true },
  });

  revalidateVirPaths(inspection.id);
  redirect(`/inspections/${inspection.id}`);
}

export async function updateInspectionStatusAction(inspectionId: string, nextStatus: VirInspectionStatus) {
  await prisma.virInspection.update({
    where: { id: inspectionId },
    data: {
      status: nextStatus,
      closedAt: nextStatus === "CLOSED" ? new Date() : null,
      shoreReviewDate: nextStatus === "SHORE_REVIEWED" ? new Date() : undefined,
    },
  });

  revalidateVirPaths(inspectionId);
}

export async function saveInspectionAnswersAction(inspectionId: string, formData: FormData) {
  const inspection = await prisma.virInspection.findUnique({
    where: { id: inspectionId },
    select: {
      template: {
        select: {
          sections: {
            select: {
              questions: {
                select: {
                  id: true,
                  responseType: true,
                },
              },
            },
          },
        },
      },
    },
  });

  if (!inspection?.template) {
    throw new Error("This inspection does not yet have a questionnaire template.");
  }

  for (const section of inspection.template.sections) {
    for (const question of section.questions) {
      const fieldName = `q:${question.id}`;
      const commentName = `comment:${question.id}`;
      const rawValue =
        question.responseType === "MULTI_SELECT" ? formData.getAll(fieldName) : formData.get(fieldName);
      const comment = toStringOrNull(formData.get(commentName));
      const payload = answerPayloadForQuestion(question.responseType, rawValue, comment);

      const hasValue =
        payload.answerText !== null ||
        payload.answerNumber !== null ||
        payload.answerBoolean !== null ||
        payload.answerDate !== null ||
        (Array.isArray(payload.selectedOptions) && payload.selectedOptions.length > 0) ||
        payload.comment !== null;

      if (!hasValue) {
        continue;
      }

      await prisma.virAnswer.upsert({
        where: {
          inspectionId_questionId: {
            inspectionId,
            questionId: question.id,
          },
        },
        update: payload,
        create: {
          inspectionId,
          questionId: question.id,
          ...payload,
        },
      });
    }
  }

  revalidateVirPaths(inspectionId);
}

export async function addFindingAction(inspectionId: string, formData: FormData) {
  const questionId = toStringOrNull(formData.get("questionId"));

  const severity = (toStringOrNull(formData.get("severity")) ?? "MEDIUM") as "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  const findingType = (toStringOrNull(formData.get("findingType")) ?? "OBSERVATION") as
    | "NON_CONFORMITY"
    | "OBSERVATION"
    | "RECOMMENDATION"
    | "POSITIVE";

  const finding = await prisma.virFinding.create({
    data: {
      inspectionId,
      questionId,
      findingType,
      severity,
      title: toStringOrNull(formData.get("title")) ?? "Untitled finding",
      description: toStringOrNull(formData.get("description")) ?? "No description provided.",
      ownerName: toStringOrNull(formData.get("ownerName")),
      dueDate: toDateOrNull(formData.get("dueDate")),
      vesselResponse: toStringOrNull(formData.get("vesselResponse")),
      status: "OPEN",
    },
  });

  if (findingType !== "POSITIVE") {
    const autoDueDays = findingType === "NON_CONFORMITY" || severity === "HIGH" || severity === "CRITICAL" ? 14 : 30;
    const targetDate = new Date();
    targetDate.setDate(targetDate.getDate() + autoDueDays);

    await prisma.virCorrectiveAction.create({
      data: {
        findingId: finding.id,
        actionText: `Auto-generated CAR for ${finding.title}`,
        ownerName: toStringOrNull(formData.get("ownerName")),
        targetDate,
        status: "OPEN",
      },
    });
  }

  await syncInspectionCounters(inspectionId);
  revalidateVirPaths(inspectionId);
}

export async function updateFindingStatusAction(
  inspectionId: string,
  findingId: string,
  status: VirFindingStatus
) {
  await prisma.virFinding.update({
    where: { id: findingId },
    data: {
      status,
      closedAt: status === "CLOSED" ? new Date() : null,
    },
  });

  await syncInspectionCounters(inspectionId);
  revalidateVirPaths(inspectionId);
}

export async function addCorrectiveActionAction(inspectionId: string, findingId: string, formData: FormData) {
  await prisma.virCorrectiveAction.create({
    data: {
      findingId,
      actionText: toStringOrNull(formData.get("actionText")) ?? "Corrective action not described.",
      ownerName: toStringOrNull(formData.get("ownerName")),
      targetDate: toDateOrNull(formData.get("targetDate")),
      status: "OPEN",
    },
  });

  revalidateVirPaths(inspectionId);
}

export async function updateCorrectiveActionStatusAction(
  inspectionId: string,
  actionId: string,
  status: VirCorrectiveActionStatus
) {
  await prisma.virCorrectiveAction.update({
    where: { id: actionId },
    data: {
      status,
      completedAt: status === "COMPLETED" || status === "VERIFIED" ? new Date() : null,
      verifiedAt: status === "VERIFIED" ? new Date() : null,
    },
  });

  revalidateVirPaths(inspectionId);
}

export async function addSignOffAction(inspectionId: string, formData: FormData) {
  await prisma.virSignOff.create({
    data: {
      inspectionId,
      stage: (toStringOrNull(formData.get("stage")) ?? "VESSEL_SUBMISSION") as VirSignOffStage,
      approved: (toStringOrNull(formData.get("approved")) ?? "YES") === "YES",
      actorName: toStringOrNull(formData.get("actorName")),
      actorRole: toStringOrNull(formData.get("actorRole")),
      comment: toStringOrNull(formData.get("comment")),
    },
  });

  revalidateVirPaths(inspectionId);
}

export async function submitTemplateImportAction(formData: FormData) {
  const payloadText = toStringOrNull(formData.get("payload"));
  const mode = toStringOrNull(formData.get("mode")) ?? "dry-run";

  if (!payloadText) {
    throw new Error("Template payload is required.");
  }

  const parsedPayload = JSON.parse(payloadText);
  const { normalized } = normalizeVirTemplateImport(parsedPayload);

  let importSessionId: string | null = null;

  if (mode === "commit") {
    const inspectionType = await prisma.virInspectionType.upsert({
      where: { code: normalized.inspectionTypeCode },
      update: {
        name: normalized.inspectionTypeName,
        category: normalized.inspectionCategory,
      },
      create: {
        code: normalized.inspectionTypeCode,
        name: normalized.inspectionTypeName,
        category: normalized.inspectionCategory,
      },
    });

    const existingTemplate = await prisma.virTemplate.findFirst({
      where: {
        inspectionTypeId: inspectionType.id,
        version: normalized.version,
      },
      select: { id: true },
    });

    if (!existingTemplate) {
      await prisma.virTemplate.create({
        data: {
          inspectionTypeId: inspectionType.id,
          name: normalized.templateName,
          version: normalized.version,
          description: normalized.description,
          sections: {
            create: normalized.sections.map((section) => ({
              code: section.code,
              title: section.title,
              guidance: section.guidance,
              sortOrder: section.sortOrder,
              questions: {
                create: section.questions.map((question) => ({
                  code: question.code,
                  prompt: question.prompt,
                  responseType: question.responseType,
                  riskLevel: question.riskLevel,
                  isMandatory: question.isMandatory,
                  allowsObservation: question.allowsObservation,
                  allowsPhoto: question.allowsPhoto,
                  isCicCandidate: question.isCicCandidate,
                  cicTopic: question.cicTopic,
                  helpText: question.helpText,
                  referenceImageUrl: question.referenceImageUrl,
                  sortOrder: question.sortOrder,
                  options: {
                    create: question.options.map((option, optionIndex) => ({
                      value: option.value,
                      label: option.label,
                      score: option.score,
                      sortOrder: optionIndex + 1,
                    })),
                  },
                })),
              },
            })),
          },
        },
      });
    }

    const session = await prisma.virImportSession.create({
      data: {
        inspectionTypeId: inspectionType.id,
        sourceFileName: `${normalized.templateName}.json`,
        sourceSystem: "Template JSON Console",
        sourceType: "JSON_TEMPLATE",
        status: "COMMITTED",
        payload: normalized,
        extractedAt: new Date(),
        confidenceAvg: 1,
        createdBy: "Local Operator",
      },
      select: { id: true },
    });

    importSessionId = session.id;
  } else {
    const session = await prisma.virImportSession.create({
      data: {
        sourceFileName: `${normalized.templateName}.json`,
        sourceSystem: "Template JSON Console",
        sourceType: "JSON_TEMPLATE",
        status: "REVIEW",
        payload: normalized,
        extractedAt: new Date(),
        confidenceAvg: 0.82,
        createdBy: "Local Operator",
      },
      select: { id: true },
    });

    importSessionId = session.id;
  }

  revalidateVirPaths();
  redirect(`/imports?session=${importSessionId}`);
}
