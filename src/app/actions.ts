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
import { summarizeProgress } from "@/lib/vir/analytics";
import { carryForwardOpenItems, findCarryForwardSourceInspection } from "@/lib/vir/carryover";
import { normalizeVirTemplateImport } from "@/lib/vir/import";
import { canAccessVessel, isOfficeSession, isVesselSession, requireVirSession, type VirSession } from "@/lib/vir/session";
import {
  answerPayloadForQuestion,
  syncInspectionCounters,
  toDateOrNull,
  toStringOrNull,
} from "@/lib/vir/workflow";

function revalidateVirPaths(inspectionId?: string) {
  revalidatePath("/");
  revalidatePath("/schedule");
  revalidatePath("/inspections");
  revalidatePath("/inspections/new");
  revalidatePath("/templates");
  revalidatePath("/imports");

  if (inspectionId) {
    revalidatePath(`/inspections/${inspectionId}`);
    revalidatePath(`/reports/inspection/${inspectionId}`);
  }
}

function ensureOffice(session: VirSession, message = "Office workspace required for this action.") {
  if (!isOfficeSession(session)) {
    throw new Error(message);
  }
}

function ensureInspectionAccess(session: VirSession, vesselId: string) {
  if (!canAccessVessel(session, vesselId)) {
    throw new Error("This VIR is not available in your current workspace.");
  }
}

async function getInspectionAccess(inspectionId: string) {
  const session = await requireVirSession();
  const inspection = await prisma.virInspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      vesselId: true,
      status: true,
    },
  });

  if (!inspection) {
    throw new Error("Inspection could not be found.");
  }

  ensureInspectionAccess(session, inspection.vesselId);
  return { session, inspection };
}

export async function createInspectionAction(formData: FormData) {
  const session = await requireVirSession();
  const requestedVesselId = toStringOrNull(formData.get("vesselId"));
  const inspectionTypeId = toStringOrNull(formData.get("inspectionTypeId"));
  const templateIdInput = toStringOrNull(formData.get("templateId"));
  const title = toStringOrNull(formData.get("title"));
  const vesselId = isVesselSession(session) ? session.vesselId : requestedVesselId;
  const inspectionDate = toDateOrNull(formData.get("inspectionDate")) ?? new Date();

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

  const carryForwardSource = await findCarryForwardSourceInspection(vesselId, inspectionTypeId, inspectionDate);

  const inspection = await prisma.virInspection.create({
    data: {
      vesselId,
      inspectionTypeId,
      templateId,
      title,
      inspectionDate,
      port: toStringOrNull(formData.get("port")),
      country: toStringOrNull(formData.get("country")),
      inspectorName: toStringOrNull(formData.get("inspectorName")) ?? session.actorName,
      inspectorCompany: toStringOrNull(formData.get("inspectorCompany")),
      externalReference: toStringOrNull(formData.get("externalReference")),
      summary: toStringOrNull(formData.get("summary")),
      status: "DRAFT",
      previousInspectionId: carryForwardSource?.id ?? null,
      metadata: {
        createdByWorkspace: session.workspace,
        createdByActor: session.actorName,
        carryForwardCandidateCount: carryForwardSource?.findings.length ?? 0,
      },
    },
    select: { id: true },
  });

  if (carryForwardSource?.findings.length) {
    await carryForwardOpenItems(carryForwardSource.id, inspection.id);
    await syncInspectionCounters(inspection.id);
  }

  revalidateVirPaths(inspection.id);
  redirect(`/inspections/${inspection.id}`);
}

export async function updateInspectionStatusAction(inspectionId: string, nextStatus: VirInspectionStatus) {
  const session = await requireVirSession();
  const inspection = await prisma.virInspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      vesselId: true,
      template: {
        select: {
          sections: {
            select: {
              questions: {
                select: {
                  id: true,
                  responseType: true,
                  riskLevel: true,
                  isMandatory: true,
                },
              },
            },
          },
        },
      },
      answers: {
        select: {
          questionId: true,
          answerText: true,
          answerNumber: true,
          answerBoolean: true,
          selectedOptions: true,
        },
      },
      signOffs: {
        select: {
          stage: true,
          approved: true,
        },
      },
      findings: {
        select: {
          correctiveActions: {
            select: { status: true },
          },
        },
      },
    },
  });

  if (!inspection) {
    throw new Error("Inspection could not be found.");
  }

  ensureInspectionAccess(session, inspection.vesselId);

  if (nextStatus === "SUBMITTED") {
    if (!isVesselSession(session)) {
      throw new Error("Only vessel workspaces can submit an inspection to shore.");
    }

    const questions = inspection.template?.sections.flatMap((section) => section.questions) ?? [];
    const progress = summarizeProgress(questions, inspection.answers);

    if (questions.length === 0) {
      throw new Error("Attach a questionnaire template before submitting this VIR.");
    }

    if (progress.answeredMandatory < progress.mandatoryQuestions) {
      throw new Error("All mandatory questionnaire items must be answered before submission.");
    }

    await prisma.virInspection.update({
      where: { id: inspectionId },
      data: { status: "SUBMITTED" },
    });

    await prisma.virSignOff.create({
      data: {
        inspectionId,
        stage: "VESSEL_SUBMISSION",
        approved: true,
        actorName: session.actorName,
        actorRole: session.actorRole,
        comment: "Submitted from vessel workspace for office review.",
      },
    });
  } else if (nextStatus === "RETURNED") {
    ensureOffice(session, "Only office workspaces can return an inspection.");

    await prisma.virInspection.update({
      where: { id: inspectionId },
      data: { status: "RETURNED" },
    });
  } else if (nextStatus === "SHORE_REVIEWED") {
    ensureOffice(session, "Only office workspaces can mark shore review.");

    await prisma.virInspection.update({
      where: { id: inspectionId },
      data: {
        status: "SHORE_REVIEWED",
        shoreReviewedBy: session.actorName,
        shoreReviewDate: new Date(),
      },
    });

    await prisma.virSignOff.create({
      data: {
        inspectionId,
        stage: "SHORE_REVIEW",
        approved: true,
        actorName: session.actorName,
        actorRole: session.actorRole,
        comment: "Reviewed and released by office control tower.",
      },
    });
  } else if (nextStatus === "CLOSED") {
    ensureOffice(session, "Only office workspaces can close a VIR.");

    const hasShoreReview = inspection.signOffs.some((signOff) => signOff.stage === "SHORE_REVIEW" && signOff.approved);
    const hasFinalAcknowledgement = inspection.signOffs.some(
      (signOff) => signOff.stage === "FINAL_ACKNOWLEDGEMENT" && signOff.approved
    );
    const pendingCorrectiveActions = inspection.findings.flatMap((finding) => finding.correctiveActions).filter((action) =>
      ["OPEN", "IN_PROGRESS", "REJECTED"].includes(action.status)
    );

    if (!hasShoreReview) {
      throw new Error("Office review sign-off is required before closing the VIR.");
    }

    if (!hasFinalAcknowledgement) {
      throw new Error("Vessel final acknowledgement is required before closure.");
    }

    if (pendingCorrectiveActions.length > 0) {
      throw new Error("All corrective actions must be completed or verified before closure.");
    }

    await prisma.virInspection.update({
      where: { id: inspectionId },
      data: {
        status: "CLOSED",
        closedAt: new Date(),
      },
    });
  } else {
    await prisma.virInspection.update({
      where: { id: inspectionId },
      data: {
        status: nextStatus,
      },
    });
  }

  revalidateVirPaths(inspectionId);
}

export async function saveInspectionAnswersAction(inspectionId: string, formData: FormData) {
  const { session, inspection } = await getInspectionAccess(inspectionId);

  if (!isVesselSession(session)) {
    throw new Error("Questionnaire answers are maintained from the vessel workspace.");
  }

  const inspectionTemplate = await prisma.virInspection.findUnique({
    where: { id: inspection.id },
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

  if (!inspectionTemplate?.template) {
    throw new Error("This inspection does not yet have a questionnaire template.");
  }

  for (const section of inspectionTemplate.template.sections) {
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
        update: {
          ...payload,
          answeredBy: session.actorName,
        },
        create: {
          inspectionId,
          questionId: question.id,
          ...payload,
          answeredBy: session.actorName,
        },
      });
    }
  }

  revalidateVirPaths(inspectionId);
}

export async function addFindingAction(inspectionId: string, formData: FormData) {
  const { session, inspection } = await getInspectionAccess(inspectionId);
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
      shoreFeedback: isOfficeSession(session) ? "Raised from office review lane." : null,
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

  await syncInspectionCounters(inspection.id);
  revalidateVirPaths(inspection.id);
}

export async function updateFindingStatusAction(
  inspectionId: string,
  findingId: string,
  status: VirFindingStatus
) {
  const session = await requireVirSession();
  const finding = await prisma.virFinding.findUnique({
    where: { id: findingId },
    select: {
      id: true,
      inspection: {
        select: {
          id: true,
          vesselId: true,
        },
      },
    },
  });

  if (!finding || finding.inspection.id !== inspectionId) {
    throw new Error("Finding could not be found.");
  }

  ensureInspectionAccess(session, finding.inspection.vesselId);

  if (status === "CLOSED") {
    ensureOffice(session, "Only office workspaces can close findings.");
  }

  await prisma.virFinding.update({
    where: { id: findingId },
    data: {
      status,
      closedAt: status === "CLOSED" ? new Date() : null,
      closedBy: status === "CLOSED" ? session.actorName : null,
    },
  });

  await syncInspectionCounters(inspectionId);
  revalidateVirPaths(inspectionId);
}

export async function addCorrectiveActionAction(inspectionId: string, findingId: string, formData: FormData) {
  const session = await requireVirSession();
  const finding = await prisma.virFinding.findUnique({
    where: { id: findingId },
    select: {
      inspection: {
        select: {
          id: true,
          vesselId: true,
        },
      },
    },
  });

  if (!finding || finding.inspection.id !== inspectionId) {
    throw new Error("Finding could not be found.");
  }

  ensureInspectionAccess(session, finding.inspection.vesselId);

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
  const session = await requireVirSession();
  const action = await prisma.virCorrectiveAction.findUnique({
    where: { id: actionId },
    select: {
      finding: {
        select: {
          inspection: {
            select: {
              id: true,
              vesselId: true,
            },
          },
        },
      },
    },
  });

  if (!action || action.finding.inspection.id !== inspectionId) {
    throw new Error("Corrective action could not be found.");
  }

  ensureInspectionAccess(session, action.finding.inspection.vesselId);

  if (status === "VERIFIED") {
    ensureOffice(session, "Only office workspaces can verify corrective actions.");
  }

  await prisma.virCorrectiveAction.update({
    where: { id: actionId },
    data: {
      status,
      completedAt: status === "COMPLETED" || status === "VERIFIED" ? new Date() : null,
      verifiedAt: status === "VERIFIED" ? new Date() : null,
      verifiedBy: status === "VERIFIED" ? session.actorName : null,
    },
  });

  revalidateVirPaths(inspectionId);
}

export async function addSignOffAction(inspectionId: string, formData: FormData) {
  const session = await requireVirSession();
  const inspection = await prisma.virInspection.findUnique({
    where: { id: inspectionId },
    select: {
      id: true,
      vesselId: true,
    },
  });

  if (!inspection) {
    throw new Error("Inspection could not be found.");
  }

  ensureInspectionAccess(session, inspection.vesselId);

  const stage = (toStringOrNull(formData.get("stage")) ?? "VESSEL_SUBMISSION") as VirSignOffStage;
  const approved = (toStringOrNull(formData.get("approved")) ?? "YES") === "YES";

  if (stage === "SHORE_REVIEW") {
    ensureOffice(session, "Only office workspaces can record shore review sign-off.");
  }

  if ((stage === "VESSEL_SUBMISSION" || stage === "FINAL_ACKNOWLEDGEMENT") && !isVesselSession(session)) {
    throw new Error("Only vessel workspaces can record vessel sign-off stages.");
  }

  await prisma.virSignOff.create({
    data: {
      inspectionId,
      stage,
      approved,
      actorName: session.actorName,
      actorRole: session.actorRole,
      comment: toStringOrNull(formData.get("comment")),
    },
  });

  if (!approved && stage === "SHORE_REVIEW") {
    await prisma.virInspection.update({
      where: { id: inspectionId },
      data: { status: "RETURNED" },
    });
  }

  revalidateVirPaths(inspectionId);
}

export async function submitTemplateImportAction(formData: FormData) {
  const session = await requireVirSession();
  ensureOffice(session);

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

    const sessionRecord = await prisma.virImportSession.create({
      data: {
        inspectionTypeId: inspectionType.id,
        sourceFileName: `${normalized.templateName}.json`,
        sourceSystem: "Template JSON Console",
        sourceType: "JSON_TEMPLATE",
        status: "COMMITTED",
        payload: normalized,
        extractedAt: new Date(),
        confidenceAvg: 1,
        createdBy: session.actorName,
      },
      select: { id: true },
    });

    importSessionId = sessionRecord.id;
  } else {
    const sessionRecord = await prisma.virImportSession.create({
      data: {
        sourceFileName: `${normalized.templateName}.json`,
        sourceSystem: "Template JSON Console",
        sourceType: "JSON_TEMPLATE",
        status: "REVIEW",
        payload: normalized,
        extractedAt: new Date(),
        confidenceAvg: 0.82,
        createdBy: session.actorName,
      },
      select: { id: true },
    });

    importSessionId = sessionRecord.id;
  }

  revalidateVirPaths();
  redirect(`/imports?session=${importSessionId}`);
}
