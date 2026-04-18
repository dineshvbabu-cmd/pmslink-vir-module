import type { Prisma, VirCorrectiveActionStatus, VirFindingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";

const unresolvedFindingStatuses: VirFindingStatus[] = ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"];
const pendingCorrectiveActionStatuses: VirCorrectiveActionStatus[] = ["OPEN", "IN_PROGRESS", "REJECTED"];

type CarryForwardSourceInspection = Prisma.VirInspectionGetPayload<{
  include: {
    findings: {
      include: {
        question: {
          select: {
            code: true;
            prompt: true;
          };
        };
        correctiveActions: true;
      };
    };
  };
}>;

export async function findCarryForwardSourceInspection(
  vesselId: string,
  inspectionTypeId: string,
  inspectionDate: Date
): Promise<CarryForwardSourceInspection | null> {
  return prisma.virInspection.findFirst({
    where: {
      vesselId,
      inspectionTypeId,
      inspectionDate: { lt: inspectionDate },
    },
    orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
    include: {
      findings: {
        where: {
          status: { in: unresolvedFindingStatuses },
        },
        include: {
          question: {
            select: {
              code: true,
              prompt: true,
            },
          },
          correctiveActions: {
            where: {
              status: { in: pendingCorrectiveActionStatuses },
            },
            orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      },
    },
  }) as Promise<CarryForwardSourceInspection | null>;
}

export async function carryForwardOpenItems(sourceInspectionId: string, targetInspectionId: string) {
  const sourceInspection = await prisma.virInspection.findUnique({
    where: { id: sourceInspectionId },
    include: {
      findings: {
        where: {
          status: { in: unresolvedFindingStatuses },
        },
        include: {
          question: {
            select: {
              code: true,
              prompt: true,
            },
          },
          correctiveActions: {
            where: {
              status: { in: pendingCorrectiveActionStatuses },
            },
            orderBy: [{ targetDate: "asc" }, { createdAt: "asc" }],
          },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      },
    },
  });

  if (!sourceInspection || sourceInspection.findings.length === 0) {
    return {
      carriedFindings: 0,
      carriedActions: 0,
    };
  }

  let carriedFindings = 0;
  let carriedActions = 0;

  for (const finding of sourceInspection.findings) {
    const sourceContext = finding.question
      ? `Source question ${finding.question.code}: ${finding.question.prompt}`
      : `Source finding from ${sourceInspection.title}`;

    const nextFinding = await prisma.virFinding.create({
      data: {
        inspectionId: targetInspectionId,
        questionId: null,
        findingType: finding.findingType,
        severity: finding.severity,
        status: "CARRIED_OVER",
        priority: finding.priority,
        title: finding.title,
        description: finding.description,
        dueDate: finding.dueDate,
        vesselResponse: finding.vesselResponse,
        shoreFeedback: finding.shoreFeedback
          ? `${finding.shoreFeedback}\n\nCarry-forward note: ${sourceContext}`
          : `Carry-forward note: ${sourceContext}`,
        isCarriedOver: true,
        carriedFromFindingId: finding.id,
        ownerName: finding.ownerName,
      },
    });

    carriedFindings += 1;

    for (const correctiveAction of finding.correctiveActions) {
      await prisma.virCorrectiveAction.create({
        data: {
          findingId: nextFinding.id,
          actionText: correctiveAction.actionText,
          ownerName: correctiveAction.ownerName,
          targetDate: correctiveAction.targetDate,
          status: "OPEN",
          completionRemark: correctiveAction.completionRemark
            ? `Carried forward from previous VIR. Previous remark: ${correctiveAction.completionRemark}`
            : "Carried forward from previous VIR.",
        },
      });

      carriedActions += 1;
    }
  }

  return {
    carriedFindings,
    carriedActions,
  };
}
