import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function InspectionsPage() {
  const inspections = await prisma.virInspection.findMany({
    orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
    include: {
      vessel: { select: { name: true } },
      inspectionType: { select: { name: true } },
      findings: {
        where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
        select: { id: true, status: true },
      },
      signOffs: { select: { id: true } },
    },
  });

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-header">
          <div>
            <h2 className="panel-title">Inspection Register</h2>
            <p className="panel-subtitle">Operational list of all VIR records across vessel, PSC, vetting, and internal inspections.</p>
          </div>
          <Link className="btn" href="/inspections/new">
            Create VIR
          </Link>
        </div>
        <table className="table">
          <thead>
            <tr>
              <th>Inspection</th>
              <th>Vessel</th>
              <th>Type</th>
              <th>Date</th>
              <th>Status</th>
              <th>Open Findings</th>
              <th>Sign-Offs</th>
            </tr>
          </thead>
          <tbody>
            {inspections.map((inspection) => (
              <tr key={inspection.id}>
                <td>
                  <Link href={`/inspections/${inspection.id}`} style={{ fontWeight: 700, color: "var(--color-navy)" }}>
                    {inspection.title}
                  </Link>
                  {inspection.port ? <div className="small-text">{inspection.port}</div> : null}
                </td>
                <td>{inspection.vessel.name}</td>
                <td>{inspection.inspectionType.name}</td>
                <td>{fmt.format(inspection.inspectionDate)}</td>
                <td>
                  <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                    {inspectionStatusLabel[inspection.status]}
                  </span>
                </td>
                <td>{inspection.findings.length}</td>
                <td>{inspection.signOffs.length}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="three-col">
        <SummaryPanel title="Draft / Returned" value={inspections.filter((item) => item.status === "DRAFT" || item.status === "RETURNED").length} note="Need vessel-side completion or correction" />
        <SummaryPanel title="Submitted / Review" value={inspections.filter((item) => item.status === "SUBMITTED" || item.status === "SHORE_REVIEWED").length} note="Active shore workflow" />
        <SummaryPanel title="Open Findings" value={inspections.reduce((sum, inspection) => sum + inspection.findings.length, 0)} note="Live unresolved findings across the register" />
      </section>
    </div>
  );
}

function SummaryPanel({ title, value, note }: { title: string; value: number; note: string }) {
  return (
    <div className="panel">
      <div className="stat-label">{title}</div>
      <div className="stat-value">{value}</div>
      <div className="stat-note">{note}</div>
    </div>
  );
}
