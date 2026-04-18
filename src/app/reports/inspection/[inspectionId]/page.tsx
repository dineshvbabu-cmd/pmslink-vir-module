import Link from "next/link";
import { notFound } from "next/navigation";
import { PrintButton } from "@/components/print-button";
import { prisma } from "@/lib/prisma";
import { calculateInspectionScore, summarizeProgress } from "@/lib/vir/analytics";
import { canAccessVessel, requireVirSession } from "@/lib/vir/session";
import {
  correctiveActionStatusLabel,
  findingStatusLabel,
  inspectionStatusLabel,
  riskLabel,
  toneForCorrectiveActionStatus,
  toneForFindingStatus,
  toneForInspectionStatus,
  toneForRisk,
} from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function InspectionReportPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await requireVirSession();
  const { inspectionId } = await params;

  const inspection = await prisma.virInspection.findUnique({
    where: { id: inspectionId },
    include: {
      vessel: true,
      inspectionType: true,
      previousInspection: {
        select: {
          id: true,
          title: true,
          inspectionDate: true,
        },
      },
      template: {
        include: {
          sections: {
            include: {
              questions: {
                include: {
                  options: true,
                },
              },
            },
          },
        },
      },
      answers: true,
      findings: {
        include: {
          correctiveActions: true,
          carriedFromFinding: {
            select: {
              title: true,
              inspection: {
                select: {
                  title: true,
                },
              },
            },
          },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      },
      signOffs: {
        orderBy: { signedAt: "asc" },
      },
      photos: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!inspection || !canAccessVessel(session, inspection.vesselId)) {
    notFound();
  }

  const questions = inspection.template?.sections.flatMap((section) => section.questions) ?? [];
  const progress = summarizeProgress(questions, inspection.answers);
  const score = calculateInspectionScore(questions, inspection.answers, inspection.findings);

  return (
    <div className="page-stack report-pack">
      <section className="hero-panel report-hero">
        <div>
          <div className="eyebrow">Inspection report</div>
          <h2 className="hero-title">{inspection.title}</h2>
          <p className="hero-copy">
            {inspection.vessel.name} / {inspection.inspectionType.name} / {fmt.format(inspection.inspectionDate)}
          </p>
        </div>
        <div className="actions-row print-hidden">
          <PrintButton />
          <a className="btn-secondary" href={`/api/reports/inspection/${inspection.id}/pdf`}>
            Download PDF
          </a>
          <Link className="btn-secondary" href={`/inspections/${inspection.id}`}>
            Back to workflow
          </Link>
        </div>
      </section>

      <section className="erp-metrics-grid">
        <MetricTile label="Completion" note="Answered questions" value={`${progress.completionPct}%`} />
        <MetricTile label="Mandatory" note="Required coverage" value={`${progress.answeredMandatory}/${progress.mandatoryQuestions}`} />
        <MetricTile label="Score" note="Inspection readiness" value={score.finalScore !== null ? `${score.finalScore}` : "n/a"} />
        <MetricTile label="Open findings" note="Not yet closed" value={`${inspection.findings.filter((finding) => finding.status !== "CLOSED").length}`} />
        <MetricTile label="Sign-offs" note="Recorded workflow stages" value={`${inspection.signOffs.length}`} />
        <MetricTile label="Evidence" note="Synced photo records" value={`${inspection.photos.length}`} />
      </section>

      <section className="panel panel-elevated report-panel">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Header and scope</h3>
            <p className="panel-subtitle">Inspection header, context, and current lifecycle state.</p>
          </div>
        </div>

        <div className="report-grid">
          <div className="list-card">
            <strong>Status</strong>
            <div className="meta-row" style={{ marginTop: "0.5rem" }}>
              <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                {inspectionStatusLabel[inspection.status]}
              </span>
            </div>
          </div>
          <div className="list-card">
            <strong>Inspector</strong>
            <div className="small-text">{inspection.inspectorName ?? "Not recorded"}</div>
          </div>
          <div className="list-card">
            <strong>Authority / company</strong>
            <div className="small-text">{inspection.inspectorCompany ?? "Not recorded"}</div>
          </div>
          <div className="list-card">
            <strong>Reference</strong>
            <div className="small-text">{inspection.externalReference ?? "Not recorded"}</div>
          </div>
          <div className="list-card">
            <strong>Location</strong>
            <div className="small-text">
              {inspection.port ?? "Port not recorded"}
              {inspection.country ? ` / ${inspection.country}` : ""}
            </div>
          </div>
          <div className="list-card">
            <strong>Previous VIR link</strong>
            <div className="small-text">
              {inspection.previousInspection
                ? `${inspection.previousInspection.title} / ${fmt.format(inspection.previousInspection.inspectionDate)}`
                : "No previous VIR linked"}
            </div>
          </div>
        </div>

        <div className="list-card" style={{ marginTop: "1rem" }}>
          <strong>Summary</strong>
          <div className="small-text" style={{ marginTop: "0.5rem" }}>
            {inspection.summary ?? "No inspection summary was recorded."}
          </div>
        </div>
      </section>

      <section className="panel panel-elevated report-panel">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Findings and corrective actions</h3>
            <p className="panel-subtitle">Observation log including carry-forward lineage and close-out activity.</p>
          </div>
        </div>

        <div className="stack-list">
          {inspection.findings.map((finding) => (
            <div className="list-card" key={finding.id}>
              <div className="meta-row">
                <span className={`chip ${toneForRisk(finding.severity)}`}>{riskLabel[finding.severity]}</span>
                <span className={`chip ${toneForFindingStatus(finding.status)}`}>{findingStatusLabel[finding.status]}</span>
              </div>
              <div className="list-card-title">{finding.title}</div>
              <div className="small-text">{finding.description}</div>
              {finding.carriedFromFinding ? (
                <div className="small-text" style={{ marginTop: "0.5rem" }}>
                  Carried forward from {finding.carriedFromFinding.inspection.title} / {finding.carriedFromFinding.title}
                </div>
              ) : null}

              <div className="stack-list" style={{ marginTop: "0.75rem" }}>
                {finding.correctiveActions.map((action) => (
                  <div className="question-card" key={action.id}>
                    <div className="section-header">
                      <div>
                        <strong>{action.actionText}</strong>
                        <div className="small-text">
                          {action.ownerName ?? "Owner not assigned"}
                          {action.targetDate ? ` / target ${fmt.format(action.targetDate)}` : ""}
                        </div>
                      </div>
                      <span className={`chip ${toneForCorrectiveActionStatus(action.status)}`}>
                        {correctiveActionStatusLabel[action.status]}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        <section className="panel panel-elevated report-panel">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Sign-off audit trail</h3>
              <p className="panel-subtitle">Office and vessel checkpoints for the current VIR lifecycle.</p>
            </div>
          </div>

          <div className="stack-list">
            {inspection.signOffs.map((signOff) => (
              <div className="list-card" key={`${signOff.stage}-${signOff.signedAt.toISOString()}`}>
                <div className="meta-row">
                  <span className={`chip ${signOff.approved ? "chip-success" : "chip-danger"}`}>
                    {signOff.approved ? "Approved" : "Returned"}
                  </span>
                  <span className="chip chip-info">{signOff.stage.replaceAll("_", " ")}</span>
                </div>
                <div className="small-text">{signOff.actorName ?? "Unknown actor"}</div>
                <div className="small-text">{fmt.format(signOff.signedAt)}</div>
                {signOff.comment ? <div className="small-text">{signOff.comment}</div> : null}
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-elevated report-panel">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Photo evidence annex</h3>
              <p className="panel-subtitle">Latest synced evidence for printable review and demo walkthrough.</p>
            </div>
          </div>

          <div className="evidence-gallery">
            {inspection.photos.map((photo) => (
              <div className="evidence-card" key={photo.id}>
                <img alt={photo.caption ?? photo.fileName ?? "Inspection evidence"} src={photo.url} />
                <div className="list-card-title">{photo.caption ?? photo.fileName ?? "Inspection evidence"}</div>
                <div className="small-text">{photo.uploadedBy ?? "Unknown uploader"}</div>
              </div>
            ))}
          </div>
        </section>
      </section>
    </div>
  );
}

function MetricTile({ label, note, value }: { label: string; note: string; value: string }) {
  return (
    <div className="metric-tile metric-tile-static">
      <div className="metric-tile-label">{label}</div>
      <div className="metric-tile-value">{value}</div>
      <div className="metric-tile-note">{note}</div>
    </div>
  );
}
