import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { calculateInspectionScore, summarizeProgress } from "@/lib/vir/analytics";
import {
  findingStatusLabel,
  inspectionStatusLabel,
  toneForFindingStatus,
  toneForInspectionStatus,
} from "@/lib/vir/workflow";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function DashboardPage() {
  const session = await requireVirSession();

  if (isOfficeSession(session)) {
    return <OfficeDashboard />;
  }

  return <VesselDashboard vesselId={session.vesselId ?? ""} vesselName={session.vesselName ?? "Assigned vessel"} />;
}

async function OfficeDashboard() {
  const now = new Date();

  const [
    inspectionCount,
    reviewCount,
    draftCount,
    closedCount,
    overdueActionCount,
    importQueueCount,
    reviewQueue,
    overdueActions,
    importSessions,
    vesselSnapshots,
  ] = await Promise.all([
    prisma.virInspection.count(),
    prisma.virInspection.count({ where: { status: { in: ["SUBMITTED", "RETURNED", "SHORE_REVIEWED"] } } }),
    prisma.virInspection.count({ where: { status: { in: ["DRAFT", "RETURNED"] } } }),
    prisma.virInspection.count({ where: { status: "CLOSED" } }),
    prisma.virCorrectiveAction.count({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "REJECTED"] },
        targetDate: { lt: now },
      },
    }),
    prisma.virImportSession.count({ where: { status: { in: ["QUEUED", "PROCESSING", "REVIEW"] } } }),
    prisma.virInspection.findMany({
      where: { status: { in: ["SUBMITTED", "RETURNED", "SHORE_REVIEWED"] } },
      take: 8,
      orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
      include: {
        vessel: { select: { name: true } },
        inspectionType: { select: { name: true } },
        findings: {
          where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
          select: { id: true },
        },
        signOffs: { select: { stage: true, approved: true } },
      },
    }),
    prisma.virCorrectiveAction.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "REJECTED"] },
        targetDate: { lt: now },
      },
      take: 8,
      orderBy: { targetDate: "asc" },
      include: {
        finding: {
          select: {
            title: true,
            inspection: {
              select: {
                id: true,
                title: true,
                vessel: { select: { name: true } },
              },
            },
          },
        },
      },
    }),
    prisma.virImportSession.findMany({
      take: 6,
      orderBy: { createdAt: "desc" },
      include: { inspectionType: { select: { name: true } } },
    }),
    prisma.vessel.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        inspections: {
          where: { status: { not: "ARCHIVED" } },
          select: {
            id: true,
            status: true,
            findings: {
              where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
              select: { severity: true },
            },
          },
        },
      },
    }),
  ]);

  const fleetHeatmap = vesselSnapshots.map((vessel) => {
    const openFindings = vessel.inspections.flatMap((inspection) => inspection.findings);
    const critical = openFindings.filter((finding) => finding.severity === "CRITICAL").length;
    const high = openFindings.filter((finding) => finding.severity === "HIGH").length;
    const reviewQueue = vessel.inspections.filter((inspection) =>
      ["SUBMITTED", "RETURNED", "SHORE_REVIEWED"].includes(inspection.status)
    ).length;

    return {
      id: vessel.id,
      name: vessel.name,
      openFindings: openFindings.length,
      critical,
      high,
      reviewQueue,
    };
  });

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="eyebrow">Office control tower</div>
          <h2 className="hero-title">Fleet review and governance</h2>
          <p className="hero-copy">
            Monitor vessel submissions, drive shore review, intervene on overdue corrective actions, and govern
            templates and imports from one operational command layer.
          </p>
        </div>
        <div className="actions-row">
          <Link className="btn" href="/inspections/new">
            Launch VIR
          </Link>
          <Link className="btn-secondary" href="/schedule">
            Scheduling board
          </Link>
          <Link className="btn-secondary" href="/imports">
            Open import engine
          </Link>
          <Link className="btn-secondary" href="/reports/management">
            Management pack
          </Link>
        </div>
      </section>

      <section className="erp-metrics-grid">
        <MetricTile href="/inspections" label="Fleet VIRs" note="All inspections" value={inspectionCount} />
        <MetricTile href="/inspections?scope=shore-review" label="Shore queue" note="Submitted and review" value={reviewCount} />
        <MetricTile href="/inspections?scope=my-drafts" label="Draft and returned" note="Needs vessel action" value={draftCount} />
        <MetricTile href="/inspections?scope=closed" label="Closed VIRs" note="Completed lifecycle" value={closedCount} />
        <MetricTile href="/inspections?scope=overdue-actions" label="Overdue CARs" note="Past target date" value={overdueActionCount} />
        <MetricTile href="/imports" label="Import queue" note="Queued and review sessions" value={importQueueCount} />
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Shore review queue</h3>
              <p className="panel-subtitle">Click through to the underlying inspection when you need to intervene.</p>
            </div>
            <Link className="btn-secondary" href="/inspections?scope=shore-review">
              Open filtered register
            </Link>
          </div>

          <table className="table data-table">
            <thead>
              <tr>
                <th>Inspection</th>
                <th>Vessel</th>
                <th>Type</th>
                <th>Status</th>
                <th>Open findings</th>
                <th>Sign-offs</th>
              </tr>
            </thead>
            <tbody>
              {reviewQueue.map((inspection) => (
                <tr key={inspection.id}>
                  <td>
                    <Link className="table-link" href={`/inspections/${inspection.id}`}>
                      {inspection.title}
                    </Link>
                    <div className="small-text">{fmt.format(inspection.inspectionDate)}</div>
                  </td>
                  <td>{inspection.vessel.name}</td>
                  <td>{inspection.inspectionType.name}</td>
                  <td>
                    <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                      {inspectionStatusLabel[inspection.status]}
                    </span>
                  </td>
                  <td>{inspection.findings.length}</td>
                  <td>{inspection.signOffs.filter((item) => item.approved).length}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Fleet heatmap</h3>
              <p className="panel-subtitle">Open findings and review pressure by vessel.</p>
            </div>
          </div>

          <div className="stack-list">
            {fleetHeatmap.map((row) => {
              const severityWeight = row.openFindings * 12 + row.critical * 18 + row.high * 10 + row.reviewQueue * 8;
              const barWidth = Math.max(10, Math.min(100, severityWeight));

              return (
                <div className="bar-card" key={row.id}>
                  <div className="bar-card-header">
                    <div>
                      <strong>{row.name}</strong>
                      <div className="small-text">
                        {row.reviewQueue} in review / {row.openFindings} open findings
                      </div>
                    </div>
                    <Link className="btn-secondary" href={`/inspections?vesselId=${row.id}`}>
                      Drill down
                    </Link>
                  </div>
                  <div className="bar-track">
                    <div className="bar-fill" style={{ width: `${barWidth}%` }} />
                  </div>
                  <div className="mini-metrics">
                    <span className="chip chip-danger">Critical {row.critical}</span>
                    <span className="chip chip-warning">High {row.high}</span>
                    <span className="chip chip-info">Review {row.reviewQueue}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Overdue corrective actions</h3>
              <p className="panel-subtitle">Oldest items come first to help office push closure.</p>
            </div>
          </div>

          <div className="stack-list">
            {overdueActions.length === 0 ? (
              <div className="empty-state">No overdue corrective actions are currently open.</div>
            ) : (
              overdueActions.map((action) => (
                <div className="list-card" key={action.id}>
                  <div className="meta-row">
                    <span className="chip chip-danger">Overdue</span>
                    <span className="chip chip-muted">{action.status}</span>
                  </div>
                  <div className="list-card-title">{action.actionText}</div>
                  <div className="small-text">
                    {action.finding.inspection.vessel.name} / {action.finding.inspection.title}
                  </div>
                  <div className="small-text">
                    Target {action.targetDate ? fmt.format(action.targetDate) : "not set"} / finding {action.finding.title}
                  </div>
                  <Link className="inline-link" href={`/inspections/${action.finding.inspection.id}`}>
                    Open inspection
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Import and template activity</h3>
              <p className="panel-subtitle">Recent external content governance and review history.</p>
            </div>
            <Link className="btn-secondary" href="/imports">
              Manage imports
            </Link>
          </div>

          <div className="stack-list">
            {importSessions.map((session) => (
              <div className="list-card" key={session.id}>
                <div className="meta-row">
                  <span className="chip chip-info">{session.status}</span>
                  {session.inspectionType ? <span className="chip chip-warning">{session.inspectionType.name}</span> : null}
                </div>
                <div className="list-card-title">{session.sourceFileName}</div>
                <div className="small-text">
                  {session.sourceSystem ?? "Unknown source"} / {fmt.format(session.createdAt)}
                </div>
                <div className="small-text">
                  Confidence {session.confidenceAvg ? `${Math.round(session.confidenceAvg * 100)}%` : "n/a"}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}

async function VesselDashboard({ vesselId, vesselName }: { vesselId: string; vesselName: string }) {
  const now = new Date();

  const inspections = await prisma.virInspection.findMany({
    where: { vesselId },
    orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
    include: {
      inspectionType: { select: { name: true } },
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
                  options: {
                    select: { value: true, score: true },
                  },
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
      findings: {
        where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
        select: {
          id: true,
          title: true,
          severity: true,
          status: true,
          dueDate: true,
          correctiveActions: {
            where: { status: { in: ["OPEN", "IN_PROGRESS", "REJECTED"] } },
            select: { id: true },
          },
        },
      },
      signOffs: {
        orderBy: { signedAt: "desc" },
        select: {
          id: true,
          stage: true,
          approved: true,
          signedAt: true,
        },
      },
    },
  });

  const cards = inspections.map((inspection) => {
    const questions = inspection.template?.sections.flatMap((section) => section.questions) ?? [];
    const progress = summarizeProgress(questions, inspection.answers);
    const score = calculateInspectionScore(questions, inspection.answers, inspection.findings);
    const pendingCar = inspection.findings.reduce((sum, finding) => sum + finding.correctiveActions.length, 0);

    return {
      id: inspection.id,
      title: inspection.title,
      inspectionTypeName: inspection.inspectionType.name,
      inspectionDate: inspection.inspectionDate,
      status: inspection.status,
      progress,
      score: score.finalScore,
      openFindings: inspection.findings.length,
      pendingCar,
      signOffs: inspection.signOffs,
    };
  });

  const openFindings = inspections.flatMap((inspection) =>
    inspection.findings.map((finding) => ({
      ...finding,
      inspectionId: inspection.id,
      inspectionTitle: inspection.title,
    }))
  );

  const draftCount = cards.filter((item) => item.status === "DRAFT" || item.status === "RETURNED").length;
  const submissionReady = cards.filter(
    (item) => item.progress.answeredMandatory === item.progress.mandatoryQuestions && item.status !== "CLOSED"
  ).length;
  const awaitingShore = cards.filter((item) => item.status === "SUBMITTED" || item.status === "SHORE_REVIEWED").length;
  const overdueCar = openFindings.filter((finding) => finding.dueDate && finding.dueDate < now).length;

  return (
    <div className="page-stack">
      <section className="hero-panel hero-panel-vessel">
        <div>
          <div className="eyebrow">Vessel workspace</div>
          <h2 className="hero-title">{vesselName}</h2>
          <p className="hero-copy">
            Complete the questionnaire, respond to findings, progress corrective actions, and submit the VIR to office
            once the mandatory inspection pack is ready.
          </p>
        </div>
        <div className="actions-row">
          <Link className="btn" href="/inspections/new">
            Start VIR
          </Link>
          <Link className="btn-secondary" href="/schedule">
            My schedule
          </Link>
          <Link className="btn-secondary" href="/inspections?scope=my-drafts">
            Open my queue
          </Link>
        </div>
      </section>

      <section className="erp-metrics-grid">
        <MetricTile href="/inspections" label="My VIRs" note="All assigned inspections" value={cards.length} />
        <MetricTile href="/inspections?scope=my-drafts" label="Draft and returned" note="Needs vessel action" value={draftCount} />
        <MetricTile href="/inspections?scope=ready-to-submit" label="Ready to submit" note="Mandatory questions complete" value={submissionReady} />
        <MetricTile href="/inspections?scope=awaiting-shore" label="Awaiting office" note="Submitted or reviewed" value={awaitingShore} />
        <MetricTile href="/inspections?scope=open-findings" label="Open findings" note="Requires follow-up" value={openFindings.length} />
        <MetricTile href="/inspections?scope=overdue-actions" label="Overdue CARs" note="Past target date" value={overdueCar} />
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">My inspection queue</h3>
              <p className="panel-subtitle">Readiness and progress at the inspection level.</p>
            </div>
          </div>

          <table className="table data-table">
            <thead>
              <tr>
                <th>Inspection</th>
                <th>Status</th>
                <th>Completion</th>
                <th>Mandatory</th>
                <th>Score</th>
                <th>Open findings</th>
              </tr>
            </thead>
            <tbody>
              {cards.map((inspection) => (
                <tr key={inspection.id}>
                  <td>
                    <Link className="table-link" href={`/inspections/${inspection.id}`}>
                      {inspection.title}
                    </Link>
                    <div className="small-text">
                      {inspection.inspectionTypeName} / {fmt.format(inspection.inspectionDate)}
                    </div>
                  </td>
                  <td>
                    <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                      {inspectionStatusLabel[inspection.status]}
                    </span>
                  </td>
                  <td>{inspection.progress.completionPct}%</td>
                  <td>
                    {inspection.progress.answeredMandatory}/{inspection.progress.mandatoryQuestions}
                  </td>
                  <td>{typeof inspection.score === "number" ? inspection.score : "n/a"}</td>
                  <td>{inspection.openFindings}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Readiness drill-down</h3>
              <p className="panel-subtitle">Open the exact inspection that needs the next move.</p>
            </div>
          </div>

          <div className="stack-list">
            {cards.map((inspection) => (
              <div className="bar-card" key={inspection.id}>
                <div className="bar-card-header">
                  <div>
                    <strong>{inspection.title}</strong>
                    <div className="small-text">{inspection.inspectionTypeName}</div>
                  </div>
                  <Link className="btn-secondary" href={`/inspections/${inspection.id}`}>
                    Open
                  </Link>
                </div>
                <div className="progress-cluster">
                  <div>
                    <div className="small-text">Completion</div>
                    <div className="bar-track">
                      <div className="bar-fill bar-fill-success" style={{ width: `${inspection.progress.completionPct}%` }} />
                    </div>
                  </div>
                  <div>
                    <div className="small-text">Mandatory</div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${inspection.progress.mandatoryPct}%` }} />
                    </div>
                  </div>
                </div>
                <div className="mini-metrics">
                  <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>{inspectionStatusLabel[inspection.status]}</span>
                  <span className="chip chip-warning">CAR {inspection.pendingCar}</span>
                  <span className="chip chip-info">Findings {inspection.openFindings}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Open findings</h3>
              <p className="panel-subtitle">Items still driving corrective work on board.</p>
            </div>
          </div>

          <div className="stack-list">
            {openFindings.length === 0 ? (
              <div className="empty-state">No open findings are currently assigned to this vessel.</div>
            ) : (
              openFindings.map((finding) => (
                <div className="list-card" key={finding.id}>
                  <div className="meta-row">
                    <span className={`chip ${toneForFindingStatus(finding.status)}`}>{findingStatusLabel[finding.status]}</span>
                    <span className="chip chip-warning">{finding.severity}</span>
                  </div>
                  <div className="list-card-title">{finding.title}</div>
                  <div className="small-text">{finding.inspectionTitle}</div>
                  <div className="small-text">
                    Due {finding.dueDate ? fmt.format(finding.dueDate) : "not set"}
                  </div>
                  <Link className="inline-link" href={`/inspections/${finding.inspectionId}`}>
                    Open finding lane
                  </Link>
                </div>
              ))
            )}
          </div>
        </div>

        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Workflow log</h3>
              <p className="panel-subtitle">Latest sign-off and handover checkpoints.</p>
            </div>
          </div>

          <div className="stack-list">
            {cards.flatMap((inspection) =>
              inspection.signOffs.slice(0, 1).map((signOff) => (
                <div className="list-card" key={signOff.id}>
                  <div className="meta-row">
                    <span className={`chip ${signOff.approved ? "chip-success" : "chip-danger"}`}>
                      {signOff.approved ? "Approved" : "Returned"}
                    </span>
                    <span className="chip chip-info">{signOff.stage.replaceAll("_", " ")}</span>
                  </div>
                  <div className="list-card-title">{inspection.title}</div>
                  <div className="small-text">{fmt.format(signOff.signedAt)}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </section>
    </div>
  );
}

function MetricTile({
  href,
  label,
  note,
  value,
}: {
  href: string;
  label: string;
  note: string;
  value: number;
}) {
  return (
    <Link className="metric-tile" href={href}>
      <div className="metric-tile-label">{label}</div>
      <div className="metric-tile-value">{value}</div>
      <div className="metric-tile-note">{note}</div>
    </Link>
  );
}
