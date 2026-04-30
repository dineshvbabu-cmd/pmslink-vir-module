import type { VirInspectionTypeCategory } from "@prisma/client";
import Link from "next/link";
import { CalendarPlus } from "lucide-react";
import { ActionIconLink } from "@/components/action-icon-link";
import { AutoSubmitSelect } from "@/components/auto-submit-select";
import { ScheduleBoard } from "@/components/schedule-board";
import { prisma } from "@/lib/prisma";
import { getVirWorkspaceFilter, isOfficeSession, isTsiSession, requireVirSession } from "@/lib/vir/session";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fullFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });
const shortFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const visibleInspectionCategories: VirInspectionTypeCategory[] = ["INTERNAL", "CLASS"];

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

export default async function SchedulePage({
  searchParams,
}: {
  searchParams: Promise<{
    vesselId?: string;
    view?: string;
    plannerStatus?: string;
    compliance?: string;
  }>;
}) {
  const session = await requireVirSession();
  const isOffice = isOfficeSession(session);
  const workspaceFilter = isOffice ? await getVirWorkspaceFilter() : null;
  const params = await searchParams;
  const requestedVesselId = typeof params.vesselId === "string" ? params.vesselId.trim() : undefined;
  const selectedView = normalizeScheduleView(typeof params.view === "string" ? params.view : undefined);
  const selectedPlannerStatus = typeof params.plannerStatus === "string" ? params.plannerStatus : "ALL";
  const selectedCompliance = typeof params.compliance === "string" ? params.compliance : "ALL";
  const selectedVesselId =
    isOffice
      ? requestedVesselId !== undefined
        ? requestedVesselId
        : workspaceFilter?.vesselId ?? ""
      : session.vesselId ?? "";
  const windowStart = addDays(startOfDay(new Date()), -180);

  const isTsi = isOffice && isTsiSession(session);
  const scopedCodes = isTsi ? (session.dashboardVesselCodes ?? []) : [];

  // Fetch all active vessels in scope (including those with no inspections)
  const allActiveVessels = isOffice
    ? await prisma.vessel.findMany({
        where: {
          isActive: true,
          ...(selectedVesselId && selectedVesselId !== "__all__"
            ? { id: selectedVesselId }
            : scopedCodes.length > 0
              ? { code: { in: scopedCodes } }
              : {}),
        },
        select: { id: true, code: true, name: true, vesselType: true, fleet: true, metadata: true },
        orderBy: { name: "asc" },
      })
    : [];

  const allVesselsForFilter = isOffice
    ? await prisma.vessel.findMany({
        where: { isActive: true },
        select: { id: true, code: true, name: true, fleet: true },
        orderBy: { name: "asc" },
      })
    : [];

  const inspections = await prisma.virInspection.findMany({
    where: {
      status: { not: "ARCHIVED" },
      inspectionType: { is: { category: { in: visibleInspectionCategories } } },
      ...(isOffice
        ? selectedVesselId === "__all__"
          ? {}
          : selectedVesselId
            ? { vesselId: selectedVesselId }
            : scopedCodes.length > 0
              ? { vessel: { code: { in: scopedCodes } } }
              : {}
        : { vesselId: session.vesselId ?? "" }),
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
          metadata: true,
        },
      },
      inspectionType: { select: { name: true, code: true } },
      findings: {
        where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
        select: { id: true, status: true },
      },
      signOffs: {
        orderBy: { signedAt: "desc" },
        take: 1,
        select: { id: true, stage: true, approved: true, signedAt: true },
      },
    },
  });

  // Build vessel rows from inspections
  const inspectionVesselMap = new Map(inspections.map((i) => [i.vessel.id, i.vessel]));

  const buildRow = (vessel: { id: string; code: string; name: string; vesselType: string | null; fleet: string | null; metadata: unknown }) => {
    const vesselInspections = inspections
      .filter((i) => i.vessel.id === vessel.id)
      .sort((a, b) => b.inspectionDate.getTime() - a.inspectionDate.getTime());
    const lastInspection = vesselInspections[0] ?? null;
    const nextDue = addDays(lastInspection?.inspectionDate ?? addDays(new Date(), -182), 182);
    const nextInspectionMode = inferInspectionMode(lastInspection?.title ?? "", lastInspection?.inspectionType.name ?? "");
    const plannerStatus = classifyPlannerStatus(nextDue);
    const inspectionCompliance = lastInspection && ["SHORE_REVIEWED", "CLOSED"].includes(lastInspection.status) ? "In Order" : "No 2 VIR";
    const sailingCompliance =
      lastInspection && inferInspectionMode(lastInspection.title, lastInspection.inspectionType.name).startsWith("SAILING")
        ? "In Order"
        : "No Sailing";

    return {
      vessel,
      lastInspection,
      nextDue,
      nextInspectionMode,
      plannerStatus,
      inspectionCompliance,
      sailingCompliance,
      inspections: vesselInspections
        .filter((i) => i.inspectionDate >= windowStart)
        .map((i) => ({
          id: i.id,
          title: i.title,
          vesselId: i.vessel.id,
          vesselName: i.vessel.name,
          inspectionTypeName: i.inspectionType.name,
          inspectionDate: i.inspectionDate.toISOString(),
          status: i.status,
        })),
    };
  };

  // Rows for vessels that have inspections
  const rowsWithInspections = [...new Map(inspections.map((i) => [i.vessel.id, i.vessel])).values()].map(buildRow);

  // Rows for active vessels with no inspections (office view shows all)
  const inspectionVesselIds = new Set(rowsWithInspections.map((r) => r.vessel.id));
  const emptyRows = isOffice
    ? allActiveVessels
        .filter((v) => !inspectionVesselIds.has(v.id))
        .map(buildRow)
    : [];

  const vesselRows = [...rowsWithInspections, ...emptyRows].sort((a, b) =>
    a.vessel.name.localeCompare(b.vessel.name)
  );

  const filteredRows = vesselRows.filter((row) => {
    if (selectedPlannerStatus !== "ALL" && row.plannerStatus !== selectedPlannerStatus) return false;
    if (selectedCompliance === "NO_2_VIR" && row.inspectionCompliance !== "No 2 VIR") return false;
    if (selectedCompliance === "NO_SAILING" && row.sailingCompliance !== "No Sailing") return false;
    if (selectedCompliance === "IN_ORDER" && row.inspectionCompliance !== "In Order" && row.sailingCompliance !== "In Order") return false;
    return true;
  });

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="eyebrow">Inspection Calendar</div>
          <h2 className="hero-title">VESSEL INSPECTION STATUS &amp; PLANNER - 2026</h2>
          <p className="hero-copy">
            Review last vessel inspection, next due dates, compliance window, and planner status across the fleet.
          </p>
        </div>
        <div className="actions-row">
          <Link
            className="btn-secondary btn-compact"
            href={`/inspections?scope=history${selectedVesselId ? `&vesselId=${encodeURIComponent(selectedVesselId)}` : ""}`}
          >
            Open history
          </Link>
        </div>
      </section>

      <section className="erp-metrics-grid">
        <MetricTile label="Total vessels" note="Visible planner scope" value={filteredRows.length} />
        <MetricTile label="Approved" note="Last inspection approved" value={filteredRows.filter((r) => r.lastInspection && ["SHORE_REVIEWED", "CLOSED"].includes(r.lastInspection.status)).length} />
        <MetricTile label="Due Range" note="Due inside 30 days" value={filteredRows.filter((r) => r.plannerStatus === "Due Range").length} />
        <MetricTile label="Overdue" note="Past next due" value={filteredRows.filter((r) => r.plannerStatus === "Overdue").length} />
        <MetricTile label="No 2 Inspection" note="Inspection compliance exception" value={filteredRows.filter((r) => r.inspectionCompliance === "No 2 VIR").length} />
        <MetricTile label="No Sailing" note="Sailing compliance exception" value={filteredRows.filter((r) => r.sailingCompliance === "No Sailing").length} />
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Inspection planner &amp; compliance status</h3>
            <p className="panel-subtitle">Planner board showing last inspection, next due, compliance window, and scheduling status per vessel.</p>
          </div>
          <div className="actions-row">
            <Link
              className={`board-tab ${selectedView === "table" ? "board-tab-active" : ""}`}
              href={buildScheduleHref({ vesselId: selectedVesselId, view: "table", plannerStatus: selectedPlannerStatus, compliance: selectedCompliance })}
              scroll={false}
            >
              Table view
            </Link>
            <Link
              className={`board-tab ${selectedView === "gantt" ? "board-tab-active" : ""}`}
              href={buildScheduleHref({ vesselId: selectedVesselId, view: "gantt", plannerStatus: selectedPlannerStatus, compliance: selectedCompliance })}
              scroll={false}
            >
              Gantt view
            </Link>
          </div>
        </div>

        {isOffice && allVesselsForFilter.length > 0 ? (
          <form method="get" action="/schedule" style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <label style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--muted)", whiteSpace: "nowrap" }}>Filter vessel</label>
            <AutoSubmitSelect name="vesselId" defaultValue={selectedVesselId} className="filter-select" style={{ minWidth: "200px" }}>
              {isTsi ? (
                <>
                  <option value="">My vessels</option>
                  <option value="__all__">All fleet vessels</option>
                  {allVesselsForFilter
                    .filter((v) => scopedCodes.includes(v.code))
                    .map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.name}{v.fleet ? ` (${v.fleet})` : ""}
                      </option>
                    ))}
                </>
              ) : (
                <>
                  <option value="">All vessels</option>
                  {allVesselsForFilter.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.name}{v.fleet ? ` (${v.fleet})` : ""}
                    </option>
                  ))}
                </>
              )}
            </AutoSubmitSelect>
            {selectedPlannerStatus !== "ALL" ? <input type="hidden" name="plannerStatus" value={selectedPlannerStatus} /> : null}
            {selectedCompliance !== "ALL" ? <input type="hidden" name="compliance" value={selectedCompliance} /> : null}
            {selectedView !== "table" ? <input type="hidden" name="view" value={selectedView} /> : null}
          </form>
        ) : null}

        <div className="filter-chips" style={{ marginBottom: "1rem" }}>
          {(["ALL", "In Window", "Due Range", "Overdue"] as const).map((ps) => (
            <Link
              className={`filter-chip ${selectedPlannerStatus === ps ? "filter-chip-active" : ""}`}
              href={buildScheduleHref({ vesselId: selectedVesselId, view: selectedView, plannerStatus: ps, compliance: selectedCompliance })}
              key={ps}
              scroll={false}
            >
              {ps === "ALL" ? "All statuses" : ps}
            </Link>
          ))}
          {([
            { id: "ALL", label: "All compliance" },
            { id: "IN_ORDER", label: "In Order" },
            { id: "NO_2_VIR", label: "No 2 Inspection" },
            { id: "NO_SAILING", label: "No Sailing" },
          ] as const).map((item) => (
            <Link
              className={`filter-chip ${selectedCompliance === item.id ? "filter-chip-active" : ""}`}
              href={buildScheduleHref({ vesselId: selectedVesselId, view: selectedView, plannerStatus: selectedPlannerStatus, compliance: item.id })}
              key={item.id}
              scroll={false}
            >
              {item.label}
            </Link>
          ))}
        </div>

        {selectedView === "table" ? (
          <div className="planner-table-scroll table-shell table-shell-tall">
            <table className="table data-table planner-table">
              <thead>
                <tr>
                  <th className="planner-sticky planner-sticky-1" colSpan={3}>VESSEL</th>
                  <th colSpan={3}>LAST INSPECTION</th>
                  <th colSpan={4}>SCHEDULING &amp; COMPLIANCE</th>
                  {isOffice ? <th>SCHEDULE</th> : null}
                </tr>
                <tr>
                  <th className="planner-sticky planner-sticky-1">Vessel Name</th>
                  <th className="planner-sticky planner-sticky-2">Type</th>
                  <th className="planner-sticky planner-sticky-3">Fleet</th>
                  <th>Date</th>
                  <th>Mode</th>
                  <th>Status</th>
                  <th>Next Due</th>
                  <th>Compliance Window</th>
                  <th>Planner Status</th>
                  <th>2VIR / Sailing</th>
                  {isOffice ? <th></th> : null}
                </tr>
              </thead>
              <tbody>
                {filteredRows.length ? filteredRows.map((row) => (
                  <tr key={row.vessel.id}>
                    <td className="planner-sticky planner-sticky-1 planner-sticky-data">
                      <Link className="table-link" href={`/vessels/${row.vessel.id}?tab=history`}>
                        {row.vessel.name}
                      </Link>
                    </td>
                    <td className="planner-sticky planner-sticky-2 planner-sticky-data">{row.vessel.vesselType ?? "—"}</td>
                    <td className="planner-sticky planner-sticky-3 planner-sticky-data">{row.vessel.fleet ?? "—"}</td>
                    <td>{row.lastInspection ? shortFmt.format(row.lastInspection.inspectionDate) : "—"}</td>
                    <td>{row.lastInspection ? inferInspectionMode(row.lastInspection.title, row.lastInspection.inspectionType.name) : "—"}</td>
                    <td>
                      {row.lastInspection ? (
                        <span className={`chip ${toneForInspectionStatus(row.lastInspection.status)}`}>
                          {inspectionStatusLabel[row.lastInspection.status]}
                        </span>
                      ) : (
                        <span className="chip chip-muted">No record</span>
                      )}
                    </td>
                    <td>{fullFmt.format(row.nextDue)}</td>
                    <td style={{ whiteSpace: "nowrap", fontSize: "0.78rem" }}>
                      {fullFmt.format(addDays(row.nextDue, -30))} – {fullFmt.format(addDays(row.nextDue, 30))}
                    </td>
                    <td>
                      <span className={`chip ${toneForPlannerStatus(row.plannerStatus)}`}>{row.plannerStatus}</span>
                    </td>
                    <td>
                      <div style={{ display: "flex", gap: "0.25rem", flexWrap: "wrap" }}>
                        <span className={`chip ${row.inspectionCompliance === "In Order" ? "chip-success" : "chip-danger"}`} style={{ fontSize: "0.7rem" }}>
                          {row.inspectionCompliance === "In Order" ? "2VIR ✓" : "No 2VIR"}
                        </span>
                        <span className={`chip ${row.sailingCompliance === "In Order" ? "chip-success" : "chip-danger"}`} style={{ fontSize: "0.7rem" }}>
                          {row.sailingCompliance === "In Order" ? "Sail ✓" : "No Sail"}
                        </span>
                      </div>
                    </td>
                    {isOffice ? (
                      <td>
                        <ActionIconLink
                          href={`/inspections/new?vesselId=${row.vessel.id}`}
                          icon={CalendarPlus}
                          label="Schedule inspection"
                          tone={row.plannerStatus === "In Window" ? "neutral" : "warning"}
                        />
                      </td>
                    ) : null}
                  </tr>
                )) : (
                  <tr>
                    <td colSpan={isOffice ? 11 : 10} style={{ textAlign: "center", color: "var(--color-ink-soft)" }}>
                      No vessels match the selected filters.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="page-stack">
            <div>
              <h3 className="panel-title">Fleet gantt board</h3>
              <p className="panel-subtitle">Dynamic scheduler with smaller inspection tags and direct move support inside the gantt for office planners.</p>
            </div>
            <ScheduleBoard
              isOffice={isOffice}
              rows={filteredRows.map((row) => ({
                id: row.vessel.id,
                name: row.vessel.name,
                inspections: row.inspections,
              }))}
              windowStart={windowStart.toISOString()}
              horizonDays={180}
            />
          </div>
        )}
      </section>
    </div>
  );
}

function normalizeScheduleView(value?: string) {
  return value === "gantt" ? "gantt" : "table";
}

function buildScheduleHref({
  vesselId,
  view,
  plannerStatus,
  compliance,
}: {
  vesselId?: string;
  view?: string;
  plannerStatus?: string;
  compliance?: string;
}) {
  const p = new URLSearchParams();
  if (vesselId) p.set("vesselId", vesselId);
  if (view) p.set("view", view);
  if (plannerStatus && plannerStatus !== "ALL") p.set("plannerStatus", plannerStatus);
  if (compliance && compliance !== "ALL") p.set("compliance", compliance);
  const q = p.toString();
  return q ? `/schedule?${q}` : "/schedule";
}

function inferInspectionMode(title: string, inspectionTypeName: string) {
  const source = `${title} ${inspectionTypeName}`.toUpperCase();
  if (source.includes("SAILING (REMOTE)")) return "SAILING (REMOTE)";
  if (source.includes("PORT (REMOTE)")) return "PORT (REMOTE)";
  if (source.includes("PORT")) return "PORT";
  return "SAILING";
}

function classifyPlannerStatus(nextDue: Date) {
  const now = startOfDay(new Date());
  const days = Math.ceil((startOfDay(nextDue).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  if (days < 0) return "Overdue";
  if (days <= 30) return "Due Range";
  return "In Window";
}

function toneForPlannerStatus(status: string) {
  switch (status) {
    case "In Window": return "chip-success";
    case "Due Range": return "chip-warning";
    default: return "chip-danger";
  }
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
