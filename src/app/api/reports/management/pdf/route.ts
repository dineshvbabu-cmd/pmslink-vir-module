import { NextResponse } from "next/server";
import { buildSimplePdfDocument } from "@/lib/vir/pdf";
import { prisma } from "@/lib/prisma";
import { getVirSession, isOfficeSession } from "@/lib/vir/session";

export async function GET() {
  const session = await getVirSession();

  if (!session || !isOfficeSession(session)) {
    return NextResponse.json({ error: "Office workspace required." }, { status: 403 });
  }

  const now = new Date();
  const sinceDate = new Date();
  sinceDate.setDate(now.getDate() - 90);

  const [inspections, overdueActions, importSessions] = await Promise.all([
    prisma.virInspection.findMany({
      where: {
        inspectionDate: { gte: sinceDate },
      },
      include: {
        vessel: true,
        inspectionType: true,
        findings: {
          where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
        },
      },
      orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
      take: 14,
    }),
    prisma.virCorrectiveAction.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "REJECTED"] },
        targetDate: { lt: now },
      },
      include: {
        finding: {
          include: {
            inspection: {
              include: {
                vessel: true,
              },
            },
          },
        },
      },
      orderBy: { targetDate: "asc" },
      take: 12,
    }),
    prisma.virImportSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { inspectionType: true },
    }),
  ]);

  const lines = [
    "Management Review Pack",
    `Generated: ${new Date().toISOString().slice(0, 10)}`,
    "",
    `Inspections in scope: ${inspections.length}`,
    `Overdue corrective actions: ${overdueActions.length}`,
    `Import sessions: ${importSessions.length}`,
    "",
    "Priority inspections",
    ...inspections.flatMap((inspection, index) => [
      `${index + 1}. ${inspection.title} / ${inspection.vessel.name} / ${inspection.inspectionType.name} / ${inspection.status} / open findings ${inspection.findings.length}`,
    ]),
    "",
    "Overdue corrective actions",
    ...(overdueActions.length > 0
      ? overdueActions.map(
          (action, index) =>
            `${index + 1}. ${action.finding.inspection.vessel.name} / ${action.finding.inspection.title} / ${action.actionText} / ${action.status} / target ${action.targetDate ? action.targetDate.toISOString().slice(0, 10) : "-"}`
        )
      : ["No overdue corrective actions."]),
    "",
    "Import governance",
    ...(importSessions.length > 0
      ? importSessions.map(
          (sessionRow, index) =>
            `${index + 1}. ${sessionRow.sourceFileName} / ${sessionRow.sourceSystem ?? "Unknown"} / ${sessionRow.status} / ${sessionRow.inspectionType?.name ?? "Unlinked"}`
        )
      : ["No import activity."]),
  ];

  const pdf = buildSimplePdfDocument("Management Review Pack", lines);

  return new NextResponse(pdf, {
    headers: {
      "Content-Disposition": 'attachment; filename="management-review-pack.pdf"',
      "Content-Type": "application/pdf",
    },
  });
}
