import Link from "next/link";
import { prisma } from "@/lib/prisma";
import {
  findingStatusLabel,
  inspectionStatusLabel,
  riskLabel,
  toneForFindingStatus,
  toneForInspectionStatus,
  toneForRisk,
} from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function DashboardPage() {
  const now = new Date();

  const [
    vesselCount,
    inspectionCount,
    templateCount,
    openFindingsCount,
    overdueActionCount,
    importQueueCount,
    recentInspections,
    urgentFindings,
    importSessions,
    inspectionsByStatus,
  ] = await Promise.all([
    prisma.vessel.count(),
    prisma.virInspection.count(),
    prisma.virTemplate.count(),
    prisma.virFinding.count({ where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW"] } } }),
    prisma.virCorrectiveAction.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS"] },
        targetDate: { lt: now },
      },
    }),
    prisma.virImportSession.count({ where: { status: { in: ["QUEUED", "PROCESSING", "REVIEW"] } } }),
    prisma.virInspection.findMany({
      take: 6,
      orderBy: { inspectionDate: "desc" },
      include: {
        vessel: { select: { name: true } },
        inspectionType: { select: { name: true } },
      },
    }),
    prisma.virFinding.findMany({
      take: 8,
      where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
      orderBy: [{ severity: "desc" }, { dueDate: "asc" }],
      include: {
        inspection: {
          select: {
            id: true,
            title: true,
            vessel: { select: { name: true } },
          },
        },
      },
    }),
    prisma.virImportSession.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: {
        inspectionType: { select: { name: true, code: true } },
      },
    }),
    prisma.virInspection.groupBy({
      by: ["status"],
      _count: { _all: true },
    }),
  ]);

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div className="actions-row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
          <div>
            <div className="eyebrow">Operational Dashboard</div>
            <h2>Vessel Inspection Report Module</h2>
            <p>
              This is the live operating layer for VIR: inspections, questionnaire execution, findings, corrective
              actions, sign-off, and template import activity. The goal is to move directly from template setup to
              vessel execution and shore review.
            </p>
          </div>
          <div className="actions-row">
            <Link className="btn" href="/inspections/new">
              Create VIR
            </Link>
            <Link className="btn-secondary" href="/imports">
              Open Import Engine
            </Link>
          </div>
        </div>
      </section>

      <section className="stats-grid">
        <MetricCard label="Vessels" value={vesselCount} note="Active seeded fleet records" />
        <MetricCard label="Inspections" value={inspectionCount} note="All VIR records in the system" />
        <MetricCard label="Open Findings" value={openFindingsCount} note="Open, in progress, or awaiting review" />
        <MetricCard label="Overdue Actions" value={overdueActionCount} note="Corrective actions past target date" />
        <MetricCard label="Templates" value={templateCount} note="Reusable questionnaire templates" />
        <MetricCard label="Import Queue" value={importQueueCount} note="Queued, processing, or review sessions" />
        <MetricCard label="Submitted / Review" value={inspectionsByStatus.reduce((sum, row) => sum + (row.status === "SUBMITTED" || row.status === "SHORE_REVIEWED" ? row._count._all : 0), 0)} note="Shore-facing active inspections" />
        <MetricCard label="Drafts" value={inspectionsByStatus.reduce((sum, row) => sum + (row.status === "DRAFT" ? row._count._all : 0), 0)} note="In-progress vessel work" />
      </section>

      <section className="two-col">
        <div className="panel">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Recent Inspections</h3>
              <p className="panel-subtitle">Latest activity across vessel inspections, self-assessments, and review cycles.</p>
            </div>
            <Link className="btn-secondary" href="/inspections">
              View Register
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Inspection</th>
                <th>Vessel</th>
                <th>Type</th>
                <th>Date</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {recentInspections.map((inspection) => (
                <tr key={inspection.id}>
                  <td>
                    <Link href={`/inspections/${inspection.id}`} style={{ fontWeight: 700, color: "var(--color-navy)" }}>
                      {inspection.title}
                    </Link>
                  </td>
                  <td>{inspection.vessel.name}</td>
                  <td>{inspection.inspectionType.name}</td>
                  <td>{fmt.format(inspection.inspectionDate)}</td>
                  <td>
                    <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                      {inspectionStatusLabel[inspection.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Urgent Findings</h3>
              <p className="panel-subtitle">Open observations and non-conformities that are driving CAR work.</p>
            </div>
          </div>
          <div className="list">
            {urgentFindings.length === 0 ? (
              <div className="empty-state">No open findings are currently driving action.</div>
            ) : (
              urgentFindings.map((finding) => (
                <div className="list-card" key={finding.id}>
                  <div className="meta-row">
                    <span className={`chip ${toneForRisk(finding.severity)}`}>{riskLabel[finding.severity]}</span>
                    <span className={`chip ${toneForFindingStatus(finding.status)}`}>{findingStatusLabel[finding.status]}</span>
                  </div>
                  <div style={{ marginTop: "0.65rem", fontWeight: 800 }}>{finding.title}</div>
                  <div className="small-text" style={{ marginTop: "0.25rem" }}>
                    {finding.inspection.vessel.name} · {finding.inspection.title}
                  </div>
                  {finding.dueDate ? <div className="small-text">Due {fmt.format(finding.dueDate)}</div> : null}
                </div>
              ))
            )}
          </div>
        </div>
      </section>

      <section className="two-col">
        <div className="panel">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Import Operations</h3>
              <p className="panel-subtitle">Template and questionnaire import sessions with review and commit status.</p>
            </div>
            <Link className="btn-secondary" href="/imports">
              Manage Imports
            </Link>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>Source</th>
                <th>Standard</th>
                <th>Status</th>
                <th>Confidence</th>
              </tr>
            </thead>
            <tbody>
              {importSessions.map((session) => (
                <tr key={session.id}>
                  <td>{session.sourceFileName}</td>
                  <td>{session.inspectionType?.name ?? "Template Review"}</td>
                  <td>{session.status}</td>
                  <td>{session.confidenceAvg ? `${Math.round(session.confidenceAvg * 100)}%` : "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Execution Coverage</h3>
              <p className="panel-subtitle">Where to go next in the live module.</p>
            </div>
          </div>
          <div className="list">
            <div className="list-card">
              <strong>Inspection Register</strong>
              <p className="small-text">Create VIRs, review draft/submitted/closed records, and open individual inspections.</p>
            </div>
            <div className="list-card">
              <strong>Questionnaire Execution</strong>
              <p className="small-text">Answer template questions, save evidence comments, and review completion percentages.</p>
            </div>
            <div className="list-card">
              <strong>Findings and CAR Flow</strong>
              <p className="small-text">Raise findings, auto-drive corrective actions, and update closure status.</p>
            </div>
            <div className="list-card">
              <strong>Import Review</strong>
              <p className="small-text">Dry-run template payloads, commit approved imports, and keep an operations trail.</p>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricCard({ label, value, note }: { label: string; value: number; note: string }) {
  return (
    <div className="stat-card">
      <div className="stat-label">{label}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}
