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
  const [grouped, answers] = await Promise.all([
    prisma.virFinding.groupBy({
      by: ["findingType"],
      where: { inspectionId },
      _count: { _all: true },
    }),
    prisma.virAnswer.findMany({
      where: { inspectionId },
      include: {
        question: {
          include: {
            options: true,
            answerLibraryType: { include: { items: { where: { isActive: true } } } },
          },
        },
      },
    }),
  ]);

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

  const conditionScore = computeConditionScore(answers);

  await prisma.virInspection.update({
    where: { id: inspectionId },
    data: { ...totals, conditionScore },
  });
}

function computeConditionScore(
  answers: Array<{
    answerText: string | null;
    answerBoolean: boolean | null;
    selectedOptions: unknown;
    question: {
      responseType: string;
      options: Array<{ value: string; score: number | null }>;
      answerLibraryType: { items: Array<{ code: string | null; label: string; metadata: unknown }> } | null;
    };
  }>
): number | null {
  const scoredValues: number[] = [];

  for (const answer of answers) {
    const q = answer.question;

    // Resolve scored options from library items or inline options
    const libraryItems = q.answerLibraryType?.items ?? [];
    const inlineOptions = q.options;

    function scoreFromLibraryItem(code: string): number | null {
      const item = libraryItems.find(
        (i) => (i.code ?? i.label.toUpperCase()) === code.toUpperCase()
      );
      if (!item?.metadata || typeof item.metadata !== "object") return null;
      const meta = item.metadata as Record<string, unknown>;
      return typeof meta.score === "number" ? meta.score : null;
    }

    function scoreFromInlineOption(value: string): number | null {
      const option = inlineOptions.find((o) => o.value === value);
      return option?.score ?? null;
    }

    switch (q.responseType) {
      case "YES_NO_NA": {
        const val = answer.answerText;
        if (val === "YES") scoredValues.push(100);
        else if (val === "NO") scoredValues.push(0);
        // NA / null = no contribution
        break;
      }
      case "SINGLE_SELECT": {
        const val = answer.answerText;
        if (!val) break;
        const libScore = scoreFromLibraryItem(val);
        const inlineScore = scoreFromInlineOption(val);
        const resolved = libScore ?? inlineScore;
        if (typeof resolved === "number") scoredValues.push(resolved);
        break;
      }
      case "MULTI_SELECT": {
        const selected = Array.isArray(answer.selectedOptions) ? answer.selectedOptions as string[] : [];
        const multiScores = selected
          .map((v) => {
            const lib = scoreFromLibraryItem(v);
            const inline = scoreFromInlineOption(v);
            return lib ?? inline;
          })
          .filter((s): s is number => typeof s === "number");
        if (multiScores.length > 0) {
          scoredValues.push(multiScores.reduce((a, b) => a + b, 0) / multiScores.length);
        }
        break;
      }
    }
  }

  if (scoredValues.length === 0) return null;
  const avg = scoredValues.reduce((a, b) => a + b, 0) / scoredValues.length;
  return Math.round(avg * 10) / 10;
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
