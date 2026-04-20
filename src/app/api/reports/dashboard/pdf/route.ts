import type { VirInspectionTypeCategory } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { buildBrandedPdfDocument } from "@/lib/vir/pdf";
import { prisma } from "@/lib/prisma";
import { getVirSession } from "@/lib/vir/session";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const visibleInspectionCategories: VirInspectionTypeCategory[] = ["INTERNAL", "CLASS"];

export async function GET(request: NextRequest) {
  const session = await getVirSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const kind = request.nextUrl.searchParams.get("kind") === "analytics" ? "analytics" : "dashboard";
  const range = normalizeRange(request.nextUrl.searchParams.get("range"));
  const fleet = request.nextUrl.searchParams.get("fleet")?.trim() ?? "";
  const vesselId = request.nextUrl.searchParams.get("vesselId")?.trim() ?? "";
  const now = new Date();
  const sinceDate = new Date();
  sinceDate.setDate(now.getDate() - range);

  if (session.workspace === "VESSEL" && vesselId && vesselId !== session.vesselId) {
    return NextResponse.json({ error: "Vessel scope mismatch." }, { status: 403 });
  }

  const vesselWhere =
    session.workspace === "VESSEL"
      ? { id: session.vesselId ?? "" }
      : {
          ...(fleet ? { fleet } : {}),
          ...(vesselId ? { id: vesselId } : {}),
        };

  const [vessels, inspections, overdueActions] = await Promise.all([
    prisma.vessel.findMany({
      where: {
        isActive: true,
        ...vesselWhere,
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        code: true,
        vesselType: true,
        fleet: true,
      },
    }),
    prisma.virInspection.findMany({
      where: {
        status: { not: "ARCHIVED" },
        inspectionDate: { gte: sinceDate },
        inspectionType: { is: { category: { in: visibleInspectionCategories } } },
        vessel: {
          isActive: true,
          ...vesselWhere,
        },
      },
      orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
      include: {
        vessel: {
          select: {
            id: true,
            name: true,
            vesselType: true,
            fleet: true,
          },
        },
        inspectionType: {
          select: {
            name: true,
            code: true,
            category: true,
          },
        },
        findings: {
          where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
          },
        },
      },
    }),
    prisma.virCorrectiveAction.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "REJECTED"] },
        targetDate: { lt: now },
        finding: {
          inspection: {
            vessel: vesselWhere,
          },
        },
      },
      include: {
        finding: {
          include: {
            inspection: {
              include: {
                vessel: { select: { name: true } },
              },
            },
          },
        },
      },
      orderBy: { targetDate: "asc" },
      take: 20,
    }),
  ]);

  const openFindings = inspections.reduce((sum, inspection) => sum + inspection.findings.length, 0);
  const approvedCount = inspections.filter((inspection) => ["SHORE_REVIEWED", "CLOSED"].includes(inspection.status)).length;
  const pendingCount = inspections.filter((inspection) => ["DRAFT", "RETURNED", "SUBMITTED"].includes(inspection.status)).length;
  const vesselTypeSummary = summarizeByVesselType(inspections);
  const latestInspections = inspections.slice(0, 18);

  const pdf = buildBrandedPdfDocument({
    brand: "Atlantas Marine / PMSLink VIR",
    title: kind === "dashboard" ? "VIR Dashboard Export" : "VIR Analytics Export",
    subtitleLines: [
      `Generated ${fmt.format(now)}`,
      `${session.workspace === "VESSEL" ? session.vesselName ?? "Assigned vessel" : fleet || "Fleet-wide"} / ${range} day range`,
      `${vessels.length} vessels / ${inspections.length} inspections / ${openFindings} open findings`,
    ],
    sections:
      kind === "dashboard"
        ? [
            {
              title: "Dashboard KPI summary",
              lines: [
                `Visible vessels: ${vessels.length}`,
                `Inspections in range: ${inspections.length}`,
                `Approved or shore reviewed: ${approvedCount}`,
                `Pending report states: ${pendingCount}`,
                `Open findings: ${openFindings}`,
                `Overdue corrective actions: ${overdueActions.length}`,
              ],
            },
            {
              title: "Inspection status and report status",
              lines: [
                `Approved / shore reviewed: ${approvedCount}`,
                `Pending report: ${pendingCount}`,
                `Open findings: ${openFindings}`,
                `Overdue corrective actions: ${overdueActions.length}`,
              ],
            },
            {
              title: "Latest inspection register",
              lines: latestInspections.length
                ? latestInspections.map(
                    (inspection, index) =>
                      `${index + 1}. ${inspection.vessel.name} / ${inspection.externalReference ?? inspection.title} / ${inspection.inspectionType.name} / ${inspection.status} / ${fmt.format(inspection.inspectionDate)} / ${inspection.port ?? "Port n/a"}`
                  )
                : ["No inspections are available in the selected scope."],
            },
            {
              title: "Vessel type inspection and findings",
              lines: vesselTypeSummary.length
                ? vesselTypeSummary.map(
                    (row, index) =>
                      `${index + 1}. ${row.label} / inspections ${row.inspections} / findings ${row.findings}`
                  )
                : ["No vessel-type distribution is available in the selected scope."],
            },
            {
              title: "Open corrective action pressure",
              lines: overdueActions.length
                ? overdueActions.map(
                    (action, index) =>
                      `${index + 1}. ${action.finding.inspection.vessel.name} / ${action.finding.inspection.title} / ${action.actionText} / target ${action.targetDate ? fmt.format(action.targetDate) : "Not set"}`
                  )
                : ["No overdue corrective actions in the selected scope."],
            },
          ]
        : [
            {
              title: "Analytics summary",
              lines: [
                `Visible vessels: ${vessels.length}`,
                `Inspections analysed: ${inspections.length}`,
                `Open findings: ${openFindings}`,
                `Overdue corrective actions: ${overdueActions.length}`,
              ],
            },
            {
              title: "Timeline and selection scope",
              lines: [
                `Range: ${range} days`,
                `Fleet selection: ${fleet || "All fleets"}`,
                `Vessel selection: ${vesselId || "All visible vessels"}`,
              ],
            },
            {
              title: "Vessel type inspection and findings",
              lines: vesselTypeSummary.length
                ? vesselTypeSummary.map(
                    (row, index) =>
                      `${index + 1}. ${row.label} / inspections ${row.inspections} / findings ${row.findings}`
                  )
                : ["No vessel-type distribution is available in the selected scope."],
            },
            {
              title: "Top inspection drill-down list",
              lines: latestInspections.length
                ? latestInspections.map(
                    (inspection, index) =>
                      `${index + 1}. ${inspection.title} / ${inspection.vessel.name} / ${inspection.inspectionType.name} / open findings ${inspection.findings.length}`
                  )
                : ["No inspection records are available in the selected scope."],
            },
          ],
  });

  return new NextResponse(pdf, {
    headers: {
      "Content-Disposition": `attachment; filename="vir-${kind}-export.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}

function normalizeRange(value: string | null) {
  const parsed = Number(value);
  return [30, 90, 180, 365].includes(parsed) ? parsed : 90;
}

function summarizeByVesselType(
  inspections: Array<{
    vessel: { vesselType: string | null };
    findings: Array<{ id: string }>;
  }>
) {
  const counts = new Map<string, { inspections: number; findings: number }>();

  for (const inspection of inspections) {
    const label = inspection.vessel.vesselType ?? "Unspecified";
    const current = counts.get(label) ?? { inspections: 0, findings: 0 };
    current.inspections += 1;
    current.findings += inspection.findings.length;
    counts.set(label, current);
  }

  return [...counts.entries()]
    .map(([label, value]) => ({ label, inspections: value.inspections, findings: value.findings }))
    .sort((left, right) => right.findings - left.findings)
    .slice(0, 16);
}
