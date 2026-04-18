import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { summarizeProgress } from "@/lib/vir/analytics";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

type SearchParams = {
  scope?: string;
  status?: string;
  vesselId?: string;
};

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireVirSession();
  const { scope, status, vesselId } = await searchParams;

  const where =
    session.workspace === "OFFICE"
      ? vesselId
        ? { vesselId }
        : {}
      : {
          vesselId: session.vesselId ?? "",
        };

  const [inspections, vessels] = await Promise.all([
    prisma.virInspection.findMany({
      where,
      orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
      include: {
        vessel: { select: { id: true, name: true } },
        inspectionType: { select: { name: true } },
        findings: {
          where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
          select: {
            id: true,
            status: true,
            severity: true,
            dueDate: true,
            correctiveActions: {
              where: { status: { in: ["OPEN", "IN_PROGRESS", "REJECTED"] } },
              select: { id: true },
            },
          },
        },
        signOffs: { select: { id: true, stage: true, approved: true } },
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
      },
    }),
    isOfficeSession(session)
      ? prisma.vessel.findMany({
          where: { isActive: true },
          orderBy: { name: "asc" },
          select: { id: true, name: true },
        })
      : Promise.resolve([]),
  ]);

  const enriched = inspections.map((inspection) => {
    const questions = inspection.template?.sections.flatMap((section) => section.questions) ?? [];
    const progress = summarizeProgress(questions, inspection.answers);
    const overdueActions = inspection.findings.filter((finding) =>
      finding.correctiveActions.length > 0 && finding.dueDate && finding.dueDate < new Date()
    ).length;

    return {
      ...inspection,
      progress,
      overdueActions,
    };
  });

  const filtered = enriched.filter((inspection) => {
    if (status && inspection.status !== status) {
      return false;
    }

    switch (scope) {
      case "shore-review":
        return ["SUBMITTED", "RETURNED", "SHORE_REVIEWED"].includes(inspection.status);
      case "my-drafts":
        return ["DRAFT", "RETURNED"].includes(inspection.status);
      case "closed":
        return inspection.status === "CLOSED";
      case "ready-to-submit":
        return (
          inspection.progress.mandatoryQuestions > 0 &&
          inspection.progress.answeredMandatory === inspection.progress.mandatoryQuestions &&
          inspection.status !== "CLOSED"
        );
      case "awaiting-shore":
        return ["SUBMITTED", "SHORE_REVIEWED"].includes(inspection.status);
      case "open-findings":
        return inspection.findings.length > 0;
      case "overdue-actions":
        return inspection.overdueActions > 0;
      default:
        return true;
    }
  });

  return (
    <div className="page-stack">
      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Inspection register</div>
            <h2 className="panel-title">
              {isOfficeSession(session) ? "Fleet register and shore queues" : `${session.vesselName ?? "Vessel"} register`}
            </h2>
            <p className="panel-subtitle">
              {isOfficeSession(session)
                ? "Fleet-wide operations grid for review, closure, and intervention."
                : "Execution queue scoped to the logged-in vessel workspace."}
            </p>
          </div>
          <Link className="btn" href="/inspections/new">
            Create VIR
          </Link>
        </div>

        <div className="filter-toolbar">
          <div className="filter-chips">
            <Link className={`filter-chip ${!scope ? "filter-chip-active" : ""}`} href="/inspections">
              All
            </Link>
            <Link className={`filter-chip ${scope === "shore-review" ? "filter-chip-active" : ""}`} href="/inspections?scope=shore-review">
              Shore review
            </Link>
            <Link className={`filter-chip ${scope === "my-drafts" ? "filter-chip-active" : ""}`} href="/inspections?scope=my-drafts">
              Draft / returned
            </Link>
            <Link className={`filter-chip ${scope === "ready-to-submit" ? "filter-chip-active" : ""}`} href="/inspections?scope=ready-to-submit">
              Ready to submit
            </Link>
            <Link className={`filter-chip ${scope === "overdue-actions" ? "filter-chip-active" : ""}`} href="/inspections?scope=overdue-actions">
              Overdue CAR
            </Link>
          </div>

          {isOfficeSession(session) ? (
            <form className="inline-form" method="get">
              <label className="inline-form-label" htmlFor="vesselId">
                Vessel
              </label>
              <select defaultValue={vesselId ?? ""} id="vesselId" name="vesselId">
                <option value="">All vessels</option>
                {vessels.map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>
                    {vessel.name}
                  </option>
                ))}
              </select>
              {scope ? <input name="scope" type="hidden" value={scope} /> : null}
              <button className="btn-secondary" type="submit">
                Apply
              </button>
            </form>
          ) : null}
        </div>

        <table className="table data-table">
          <thead>
            <tr>
              <th>Inspection</th>
              {isOfficeSession(session) ? <th>Vessel</th> : null}
              <th>Type</th>
              <th>Status</th>
              <th>Completion</th>
              <th>Mandatory</th>
              <th>Open findings</th>
              <th>Open CAR</th>
              <th>Sign-offs</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((inspection) => (
              <tr key={inspection.id}>
                <td>
                  <Link className="table-link" href={`/inspections/${inspection.id}`}>
                    {inspection.title}
                  </Link>
                  <div className="small-text">
                    {fmt.format(inspection.inspectionDate)}
                    {inspection.port ? ` / ${inspection.port}` : ""}
                  </div>
                </td>
                {isOfficeSession(session) ? <td>{inspection.vessel.name}</td> : null}
                <td>{inspection.inspectionType.name}</td>
                <td>
                  <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                    {inspectionStatusLabel[inspection.status]}
                  </span>
                </td>
                <td>{inspection.progress.completionPct}%</td>
                <td>
                  {inspection.progress.answeredMandatory}/{inspection.progress.mandatoryQuestions}
                </td>
                <td>{inspection.findings.length}</td>
                <td>{inspection.overdueActions}</td>
                <td>{inspection.signOffs.filter((item) => item.approved).length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="erp-metrics-grid">
        <MetricStat
          label="Visible inspections"
          note="Current filtered set"
          value={filtered.length}
        />
        <MetricStat
          label="Submitted / review"
          note="Office-facing queue"
          value={filtered.filter((item) => ["SUBMITTED", "SHORE_REVIEWED"].includes(item.status)).length}
        />
        <MetricStat
          label="Draft / returned"
          note="Needs vessel work"
          value={filtered.filter((item) => ["DRAFT", "RETURNED"].includes(item.status)).length}
        />
        <MetricStat
          label="Open findings"
          note="Across filtered set"
          value={filtered.reduce((sum, item) => sum + item.findings.length, 0)}
        />
      </section>
    </div>
  );
}

function MetricStat({ label, note, value }: { label: string; note: string; value: number }) {
  return (
    <div className="metric-tile metric-tile-static">
      <div className="metric-tile-label">{label}</div>
      <div className="metric-tile-value">{value}</div>
      <div className="metric-tile-note">{note}</div>
    </div>
  );
}
