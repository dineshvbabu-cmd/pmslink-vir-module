import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { PrintButton } from "@/components/print-button";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function ManagementReportPage() {
  const session = await requireVirSession();
  const isOffice = isOfficeSession(session);
  const now = new Date();
  const sinceDate = new Date();
  sinceDate.setDate(now.getDate() - 90);

  const [inspections, overdueActions, importSessions] = await Promise.all([
    prisma.virInspection.findMany({
      where: {
        inspectionDate: { gte: sinceDate },
        ...(isOffice ? {} : { vesselId: session.vesselId ?? "" }),
      },
      orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
      take: 16,
      include: {
        vessel: { select: { name: true } },
        inspectionType: { select: { name: true } },
        findings: {
          where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
          select: { id: true, severity: true, status: true, title: true },
        },
        signOffs: {
          orderBy: { signedAt: "desc" },
          take: 2,
          select: { stage: true, approved: true, signedAt: true },
        },
      },
    }),
    prisma.virCorrectiveAction.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "REJECTED"] },
        targetDate: { lt: now },
        ...(isOffice
          ? {}
          : {
              finding: {
                inspection: {
                  vesselId: session.vesselId ?? "",
                },
              },
            }),
      },
      orderBy: { targetDate: "asc" },
      take: 12,
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
    }),
    prisma.virImportSession.findMany({
      where: isOffice ? {} : { vesselId: session.vesselId ?? "" },
      orderBy: { createdAt: "desc" },
      take: 8,
      include: { inspectionType: { select: { name: true } } },
    }),
  ]);

  const carryForwardCount = inspections.reduce(
    (sum, inspection) => sum + inspection.findings.filter((finding) => finding.status === "CARRIED_OVER").length,
    0
  );

  const criticalCount = inspections.reduce(
    (sum, inspection) => sum + inspection.findings.filter((finding) => finding.severity === "CRITICAL").length,
    0
  );

  return (
    <div className="page-stack report-pack">
      <section className="hero-panel report-hero">
        <div>
          <div className="eyebrow">{isOffice ? "Management review pack" : "Vessel review pack"}</div>
          <h2 className="hero-title">Operational review and printable demo pack</h2>
          <p className="hero-copy">
            Executive summary for inspections, carry-forward exposure, overdue actions, and template/import governance.
          </p>
        </div>
        <div className="actions-row print-hidden">
          <PrintButton />
          <a className="btn-secondary" href="/api/reports/management/pdf">
            Download PDF
          </a>
          <Link className="btn-secondary" href="/schedule">
            Open scheduling board
          </Link>
        </div>
      </section>

      <section className="erp-metrics-grid">
        <MetricTile label="Inspections" note="Last 90 days" value={inspections.length} />
        <MetricTile label="Overdue CARs" note="Needs management push" value={overdueActions.length} />
        <MetricTile label="Carry-forward" note="Open observations carried ahead" value={carryForwardCount} />
        <MetricTile label="Critical findings" note="Immediate attention" value={criticalCount} />
        <MetricTile
          label="Shore queue"
          note="Submitted and reviewed"
          value={inspections.filter((inspection) => ["SUBMITTED", "SHORE_REVIEWED"].includes(inspection.status)).length}
        />
        <MetricTile label="Import sessions" note="Recent governance activity" value={importSessions.length} />
      </section>

      <section className="panel panel-elevated report-panel">
        <h3 className="panel-title">Executive narrative</h3>
        <p className="small-text report-copy">
          The current VIR operating picture shows live segregation between vessel execution and office governance while preserving a shared audit trail. Carry-forward control is active, unresolved findings remain visible in subsequent inspections, and the review board can drill down directly into scheduling, inspection detail, and printable records.
        </p>
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        <section className="panel panel-elevated report-panel">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Priority inspections</h3>
              <p className="panel-subtitle">Latest operational items for management review.</p>
            </div>
          </div>

          <div className="stack-list">
            {inspections.map((inspection) => (
              <div className="list-card" key={inspection.id}>
                <div className="meta-row">
                  <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                    {inspectionStatusLabel[inspection.status]}
                  </span>
                  <span className="chip chip-info">{inspection.inspectionType.name}</span>
                </div>
                <div className="list-card-title">{inspection.title}</div>
                <div className="small-text">
                  {inspection.vessel.name} / {fmt.format(inspection.inspectionDate)}
                </div>
                <div className="small-text">
                  {inspection.findings.length} open findings / {inspection.signOffs.length} recent sign-offs
                </div>
                <div className="actions-row" style={{ marginTop: "0.75rem" }}>
                  <Link className="btn-secondary" href={`/inspections/${inspection.id}`}>
                    Open workflow
                  </Link>
                  <Link className="btn-secondary" href={`/reports/inspection/${inspection.id}`}>
                    Printable pack
                  </Link>
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-elevated report-panel">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Overdue corrective actions</h3>
              <p className="panel-subtitle">Top late actions across the managed scope.</p>
            </div>
          </div>

          <div className="stack-list">
            {overdueActions.length === 0 ? (
              <div className="empty-state">No overdue corrective actions in the current reporting scope.</div>
            ) : (
              overdueActions.map((action) => (
                <div className="list-card" key={action.id}>
                  <div className="meta-row">
                    <span className="chip chip-danger">Overdue</span>
                    <span className="chip chip-warning">{action.status}</span>
                  </div>
                  <div className="list-card-title">{action.actionText}</div>
                  <div className="small-text">
                    {action.finding.inspection.vessel.name} / {action.finding.inspection.title}
                  </div>
                  <div className="small-text">
                    Target {action.targetDate ? fmt.format(action.targetDate) : "Not set"}
                  </div>
                </div>
              ))
            )}
          </div>
        </section>
      </section>

      <section className="panel panel-elevated report-panel">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Import and template governance</h3>
            <p className="panel-subtitle">Recent inspection questionnaire normalization and review activity.</p>
          </div>
        </div>

        <table className="table data-table">
          <thead>
            <tr>
              <th>Source file</th>
              <th>Source system</th>
              <th>Inspection type</th>
              <th>Status</th>
              <th>Confidence</th>
            </tr>
          </thead>
          <tbody>
            {importSessions.map((sessionRow) => (
              <tr key={sessionRow.id}>
                <td>{sessionRow.sourceFileName}</td>
                <td>{sessionRow.sourceSystem ?? "Unknown"}</td>
                <td>{sessionRow.inspectionType?.name ?? "Not linked"}</td>
                <td>{sessionRow.status}</td>
                <td>{sessionRow.confidenceAvg ? `${Math.round(sessionRow.confidenceAvg * 100)}%` : "n/a"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}

function MetricTile({ label, note, value }: { label: string; note: string; value: number }) {
  return (
    <div className="metric-tile metric-tile-static">
      <div className="metric-tile-label">{label}</div>
      <div className="metric-tile-value">{value}</div>
      <div className="metric-tile-note">{note}</div>
    </div>
  );
}
