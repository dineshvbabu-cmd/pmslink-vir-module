import Link from "next/link";
import { ScheduleBoard } from "@/components/schedule-board";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fullFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

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

export default async function SchedulePage() {
  const session = await requireVirSession();
  const isOffice = isOfficeSession(session);
  const windowStart = addDays(startOfDay(new Date()), -14);

  const inspections = await prisma.virInspection.findMany({
    where: {
      status: { not: "ARCHIVED" },
      ...(isOffice ? {} : { vesselId: session.vesselId ?? "" }),
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

  const vesselRows = [...new Map(inspections.map((inspection) => [inspection.vessel.id, inspection.vessel])).values()]
    .map((vessel) => {
      const vesselInspections = inspections
        .filter((inspection) => inspection.vessel.id === vessel.id)
        .sort((left, right) => right.inspectionDate.getTime() - left.inspectionDate.getTime());
      const lastInspection = vesselInspections[0] ?? null;
      const previousInspection = vesselInspections[1] ?? null;
      const nextDue = addDays(lastInspection?.inspectionDate ?? new Date(), 182);
      const nextInspectionMode = inferInspectionMode(lastInspection?.title ?? "", lastInspection?.inspectionType.name ?? "");
      const plannerStatus = classifyPlannerStatus(nextDue);
      const inspectionCompliance = lastInspection && ["SHORE_REVIEWED", "CLOSED"].includes(lastInspection.status) ? "In Order" : "No 2 VIR";
      const sailingCompliance =
        lastInspection && inferInspectionMode(lastInspection.title, lastInspection.inspectionType.name).startsWith("Sailing")
          ? "In Order"
          : "No Sailing";

      return {
        vessel,
        lastInspection,
        previousInspection,
        nextDue,
        nextInspectionMode,
        plannerStatus,
        inspectionCompliance,
        sailingCompliance,
        inspections: vesselInspections
          .filter((inspection) => inspection.inspectionDate >= windowStart)
          .map((inspection) => ({
            id: inspection.id,
            title: inspection.title,
            vesselId: inspection.vessel.id,
            vesselName: inspection.vessel.name,
            inspectionTypeName: inspection.inspectionType.name,
            inspectionDate: inspection.inspectionDate.toISOString(),
            status: inspection.status,
          })),
      };
    })
    .sort((left, right) => left.vessel.name.localeCompare(right.vessel.name));

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="eyebrow">VIR Calendar</div>
          <h2 className="hero-title">VESSEL INSPECTION STATUS &amp; PLANNER - 2026</h2>
          <p className="hero-copy">
            Review previous vessel inspection, last vessel inspection, and inspection planner &amp; compliance status in one
            office-vessel scheduling board.
          </p>
        </div>
        <div className="actions-row">
          <Link className="btn btn-compact" href="/inspections/new">
            Schedule VIR
          </Link>
          <Link className="btn-secondary btn-compact" href="/inspections?scope=history">
            Open history
          </Link>
        </div>
      </section>

      <section className="erp-metrics-grid">
        <MetricTile label="Total vessels" note="Visible planner scope" value={vesselRows.length} />
        <MetricTile label="Approved" note="Last inspection approved" value={vesselRows.filter((row) => row.lastInspection && ["SHORE_REVIEWED", "CLOSED"].includes(row.lastInspection.status)).length} />
        <MetricTile label="Due Range" note="Due inside 30 days" value={vesselRows.filter((row) => row.plannerStatus === "Due Range").length} />
        <MetricTile label="Overdue" note="Past next due" value={vesselRows.filter((row) => row.plannerStatus === "Overdue").length} />
        <MetricTile label="No 2 VIR" note="Inspection compliance exception" value={vesselRows.filter((row) => row.inspectionCompliance === "No 2 VIR").length} />
        <MetricTile label="No Sailing" note="Sailing compliance exception" value={vesselRows.filter((row) => row.sailingCompliance === "No Sailing").length} />
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Inspection planner &amp; compliance status</h3>
            <p className="panel-subtitle">Workbook-style planner grid aligned to vessel, type, fleet, previous inspection, last inspection, and next due status.</p>
          </div>
        </div>

        <div className="planner-table-scroll">
          <table className="table data-table planner-table">
            <thead>
              <tr>
                <th colSpan={3}>VESSEL / TYPE / FLEET</th>
                <th colSpan={6}>PREVIOUS VESSEL INSPECTION</th>
                <th colSpan={6}>LAST VESSEL INSPECTION</th>
                <th colSpan={5}>INSPECTION PLANNER &amp; COMPLIANCE STATUS</th>
              </tr>
              <tr>
                <th>Vessel Name</th>
                <th>Vessel Type</th>
                <th>Group Name</th>
                <th>From Date</th>
                <th>To Date</th>
                <th>Inspection Mode</th>
                <th>From Location</th>
                <th>To Location</th>
                <th>Status</th>
                <th>From Date</th>
                <th>To Date</th>
                <th>Inspection Mode</th>
                <th>From Location</th>
                <th>To Location</th>
                <th>Status</th>
                <th>Next Due</th>
                <th>Next Inspection Mode</th>
                <th>Inspection Status</th>
                <th>Inspection Compliance</th>
                <th>Sailing Compliance</th>
              </tr>
            </thead>
            <tbody>
              {vesselRows.map((row) => (
                <tr key={row.vessel.id}>
                  <td>{row.vessel.name}</td>
                  <td>{row.vessel.vesselType ?? "Not set"}</td>
                  <td>{row.vessel.fleet ?? "Not set"}</td>
                  <td>{row.previousInspection ? fullFmt.format(row.previousInspection.inspectionDate) : "-"}</td>
                  <td>{row.previousInspection ? fullFmt.format(row.previousInspection.inspectionDate) : "-"}</td>
                  <td>{row.previousInspection ? inferInspectionMode(row.previousInspection.title, row.previousInspection.inspectionType.name) : "-"}</td>
                  <td>{row.previousInspection?.port ?? "-"}</td>
                  <td>{row.previousInspection?.country ?? "-"}</td>
                  <td>
                    {row.previousInspection ? (
                      <span className={`chip ${toneForInspectionStatus(row.previousInspection.status)}`}>
                        {inspectionStatusLabel[row.previousInspection.status]}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{row.lastInspection ? fullFmt.format(row.lastInspection.inspectionDate) : "-"}</td>
                  <td>{row.lastInspection ? fullFmt.format(row.lastInspection.inspectionDate) : "-"}</td>
                  <td>{row.lastInspection ? inferInspectionMode(row.lastInspection.title, row.lastInspection.inspectionType.name) : "-"}</td>
                  <td>{row.lastInspection?.port ?? "-"}</td>
                  <td>{row.lastInspection?.country ?? "-"}</td>
                  <td>
                    {row.lastInspection ? (
                      <span className={`chip ${toneForInspectionStatus(row.lastInspection.status)}`}>
                        {inspectionStatusLabel[row.lastInspection.status]}
                      </span>
                    ) : (
                      "-"
                    )}
                  </td>
                  <td>{fullFmt.format(row.nextDue)}</td>
                  <td>{row.nextInspectionMode}</td>
                  <td>
                    <span className={`chip ${toneForPlannerStatus(row.plannerStatus)}`}>{row.plannerStatus}</span>
                  </td>
                  <td>
                    <span className={`chip ${row.inspectionCompliance === "In Order" ? "chip-success" : "chip-danger"}`}>{row.inspectionCompliance}</span>
                  </td>
                  <td>
                    <span className={`chip ${row.sailingCompliance === "In Order" ? "chip-success" : "chip-danger"}`}>{row.sailingCompliance}</span>
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
            <h3 className="panel-title">Fleet gantt board</h3>
            <p className="panel-subtitle">Dynamic scheduler with smaller inspection tags and direct move support inside the gantt for office planners.</p>
          </div>
        </div>
        <ScheduleBoard
          isOffice={isOffice}
          rows={vesselRows.map((row) => ({
            id: row.vessel.id,
            name: row.vessel.name,
            inspections: row.inspections,
          }))}
          windowStart={windowStart.toISOString()}
          horizonDays={92}
        />
      </section>
    </div>
  );
}

function inferInspectionMode(title: string, inspectionTypeName: string) {
  const source = `${title} ${inspectionTypeName}`.toUpperCase();

  if (source.includes("SAILING (REMOTE)")) {
    return "SAILING (REMOTE)";
  }

  if (source.includes("PORT (REMOTE)")) {
    return "PORT (REMOTE)";
  }

  if (source.includes("PORT")) {
    return "PORT";
  }

  return "SAILING";
}

function classifyPlannerStatus(nextDue: Date) {
  const now = startOfDay(new Date());
  const days = Math.ceil((startOfDay(nextDue).getTime() - now.getTime()) / (24 * 60 * 60 * 1000));

  if (days < 0) {
    return "Overdue";
  }

  if (days <= 30) {
    return "Due Range";
  }

  return "In Window";
}

function toneForPlannerStatus(status: string) {
  switch (status) {
    case "In Window":
      return "chip-success";
    case "Due Range":
      return "chip-warning";
    default:
      return "chip-danger";
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
