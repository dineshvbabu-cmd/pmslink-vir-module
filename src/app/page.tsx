import type { VirFindingStatus, VirInspectionStatus, VirInspectionTypeCategory, VirRiskLevel } from "@prisma/client";
import Link from "next/link";
import { FileDown } from "lucide-react";
import { CompactBarChart, DonutChart, DualMetricBarChart } from "@/components/erp-charts";
import { prisma } from "@/lib/prisma";
import { findingStatusLabel, inspectionStatusLabel, toneForFindingStatus, toneForInspectionStatus } from "@/lib/vir/workflow";
import { getVirWorkspaceFilter, isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const approvedStatuses = new Set(["SHORE_REVIEWED", "CLOSED"]);
const visibleInspectionCategories: VirInspectionTypeCategory[] = ["INTERNAL", "CLASS"];

type DashboardSearchParams = {
  range?: string;
  fleet?: string;
  vesselId?: string;
  focus?: string;
};

type DashboardFocus =
  | "total-vessels"
  | "sailing-vir"
  | "port-vir"
  | "total-vir"
  | "pending-report"
  | "pending-deviation"
  | "not-synced"
  | "planner-in-window"
  | "planner-due-range"
  | "planner-overdue"
  | "report-in-order"
  | "report-non-compliance"
  | "inspection-in-order"
  | "inspection-non-compliance"
  | "sailing-in-order"
  | "sailing-non-compliance";

type DashboardInspectionRow = {
  id: string;
  title: string;
  externalReference: string | null;
  status: VirInspectionStatus;
  inspectionDate: Date;
  port: string | null;
  country: string | null;
  vessel: {
    id: string;
    name: string;
    vesselType: string | null;
    fleet: string | null;
  };
  inspectionType: {
    name: string;
  };
  findings: Array<{
    id: string;
  }>;
};

type DashboardFindingRow = {
  id: string;
  title: string;
  severity: VirRiskLevel;
  status: VirFindingStatus;
  question: {
    section: {
      title: string;
    } | null;
  } | null;
  inspection: DashboardInspectionRow;
};

type DashboardVesselRow = {
  vessel: {
    id: string;
    name: string;
    vesselType: string | null;
    fleet: string | null;
  };
  latest: DashboardInspectionRow | null;
  nextDue: Date | null;
  latestMode: string;
  plannerStatus: string;
  inspectionCompliance: string;
  sailingCompliance: string;
};

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<DashboardSearchParams>;
}) {
  const session = await requireVirSession();
  const params = await searchParams;

  if (isOfficeSession(session)) {
    return <OfficeDashboard searchParams={params} />;
  }

  return <VesselDashboard vesselId={session.vesselId ?? ""} vesselName={session.vesselName ?? "Assigned vessel"} />;
}

async function OfficeDashboard({
  searchParams,
}: {
  searchParams: DashboardSearchParams;
}) {
  const workspaceFilter = await getVirWorkspaceFilter();
  const now = new Date();
  const requestedRange = typeof searchParams.range === "string" ? searchParams.range : undefined;
  const requestedFleet = typeof searchParams.fleet === "string" ? searchParams.fleet.trim() : undefined;
  const requestedVesselId = typeof searchParams.vesselId === "string" ? searchParams.vesselId.trim() : undefined;
  const rangeDays = normalizeDashboardRange(requestedRange ?? workspaceFilter?.range ?? undefined);
  const sinceDate = addDays(now, -rangeDays);
  const selectedFleet = requestedFleet !== undefined ? requestedFleet : workspaceFilter?.fleet ?? "";
  const selectedVesselId = requestedVesselId !== undefined ? requestedVesselId : workspaceFilter?.vesselId ?? "";
  const selectedFocus = normalizeDashboardFocus(searchParams.focus);

  const [vessels, inspections] = await Promise.all([
    prisma.vessel.findMany({
      where: {
        isActive: true,
        ...(selectedFleet ? { fleet: selectedFleet } : {}),
        ...(selectedVesselId ? { id: selectedVesselId } : {}),
      },
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
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
          ...(selectedFleet ? { fleet: selectedFleet } : {}),
          ...(selectedVesselId ? { id: selectedVesselId } : {}),
        },
      },
      orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
      include: {
        vessel: {
          select: {
            id: true,
            code: true,
            name: true,
            vesselType: true,
            fleet: true,
          },
        },
        inspectionType: { select: { code: true, name: true } },
        findings: {
          where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
          include: {
            question: {
              select: {
                prompt: true,
                section: {
                  select: {
                    title: true,
                  },
                },
              },
            },
          },
        },
        signOffs: {
          orderBy: { signedAt: "desc" },
          take: 2,
          select: {
            id: true,
            stage: true,
            approved: true,
            actorName: true,
            signedAt: true,
          },
        },
      },
    }),
  ]);

  const fleetOptions = [...new Set(vessels.map((vessel) => vessel.fleet).filter((value): value is string => Boolean(value)))].sort();

  const inspectionsByVessel = new Map<string, typeof inspections>();

  for (const inspection of inspections) {
    const current = inspectionsByVessel.get(inspection.vessel.id) ?? [];
    current.push(inspection);
    inspectionsByVessel.set(inspection.vessel.id, current);
  }

  const latestByVessel = vessels.map((vessel) => {
    const vesselInspections = (inspectionsByVessel.get(vessel.id) ?? []).sort(
      (left, right) => right.inspectionDate.getTime() - left.inspectionDate.getTime()
    );
    const latest = vesselInspections[0] ?? null;
    const nextDue = latest ? addDays(latest.inspectionDate, 182) : null;
    const plannerStatus = classifyPlannerStatus(nextDue, now);
    const latestMode = latest ? inferInspectionMode(latest.title, latest.inspectionType.name) : "Sailing";

    return {
      vessel,
      latest,
      nextDue,
      latestMode,
      plannerStatus,
      inspectionCompliance: latest && approvedStatuses.has(latest.status) ? "In Order" : "Non Compliance",
      sailingCompliance: latest && latestMode.includes("Sailing") && approvedStatuses.has(latest.status) ? "In Order" : "Non Compliance",
    };
  });

  const completedInspections = inspections.filter((inspection) => approvedStatuses.has(inspection.status));
  const completedSailing = completedInspections.filter((inspection) =>
    inferInspectionMode(inspection.title, inspection.inspectionType.name).includes("Sailing")
  ).length;
  const completedPort = completedInspections.filter(
    (inspection) => inferInspectionMode(inspection.title, inspection.inspectionType.name) === "Port"
  ).length;
  const pendingReport = inspections.filter((inspection) => ["DRAFT", "SUBMITTED", "RETURNED"].includes(inspection.status)).length;
  const pendingDeviation = inspections.reduce((sum, inspection) => sum + inspection.findings.length, 0);
  const notSynced = inspections.filter((inspection) => ["DRAFT", "RETURNED"].includes(inspection.status)).length;

  const inspectionStatusCounts = countBy(latestByVessel.map((item) => item.plannerStatus));
  const reportStatusCounts = {
    "In Order": completedInspections.length,
    "Non Compliance": Math.max(0, inspections.length - completedInspections.length),
  };
  const inspectionComplianceCounts = countBy(latestByVessel.map((item) => item.inspectionCompliance));
  const sailingComplianceCounts = countBy(latestByVessel.map((item) => item.sailingCompliance));

  const chapterSeverityCounts = new Map<string, { high: number; medium: number; low: number; total: number }>();

  for (const inspection of inspections) {
    for (const finding of inspection.findings) {
      const chapter = finding.question?.section.title ?? "General";
      const current = chapterSeverityCounts.get(chapter) ?? { high: 0, medium: 0, low: 0, total: 0 };
      const severityBucket = finding.severity === "CRITICAL" || finding.severity === "HIGH" ? "high" : finding.severity === "MEDIUM" ? "medium" : "low";
      current[severityBucket] += 1;
      current.total += 1;
      chapterSeverityCounts.set(chapter, current);
    }
  }

  const vesselTypeCounts = new Map<string, { inspections: number; findings: number; high: number; medium: number; low: number }>();

  for (const inspection of inspections) {
    const vesselType = inspection.vessel.vesselType ?? "Unspecified";
    const current = vesselTypeCounts.get(vesselType) ?? { inspections: 0, findings: 0, high: 0, medium: 0, low: 0 };
    current.inspections += 1;
    current.findings += inspection.findings.length;
    for (const finding of inspection.findings) {
      if (finding.severity === "CRITICAL" || finding.severity === "HIGH") {
        current.high += 1;
      } else if (finding.severity === "MEDIUM") {
        current.medium += 1;
      } else {
        current.low += 1;
      }
    }
    vesselTypeCounts.set(vesselType, current);
  }

  const reviewQueue = inspections
    .filter((inspection) => ["SUBMITTED", "RETURNED", "SHORE_REVIEWED"].includes(inspection.status))
    .slice(0, 12);
  const approvedSnapshot = completedInspections.slice(0, 12);
  const openFindings = inspections.flatMap((inspection) =>
    inspection.findings.map((finding) => ({
      ...finding,
      inspection,
    }))
  );

  const focusContent = buildDashboardFocusContent({
    focus: selectedFocus,
    latestByVessel,
    inspections,
    completedInspections,
    openFindings,
  });

  return (
    <div className="page-stack">
      <section className="panel panel-elevated vir-toolbar-panel">
        <div className="vir-toolbar-row">
          <div className="vir-toolbar-copy">
            <strong>Period:</strong>
            <span>{fmt.format(sinceDate)}</span>
            <span>to</span>
            <span>{fmt.format(now)}</span>
          </div>
          <div className="actions-row">
            <DashboardExportMenu
              items={[
                {
                  href: buildDashboardExportHref("dashboard", { range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId }),
                  label: "Dashboard PDF",
                },
                {
                  href: buildDashboardExportHref("analytics", { range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId }),
                  label: "Analytics PDF",
                },
              ]}
            />
            <Link className="btn-secondary btn-compact" href={buildInspectionListHref("approved", selectedVesselId)}>
              Approved inspections
            </Link>
            <Link className="btn-secondary btn-compact" href={buildInspectionListHref("history", selectedVesselId)}>
              Inspection history
            </Link>
            <Link className="btn-secondary btn-compact" href={buildScheduleHref(selectedVesselId)}>
              VIR Calendar
            </Link>
          </div>
        </div>
      </section>

      <section className="panel panel-elevated">
        <form className="inline-form inline-form-wide" method="get">
          <label className="inline-form-label" htmlFor="range">
            Timeline
          </label>
          <select defaultValue={`${rangeDays}`} id="range" name="range">
            <option value="90">3 months to today</option>
            <option value="180">6 months to today</option>
            <option value="365">1 year to today</option>
          </select>
          <label className="inline-form-label" htmlFor="fleet">
            Fleet
          </label>
          <select defaultValue={selectedFleet} id="fleet" name="fleet">
            <option value="">All fleets</option>
            {fleetOptions.map((fleet) => (
              <option key={fleet} value={fleet}>
                {fleet}
              </option>
            ))}
          </select>
          <label className="inline-form-label" htmlFor="vesselId">
            Vessel
          </label>
          <select defaultValue={selectedVesselId} id="vesselId" name="vesselId">
            <option value="">All vessels</option>
            {vessels.map((vessel) => (
              <option key={vessel.id} value={vessel.id}>
                {vessel.name}
              </option>
            ))}
          </select>
          {selectedFocus ? <input name="focus" type="hidden" value={selectedFocus} /> : null}
          <button className="btn-secondary" type="submit">
            Apply
          </button>
        </form>
      </section>

      <section className="vir-kpi-grid">
        <KpiCard
          href={buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "total-vessels" })}
          label="Total Vessels"
          value={`${vessels.length}`}
        />
        <KpiCard
          label="Completed Inspection"
          split={[
            {
              label: "Sailing VIR",
              value: `${completedSailing}`,
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "sailing-vir" }),
            },
            {
              label: "Port VIR",
              value: `${completedPort}`,
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "port-vir" }),
            },
            {
              label: "Total VIR",
              value: `${completedInspections.length}`,
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "total-vir" }),
            },
          ]}
        />
        <KpiCard
          label="Pending Task"
          split={[
            {
              label: "Pending Report",
              value: `${pendingReport}`,
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "pending-report" }),
            },
            {
              label: "Pending Deviation",
              value: `${pendingDeviation}`,
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "pending-deviation" }),
            },
          ]}
        />
        <KpiCard
          href={buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "not-synced" })}
          label="Not Synced"
          value={`${notSynced}`}
          emphasis="danger"
        />
      </section>

      <section className="vir-donut-grid">
        <DonutChart
          segments={[
            {
              label: "In Window",
              value: inspectionStatusCounts["In Window"] ?? 0,
              className: "donut-segment-success",
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "planner-in-window" }),
              title: `In Window: ${inspectionStatusCounts["In Window"] ?? 0}`,
            },
            {
              label: "Due Range",
              value: inspectionStatusCounts["Due Range"] ?? 0,
              className: "donut-segment-warning",
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "planner-due-range" }),
              title: `Due Range: ${inspectionStatusCounts["Due Range"] ?? 0}`,
            },
            {
              label: "Overdue",
              value: inspectionStatusCounts["Overdue"] ?? 0,
              className: "donut-segment-danger",
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "planner-overdue" }),
              title: `Overdue: ${inspectionStatusCounts["Overdue"] ?? 0}`,
            },
          ]}
          subtitle="Latest planner position by vessel"
          title="Inspection Status"
        />
        <DonutChart
          segments={[
            {
              label: "In Order",
              value: reportStatusCounts["In Order"],
              className: "donut-segment-success",
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "report-in-order" }),
              title: `In Order: ${reportStatusCounts["In Order"]}`,
            },
            {
              label: "Non Compliance",
              value: reportStatusCounts["Non Compliance"],
              className: "donut-segment-danger",
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "report-non-compliance" }),
              title: `Non Compliance: ${reportStatusCounts["Non Compliance"]}`,
            },
          ]}
          subtitle="Approved or closed versus open lifecycle"
          title="Report Status"
        />
        <DonutChart
          segments={[
            {
              label: "In Order",
              value: inspectionComplianceCounts["In Order"] ?? 0,
              className: "donut-segment-success",
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "inspection-in-order" }),
              title: `In Order: ${inspectionComplianceCounts["In Order"] ?? 0}`,
            },
            {
              label: "Non Compliance",
              value: inspectionComplianceCounts["Non Compliance"] ?? 0,
              className: "donut-segment-danger",
              href: buildDashboardPageHref({
                range: rangeDays,
                fleet: selectedFleet,
                vesselId: selectedVesselId,
                focus: "inspection-non-compliance",
              }),
              title: `Non Compliance: ${inspectionComplianceCounts["Non Compliance"] ?? 0}`,
            },
          ]}
          subtitle="Latest inspection compliance picture"
          title="Inspection Compliance"
        />
        <DonutChart
          segments={[
            {
              label: "In Order",
              value: sailingComplianceCounts["In Order"] ?? 0,
              className: "donut-segment-success",
              href: buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId, focus: "sailing-in-order" }),
              title: `In Order: ${sailingComplianceCounts["In Order"] ?? 0}`,
            },
            {
              label: "Non Compliance",
              value: sailingComplianceCounts["Non Compliance"] ?? 0,
              className: "donut-segment-danger",
              href: buildDashboardPageHref({
                range: rangeDays,
                fleet: selectedFleet,
                vesselId: selectedVesselId,
                focus: "sailing-non-compliance",
              }),
              title: `Non Compliance: ${sailingComplianceCounts["Non Compliance"] ?? 0}`,
            },
          ]}
          subtitle="Latest sailing-mode compliance picture"
          title="Sailing"
        />
      </section>

      {focusContent ? (
        <section className="panel panel-elevated dashboard-focus-panel" id="dashboard-data">
          <div className="section-header">
            <div>
              <h3 className="panel-title">{focusContent.title}</h3>
              <p className="panel-subtitle">{focusContent.subtitle}</p>
            </div>
            <Link
              className="btn-secondary btn-compact"
              href={buildDashboardPageHref({ range: rangeDays, fleet: selectedFleet, vesselId: selectedVesselId })}
            >
              Clear selection
            </Link>
          </div>

          {focusContent.kind === "vessels" ? (
            <DashboardVesselTable rows={focusContent.rows} />
          ) : focusContent.kind === "inspections" ? (
            <DashboardInspectionTable rows={focusContent.rows} />
          ) : (
            <DashboardFindingTable rows={focusContent.rows} />
          )}
        </section>
      ) : (
        <section className="panel panel-elevated dashboard-focus-panel" id="dashboard-data">
          <div className="dashboard-focus-empty">Select a KPI tile or a donut legend segment to open the underlying live data table here.</div>
        </section>
      )}

      <section className="dashboard-grid dashboard-grid-equal">
        <CompactBarChart
          bars={[...chapterSeverityCounts.entries()]
            .sort((a, b) => b[1].total - a[1].total)
            .slice(0, 8)
            .map(([label, value]) => ({
              label,
              value: value.total,
              note: `${value.total} findings`,
              title: `High: ${value.high} | Medium: ${value.medium} | Low: ${value.low} | Total: ${value.total}`,
              segments: [
                { label: "High", value: value.high, className: "chart-bar-segment-danger" },
                { label: "Medium", value: value.medium, className: "chart-bar-segment-warning" },
                { label: "Low", value: value.low, className: "chart-bar-segment-low" },
              ],
            }))}
          subtitle="Open findings by questionnaire chapter"
          title="Chapter-wise Findings"
        />
        <DualMetricBarChart
          bars={[...vesselTypeCounts.entries()]
            .sort((a, b) => b[1].findings - a[1].findings)
            .slice(0, 8)
            .map(([label, value]) => ({
              label,
              note: `${value.findings} findings / ${value.inspections} inspections`,
              title: `Findings: ${value.findings} | Inspections: ${value.inspections} | High: ${value.high} | Medium: ${value.medium} | Low: ${value.low}`,
              primary: { label: "Findings", value: value.findings, className: "chart-bar-segment-findings" },
              secondary: { label: "Inspections", value: value.inspections, className: "chart-bar-segment-inspections" },
            }))}
          subtitle="Finding concentration by vessel class"
          title="Vessel Type Inspection & Findings"
        />
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Pending review queue</h3>
              <p className="panel-subtitle">Open the workflow or report directly from the queue.</p>
            </div>
            <Link className="btn-secondary" href={buildInspectionListHref("history", selectedVesselId)}>
              Open inspection history
            </Link>
          </div>

          <div className="table-shell table-shell-compact">
            <table className="table data-table vir-data-table">
              <thead>
                <tr>
                  <th>Progress</th>
                  <th>Vessel</th>
                  <th>Ref no</th>
                  <th>Status</th>
                  <th>Place of inspection</th>
                  <th>Inspected by</th>
                  <th>Report Type</th>
                  <th>Insp.Mode</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {reviewQueue.map((inspection) => (
                  <tr key={inspection.id}>
                    <td>
                      <div className="table-progress">
                        <div className="table-progress-track">
                          <div
                            className="table-progress-fill"
                            style={{
                              width: `${Math.min(100, Math.max(8, Math.round((inspection.signOffs.length / 3) * 100)))}%`,
                            }}
                          />
                        </div>
                        <div className="small-text">{Math.min(100, Math.max(8, Math.round((inspection.signOffs.length / 3) * 100)))}%</div>
                      </div>
                    </td>
                    <td>{inspection.vessel.name}</td>
                    <td>
                      <Link className="table-link" href={`/reports/inspection/${inspection.id}?variant=detailed`}>
                        {inspection.externalReference ?? inspection.title}
                      </Link>
                    </td>
                    <td>
                      <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                        {inspectionStatusLabel[inspection.status]}
                      </span>
                    </td>
                    <td>{[inspection.port, inspection.country].filter(Boolean).join(", ") || "Not set"}</td>
                    <td>{inspection.inspectorName ?? "Not set"}</td>
                    <td>{inspection.inspectionType.name}</td>
                    <td>{inferInspectionMode(inspection.title, inspection.inspectionType.name)}</td>
                    <td>
                      <div className="table-actions">
                        <Link className="inline-link" href={`/inspections/${inspection.id}`}>
                          Workflow
                        </Link>
                        <Link className="inline-link" href={`/reports/inspection/${inspection.id}?variant=detailed`}>
                          Report
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Approved inspections</h3>
              <p className="panel-subtitle">Direct report-entry flow for demo walkthroughs.</p>
            </div>
            <Link className="btn-secondary" href={buildInspectionListHref("approved", selectedVesselId)}>
              Open approved inspections
            </Link>
          </div>

          <div className="table-shell table-shell-compact">
            <table className="table data-table vir-data-table">
              <thead>
                <tr>
                  <th>Vessel</th>
                  <th>Ref no</th>
                  <th>Place of inspection</th>
                  <th>Inspected by</th>
                  <th>Approved date</th>
                  <th>Synced?</th>
                </tr>
              </thead>
              <tbody>
                {approvedSnapshot.map((inspection) => (
                  <tr key={inspection.id}>
                    <td>
                      <Link className="table-link" href={`/reports/inspection/${inspection.id}?variant=summary`}>
                        {inspection.vessel.name}
                      </Link>
                    </td>
                    <td>
                      <Link className="inline-link" href={`/reports/inspection/${inspection.id}?variant=detailed`}>
                        {inspection.externalReference ?? inspection.title}
                      </Link>
                    </td>
                    <td>{[inspection.port, inspection.country].filter(Boolean).join(", ") || "Not set"}</td>
                    <td>{inspection.inspectorName ?? "Not set"}</td>
                    <td>{inspection.signOffs[0]?.signedAt ? fmt.format(inspection.signOffs[0].signedAt) : "Not set"}</td>
                    <td>
                      <span className="chip chip-success">Synced</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>
    </div>
  );
}

async function VesselDashboard({ vesselId, vesselName }: { vesselId: string; vesselName: string }) {
  const now = new Date();
  const inspections = await prisma.virInspection.findMany({
    where: { vesselId, status: { not: "ARCHIVED" }, inspectionType: { is: { category: { in: visibleInspectionCategories } } } },
    orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
    include: {
      vessel: {
        select: {
          name: true,
          vesselType: true,
          fleet: true,
        },
      },
      inspectionType: { select: { name: true } },
      findings: {
        where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
        include: {
          question: {
            select: {
              section: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
      },
      signOffs: {
        orderBy: { signedAt: "desc" },
        take: 2,
        select: {
          id: true,
          stage: true,
          approved: true,
          actorName: true,
          signedAt: true,
        },
      },
    },
  });

  const completedInspections = inspections.filter((inspection) => approvedStatuses.has(inspection.status));
  const pendingReport = inspections.filter((inspection) => ["DRAFT", "SUBMITTED", "RETURNED"].includes(inspection.status)).length;
  const notSynced = inspections.filter((inspection) => ["DRAFT", "RETURNED"].includes(inspection.status)).length;
  const openFindings = inspections.flatMap((inspection) =>
    inspection.findings.map((finding) => ({
      ...finding,
      inspectionId: inspection.id,
      inspectionTitle: inspection.title,
    }))
  );

  const latest = inspections[0] ?? null;
  const nextDue = latest ? addDays(latest.inspectionDate, 182) : null;
  const plannerStatus = classifyPlannerStatus(nextDue, now);
  const chapterCounts = new Map<string, number>();

  for (const finding of openFindings) {
    const chapter = finding.question?.section.title ?? "General";
    chapterCounts.set(chapter, (chapterCounts.get(chapter) ?? 0) + 1);
  }

  return (
    <div className="page-stack">
      <section className="panel panel-elevated vir-toolbar-panel">
        <div className="vir-toolbar-row">
          <div className="vir-toolbar-copy">
            <strong>Vessel:</strong>
            <span>{vesselName}</span>
            <span>Next Due</span>
            <span>{nextDue ? fmt.format(nextDue) : "Not set"}</span>
          </div>
          <div className="actions-row">
            <DashboardExportMenu
              items={[
                {
                  href: buildDashboardExportHref("dashboard", { range: 180, vesselId }),
                  label: "Dashboard PDF",
                },
                {
                  href: buildDashboardExportHref("analytics", { range: 180, vesselId }),
                  label: "Analytics PDF",
                },
              ]}
            />
            <Link className="btn-secondary btn-compact" href="/inspections?scope=my-drafts">
              My VIR Queue
            </Link>
            <Link className="btn-secondary btn-compact" href="/inspections?scope=history">
              Inspection history
            </Link>
            <Link className="btn-secondary btn-compact" href="/schedule">
              VIR Calendar
            </Link>
          </div>
        </div>
      </section>

      <section className="vir-kpi-grid">
        <KpiCard label="Completed Inspection" value={`${completedInspections.length}`} />
        <KpiCard label="Pending Report" value={`${pendingReport}`} />
        <KpiCard label="Pending Deviation" value={`${openFindings.length}`} />
        <KpiCard label="Not Synced" value={`${notSynced}`} emphasis="danger" />
      </section>

      <section className="vir-donut-grid">
        <DonutChart
          segments={[
            { label: plannerStatus, value: 1, className: plannerStatusTone(plannerStatus) },
            { label: "Other", value: 0, className: "donut-segment-info" },
          ]}
          subtitle="Latest vessel planner status"
          title="Inspection Status"
        />
        <DonutChart
          segments={[
            { label: "Approved", value: completedInspections.length, className: "donut-segment-success" },
            {
              label: "Pending",
              value: Math.max(0, inspections.length - completedInspections.length),
              className: "donut-segment-danger",
            },
          ]}
          subtitle="Report lifecycle by vessel"
          title="Report Status"
        />
        <DonutChart
          segments={[
            { label: "Open Findings", value: openFindings.length, className: "donut-segment-warning" },
            {
              label: "Closed / Clear",
              value: Math.max(0, completedInspections.length),
              className: "donut-segment-success",
            },
          ]}
          subtitle="Finding pressure on board"
          title="Inspection Compliance"
        />
        <DonutChart
          segments={[
            { label: "Synced", value: Math.max(0, inspections.length - notSynced), className: "donut-segment-success" },
            { label: "Not Synced", value: notSynced, className: "donut-segment-danger" },
          ]}
          subtitle="Office and vessel sync visibility"
          title="Sync Health"
        />
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        <CompactBarChart
          bars={[...chapterCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }))}
          subtitle="Open findings by chapter"
          title="Chapter-wise Findings"
        />

        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">My inspection queue</h3>
              <p className="panel-subtitle">Open workflow or report directly from each live inspection.</p>
            </div>
          </div>
          <div className="table-shell table-shell-compact">
            <table className="table data-table vir-data-table">
              <thead>
                <tr>
                  <th>Ref no</th>
                  <th>Status</th>
                  <th>Place of inspection</th>
                  <th>Report Type</th>
                  <th>Insp.Mode</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {inspections.map((inspection) => (
                  <tr key={inspection.id}>
                    <td>
                      <Link className="table-link" href={`/reports/inspection/${inspection.id}?variant=detailed`}>
                        {inspection.externalReference ?? inspection.title}
                      </Link>
                    </td>
                    <td>
                      <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                        {inspectionStatusLabel[inspection.status]}
                      </span>
                    </td>
                    <td>{[inspection.port, inspection.country].filter(Boolean).join(", ") || "Not set"}</td>
                    <td>{inspection.inspectionType.name}</td>
                    <td>{inferInspectionMode(inspection.title, inspection.inspectionType.name)}</td>
                    <td>
                      <div className="table-actions">
                        <Link className="inline-link" href={`/inspections/${inspection.id}`}>
                          Workflow
                        </Link>
                        <Link className="inline-link" href={`/reports/inspection/${inspection.id}?variant=detailed`}>
                          Report
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Open findings</h3>
            <p className="panel-subtitle">Items still driving corrective work on board.</p>
          </div>
        </div>

        <div className="table-shell table-shell-compact">
          <table className="table data-table vir-data-table">
            <thead>
              <tr>
                <th>Status</th>
                <th>Severity</th>
                <th>Finding</th>
                <th>Inspection</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {openFindings.map((finding) => (
                <tr key={finding.id}>
                  <td>
                    <span className={`chip ${toneForFindingStatus(finding.status)}`}>{findingStatusLabel[finding.status]}</span>
                  </td>
                  <td>{finding.severity}</td>
                  <td>{finding.title}</td>
                  <td>{finding.inspectionTitle}</td>
                  <td>
                    <Link className="inline-link" href={`/inspections/${finding.inspectionId}?pane=findings`}>
                      Open finding lane
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  split,
  emphasis,
  href,
}: {
  label: string;
  value?: string;
  split?: Array<{ label: string; value: string; href?: string }>;
  emphasis?: "danger";
  href?: string;
}) {
  const content = (
    <>
      <div className="vir-kpi-label">{label}</div>
      {value ? <div className="vir-kpi-value">{value}</div> : null}
      {split ? (
        <div className={`vir-kpi-split ${split.length === 3 ? "vir-kpi-split-three" : ""}`}>
          {split.map((item) =>
            item.href ? (
              <Link className="vir-kpi-split-item vir-kpi-split-item-link" href={item.href} key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </Link>
            ) : (
              <div className="vir-kpi-split-item" key={item.label}>
                <span>{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            )
          )}
        </div>
      ) : null}
    </>
  );

  return (
    <div className={`panel panel-elevated vir-kpi-card ${emphasis === "danger" ? "vir-kpi-card-danger" : ""}`}>
      {href ? (
        <Link className="vir-kpi-card-link" href={href}>
          {content}
        </Link>
      ) : (
        content
      )}
    </div>
  );
}

function inferInspectionMode(title: string, inspectionTypeName: string) {
  const source = `${title} ${inspectionTypeName}`.toUpperCase();

  if (source.includes("SAILING")) {
    return source.includes("REMOTE") ? "Sailing (Remote)" : "Sailing";
  }

  if (source.includes("PORT")) {
    return source.includes("REMOTE") ? "Port (Remote)" : "Port";
  }

  return "Sailing";
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function classifyPlannerStatus(nextDue: Date | null, now: Date) {
  if (!nextDue) {
    return "Due Range";
  }

  const days = Math.floor((nextDue.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));

  if (days < 0) {
    return "Overdue";
  }

  if (days <= 30) {
    return "Due Range";
  }

  return "In Window";
}

function plannerStatusTone(status: string) {
  if (status === "Overdue") {
    return "donut-segment-danger";
  }

  if (status === "Due Range") {
    return "donut-segment-warning";
  }

  return "donut-segment-success";
}

function countBy(values: string[]) {
  return values.reduce<Record<string, number>>((acc, value) => {
    acc[value] = (acc[value] ?? 0) + 1;
    return acc;
  }, {});
}

function normalizeDashboardRange(value: string | undefined) {
  const parsed = Number(value);
  return [90, 180, 365].includes(parsed) ? parsed : 180;
}

function normalizeDashboardFocus(value: string | undefined): DashboardFocus | undefined {
  if (!value) {
    return undefined;
  }

  const allowed: DashboardFocus[] = [
    "total-vessels",
    "sailing-vir",
    "port-vir",
    "total-vir",
    "pending-report",
    "pending-deviation",
    "not-synced",
    "planner-in-window",
    "planner-due-range",
    "planner-overdue",
    "report-in-order",
    "report-non-compliance",
    "inspection-in-order",
    "inspection-non-compliance",
    "sailing-in-order",
    "sailing-non-compliance",
  ];

  return allowed.includes(value as DashboardFocus) ? (value as DashboardFocus) : undefined;
}

function buildDashboardExportHref(
  kind: "dashboard" | "analytics",
  filters: { range: number; fleet?: string; vesselId?: string }
) {
  const params = new URLSearchParams();
  params.set("kind", kind);
  params.set("range", `${filters.range}`);

  if (filters.fleet) {
    params.set("fleet", filters.fleet);
  }

  if (filters.vesselId) {
    params.set("vesselId", filters.vesselId);
  }

  return `/api/reports/dashboard/pdf?${params.toString()}`;
}

function buildDashboardPageHref(filters: { range: number; fleet?: string; vesselId?: string; focus?: DashboardFocus }) {
  const params = new URLSearchParams();
  params.set("range", `${filters.range}`);

  if (filters.fleet) {
    params.set("fleet", filters.fleet);
  }

  if (filters.vesselId) {
    params.set("vesselId", filters.vesselId);
  }

  if (filters.focus) {
    params.set("focus", filters.focus);
  }

  const query = params.toString();
  return `${query ? `/?${query}` : "/"}${filters.focus ? "#dashboard-data" : ""}`;
}

function buildInspectionListHref(scope: "approved" | "history", vesselId?: string) {
  const params = new URLSearchParams();
  params.set("scope", scope);

  if (vesselId) {
    params.set("vesselId", vesselId);
  }

  return `/inspections?${params.toString()}`;
}

function buildScheduleHref(vesselId?: string) {
  const params = new URLSearchParams();

  if (vesselId) {
    params.set("vesselId", vesselId);
  }

  return `/schedule${params.toString() ? `?${params.toString()}` : ""}`;
}

function DashboardExportMenu({
  items,
}: {
  items: Array<{ href: string; label: string }>;
}) {
  return (
    <details className="export-menu">
      <summary aria-label="Export PDFs" className="btn-secondary btn-compact export-menu-trigger export-menu-trigger-icon" title="Export PDFs">
        <FileDown size={16} />
      </summary>
      <div className="export-menu-popover">
        {items.map((item) => (
          <a className="export-menu-item" href={item.href} key={item.label}>
            {item.label}
          </a>
        ))}
      </div>
    </details>
  );
}

function buildDashboardFocusContent({
  focus,
  latestByVessel,
  inspections,
  completedInspections,
  openFindings,
}: {
  focus: DashboardFocus | undefined;
  latestByVessel: DashboardVesselRow[];
  inspections: DashboardInspectionRow[];
  completedInspections: DashboardInspectionRow[];
  openFindings: DashboardFindingRow[];
}) {
  if (!focus) {
    return null;
  }

  switch (focus) {
    case "total-vessels":
      return {
        kind: "vessels" as const,
        title: "Total vessels",
        subtitle: "Fleet and vessel master filtered by the current dashboard selection.",
        rows: latestByVessel,
      };
    case "sailing-vir":
      return {
        kind: "inspections" as const,
        title: "Completed sailing VIR",
        subtitle: "Approved or closed sailing-mode VIR records.",
        rows: completedInspections.filter((inspection) => inferInspectionMode(inspection.title, inspection.inspectionType.name).includes("Sailing")),
      };
    case "port-vir":
      return {
        kind: "inspections" as const,
        title: "Completed port VIR",
        subtitle: "Approved or closed port-mode VIR records.",
        rows: completedInspections.filter((inspection) => inferInspectionMode(inspection.title, inspection.inspectionType.name) === "Port"),
      };
    case "total-vir":
      return {
        kind: "inspections" as const,
        title: "Completed total VIR",
        subtitle: "All approved or closed VIR records within the selected period.",
        rows: completedInspections,
      };
    case "pending-report":
      return {
        kind: "inspections" as const,
        title: "Pending report",
        subtitle: "Inspections still in draft, submitted, or returned lifecycle.",
        rows: inspections.filter((inspection) => ["DRAFT", "SUBMITTED", "RETURNED"].includes(inspection.status)),
      };
    case "pending-deviation":
      return {
        kind: "findings" as const,
        title: "Pending deviation register",
        subtitle: "Open findings and corrective items currently driving deviation load.",
        rows: openFindings,
      };
    case "not-synced":
      return {
        kind: "inspections" as const,
        title: "Not synced",
        subtitle: "Inspection packages still not fully synchronized between vessel and office.",
        rows: inspections.filter((inspection) => ["DRAFT", "RETURNED"].includes(inspection.status)),
      };
    case "planner-in-window":
      return {
        kind: "vessels" as const,
        title: "Planner status: In Window",
        subtitle: "Vessels currently in the acceptable planning window.",
        rows: latestByVessel.filter((item) => item.plannerStatus === "In Window"),
      };
    case "planner-due-range":
      return {
        kind: "vessels" as const,
        title: "Planner status: Due Range",
        subtitle: "Vessels approaching the next VIR due date.",
        rows: latestByVessel.filter((item) => item.plannerStatus === "Due Range"),
      };
    case "planner-overdue":
      return {
        kind: "vessels" as const,
        title: "Planner status: Overdue",
        subtitle: "Vessels beyond the current VIR due date threshold.",
        rows: latestByVessel.filter((item) => item.plannerStatus === "Overdue"),
      };
    case "report-in-order":
      return {
        kind: "inspections" as const,
        title: "Report status: In Order",
        subtitle: "Approved or closed records counted as report-ready.",
        rows: completedInspections,
      };
    case "report-non-compliance":
      return {
        kind: "inspections" as const,
        title: "Report status: Non Compliance",
        subtitle: "Inspection records not yet approved or closed.",
        rows: inspections.filter((inspection) => !approvedStatuses.has(inspection.status)),
      };
    case "inspection-in-order":
      return {
        kind: "vessels" as const,
        title: "Inspection compliance: In Order",
        subtitle: "Latest inspection record is compliant for the vessel.",
        rows: latestByVessel.filter((item) => item.inspectionCompliance === "In Order"),
      };
    case "inspection-non-compliance":
      return {
        kind: "vessels" as const,
        title: "Inspection compliance: Non Compliance",
        subtitle: "Latest inspection record remains non-compliant for the vessel.",
        rows: latestByVessel.filter((item) => item.inspectionCompliance === "Non Compliance"),
      };
    case "sailing-in-order":
      return {
        kind: "vessels" as const,
        title: "Sailing compliance: In Order",
        subtitle: "Latest sailing-mode record is compliant for the vessel.",
        rows: latestByVessel.filter((item) => item.sailingCompliance === "In Order"),
      };
    case "sailing-non-compliance":
      return {
        kind: "vessels" as const,
        title: "Sailing compliance: Non Compliance",
        subtitle: "Latest sailing-mode record remains non-compliant for the vessel.",
        rows: latestByVessel.filter((item) => item.sailingCompliance === "Non Compliance"),
      };
    default:
      return null;
  }
}

function DashboardVesselTable({
  rows,
}: {
  rows: DashboardVesselRow[];
}) {
  return (
    <div className="table-shell table-shell-compact">
      <table className="table data-table vir-data-table">
        <thead>
          <tr>
            <th>Vessel</th>
            <th>Type</th>
            <th>Fleet</th>
            <th>Last VIR done date</th>
            <th>Last VIR inspection mode</th>
            <th>Next due date</th>
            <th>Inspection status</th>
            <th>Inspection compliance</th>
            <th>Sailing compliance</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((item) => (
              <tr key={item.vessel.id}>
                <td>{item.vessel.name}</td>
                <td>{item.vessel.vesselType ?? "Unspecified"}</td>
                <td>{item.vessel.fleet ?? "Unassigned"}</td>
                <td>{item.latest ? fmt.format(item.latest.inspectionDate) : "Not recorded"}</td>
                <td>{item.latestMode}</td>
                <td>{item.nextDue ? fmt.format(item.nextDue) : "Not set"}</td>
                <td>{item.plannerStatus}</td>
                <td>{item.inspectionCompliance}</td>
                <td>{item.sailingCompliance}</td>
                <td>
                  <div className="table-actions">
                    <Link className="inline-link" href={`/vessels/${item.vessel.id}`}>
                      Vessel details
                    </Link>
                    {item.latest ? (
                      <Link className="inline-link" href={`/reports/inspection/${item.latest.id}?variant=detailed`}>
                        Report
                      </Link>
                    ) : null}
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={10}>No vessel records matched this dashboard selection.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DashboardInspectionTable({ rows }: { rows: DashboardInspectionRow[] }) {
  return (
    <div className="table-shell table-shell-compact">
      <table className="table data-table vir-data-table">
        <thead>
          <tr>
            <th>Inspection</th>
            <th>Vessel</th>
            <th>Type</th>
            <th>Status</th>
            <th>Place of inspection</th>
            <th>Inspection date</th>
            <th>Open findings</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((inspection) => (
              <tr key={inspection.id}>
                <td>{inspection.externalReference ?? inspection.title}</td>
                <td>{inspection.vessel.name}</td>
                <td>{inspection.inspectionType.name}</td>
                <td>
                  <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                    {inspectionStatusLabel[inspection.status]}
                  </span>
                </td>
                <td>{[inspection.port, inspection.country].filter(Boolean).join(", ") || "Not set"}</td>
                <td>{fmt.format(inspection.inspectionDate)}</td>
                <td>{inspection.findings.length}</td>
                <td>
                  <div className="table-actions">
                    <Link className="inline-link" href={`/inspections/${inspection.id}`}>
                      Workflow
                    </Link>
                    <Link className="inline-link" href={`/reports/inspection/${inspection.id}?variant=detailed`}>
                      Report
                    </Link>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={8}>No inspection records matched this dashboard selection.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

function DashboardFindingTable({ rows }: { rows: DashboardFindingRow[] }) {
  return (
    <div className="table-shell table-shell-compact">
      <table className="table data-table vir-data-table">
        <thead>
          <tr>
            <th>Vessel</th>
            <th>Inspection</th>
            <th>Chapter</th>
            <th>Finding</th>
            <th>Severity</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length ? (
            rows.map((finding) => (
              <tr key={finding.id}>
                <td>{finding.inspection.vessel.name}</td>
                <td>{finding.inspection.externalReference ?? finding.inspection.title}</td>
                <td>{finding.question?.section?.title ?? "General"}</td>
                <td>{finding.title}</td>
                <td>{finding.severity}</td>
                <td>
                  <span className={`chip ${toneForFindingStatus(finding.status)}`}>{findingStatusLabel[finding.status]}</span>
                </td>
                <td>
                  <div className="table-actions">
                    <Link className="inline-link" href={`/inspections/${finding.inspection.id}?pane=findings`}>
                      Open finding
                    </Link>
                    <Link className="inline-link" href={`/deviations/${finding.inspection.id}?vesselId=${finding.inspection.vessel.id}`}>
                      Deviation
                    </Link>
                  </div>
                </td>
              </tr>
            ))
          ) : (
            <tr>
              <td colSpan={7}>No finding records matched this dashboard selection.</td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
