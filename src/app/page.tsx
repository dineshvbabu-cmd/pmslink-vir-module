import Link from "next/link";
import { CompactBarChart, DonutChart } from "@/components/erp-charts";
import { prisma } from "@/lib/prisma";
import { findingStatusLabel, inspectionStatusLabel, toneForFindingStatus, toneForInspectionStatus } from "@/lib/vir/workflow";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const approvedStatuses = new Set(["SHORE_REVIEWED", "CLOSED"]);

export default async function DashboardPage() {
  const session = await requireVirSession();

  if (isOfficeSession(session)) {
    return <OfficeDashboard />;
  }

  return <VesselDashboard vesselId={session.vesselId ?? ""} vesselName={session.vesselName ?? "Assigned vessel"} />;
}

async function OfficeDashboard() {
  const now = new Date();

  const [vessels, inspections] = await Promise.all([
    prisma.vessel.findMany({
      where: { isActive: true },
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
      where: { status: { not: "ARCHIVED" } },
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

  const chapterCounts = new Map<string, number>();

  for (const inspection of inspections) {
    for (const finding of inspection.findings) {
      const chapter = finding.question?.section.title ?? "General";
      chapterCounts.set(chapter, (chapterCounts.get(chapter) ?? 0) + 1);
    }
  }

  const vesselTypeCounts = new Map<string, { inspections: number; findings: number }>();

  for (const inspection of inspections) {
    const vesselType = inspection.vessel.vesselType ?? "Unspecified";
    const current = vesselTypeCounts.get(vesselType) ?? { inspections: 0, findings: 0 };
    current.inspections += 1;
    current.findings += inspection.findings.length;
    vesselTypeCounts.set(vesselType, current);
  }

  const reviewQueue = inspections
    .filter((inspection) => ["SUBMITTED", "RETURNED", "SHORE_REVIEWED"].includes(inspection.status))
    .slice(0, 12);
  const approvedSnapshot = completedInspections.slice(0, 12);

  return (
    <div className="page-stack">
      <section className="panel panel-elevated vir-toolbar-panel">
        <div className="vir-toolbar-row">
          <div className="vir-toolbar-copy">
            <strong>Period:</strong>
            <span>{fmt.format(addDays(now, -90))}</span>
            <span>to</span>
            <span>{fmt.format(now)}</span>
          </div>
          <div className="actions-row">
            <Link className="btn-secondary btn-compact" href="/inspections?scope=approved">
              Approved inspections
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
        <KpiCard label="Total Vessels" value={`${vessels.length}`} />
        <KpiCard
          label="Completed Inspection"
          split={[
            { label: "Sailing VIR", value: `${completedSailing}` },
            { label: "Port VIR", value: `${completedPort}` },
            { label: "Total VIR", value: `${completedInspections.length}` },
          ]}
        />
        <KpiCard
          label="Pending Task"
          split={[
            { label: "Pending Report", value: `${pendingReport}` },
            { label: "Pending Deviation", value: `${pendingDeviation}` },
          ]}
        />
        <KpiCard label="Not Synced" value={`${notSynced}`} emphasis="danger" />
      </section>

      <section className="vir-donut-grid">
        <DonutChart
          segments={[
            { label: "In Window", value: inspectionStatusCounts["In Window"] ?? 0, className: "donut-segment-success" },
            { label: "Due Range", value: inspectionStatusCounts["Due Range"] ?? 0, className: "donut-segment-warning" },
            { label: "Overdue", value: inspectionStatusCounts["Overdue"] ?? 0, className: "donut-segment-danger" },
          ]}
          subtitle="Latest planner position by vessel"
          title="Inspection Status"
        />
        <DonutChart
          segments={[
            { label: "In Order", value: reportStatusCounts["In Order"], className: "donut-segment-success" },
            { label: "Non Compliance", value: reportStatusCounts["Non Compliance"], className: "donut-segment-danger" },
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
            },
            {
              label: "Non Compliance",
              value: inspectionComplianceCounts["Non Compliance"] ?? 0,
              className: "donut-segment-danger",
            },
          ]}
          subtitle="Latest inspection compliance picture"
          title="Inspection Compliance"
        />
        <DonutChart
          segments={[
            { label: "In Order", value: sailingComplianceCounts["In Order"] ?? 0, className: "donut-segment-success" },
            {
              label: "Non Compliance",
              value: sailingComplianceCounts["Non Compliance"] ?? 0,
              className: "donut-segment-danger",
            },
          ]}
          subtitle="Latest sailing-mode compliance picture"
          title="Sailing"
        />
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        <CompactBarChart
          bars={[...chapterCounts.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8).map(([label, value]) => ({ label, value }))}
          subtitle="Open findings by questionnaire chapter"
          title="Chapter-wise Findings"
        />
        <CompactBarChart
          bars={[...vesselTypeCounts.entries()]
            .sort((a, b) => b[1].findings - a[1].findings)
            .slice(0, 8)
            .map(([label, value]) => ({
              label,
              value: value.findings,
              note: `${value.inspections} inspections`,
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
            <Link className="btn-secondary" href="/inspections?scope=history">
              Open inspection history
            </Link>
          </div>

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
                    <Link className="table-link" href={`/reports/inspection/${inspection.id}`}>
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
                      <Link className="inline-link" href={`/reports/inspection/${inspection.id}`}>
                        Report
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Approved inspections</h3>
              <p className="panel-subtitle">Direct report-entry flow for demo walkthroughs.</p>
            </div>
            <Link className="btn-secondary" href="/inspections?scope=approved">
              Open approved inspections
            </Link>
          </div>

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
                    <Link className="table-link" href={`/reports/inspection/${inspection.id}`}>
                      {inspection.vessel.name}
                    </Link>
                  </td>
                  <td>{inspection.externalReference ?? inspection.title}</td>
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
      </section>
    </div>
  );
}

async function VesselDashboard({ vesselId, vesselName }: { vesselId: string; vesselName: string }) {
  const now = new Date();
  const inspections = await prisma.virInspection.findMany({
    where: { vesselId, status: { not: "ARCHIVED" } },
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
                    <Link className="table-link" href={`/reports/inspection/${inspection.id}`}>
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
                      <Link className="inline-link" href={`/reports/inspection/${inspection.id}`}>
                        Report
                      </Link>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Open findings</h3>
            <p className="panel-subtitle">Items still driving corrective work on board.</p>
          </div>
        </div>

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
      </section>
    </div>
  );
}

function KpiCard({
  label,
  value,
  split,
  emphasis,
}: {
  label: string;
  value?: string;
  split?: Array<{ label: string; value: string }>;
  emphasis?: "danger";
}) {
  return (
    <div className={`panel panel-elevated vir-kpi-card ${emphasis === "danger" ? "vir-kpi-card-danger" : ""}`}>
      <div className="vir-kpi-label">{label}</div>
      {value ? <div className="vir-kpi-value">{value}</div> : null}
      {split ? (
        <div className={`vir-kpi-split ${split.length === 3 ? "vir-kpi-split-three" : ""}`}>
          {split.map((item) => (
            <div className="vir-kpi-split-item" key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </div>
      ) : null}
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
