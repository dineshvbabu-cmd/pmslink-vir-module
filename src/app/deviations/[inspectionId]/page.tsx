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

export const dynamic = "force-dynamic";

const APPROVER_DIRECTORY = [
  { name: "Madhavan Subbiah", email: "madhavan@pmslink.demo" },
  { name: "Somasekhar", email: "somasekhar@pmslink.demo" },
  { name: "Sivakumar Palani", email: "sivakumar@pmslink.demo" },
  { name: "Ajay Kumar Chaudhry", email: "ajay@pmslink.demo" },
  { name: "Manish Das", email: "manish@pmslink.demo" },
];

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

  return (
    <div className="page-stack">
      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Deviation approval flow</div>
            <h2 className="hero-title">
              {inspection.vessel.name} | {inspection.externalReference ?? inspection.title}
            </h2>
            <p className="hero-copy">Pending deviation register with approver selection for the live office review workflow.</p>
          </div>
          <div className="actions-row">
            <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>{inspectionStatusLabel[inspection.status]}</span>
            <Link className="btn-secondary btn-compact" href={`/reports/inspection/${inspection.id}?variant=findings`}>
              Open finding report
            </Link>
          </div>
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Pending deviation register</h3>
            <p className="panel-subtitle">All open findings and corrective actions awaiting approval or closure flow.</p>
          </div>
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

      <section className="dashboard-grid dashboard-grid-equal">
        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Approver directory</h3>
              <p className="panel-subtitle">Send the selected deviation pack to a named approver from the office review roster.</p>
            </div>
          </div>
          <div className="stack-list">
            {APPROVER_DIRECTORY.map((approver) => (
              <div className="list-card" key={approver.email}>
                <div className="list-card-title">{approver.name}</div>
                <div className="small-text">{approver.email}</div>
                <a
                  className="inline-link"
                  href={buildApprovalMailtoHref({
                    email: approver.email,
                    inspectionRef: inspection.externalReference ?? inspection.title,
                    vesselName: inspection.vessel.name,
                  })}
                >
                  Send for approval
                </a>
              </div>
            ))}
          </div>
        </section>

        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Recent approval trail</h3>
              <p className="panel-subtitle">Latest recorded sign-offs already captured against this inspection.</p>
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
                  <div className="small-text">
                    {new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(signOff.signedAt)}
                  </div>
                  {signOff.comment ? <div className="small-text">{signOff.comment}</div> : null}
                </div>
              ))
            ) : (
              <div className="empty-state">No approval actions have been recorded for this inspection yet.</div>
            )}
          </div>
        </section>
      </section>
    </div>
  );
}

function buildApprovalMailtoHref({
  email,
  inspectionRef,
  vesselName,
}: {
  email: string;
  inspectionRef: string;
  vesselName: string;
}) {
  const subject = `Deviation approval request | ${vesselName} | ${inspectionRef}`;
  const body =
    `Please review the pending deviation register for ${vesselName}.%0D%0A%0D%0A` +
    `Inspection reference: ${inspectionRef}%0D%0A` +
    `Workflow link: https://pmslink-vir-module-production.up.railway.app`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${body}`;
}
