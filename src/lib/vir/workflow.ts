import type {
  Prisma,
  VirCorrectiveActionStatus,
  VirFindingStatus,
  VirInspectionStatus,
  VirRiskLevel,
} from "@prisma/client";
import { prisma } from "@/lib/prisma";

export const inspectionStatusLabel: Record<VirInspectionStatus, string> = {
  DRAFT: "Draft",
  SUBMITTED: "Submitted",
  RETURNED: "Returned",
  SHORE_REVIEWED: "Shore Reviewed",
  CLOSED: "Closed",
  IMPORT_REVIEW: "Import Review",
  ARCHIVED: "Archived",
};

export const findingStatusLabel: Record<VirFindingStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  READY_FOR_REVIEW: "Ready For Review",
  CLOSED: "Closed",
  CARRIED_OVER: "Carried Over",
};

export const correctiveActionStatusLabel: Record<VirCorrectiveActionStatus, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  COMPLETED: "Completed",
  VERIFIED: "Verified",
  REJECTED: "Rejected",
};

export const riskLabel: Record<VirRiskLevel, string> = {
  LOW: "Low",
  MEDIUM: "Medium",
  HIGH: "High",
  CRITICAL: "Critical",
};

export function toneForInspectionStatus(status: VirInspectionStatus) {
  switch (status) {
    case "CLOSED":
    case "SHORE_REVIEWED":
      return "chip-success";
    case "SUBMITTED":
    case "IMPORT_REVIEW":
      return "chip-info";
    case "RETURNED":
      return "chip-danger";
    case "ARCHIVED":
      return "chip-muted";
    case "DRAFT":
    default:
      return "chip-warning";
  }
}

export function toneForFindingStatus(status: VirFindingStatus) {
  switch (status) {
    case "CLOSED":
      return "chip-success";
    case "READY_FOR_REVIEW":
      return "chip-info";
    case "CARRIED_OVER":
      return "chip-warning";
    case "IN_PROGRESS":
      return "chip-info";
    case "OPEN":
    default:
      return "chip-danger";
  }
}

export function toneForCorrectiveActionStatus(status: VirCorrectiveActionStatus) {
  switch (status) {
    case "VERIFIED":
      return "chip-success";
    case "COMPLETED":
      return "chip-info";
    case "REJECTED":
      return "chip-danger";
    case "IN_PROGRESS":
      return "chip-warning";
    case "OPEN":
    default:
      return "chip-muted";
  }
}

export function toneForRisk(level: VirRiskLevel) {
  switch (level) {
    case "CRITICAL":
      return "chip-danger";
    case "HIGH":
      return "chip-warning";
    case "MEDIUM":
      return "chip-info";
    case "LOW":
    default:
      return "chip-success";
  }
}

export async function syncInspectionCounters(inspectionId: string) {
  const grouped = await prisma.virFinding.groupBy({
    by: ["findingType"],
    where: { inspectionId },
    _count: { _all: true },
  });

  const totals = grouped.reduce(
    (acc, row) => {
      switch (row.findingType) {
        case "POSITIVE":
          acc.posCount = row._count._all;
          break;
        case "OBSERVATION":
          acc.obsCount = row._count._all;
          break;
        case "NON_CONFORMITY":
          acc.ncCount = row._count._all;
          break;
        case "RECOMMENDATION":
          acc.recCount = row._count._all;
          break;
      }

      return acc;
    },
    { posCount: 0, obsCount: 0, ncCount: 0, recCount: 0 }
  );

  await prisma.virInspection.update({
    where: { id: inspectionId },
    data: totals,
  });
}

export function toDateOrNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

export function toStringOrNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

export function toNumberOrNull(value: FormDataEntryValue | null) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

export function answerPayloadForQuestion(
  responseType: string,
  rawValue: FormDataEntryValue | FormDataEntryValue[] | null,
  comment: string | null
): Pick<
  Prisma.VirAnswerUncheckedCreateInput,
  "answerText" | "answerNumber" | "answerBoolean" | "answerDate" | "selectedOptions" | "comment" | "answeredAt"
> {
  const base = {
    answerText: null,
    answerNumber: null,
    answerBoolean: null,
    answerDate: null,
    selectedOptions: undefined as Prisma.InputJsonValue | undefined,
    comment,
    answeredAt: new Date(),
  };

  switch (responseType) {
    case "YES_NO_NA": {
      const value = typeof rawValue === "string" ? rawValue : "";
      return {
        ...base,
        answerText: value || null,
        answerBoolean: value === "YES" ? true : value === "NO" ? false : null,
      };
    }
    case "NUMBER":
    case "SCORE":
      return {
        ...base,
        answerNumber: typeof rawValue === "string" ? toNumberOrNull(rawValue) : null,
      };
    case "DATE":
      return {
        ...base,
        answerDate: typeof rawValue === "string" ? toDateOrNull(rawValue) : null,
      };
    case "MULTI_SELECT": {
      const values = Array.isArray(rawValue)
        ? rawValue.filter((item): item is string => typeof item === "string" && item.trim().length > 0)
        : [];

      return {
        ...base,
        answerText: values.length > 0 ? values.join(", ") : null,
        selectedOptions: values,
      };
    }
    case "SINGLE_SELECT":
    case "TEXT":
    default: {
      const value = typeof rawValue === "string" ? toStringOrNull(rawValue) : null;
      return {
        ...base,
        answerText: value,
      };
    }
  }
}
