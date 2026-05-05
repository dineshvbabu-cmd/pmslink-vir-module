import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccessVessel, requireVirSession } from "@/lib/vir/session";
import {
  correctiveActionStatusLabel,
  findingStatusLabel,
  inspectionStatusLabel,
  toneForCorrectiveActionStatus,
  toneForFindingStatus,
  toneForInspectionStatus,
} from "@/lib/vir/workflow";
import { DeviationApprovalPanel } from "./approval-form";

export const dynamic = "force-dynamic";

export default async function DeviationReviewPage({
  params,
}: {
  params: Promise<{ inspectionId: string }>;
}) {
  const session = await requireVirSession();
  const { inspectionId } = await params;

  const inspection = await prisma.virInspection.findUnique({
    where: { id: inspectionId },
    include: {
      vessel: true,
      inspectionType: { select: { name: true } },
      findings: {
        where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
        include: {
          correctiveActions: true,
          question: {
            select: {
              prompt: true,
              section: {
                select: { title: true },
              },
            },
          },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      },
      signOffs: {
        orderBy: { signedAt: "desc" },
        select: { actorName: true, actorRole: true, approved: true, signedAt: true, comment: true },
      },
    },
  });

  if (!inspection || !canAccessVessel(session, inspection.vesselId)) {
    notFound();
  }

  const allActions = inspection.findings.flatMap((finding) =>
    finding.correctiveActions.map((action) => ({
      ...action,
      findingTitle: finding.title,
      findingStatus: finding.status,
      sectionTitle: finding.question?.section.title ?? "General",
    }))
  );

  const inspectionRef = inspection.externalReference ?? inspection.title;
  const statusChip = (
    <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
      {inspectionStatusLabel[inspection.status]}
    </span>
  );

  const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return (
    <div className="page-stack">
      <section className="panel panel-elevated">
        <DeviationApprovalPanel
          vesselName={inspection.vessel.name}
          inspectionRef={inspectionRef}
          statusChip={statusChip}
        />
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Pending deviation register</h3>
            <p className="panel-subtitle">All open findings and corrective actions awaiting approval or closure.</p>
          </div>
          <Link className="btn-secondary btn-compact" href={`/reports/inspection/${inspection.id}?variant=findings`}>
            Open finding report
          </Link>
        </div>

        <div className="table-shell table-shell-compact">
          <table className="table data-table vir-data-table">
            <thead>
              <tr>
                <th>Chapter</th>
                <th>Finding</th>
                <th>Status</th>
                <th>Corrective action</th>
                <th>Action status</th>
                <th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {allActions.length ? (
                allActions.map((action) => (
                  <tr key={action.id}>
                    <td>{action.sectionTitle}</td>
                    <td>{action.findingTitle}</td>
                    <td>
                      <span className={`chip ${toneForFindingStatus(action.findingStatus)}`}>
                        {findingStatusLabel[action.findingStatus]}
                      </span>
                    </td>
                    <td>{action.actionText}</td>
                    <td>
                      <span className={`chip ${toneForCorrectiveActionStatus(action.status)}`}>
                        {correctiveActionStatusLabel[action.status]}
                      </span>
                    </td>
                    <td>{action.ownerName ?? "Not assigned"}</td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6}>No pending deviations remain for this inspection.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Recent approval trail</h3>
            <p className="panel-subtitle">Recorded sign-offs against this inspection.</p>
          </div>
        </div>
        <div className="stack-list">
          {inspection.signOffs.length ? (
            inspection.signOffs.map((signOff, index) => (
              <div className="list-card" key={`${signOff.actorName ?? "actor"}-${index}`}>
                <div className="meta-row">
                  <span className={`chip ${signOff.approved ? "chip-success" : "chip-danger"}`}>
                    {signOff.approved ? "Approved" : "Returned"}
                  </span>
                  <span className="chip chip-info">{signOff.actorRole ?? "Workflow"}</span>
                </div>
                <div className="list-card-title">{signOff.actorName ?? "Unknown actor"}</div>
                <div className="small-text">{fmt.format(signOff.signedAt)}</div>
                {signOff.comment ? <div className="small-text">{signOff.comment}</div> : null}
              </div>
            ))
          ) : (
            <div className="empty-state">No approval actions have been recorded for this inspection yet.</div>
          )}
        </div>
      </section>
    </div>
  );
}
