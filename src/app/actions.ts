"use server";

import { Prisma } from "@prisma/client";
import type {
  VirCorrectiveActionStatus,
  VirFindingStatus,
  VirInspectionStatus,
  VirLibraryValueKind,
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

const VIR_RESPONSE_TYPES = ["YES_NO_NA", "TEXT", "NUMBER", "DATE", "SINGLE_SELECT", "MULTI_SELECT", "SCORE"] as const;
const VIR_RISK_LEVELS = ["LOW", "MEDIUM", "HIGH", "CRITICAL"] as const;
type VirQuestionResponseType = (typeof VIR_RESPONSE_TYPES)[number];
type VirRiskLevel = (typeof VIR_RISK_LEVELS)[number];

function revalidateVirPaths(inspectionId?: string) {
  revalidatePath("/");
  revalidatePath("/register");
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

function toBooleanFlag(value: FormDataEntryValue | null) {
  const normalized = toStringOrNull(value)?.toUpperCase();
  if (normalized === "YES" || normalized === "TRUE") {
    return true;
  }

  if (normalized === "NO" || normalized === "FALSE") {
    return false;
  }

  return null;
}

function buildInspectionMetadata(formData: FormData, inspectionTypeName: string) {
  return {
    reportType: toStringOrNull(formData.get("reportType")),
    inspectionMode: toStringOrNull(formData.get("inspectionMode")),
    inspectionFromDate: toStringOrNull(formData.get("inspectionFromDate")),
    inspectionToDate: toStringOrNull(formData.get("inspectionToDate")),
    dateLastInspected: toStringOrNull(formData.get("dateLastInspected")),
    placeLastInspected: toStringOrNull(formData.get("placeLastInspected")),
    placeOfInspectionFrom: toStringOrNull(formData.get("placeOfInspectionFrom")),
    durationOnBoard: toStringOrNull(formData.get("durationOnBoard")),
    location: toStringOrNull(formData.get("location")),
    alongsideBy: toStringOrNull(formData.get("alongsideBy")),
    operationsAtInspection: toStringOrNull(formData.get("operationsAtInspection")),
    otherPartiesInspected: toStringOrNull(formData.get("otherPartiesInspected")),
    draftAft: toStringOrNull(formData.get("draftAft")),
    lastPortOfCall: toStringOrNull(formData.get("lastPortOfCall")),
    inspectionBasedOnIncidents: toBooleanFlag(formData.get("inspectionBasedOnIncidents")),
    inspectionBasedOnExternal: toBooleanFlag(formData.get("inspectionBasedOnExternal")),
    inspectionAuthority: toStringOrNull(formData.get("inspectionAuthority")),
    crewParticulars: {
      nationalityOfMasterAndChiefEngineer: toStringOrNull(formData.get("nationalityOfMasterAndChiefEngineer")),
      numberAndNationalityOfOfficers: toStringOrNull(formData.get("numberAndNationalityOfOfficers")),
      numberAndNationalityOfCrew: toStringOrNull(formData.get("numberAndNationalityOfCrew")),
      minimumSafeManningCrew: toStringOrNull(formData.get("minimumSafeManningCrew")),
      mastersName: toStringOrNull(formData.get("mastersName")),
      chiefEngineersName: toStringOrNull(formData.get("chiefEngineersName")),
    },
    screenSelections: {
      causeAnalysisTarget: toStringOrNull(formData.get("causeAnalysisTarget")),
      correctiveActionPlanTarget: toStringOrNull(formData.get("correctiveActionPlanTarget")),
    },
    inspectionTypeName,
  };
}

function buildInspectionTitle({
  inspectionTypeName,
  reportType,
  inspectionMode,
}: {
  inspectionTypeName: string;
  reportType: string | null;
  inspectionMode: string | null;
}) {
  const primary = reportType ?? inspectionTypeName;
  if (inspectionMode) {
    return `${primary} / ${inspectionMode}`;
  }

  return primary;
}

function ensureOffice(session: VirSession, message = "Office workspace required for this action.") {
  if (!isOfficeSession(session)) {
    throw new Error(message);
  }
}

function normalizeLibraryCode(value: string) {
  return value
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
}

function parseSortOrder(value: FormDataEntryValue | null) {
  const parsed = Number.parseInt(toStringOrNull(value) ?? "0", 10);
  return Number.isFinite(parsed) ? parsed : 0;
}

function isChecked(formData: FormData, key: string) {
  const value = toStringOrNull(formData.get(key));
  return value === "on" || value === "true" || value === "YES";
}

function parseVirResponseType(value: FormDataEntryValue | null) {
  const normalized = toStringOrNull(value)?.toUpperCase() ?? "YES_NO_NA";
  return (VIR_RESPONSE_TYPES.includes(normalized as VirQuestionResponseType) ? normalized : "YES_NO_NA") as VirQuestionResponseType;
}

function parseVirRiskLevel(value: FormDataEntryValue | null) {
  const normalized = toStringOrNull(value)?.toUpperCase() ?? "LOW";
  return (VIR_RISK_LEVELS.includes(normalized as VirRiskLevel) ? normalized : "LOW") as VirRiskLevel;
}

function parseTemplateQuestionOptions(value: string | null) {
  return (value ?? "")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [rawValue, rawLabel, rawScore] = line.split("|").map((item) => item.trim());
      const optionValue = rawValue || `OPTION_${index + 1}`;
      const score = rawScore ? Number.parseInt(rawScore, 10) : null;

      return {
        value: optionValue,
        label: rawLabel || optionValue,
        score: Number.isFinite(score ?? Number.NaN) ? score : null,
        sortOrder: index + 1,
      };
    });
}

async function getNextTemplateVersion(inspectionTypeId: string, currentVersion: string) {
  const versions = await prisma.virTemplate.findMany({
    where: { inspectionTypeId },
    select: { version: true },
    orderBy: [{ createdAt: "desc" }],
  });

  const normalizedCurrent = currentVersion.trim() || "1";
  const parts = normalizedCurrent.split(".");
  const lastPart = parts.at(-1) ?? "0";
  const parsedLastPart = Number.parseInt(lastPart, 10);

  if (Number.isFinite(parsedLastPart)) {
    let candidate = [...parts];
    candidate[candidate.length - 1] = String(parsedLastPart + 1);
    let nextVersion = candidate.join(".");
    while (versions.some((record) => record.version === nextVersion)) {
      candidate[candidate.length - 1] = String(Number.parseInt(candidate[candidate.length - 1]!, 10) + 1);
      nextVersion = candidate.join(".");
    }
    return nextVersion;
  }

  let suffix = 1;
  let nextVersion = `${normalizedCurrent}.${suffix}`;
  while (versions.some((record) => record.version === nextVersion)) {
    suffix += 1;
    nextVersion = `${normalizedCurrent}.${suffix}`;
  }

  return nextVersion;
}

async function assertTemplateEditable(templateId: string) {
  const template = await prisma.virTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      inspectionTypeId: true,
      name: true,
      version: true,
      inspections: {
        where: { isDeleted: false },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!template) {
    throw new Error("Template could not be found.");
  }

  return template;
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

export async function upsertVirLibraryTypeAction(formData: FormData) {
  const session = await requireVirSession();
  ensureOffice(session);

  const id = toStringOrNull(formData.get("id"));
  const codeInput = toStringOrNull(formData.get("code"));
  const name = toStringOrNull(formData.get("name"));
  const description = toStringOrNull(formData.get("description"));
  const valueKind = (toStringOrNull(formData.get("valueKind")) ?? "TEXT") as VirLibraryValueKind;
  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  const isActive = isChecked(formData, "isActive");

  if (!name) {
    throw new Error("Library name is required.");
  }

  const code = normalizeLibraryCode(codeInput ?? name);

  await prisma.virLibraryType.upsert({
    where: id ? { id } : { code },
    update: {
      code,
      name,
      description,
      valueKind,
      sortOrder,
      isActive,
    },
    create: {
      code,
      name,
      description,
      valueKind,
      sortOrder,
      isActive,
    },
  });

  revalidateVirPaths();
}

export async function upsertVirLibraryItemAction(formData: FormData) {
  const session = await requireVirSession();
  ensureOffice(session);

  const id = toStringOrNull(formData.get("id"));
  const libraryTypeId = toStringOrNull(formData.get("libraryTypeId"));
  const codeInput = toStringOrNull(formData.get("code"));
  const label = toStringOrNull(formData.get("label"));
  const description = toStringOrNull(formData.get("description"));
  const sortOrder = parseSortOrder(formData.get("sortOrder"));
  const isActive = isChecked(formData, "isActive");
  const valuesInput = toStringOrNull(formData.get("values"));

  if (!libraryTypeId || !label) {
    throw new Error("Library type and item label are required.");
  }

  const code = codeInput ? normalizeLibraryCode(codeInput) : null;
  const values = (valuesInput ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  const payload = {
    code,
    label,
    description,
    sortOrder,
    isActive,
    metadata: values.length ? ({ values } satisfies Prisma.JsonObject) : Prisma.JsonNull,
  };

  let libraryItemId = id;

  if (id) {
    await prisma.virLibraryItem.update({
      where: { id },
      data: payload,
    });
  } else {
    const created = await prisma.virLibraryItem.create({
      data: {
        libraryTypeId,
        ...payload,
      },
      select: { id: true },
    });
    libraryItemId = created.id;
  }

  if (libraryItemId) {
    await prisma.virLibraryItemValue.deleteMany({
      where: { libraryItemId },
    });

    if (values.length) {
      await prisma.virLibraryItemValue.createMany({
        data: values.map((value, index) => ({
          libraryItemId: libraryItemId!,
          value,
          label: value,
          sortOrder: index,
        })),
      });
    }
  }

  revalidateVirPaths();
}

export async function deleteVirLibraryItemAction(itemId: string) {
  const session = await requireVirSession();
  ensureOffice(session);

  if (!itemId) {
    throw new Error("Library item is required.");
  }

  await prisma.virLibraryItem.delete({
    where: { id: itemId },
  });

  revalidateVirPaths();
}

export async function cloneVirTemplateVersionAction(templateId: string) {
  const session = await requireVirSession();
  ensureOffice(session);

  if (!templateId) {
    throw new Error("Template is required.");
  }

  const template = await prisma.virTemplate.findUnique({
    where: { id: templateId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          questions: {
            orderBy: { sortOrder: "asc" },
            include: {
              options: {
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!template) {
    throw new Error("Template could not be found.");
  }

  const nextVersion = await getNextTemplateVersion(template.inspectionTypeId, template.version);
  const clonedTemplate = await prisma.virTemplate.create({
    data: {
      inspectionTypeId: template.inspectionTypeId,
      name: template.name,
      version: nextVersion,
      description: template.description,
      questionnaireLibraryId: template.questionnaireLibraryId ?? null,
      workflowConfig: template.workflowConfig ?? undefined,
      isActive: true,
      sections: {
        create: template.sections.map((section) => ({
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
              answerLibraryTypeId: question.answerLibraryTypeId ?? null,
              sortOrder: question.sortOrder,
              options: {
                create: question.options.map((option) => ({
                  value: option.value,
                  label: option.label,
                  score: option.score,
                  sortOrder: option.sortOrder,
                })),
              },
            })),
          },
        })),
      },
    },
    select: { id: true, inspectionType: { select: { name: true } } },
  });

  revalidateVirPaths();
  redirect(`/templates?type=${encodeURIComponent(clonedTemplate.inspectionType.name)}&template=${clonedTemplate.id}`);
}

export async function createVirTemplateAction(formData: FormData) {
  const session = await requireVirSession();
  ensureOffice(session);

  const inspectionTypeId = toStringOrNull(formData.get("inspectionTypeId"));
  const name = toStringOrNull(formData.get("name"));
  const description = toStringOrNull(formData.get("description"));
  const version = toStringOrNull(formData.get("version")) ?? "1";
  const questionnaireLibraryId = toStringOrNull(formData.get("questionnaireLibraryId"));

  if (!inspectionTypeId || !name) {
    throw new Error("Inspection type and template name are required.");
  }

  const existing = await prisma.virTemplate.findUnique({
    where: { inspectionTypeId_version: { inspectionTypeId, version } },
    select: { id: true },
  });

  if (existing) {
    throw new Error(`Version ${version} already exists for this inspection type. Choose a different version.`);
  }

  const created = await prisma.virTemplate.create({
    data: {
      inspectionTypeId,
      name,
      description,
      version,
      questionnaireLibraryId: questionnaireLibraryId || null,
      isActive: true,
    },
    select: { id: true, inspectionType: { select: { name: true } } },
  });

  revalidateVirPaths();
  redirect(`/templates?type=${encodeURIComponent(created.inspectionType.name)}&template=${created.id}`);
}

export async function upsertVirTemplateAction(formData: FormData) {
  const session = await requireVirSession();
  ensureOffice(session);

  const id = toStringOrNull(formData.get("id"));
  const name = toStringOrNull(formData.get("name"));
  const description = toStringOrNull(formData.get("description"));
  const isActive = isChecked(formData, "isActive");
  const questionnaireLibraryId = toStringOrNull(formData.get("questionnaireLibraryId"));

  if (!id || !name) {
    throw new Error("Template and template name are required.");
  }

  await assertTemplateEditable(id);

  await prisma.virTemplate.update({
    where: { id },
    data: {
      name,
      description,
      isActive,
      questionnaireLibraryId: questionnaireLibraryId || null,
    },
  });

  revalidateVirPaths();
  revalidatePath(`/templates/${id}/edit`);
}

export async function upsertVirTemplateWorkflowAction(formData: FormData) {
  const session = await requireVirSession();
  ensureOffice(session);

  const id = toStringOrNull(formData.get("id"));

  if (!id) {
    throw new Error("Template id is required.");
  }

  const STAGES = ["VESSEL_SUBMISSION", "SHORE_REVIEW", "FINAL_ACKNOWLEDGEMENT"] as const;

  const stages = STAGES.map((stage) => ({
    stage,
    label: toStringOrNull(formData.get(`stage_${stage}_label`)) ?? defaultStageLabel(stage),
    description: toStringOrNull(formData.get(`stage_${stage}_description`)) ?? null,
    actorRole: toStringOrNull(formData.get(`stage_${stage}_actorRole`)) ?? null,
    isRequired: formData.get(`stage_${stage}_isRequired`) === "on",
  }));

  await prisma.virTemplate.update({
    where: { id },
    data: { workflowConfig: { stages } },
  });

  revalidateVirPaths();
}

function defaultStageLabel(stage: "VESSEL_SUBMISSION" | "SHORE_REVIEW" | "FINAL_ACKNOWLEDGEMENT") {
  switch (stage) {
    case "VESSEL_SUBMISSION":
      return "Vessel submission";
    case "SHORE_REVIEW":
      return "Office review";
    case "FINAL_ACKNOWLEDGEMENT":
      return "Final acknowledgement";
  }
}

export async function upsertVirTemplateSectionAction(formData: FormData) {
  const session = await requireVirSession();
  ensureOffice(session);

  const id = toStringOrNull(formData.get("id"));
  const templateId = toStringOrNull(formData.get("templateId"));
  const title = toStringOrNull(formData.get("title"));
  const guidance = toStringOrNull(formData.get("guidance"));
  const codeInput = toStringOrNull(formData.get("code"));
  let sortOrder = parseSortOrder(formData.get("sortOrder"));

  if (!templateId || !title) {
    throw new Error("Template and section title are required.");
  }

  await assertTemplateEditable(templateId);

  if (!id && sortOrder <= 0) {
    const lastSection = await prisma.virTemplateSection.findFirst({
      where: { templateId },
      orderBy: { sortOrder: "desc" },
      select: { sortOrder: true },
    });
    sortOrder = (lastSection?.sortOrder ?? 0) + 1;
  }

  const code = codeInput ? normalizeLibraryCode(codeInput) : null;

  if (id) {
    await prisma.virTemplateSection.update({
      where: { id },
      data: {
        code,
        title,
        guidance,
        sortOrder,
      },
    });
  } else {
    await prisma.virTemplateSection.create({
      data: {
        templateId,
        code,
        title,
        guidance,
        sortOrder,
      },
    });
  }

  revalidateVirPaths();
  revalidatePath(`/templates/${templateId}/edit`);
}

export async function deleteVirTemplateSectionAction(sectionId: string) {
  const session = await requireVirSession();
  ensureOffice(session);

  if (!sectionId) {
    throw new Error("Section is required.");
  }

  const section = await prisma.virTemplateSection.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      templateId: true,
      template: {
        select: {
          inspections: {
            where: { isDeleted: false },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!section) {
    throw new Error("Section could not be found.");
  }

  if (section.template.inspections.length) {
    throw new Error("Create a new template version before deleting sections from a template already used by inspections.");
  }

  await prisma.virTemplateSection.delete({
    where: { id: sectionId },
  });

  revalidateVirPaths();
  revalidatePath(`/templates/${section.templateId}/edit`);
}

export async function upsertVirTemplateQuestionAction(formData: FormData) {
  const session = await requireVirSession();
  ensureOffice(session);

  const id = toStringOrNull(formData.get("id"));
  const sectionId = toStringOrNull(formData.get("sectionId"));
  const codeInput = toStringOrNull(formData.get("code"));
  const prompt = toStringOrNull(formData.get("prompt"));
  const helpText = toStringOrNull(formData.get("helpText"));
  const cicTopic = toStringOrNull(formData.get("cicTopic"));
  const referenceImageUrl = toStringOrNull(formData.get("referenceImageUrl"));
  const responseType = parseVirResponseType(formData.get("responseType"));
  const riskLevel = parseVirRiskLevel(formData.get("riskLevel"));
  const isMandatory = isChecked(formData, "isMandatory");
  const allowsObservation = isChecked(formData, "allowsObservation");
  const allowsPhoto = isChecked(formData, "allowsPhoto");
  const isCicCandidate = isChecked(formData, "isCicCandidate");
  const optionsText = toStringOrNull(formData.get("optionsText"));
  const answerLibraryTypeId = toStringOrNull(formData.get("answerLibraryTypeId"));
  let sortOrder = parseSortOrder(formData.get("sortOrder"));

  if (!sectionId || !prompt) {
    throw new Error("Section and question prompt are required.");
  }

  const section = await prisma.virTemplateSection.findUnique({
    where: { id: sectionId },
    select: {
      id: true,
      templateId: true,
      questions: {
        orderBy: { sortOrder: "desc" },
        select: { sortOrder: true },
        take: 1,
      },
      template: {
        select: {
          inspections: {
            where: { isDeleted: false },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  if (!section) {
    throw new Error("Section could not be found.");
  }

  if (!id && sortOrder <= 0) {
    sortOrder = (section.questions[0]?.sortOrder ?? 0) + 1;
  }

  const code = normalizeLibraryCode(codeInput ?? prompt);
  const options = parseTemplateQuestionOptions(optionsText);

  if (id) {
    if (section.template.inspections.length) {
      throw new Error("Create a new template version before editing questions on a template already used by inspections.");
    }

    await prisma.virTemplateQuestion.update({
      where: { id },
      data: {
        code,
        prompt,
        responseType,
        riskLevel,
        isMandatory,
        allowsObservation,
        allowsPhoto,
        isCicCandidate,
        cicTopic,
        helpText,
        referenceImageUrl,
        answerLibraryTypeId: answerLibraryTypeId || null,
        sortOrder,
      },
    });

    await prisma.virTemplateQuestionOption.deleteMany({
      where: { questionId: id },
    });

    if (options.length) {
      await prisma.virTemplateQuestionOption.createMany({
        data: options.map((option) => ({
          questionId: id,
          value: option.value,
          label: option.label,
          score: option.score,
          sortOrder: option.sortOrder,
        })),
      });
    }
  } else {
    await prisma.virTemplateQuestion.create({
      data: {
        sectionId,
        code,
        prompt,
        responseType,
        riskLevel,
        isMandatory,
        allowsObservation,
        allowsPhoto,
        isCicCandidate,
        cicTopic,
        helpText,
        referenceImageUrl,
        answerLibraryTypeId: answerLibraryTypeId || null,
        sortOrder,
        options: {
          create: options,
        },
      },
    });
  }

  revalidateVirPaths();
  revalidatePath(`/templates/${section.templateId}/edit`);
}

export async function deleteVirTemplateQuestionAction(questionId: string) {
  const session = await requireVirSession();
  ensureOffice(session);

  if (!questionId) {
    throw new Error("Question is required.");
  }

  const question = await prisma.virTemplateQuestion.findUnique({
    where: { id: questionId },
    select: {
      id: true,
      section: {
        select: {
          templateId: true,
          template: {
            select: {
              inspections: {
                where: { isDeleted: false },
                select: { id: true },
                take: 1,
              },
            },
          },
        },
      },
    },
  });

  if (!question) {
    throw new Error("Question could not be found.");
  }

  if (question.section.template.inspections.length) {
    throw new Error("Create a new template version before deleting questions from a template already used by inspections.");
  }

  await prisma.virTemplateQuestion.delete({
    where: { id: questionId },
  });

  revalidateVirPaths();
  revalidatePath(`/templates/${question.section.templateId}/edit`);
}

export async function deleteDraftInspectionAction(inspectionId: string) {
  const session = await requireVirSession();
  ensureOffice(session);

  const inspection = await prisma.virInspection.findUnique({
    where: { id: inspectionId },
    select: { id: true, status: true, isDeleted: true },
  });

  if (!inspection) {
    throw new Error("Inspection could not be found.");
  }

  if (inspection.isDeleted) {
    return;
  }

  if (inspection.status !== "DRAFT") {
    throw new Error("Only draft inspections can be deleted.");
  }

  await prisma.virInspection.update({
    where: { id: inspectionId },
    data: {
      isDeleted: true,
      deletedAt: new Date(),
      deletedBy: session.actorName,
    },
  });

  revalidateVirPaths();
}

export async function createInspectionAction(formData: FormData) {
  const session = await requireVirSession();
  const requestedVesselId = toStringOrNull(formData.get("vesselId"));
  const inspectionTypeId = toStringOrNull(formData.get("inspectionTypeId"));
  const templateIdInput = toStringOrNull(formData.get("templateId"));
  const vesselId = isVesselSession(session) ? session.vesselId : requestedVesselId;
  const inspectionDate =
    toDateOrNull(formData.get("inspectionFromDate")) ?? toDateOrNull(formData.get("inspectionDate")) ?? new Date();
  const reportType = toStringOrNull(formData.get("reportType"));
  const inspectionMode = toStringOrNull(formData.get("inspectionMode"));
  const alongsideBy = toStringOrNull(formData.get("alongsideBy"));
  const operationsAtInspection = toStringOrNull(formData.get("operationsAtInspection"));
  const inspectionAuthority = toStringOrNull(formData.get("inspectionAuthority"));
  const causeAnalysisTarget = toStringOrNull(formData.get("causeAnalysisTarget"));
  const correctiveActionPlanTarget = toStringOrNull(formData.get("correctiveActionPlanTarget"));

  if (
    !vesselId ||
    !inspectionTypeId ||
    !reportType ||
    !inspectionMode ||
    !alongsideBy ||
    !operationsAtInspection ||
    !inspectionAuthority ||
    !causeAnalysisTarget ||
    !correctiveActionPlanTarget
  ) {
    throw new Error(
      "Vessel, inspection type, report type, inspection mode, alongside selection, operations at inspection, inspection authority, cause analysis, and corrective action target are required."
    );
  }

  let templateId = templateIdInput;
  const [inspectionType, vessel] = await Promise.all([
    prisma.virInspectionType.findUnique({
      where: { id: inspectionTypeId },
      select: { id: true, name: true },
    }),
    prisma.vessel.findUnique({
      where: { id: vesselId },
      select: { id: true, name: true },
    }),
  ]);

  if (!inspectionType || !vessel) {
    throw new Error("Vessel or inspection type could not be found.");
  }

  if (!templateId) {
    const latestTemplate = await prisma.virTemplate.findFirst({
      where: { inspectionTypeId },
      orderBy: [{ version: "desc" }, { createdAt: "desc" }],
      select: { id: true },
    });

    templateId = latestTemplate?.id ?? null;
  }

  const carryForwardSource = await findCarryForwardSourceInspection(vesselId, inspectionTypeId, inspectionDate);
  const metadata = buildInspectionMetadata(formData, inspectionType.name);
  const title =
    toStringOrNull(formData.get("title")) ??
    buildInspectionTitle({
      inspectionTypeName: inspectionType.name,
      reportType,
      inspectionMode,
    });

  const inspection = await prisma.virInspection.create({
    data: {
      vesselId,
      inspectionTypeId,
      templateId,
      title: `${vessel.name} / ${title}`,
      inspectionDate,
      port:
        toStringOrNull(formData.get("placeOfInspectionFrom")) ??
        toStringOrNull(formData.get("location")) ??
        toStringOrNull(formData.get("port")),
      country: toStringOrNull(formData.get("placeLastInspected")) ?? toStringOrNull(formData.get("country")),
      inspectorName: toStringOrNull(formData.get("inspectorName")) ?? session.actorName,
      inspectorCompany: inspectionAuthority,
      externalReference: toStringOrNull(formData.get("externalReference")),
      summary: toStringOrNull(formData.get("summary")),
      status: "DRAFT",
      previousInspectionId: carryForwardSource?.id ?? null,
      metadata: {
        ...metadata,
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
    const questions = inspection.template?.sections.flatMap((section) => section.questions) ?? [];
    const progress = summarizeProgress(questions, inspection.answers);

    if (questions.length > 0 && progress.answeredMandatory < progress.mandatoryQuestions) {
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
        comment: isVesselSession(session)
          ? "Submitted from vessel workspace for office review."
          : "Submitted from office control tower for review.",
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

  const inspectionTemplate = await prisma.virInspection.findUnique({
    where: { id: inspection.id },
    select: {
      metadata: true,
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

  // Allow saving for live-checklist inspections that have no formal template
  const hasTemplate = Boolean(inspectionTemplate?.template);

  const existingMetadata =
    inspectionTemplate?.metadata && typeof inspectionTemplate.metadata === "object" && !Array.isArray(inspectionTemplate.metadata)
      ? (inspectionTemplate.metadata as Record<string, unknown>)
      : {};
  const existingQuestionWorkflow =
    existingMetadata.questionWorkflow &&
    typeof existingMetadata.questionWorkflow === "object" &&
    !Array.isArray(existingMetadata.questionWorkflow)
      ? (existingMetadata.questionWorkflow as Record<string, unknown>)
      : {};
  const questionWorkflow: Record<string, { surveyStatus: string | null; score: number | null; comment?: string | null }> = Object.fromEntries(
    Object.entries(existingQuestionWorkflow).map(([key, value]) => {
      const record = value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
      return [
        key,
        {
          surveyStatus: typeof record.surveyStatus === "string" ? record.surveyStatus : null,
          score: typeof record.score === "number" ? record.score : null,
          comment: typeof record.comment === "string" ? record.comment : null,
        },
      ];
    })
  );

  for (const section of (hasTemplate ? inspectionTemplate!.template!.sections : [])) {
    for (const question of section.questions) {
      const fieldName = `q:${question.id}`;
      const commentName = `comment:${question.id}`;
      const statusName = `status:${question.id}`;
      const scoreName = `score:${question.id}`;
      const rawValue =
        question.responseType === "MULTI_SELECT" ? formData.getAll(fieldName) : formData.get(fieldName);
      const comment = toStringOrNull(formData.get(commentName));
      const surveyStatus = toStringOrNull(formData.get(statusName));
      const manualScoreValue = toStringOrNull(formData.get(scoreName));
      const manualScore = manualScoreValue === null || manualScoreValue === "" ? null : Number(manualScoreValue);
      const payload = answerPayloadForQuestion(question.responseType, rawValue, comment);
      const normalizedSurveyStatus =
        surveyStatus && ["T", "I", "NS", "NA"].includes(surveyStatus.toUpperCase()) ? surveyStatus.toUpperCase() : null;
      const normalizedScore = typeof manualScore === "number" && Number.isFinite(manualScore) ? manualScore : null;

      const hasValue =
        payload.answerText !== null ||
        payload.answerNumber !== null ||
        payload.answerBoolean !== null ||
        payload.answerDate !== null ||
        (Array.isArray(payload.selectedOptions) && payload.selectedOptions.length > 0) ||
        payload.comment !== null ||
        normalizedSurveyStatus !== null ||
        normalizedScore !== null;

      if (!hasValue) {
        continue;
      }

      questionWorkflow[question.id] = {
        surveyStatus: normalizedSurveyStatus,
        score: normalizedScore,
      };

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

  // Also persist T/I/NS/NA + score + comment for live checklist questions not bound to a DB template question
  const processedLiveKeys = new Set<string>();
  for (const rawKey of formData.keys()) {
    const statusMatch = /^status:(live-.+)$/.exec(rawKey);
    const commentMatch = /^comment:(live-.+)$/.exec(rawKey);
    const scoreMatch = /^score:(live-.+)$/.exec(rawKey);
    const liveId = statusMatch?.[1] ?? commentMatch?.[1] ?? scoreMatch?.[1];
    if (!liveId) continue;
    if (processedLiveKeys.has(liveId)) continue;
    processedLiveKeys.add(liveId);
    const surveyStatus = toStringOrNull(formData.get(`status:${liveId}`));
    const scoreRaw = toStringOrNull(formData.get(`score:${liveId}`));
    const comment = toStringOrNull(formData.get(`comment:${liveId}`));
    const manualScore = scoreRaw ? Number(scoreRaw) : null;
    const normalizedStatus = surveyStatus && ["T", "I", "NS", "NA"].includes(surveyStatus.toUpperCase()) ? surveyStatus.toUpperCase() : null;
    const normalizedScore = typeof manualScore === "number" && Number.isFinite(manualScore) ? manualScore : null;
    if (normalizedStatus !== null || normalizedScore !== null || comment !== null) {
      questionWorkflow[liveId] = { surveyStatus: normalizedStatus, score: normalizedScore, comment };
    }
  }

  const narrativeKeys = [
    "itemsOfConcern",
    "bestPractice",
    "equipmentNotWorking",
    "safetyMeeting",
    "openingMeeting",
    "closingMeeting",
    "conclusion",
  ] as const;

  const narrativeMetadata = Object.fromEntries(
    narrativeKeys.map((key) => [key, toStringOrNull(formData.get(key))])
  );

  const metadataPayload = {
    ...existingMetadata,
    ...narrativeMetadata,
    questionWorkflow,
  } satisfies Prisma.JsonObject;

  await prisma.virInspection.update({
    where: { id: inspectionId },
    data: {
      metadata: metadataPayload,
    },
  });

  await syncInspectionCounters(inspectionId);
  revalidateVirPaths(inspectionId);
}

export async function saveInspectionHeaderAction(inspectionId: string, formData: FormData) {
  const { inspection } = await getInspectionAccess(inspectionId);

  const existing = await prisma.virInspection.findUnique({
    where: { id: inspection.id },
    select: { metadata: true },
  });

  const existingMetadata =
    existing?.metadata && typeof existing.metadata === "object" && !Array.isArray(existing.metadata)
      ? (existing.metadata as Record<string, unknown>)
      : {};

  const headerMetadata: Record<string, unknown> = {
    auditFromTime: toStringOrNull(formData.get("auditFromTime")),
    auditEndDate: toStringOrNull(formData.get("auditEndDate")),
    auditToTime: toStringOrNull(formData.get("auditToTime")),
    portOfDisembarkation: toStringOrNull(formData.get("portOfDisembarkation")),
    auditBasedOnIncidents: toBooleanFlag(formData.get("auditBasedOnIncidents")),
    auditBasedOnExternal: toBooleanFlag(formData.get("auditBasedOnExternal")),
    operationsAtTime: toStringOrNull(formData.get("operationsAtTime")),
    auditAuthority: toStringOrNull(formData.get("auditAuthority")),
    auditorQualification: toStringOrNull(formData.get("auditorQualification")),
    commandExperience: toStringOrNull(formData.get("commandExperience")),
    auditExperience: toStringOrNull(formData.get("auditExperience")),
    auditees: toStringOrNull(formData.get("auditees")),
    openingMeetingAttendees: toStringOrNull(formData.get("openingMeetingAttendees")),
    closingMeetingAttendees: toStringOrNull(formData.get("closingMeetingAttendees")),
    itemsOfConcern: toStringOrNull(formData.get("itemsOfConcern")),
    bestPractice: toStringOrNull(formData.get("bestPractice")),
    equipmentNotWorking: toStringOrNull(formData.get("equipmentNotWorking")),
    safetyMeeting: toStringOrNull(formData.get("safetyMeeting")),
    openingMeetingDate: toStringOrNull(formData.get("openingMeetingDate")),
    openingMeetingFromTime: toStringOrNull(formData.get("openingMeetingFromTime")),
    openingMeetingToTime: toStringOrNull(formData.get("openingMeetingToTime")),
    openingMeetingNotes: toStringOrNull(formData.get("openingMeetingNotes")),
    closingMeetingDate: toStringOrNull(formData.get("closingMeetingDate")),
    closingMeetingFromTime: toStringOrNull(formData.get("closingMeetingFromTime")),
    closingMeetingToTime: toStringOrNull(formData.get("closingMeetingToTime")),
    closingMeetingNotes: toStringOrNull(formData.get("closingMeetingNotes")),
  };

  const summary = toStringOrNull(formData.get("summary"));

  const mergedMetadata: Prisma.JsonObject = {};
  for (const [key, value] of Object.entries({ ...existingMetadata, ...headerMetadata })) {
    mergedMetadata[key] = value as Prisma.JsonValue;
  }

  await prisma.virInspection.update({
    where: { id: inspectionId },
    data: {
      summary,
      metadata: mergedMetadata,
    },
  });

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

export async function createTemplateFromImportAction(sessionId: string) {
  const session = await requireVirSession();
  ensureOffice(session);

  const importSession = await prisma.virImportSession.findUnique({
    where: { id: sessionId },
    select: {
      id: true,
      status: true,
      payload: true,
      inspectionTypeId: true,
      inspectionType: { select: { id: true, name: true } },
    },
  });

  if (!importSession) {
    throw new Error("Import session not found.");
  }

  if (importSession.status !== "COMMITTED") {
    throw new Error("Only COMMITTED import sessions can be promoted to templates.");
  }

  const { normalized } = normalizeVirTemplateImport(importSession.payload);

  const inspectionType = importSession.inspectionType ??
    await prisma.virInspectionType.findFirst({
      where: { code: normalized.inspectionTypeCode },
      select: { id: true, name: true },
    });

  if (!inspectionType) {
    throw new Error(`Inspection type '${normalized.inspectionTypeCode}' not found. Register it before promoting this import.`);
  }

  const existing = await prisma.virTemplate.findFirst({
    where: { inspectionTypeId: inspectionType.id, version: normalized.version },
    select: { id: true },
  });

  if (existing) {
    revalidateVirPaths();
    redirect(`/templates?type=${encodeURIComponent(inspectionType.name)}&template=${existing.id}`);
  }

  const created = await prisma.virTemplate.create({
    data: {
      inspectionTypeId: inspectionType.id,
      name: normalized.templateName,
      version: normalized.version,
      description: normalized.description,
      isActive: true,
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
    select: { id: true },
  });

  revalidateVirPaths();
  redirect(`/templates?type=${encodeURIComponent(inspectionType.name)}&template=${created.id}`);
}
