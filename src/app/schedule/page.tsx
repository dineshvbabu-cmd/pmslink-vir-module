import Link from "next/link";
import { ScheduleBoard } from "@/components/schedule-board";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const fullFmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

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
  const windowStart = addDays(startOfDay(new Date()), -7);
  const windowEnd = addDays(windowStart, 56);

  const inspections = await prisma.virInspection.findMany({
    where: {
      status: { not: "ARCHIVED" },
      ...(isOffice ? {} : { vesselId: session.vesselId ?? "" }),
    },
    orderBy: [{ inspectionDate: "asc" }, { createdAt: "asc" }],
    include: {
      vessel: { select: { id: true, name: true } },
      inspectionType: { select: { name: true } },
      findings: {
        where: {
          status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] },
        },
        select: {
          id: true,
          status: true,
        },
      },
      signOffs: {
        orderBy: { signedAt: "desc" },
        take: 1,
        select: {
          id: true,
          stage: true,
          approved: true,
          signedAt: true,
        },
      },
    },
  });

  const timelineInspections = inspections.filter(
    (inspection) => inspection.inspectionDate >= windowStart && inspection.inspectionDate <= windowEnd
  );

  const vesselRows = [...new Map(timelineInspections.map((inspection) => [inspection.vessel.id, inspection.vessel])).values()]
    .map((vessel) => ({
      ...vessel,
      inspections: timelineInspections
        .filter((inspection) => inspection.vessel.id === vessel.id)
        .map((inspection) => ({
          id: inspection.id,
          title: inspection.title,
          vesselId: inspection.vessel.id,
          vesselName: inspection.vessel.name,
          inspectionTypeName: inspection.inspectionType.name,
          inspectionDate: inspection.inspectionDate.toISOString(),
          status: inspection.status,
        })),
    }))
    .sort((left, right) => left.name.localeCompare(right.name));

  const calendarDays = Array.from({ length: 21 }, (_, index) => addDays(startOfDay(new Date()), index)).map((date) => ({
    date,
    inspections: inspections.filter(
      (inspection) => startOfDay(inspection.inspectionDate).getTime() === date.getTime()
    ),
  }));

  const scheduledCount = timelineInspections.length;
  const submittedCount = timelineInspections.filter((inspection) => inspection.status === "SUBMITTED").length;
  const shoreCount = timelineInspections.filter((inspection) => inspection.status === "SHORE_REVIEWED").length;
  const carryForwardCount = timelineInspections.reduce(
    (sum, inspection) => sum + inspection.findings.filter((finding) => finding.status === "CARRIED_OVER").length,
    0
  );

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="eyebrow">{isOffice ? "Office scheduling board" : "Vessel schedule"}</div>
          <h2 className="hero-title">Inspection plan and handover timeline</h2>
          <p className="hero-copy">
            Run the fleet calendar, monitor ship-to-shore handovers, and drill from planned inspections straight into live execution.
          </p>
        </div>
        <div className="actions-row">
          <Link className="btn btn-compact" href="/inspections/new">
            Schedule VIR
          </Link>
          <Link className="btn-secondary btn-compact" href="/reports/management">
            Open management pack
          </Link>
        </div>
      </section>

      <section className="erp-metrics-grid">
        <MetricTile label="Planned window" note="56-day gantt horizon" value={scheduledCount} />
        <MetricTile label="Submitted" note="Waiting office action" value={submittedCount} />
        <MetricTile label="Shore reviewed" note="Released from office" value={shoreCount} />
        <MetricTile label="Carry-forward" note="Open items brought ahead" value={carryForwardCount} />
        <MetricTile
          label="Closed"
          note="Completed in visible window"
          value={timelineInspections.filter((inspection) => inspection.status === "CLOSED").length}
        />
        <MetricTile
          label="Upcoming 21d"
          note="Near-term board focus"
          value={calendarDays.reduce((sum, day) => sum + day.inspections.length, 0)}
        />
      </section>

      <section className="dashboard-grid dashboard-grid-wide">
        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Fleet gantt board</h3>
              <p className="panel-subtitle">Inspection cadence across vessels with one-click drill-down to the live workflow.</p>
            </div>
          </div>

          <ScheduleBoard isOffice={isOffice} rows={vesselRows} windowStart={windowStart.toISOString()} />
        </section>

        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">21-day calendar</h3>
              <p className="panel-subtitle">Near-term execution view for masters, office reviewers, and schedulers.</p>
            </div>
          </div>

          <div className="stack-list">
            {calendarDays.map((day) => (
              <div className="list-card" key={day.date.toISOString()}>
                <div className="section-header">
                  <div>
                    <div className="list-card-title">{fullFmt.format(day.date)}</div>
                    <div className="small-text">{day.inspections.length} inspections</div>
                  </div>
                  <span className={`chip ${day.inspections.length > 0 ? "chip-info" : "chip-muted"}`}>
                    {day.inspections.length > 0 ? "Active day" : "No events"}
                  </span>
                </div>

                {day.inspections.length > 0 ? (
                  <div className="stack-list">
                    {day.inspections.map((inspection) => (
                      <Link className="inline-link" href={`/inspections/${inspection.id}`} key={inspection.id}>
                        {inspection.vessel.name} / {inspection.title} / {inspection.inspectionType.name}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </section>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Ship-to-shore handover register</h3>
            <p className="panel-subtitle">Separate office and vessel statuses remain visible, but both flows work from the same inspection record.</p>
          </div>
        </div>

        <table className="table data-table">
          <thead>
            <tr>
              <th>Inspection</th>
              <th>Vessel</th>
              <th>Status</th>
              <th>Open findings</th>
              <th>Latest handover</th>
            </tr>
          </thead>
          <tbody>
            {timelineInspections.map((inspection) => (
              <tr key={inspection.id}>
                <td>
                  <Link className="table-link" href={`/inspections/${inspection.id}`}>
                    {inspection.title}
                  </Link>
                  <div className="small-text">
                    {inspection.inspectionType.name} / {fullFmt.format(inspection.inspectionDate)}
                  </div>
                </td>
                <td>{inspection.vessel.name}</td>
                <td>
                  <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                    {inspectionStatusLabel[inspection.status]}
                  </span>
                </td>
                <td>{inspection.findings.length}</td>
                <td>
                  {inspection.signOffs[0]
                    ? `${inspection.signOffs[0].stage.replaceAll("_", " ")} / ${inspection.signOffs[0].approved ? "approved" : "returned"}`
                    : "No sign-off yet"}
                </td>
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
