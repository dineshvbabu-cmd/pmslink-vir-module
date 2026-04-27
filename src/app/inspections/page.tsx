import type { VirInspectionTypeCategory } from "@prisma/client";
import Link from "next/link";
import { Eye, FileText, LayoutGrid, TableProperties, Trash2, TriangleAlert } from "lucide-react";
import { deleteDraftInspectionAction } from "@/app/actions";
import { ActionIconLink } from "@/components/action-icon-link";
import { prisma } from "@/lib/prisma";
import { summarizeProgress } from "@/lib/vir/analytics";
import { getVirWorkspaceFilter, isOfficeSession, requireVirSession } from "@/lib/vir/session";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const visibleInspectionCategories: VirInspectionTypeCategory[] = ["INTERNAL", "CLASS"];

type SearchParams = {
  scope?: string;
  status?: string;
  vesselId?: string;
  view?: string;
  q?: string;
};

type PageMode = "register" | "approved" | "history";
type ViewMode = "grid" | "summary";
type InspectionRow = {
  id: string;
  title: string;
  externalReference: string | null;
  inspectionDate: Date;
  port: string | null;
  country: string | null;
  inspectorName: string | null;
  status: keyof typeof inspectionStatusLabel;
  shoreReviewedBy: string | null;
  shoreReviewDate: Date | null;
  metadata: unknown;
  vessel: {
    id: string;
    code: string;
    name: string;
    vesselType: string | null;
    fleet: string | null;
  };
  inspectionType: {
    name: string;
    code: string;
  };
  findings: Array<{
    id: string;
    status: string;
    severity: string;
    dueDate: Date | null;
    correctiveActions: Array<{ id: string }>;
  }>;
  signOffs: Array<{
    id: string;
    stage: string;
    approved: boolean;
    actorName: string | null;
    signedAt: Date;
  }>;
  progress: {
    totalQuestions: number;
    answeredQuestions: number;
    mandatoryQuestions: number;
    answeredMandatory: number;
    completionPct: number;
    mandatoryPct: number;
  };
  overdueActions: number;
  approvedSignOff: {
    id: string;
    stage: string;
    approved: boolean;
    actorName: string | null;
    signedAt: Date;
  } | null;
  reportType: string;
  refNo: string;
  inspectionMode: string;
  syncLabel: "Synced" | "Not Synced";
  placeOfInspection: string;
  conditionScore: number | null;
  auditFromDate: string | null;
  auditEndDate: string | null;
};

export default async function InspectionsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const session = await requireVirSession();
  const workspaceFilter = isOfficeSession(session) ? await getVirWorkspaceFilter() : null;
  const { scope, status, vesselId, view, q } = await searchParams;
  const pageMode = normalizePageMode(scope, session.workspace === "OFFICE");
  const viewMode = normalizeViewMode(view);
  const searchTerm = q?.trim().toLowerCase() ?? "";
  const requestedVesselId = typeof vesselId === "string" ? vesselId.trim() : undefined;
  const selectedVesselId =
    session.workspace === "OFFICE"
      ? requestedVesselId !== undefined
        ? requestedVesselId
        : workspaceFilter?.vesselId ?? ""
      : session.vesselId ?? "";

  const where =
    session.workspace === "OFFICE"
    ? {
        isDeleted: false,
        status: { not: "ARCHIVED" as const },
        inspectionType: { is: { category: { in: visibleInspectionCategories } } },
        ...(selectedVesselId ? { vesselId: selectedVesselId } : {}),
      }
    : {
        vesselId: session.vesselId ?? "",
        isDeleted: false,
        status: { not: "ARCHIVED" as const },
        inspectionType: { is: { category: { in: visibleInspectionCategories } } },
      };

  const [inspections, vessels] = await Promise.all([
    prisma.virInspection.findMany({
      where,
      orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
      include: {
        vessel: { select: { id: true, code: true, name: true, vesselType: true, fleet: true } },
        inspectionType: { select: { name: true, code: true } },
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
        signOffs: {
          orderBy: { signedAt: "desc" },
          select: { id: true, stage: true, approved: true, actorName: true, signedAt: true },
        },
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
    const approvedSignOff = inspection.signOffs.find((item) => item.approved) ?? null;
    const reportType = inspection.inspectionType.name.includes("VIR") ? inspection.inspectionType.name : "VIR";

    const meta =
      inspection.metadata && typeof inspection.metadata === "object" && !Array.isArray(inspection.metadata)
        ? (inspection.metadata as Record<string, unknown>)
        : {};

    return {
      ...inspection,
      progress,
      overdueActions,
      approvedSignOff,
      reportType,
      refNo: inspection.externalReference ?? inspection.title,
      inspectionMode: inferInspectionMode(inspection.title, inspection.inspectionType.name),
      syncLabel: syncLabelForInspection(inspection.status),
      placeOfInspection: [inspection.port, inspection.country].filter(Boolean).join(", ") || "Not set",
      auditFromDate: fmt.format(inspection.inspectionDate),
      auditEndDate: typeof meta.auditEndDate === "string" ? meta.auditEndDate : null,
    };
  });

  const filtered = enriched.filter((inspection) => {
    const inspectionSource = `${inspection.title} ${inspection.inspectionType.name} ${inspection.inspectionType.code}`.toUpperCase();

    if (
      inspectionSource.includes("PSC") ||
      inspectionSource.includes("PORT STATE CONTROL") ||
      inspectionSource.includes("TMSA") ||
      inspectionSource.includes("SIRE") ||
      inspectionSource.includes("CDI") ||
      inspectionSource.includes("RIGHTSHIP")
    ) {
      return false;
    }

    if (
      searchTerm &&
      ![
        inspection.title,
        inspection.refNo,
        inspection.vessel.name,
        inspection.placeOfInspection,
        inspection.inspectorName ?? "",
        inspection.reportType,
        inspection.inspectionMode,
      ]
        .join(" ")
        .toLowerCase()
        .includes(searchTerm)
    ) {
      return false;
    }

    if (status && inspection.status !== status) {
      return false;
    }

    if (pageMode === "approved") {
      return ["SHORE_REVIEWED", "CLOSED"].includes(inspection.status);
    }

    if (pageMode === "history") {
      return inspection.status !== "ARCHIVED";
    }

    switch (scope) {
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

  const header = pageMode === "approved"
    ? {
        title: "Approved inspections",
        eyebrow: "Approved inspections",
        subtitle: "Approved register with quick access to approved date, approver, report type, and sync state.",
      }
    : pageMode === "history"
      ? {
          title: "Inspection history",
          eyebrow: "Inspection history",
          subtitle: "All inspection records with progress, status, inspection mode, and live action access.",
        }
        : {
          title: isOfficeSession(session) ? "Inspection Register" : "Inspection Register",
          eyebrow: "Inspection register",
          subtitle: isOfficeSession(session)
            ? "Draft, manager approval, vessel sync, office review, and closure are all managed in one fleet-wide register."
            : "Synced vessel inspections stay in one execution register while office retains planning and approval control.",
        };

  return (
    <div className="page-stack">
      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">{header.eyebrow}</div>
            <h2 className="panel-title">{header.title}</h2>
            <p className="panel-subtitle">{header.subtitle}</p>
          </div>
          <div className="actions-row">
            <Link className="btn-secondary btn-compact" href={modeHref("approved", { vesselId: selectedVesselId, view: viewMode, q })}>
              Approved inspections
            </Link>
            <Link className="btn-secondary btn-compact" href={modeHref("history", { vesselId: selectedVesselId, view: viewMode, q })}>
              Inspection history
            </Link>
            {isOfficeSession(session) ? (
              <Link className="btn btn-compact" href="/inspections/new">
                Create VIR
              </Link>
            ) : null}
          </div>
        </div>

        <div className="filter-toolbar">
          <div className="filter-chips">
            <Link
              className={`filter-chip ${pageMode === "register" ? "filter-chip-active" : ""}`}
              href={modeHref("register", { vesselId: selectedVesselId, view: viewMode, q })}
            >
              Inspection Register
            </Link>
            <Link
              className={`filter-chip ${pageMode === "approved" ? "filter-chip-active" : ""}`}
              href={modeHref("approved", { vesselId: selectedVesselId, view: viewMode, q })}
            >
              Approved inspections
            </Link>
            <Link
              className={`filter-chip ${pageMode === "history" ? "filter-chip-active" : ""}`}
              href={modeHref("history", { vesselId: selectedVesselId, view: viewMode, q })}
            >
              Inspection history
            </Link>
            <Link
              className={`filter-chip ${viewMode === "grid" ? "filter-chip-active" : ""}`}
              href={modeHref(pageMode, { vesselId: selectedVesselId, status, view: "grid", scope, q })}
            >
              <TableProperties size={16} />
              <span>Table/Grid View</span>
            </Link>
            <Link
              className={`filter-chip ${viewMode === "summary" ? "filter-chip-active" : ""}`}
              href={modeHref(pageMode, { vesselId: selectedVesselId, status, view: "summary", scope, q })}
            >
              <LayoutGrid size={16} />
              <span>Summary View</span>
            </Link>
          </div>

          <form className="inline-form inline-form-wide" method="get">
            {scope ? <input name="scope" type="hidden" value={scope} /> : null}
            {view ? <input name="view" type="hidden" value={view} /> : null}
            <label className="inline-form-label" htmlFor="q">
              Search
            </label>
            <input defaultValue={q ?? ""} id="q" name="q" placeholder="Search inspection, vessel, ref no, or place" />
            {isOfficeSession(session) ? (
              <>
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
              </>
            ) : null}
            <button className="btn-secondary" type="submit">
              Apply
            </button>
          </form>
        </div>

        {viewMode === "summary" ? (
          <SummaryInspectionView inspections={filtered} pageMode={pageMode} isOffice={isOfficeSession(session)} />
        ) : pageMode === "approved" ? (
          <ApprovedInspectionGrid inspections={filtered} />
        ) : pageMode === "history" ? (
          <InspectionHistoryGrid inspections={filtered} isOffice={isOfficeSession(session)} selectedVesselId={selectedVesselId} />
        ) : (
          <InspectionRegisterGrid inspections={filtered} isOffice={isOfficeSession(session)} />
        )}
      </section>

      <section className="erp-metrics-grid">
        <MetricStat label="Visible inspections" note="Current filtered set" value={filtered.length} />
        <MetricStat
          label="Approved"
          note="Shore reviewed or closed"
          value={filtered.filter((item) => ["SHORE_REVIEWED", "CLOSED"].includes(item.status)).length}
        />
        <MetricStat
          label="Pending approval"
          note="Submitted or returned"
          value={filtered.filter((item) => ["SUBMITTED", "RETURNED"].includes(item.status)).length}
        />
        <MetricStat label="Open findings" note="Across filtered set" value={filtered.reduce((sum, item) => sum + item.findings.length, 0)} />
        <MetricStat label="Overdue CAR" note="Past target date" value={filtered.reduce((sum, item) => sum + item.overdueActions, 0)} />
        <MetricStat
          label="Not Synced"
          note="Derived from draft or returned records"
          value={filtered.filter((item) => item.syncLabel === "Not Synced").length}
        />
      </section>
    </div>
  );
}

function ApprovedInspectionGrid({
  inspections,
}: {
  inspections: InspectionRow[];
}) {
  return (
    <div className="table-shell table-shell-compact">
      <table className="table data-table vir-data-table">
        <thead>
          <tr>
            <th>Vessel</th>
            <th>Ref no</th>
            <th>Place of inspection</th>
            <th>Inspected by</th>
            <th>Approved by</th>
            <th>Approved date</th>
            <th>Report Type</th>
            <th>Synced?</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {inspections.map((inspection) => (
            <tr key={inspection.id}>
              <td>
                <Link className="table-link" href={`/vessels/${inspection.vessel.id}`}>
                  {inspection.vessel.name}
                </Link>
                <div className="table-actions">
                  <ActionIconLink
                    href={`/reports/inspection/${inspection.id}?variant=detailed`}
                    icon={Eye}
                    label="Open approved report"
                    tone="primary"
                  />
                </div>
              </td>
              <td>
                <Link className="inline-link" href={`/reports/inspection/${inspection.id}?variant=detailed`}>
                  {inspection.refNo}
                </Link>
              </td>
              <td>{inspection.placeOfInspection}</td>
              <td>{inspection.inspectorName ?? "Not set"}</td>
              <td>{inspection.approvedSignOff?.actorName ?? inspection.shoreReviewedBy ?? "Not set"}</td>
              <td>{inspection.approvedSignOff?.signedAt ? fmt.format(inspection.approvedSignOff.signedAt) : inspection.shoreReviewDate ? fmt.format(inspection.shoreReviewDate) : "Not set"}</td>
              <td>{inspection.reportType}</td>
              <td>
                <span className={`chip ${inspection.syncLabel === "Synced" ? "chip-success" : "chip-danger"}`}>{inspection.syncLabel}</span>
              </td>
              <td>
                <div className="table-actions table-actions-icons">
                  <ActionIconLink href={`/inspections/${inspection.id}`} icon={Eye} label="Inspection workflow" tone="primary" />
                  <ActionIconLink
                    href={`/reports/inspection/${inspection.id}?variant=detailed`}
                    icon={FileText}
                    label="Detailed report"
                    tone="success"
                  />
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function InspectionHistoryGrid({
  inspections,
  isOffice,
  selectedVesselId,
}: {
  inspections: InspectionRow[];
  isOffice: boolean;
  selectedVesselId: string;
}) {
  return (
    <div className="table-shell table-shell-tall">
      <table className="table data-table vir-data-table">
        <thead>
          <tr>
            {isOffice ? <th>Vessel</th> : null}
            <th>Ref no</th>
            <th>Audit from</th>
            <th>Audit to</th>
            <th>Status</th>
            <th style={{ textAlign: "center" }}>Submitted</th>
            <th style={{ textAlign: "center" }}>Reviewed</th>
            <th style={{ textAlign: "center" }}>Acknowledged</th>
            <th>Place</th>
            <th>Inspected by</th>
            <th>Report Type</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {inspections.map((inspection) => {
            const hasVesselSubmit = inspection.signOffs.some(
              (s) => s.stage === "VESSEL_SUBMISSION" && s.approved
            );
            const hasShoreReview = inspection.signOffs.some(
              (s) => s.stage === "SHORE_REVIEW" && s.approved
            );
            const hasFinalAck = inspection.signOffs.some(
              (s) => s.stage === "FINAL_ACKNOWLEDGEMENT" && s.approved
            );

            return (
              <tr key={inspection.id}>
                {isOffice ? (
                  <td>
                    <Link className="table-link" href={`/vessels/${inspection.vessel.id}`}>
                      {inspection.vessel.name}
                    </Link>
                  </td>
                ) : null}
                <td>
                  <Link className="table-link" href={`/inspections/${inspection.id}`}>
                    {inspection.refNo}
                  </Link>
                  <div className="small-text">{inspection.inspectionMode}</div>
                </td>
                <td>{inspection.auditFromDate}</td>
                <td>{inspection.auditEndDate ?? "—"}</td>
                <td>
                  <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                    {inspectionStatusLabel[inspection.status]}
                  </span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span title="Vessel submitted" style={{ fontSize: "1.1rem" }}>
                    {hasVesselSubmit ? "✅" : "⬜"}
                  </span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span title="Shore reviewed" style={{ fontSize: "1.1rem" }}>
                    {hasShoreReview ? "✅" : "⬜"}
                  </span>
                </td>
                <td style={{ textAlign: "center" }}>
                  <span title="Final acknowledgement" style={{ fontSize: "1.1rem" }}>
                    {hasFinalAck ? "✅" : "⬜"}
                  </span>
                </td>
                <td>{inspection.placeOfInspection}</td>
                <td>{inspection.inspectorName ?? "Not set"}</td>
                <td>{inspection.reportType}</td>
                <td>
                  <div className="table-actions table-actions-icons">
                    <ActionIconLink href={`/inspections/${inspection.id}`} icon={Eye} label="Inspection workflow" tone="primary" />
                    <ActionIconLink
                      href={`/reports/inspection/${inspection.id}?variant=detailed`}
                      icon={FileText}
                      label="Detailed report"
                      tone="success"
                    />
                    {inspection.findings.length > 0 ? (
                      <ActionIconLink
                        href={`/deviations/${inspection.id}${selectedVesselId ? `?vesselId=${encodeURIComponent(selectedVesselId)}` : ""}`}
                        icon={TriangleAlert}
                        label="Pending deviations"
                        tone="warning"
                      />
                    ) : null}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function InspectionRegisterGrid({
  inspections,
  isOffice,
}: {
  inspections: InspectionRow[];
  isOffice: boolean;
}) {
  return (
    <div className="table-shell table-shell-tall">
      <table className="table data-table vir-data-table">
        <thead>
          <tr>
            <th>Inspection</th>
            {isOffice ? <th>Vessel</th> : null}
            <th>Type</th>
            <th>Status</th>
            <th>Completion</th>
            <th>Mandatory</th>
            <th>Open findings</th>
            <th>Open CAR</th>
            <th>Sign-offs</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {inspections.map((inspection) => (
            <tr key={inspection.id}>
              <td>
                <Link className="table-link" href={`/reports/inspection/${inspection.id}?variant=detailed`}>
                  {inspection.title}
                </Link>
                <div className="small-text">
                  {fmt.format(inspection.inspectionDate)}
                  {inspection.port ? ` / ${inspection.port}` : ""}
                </div>
              </td>
              {isOffice ? (
                <td>
                  <Link className="table-link" href={`/vessels/${inspection.vessel.id}`}>
                    {inspection.vessel.name}
                  </Link>
                </td>
              ) : null}
              <td>{inspection.inspectionType.name}</td>
              <td>
                <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>{inspectionStatusLabel[inspection.status]}</span>
              </td>
              <td>{inspection.progress.completionPct}%</td>
              <td>
                {inspection.progress.answeredMandatory}/{inspection.progress.mandatoryQuestions}
              </td>
              <td>{inspection.findings.length}</td>
              <td>{inspection.overdueActions}</td>
              <td>
                <div className="table-actions">
                  <span>{inspection.signOffs.filter((item) => item.approved).length}</span>
                </div>
              </td>
              <td>
                <div className="table-actions table-actions-icons">
                  <ActionIconLink href={`/inspections/${inspection.id}`} icon={Eye} label="Inspection workflow" tone="primary" />
                  <ActionIconLink
                    href={`/reports/inspection/${inspection.id}?variant=detailed`}
                    icon={FileText}
                    label="Detailed report"
                    tone="success"
                  />
                  {inspection.findings.length > 0 ? (
                    <ActionIconLink
                      href={`/deviations/${inspection.id}?vesselId=${inspection.vessel.id}`}
                      icon={TriangleAlert}
                      label="Deviation approval flow"
                      tone="warning"
                    />
                  ) : null}
                  {isOffice && inspection.status === "DRAFT" ? (
                    <form action={deleteDraftInspectionAction.bind(null, inspection.id)}>
                      <button
                        className="action-icon-button action-icon-button-danger"
                        title="Delete draft inspection"
                        type="submit"
                      >
                        <Trash2 size={15} />
                      </button>
                    </form>
                  ) : null}
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SummaryInspectionView({
  inspections,
  pageMode,
  isOffice,
}: {
  inspections: InspectionRow[];
  pageMode: PageMode;
  isOffice: boolean;
}) {
  return (
    <div className="inspection-summary-grid">
      {inspections.map((inspection) => (
        <article className="bar-card" key={inspection.id}>
          <div className="bar-card-header">
            <div>
              <strong>{pageMode === "approved" ? inspection.vessel.name : inspection.title}</strong>
              <div className="small-text">
                {pageMode === "approved"
                  ? `${inspection.refNo} / ${inspection.placeOfInspection}`
                  : `${inspection.vessel.name} / ${inspection.reportType} / ${inspection.inspectionMode}`}
              </div>
            </div>
            <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>{inspectionStatusLabel[inspection.status]}</span>
          </div>

          <div className="progress-cluster">
            <div>
              <div className="small-text">Progress</div>
              <div className="bar-track">
                <div className="bar-fill bar-fill-success" style={{ width: `${inspection.progress.completionPct}%` }} />
              </div>
            </div>
          </div>

          <div className="mini-metrics">
            {isOffice ? (
              <Link className="chip chip-info" href={`/vessels/${inspection.vessel.id}`}>
                {inspection.vessel.name}
              </Link>
            ) : null}
            <span className="chip chip-warning">Mandatory {inspection.progress.answeredMandatory}/{inspection.progress.mandatoryQuestions}</span>
            <span className="chip chip-danger">Findings {inspection.findings.length}</span>
            {inspection.conditionScore !== null && inspection.conditionScore !== undefined ? (
              <span className={`chip ${inspection.conditionScore >= 75 ? "chip-success" : inspection.conditionScore >= 40 ? "chip-warning" : "chip-danger"}`}>
                {inspection.conditionScore}%
              </span>
            ) : null}
            <span className={`chip ${inspection.syncLabel === "Synced" ? "chip-success" : "chip-danger"}`}>{inspection.syncLabel}</span>
          </div>

          <div className="small-text" style={{ marginTop: "0.7rem" }}>
            Inspected by {inspection.inspectorName ?? "Not set"}
            {inspection.approvedSignOff?.actorName ? ` / Approved by ${inspection.approvedSignOff.actorName}` : ""}
          </div>
          <div className="table-actions table-actions-icons" style={{ marginTop: "0.8rem" }}>
            <ActionIconLink href={`/inspections/${inspection.id}`} icon={Eye} label="Inspection workflow" tone="primary" />
            <ActionIconLink
              href={`/reports/inspection/${inspection.id}?variant=detailed`}
              icon={FileText}
              label="Detailed report"
              tone="success"
            />
          </div>
        </article>
      ))}
    </div>
  );
}

function normalizePageMode(scope: string | undefined, isOffice: boolean): PageMode {
  if (scope === "approved" && isOffice) {
    return "approved";
  }

  if (scope === "history") {
    return "history";
  }

  return "register";
}

function normalizeViewMode(view: string | undefined): ViewMode {
  return view === "summary" ? "summary" : "grid";
}

function modeHref(
  pageMode: PageMode,
  params: { vesselId?: string; status?: string; view?: string; scope?: string; q?: string }
) {
  const next = new URLSearchParams();

  if (pageMode === "approved") {
    next.set("scope", "approved");
  } else if (pageMode === "history") {
    next.set("scope", "history");
  } else if (params.scope && !["approved", "history"].includes(params.scope)) {
    next.set("scope", params.scope);
  }

  if (params.vesselId) {
    next.set("vesselId", params.vesselId);
  }

  if (params.status) {
    next.set("status", params.status);
  }

  if (params.view) {
    next.set("view", params.view);
  }

  if (params.q) {
    next.set("q", params.q);
  }

  return `/inspections${next.toString() ? `?${next.toString()}` : ""}`;
}

function inferInspectionMode(title: string, inspectionTypeName: string) {
  const source = `${title} ${inspectionTypeName}`.toUpperCase();

  if (source.includes("SAILING (REMOTE)")) {
    return "Sailing (Remote)";
  }

  if (source.includes("PORT (REMOTE)")) {
    return "Port (Remote)";
  }

  if (source.includes("PORT")) {
    return "Port";
  }

  return "Sailing";
}

function syncLabelForInspection(status: string): "Synced" | "Not Synced" {
  return ["DRAFT", "RETURNED", "IMPORT_REVIEW"].includes(status) ? "Not Synced" : "Synced";
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
