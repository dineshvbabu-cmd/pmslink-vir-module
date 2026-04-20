import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { canAccessVessel, requireVirSession } from "@/lib/vir/session";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function VesselDetailsPage({
  params,
}: {
  params: Promise<{ vesselId: string }>;
}) {
  const session = await requireVirSession();
  const { vesselId } = await params;

  const vessel = await prisma.vessel.findUnique({
    where: { id: vesselId },
    include: {
      inspections: {
        where: {
          status: { not: "ARCHIVED" },
          inspectionType: { is: { category: { in: ["INTERNAL", "CLASS"] } } },
        },
        orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
        include: {
          inspectionType: { select: { name: true } },
          findings: {
            where: { status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] } },
            select: { id: true },
          },
          signOffs: {
            orderBy: { signedAt: "desc" },
            take: 1,
            select: { actorName: true, signedAt: true },
          },
        },
      },
    },
  });

  if (!vessel || !canAccessVessel(session, vessel.id)) {
    notFound();
  }

  const latestInspection = vessel.inspections[0] ?? null;
  const pendingDeviationCount = vessel.inspections.reduce((sum, inspection) => sum + inspection.findings.length, 0);

  return (
    <div className="page-stack">
      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Vessel details</div>
            <h2 className="hero-title">{vessel.name}</h2>
            <p className="hero-copy">Vessel particulars and inspection history drill-down for office and vessel workflows.</p>
          </div>
          <div className="actions-row">
            <Link className="btn-secondary btn-compact" href={`/inspections?scope=history&vesselId=${vessel.id}`}>
              Open inspection history
            </Link>
            {latestInspection ? (
              <Link className="btn btn-compact" href={`/reports/inspection/${latestInspection.id}?variant=detailed`}>
                Open latest report
              </Link>
            ) : null}
          </div>
        </div>

        <div className="report-detail-grid">
          <DetailRow label="Vessel code" value={vessel.code} />
          <DetailRow label="IMO number" value={vessel.imoNumber ?? "Not recorded"} />
          <DetailRow label="Type" value={vessel.vesselType ?? "Not recorded"} />
          <DetailRow label="Fleet" value={vessel.fleet ?? "Not recorded"} />
          <DetailRow label="Flag" value={vessel.flag ?? "Not recorded"} />
          <DetailRow label="Manager" value={vessel.manager ?? "Not recorded"} />
          <DetailRow label="Latest VIR" value={latestInspection ? fmt.format(latestInspection.inspectionDate) : "Not recorded"} />
          <DetailRow label="Pending deviations" value={`${pendingDeviationCount}`} />
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Inspection history</h3>
            <p className="panel-subtitle">Full vessel record with direct links into workflow, report, and pending deviation review.</p>
          </div>
        </div>

        <div className="table-shell table-shell-compact">
          <table className="table data-table vir-data-table">
            <thead>
              <tr>
                <th>Date</th>
                <th>Ref no</th>
                <th>Inspection</th>
                <th>Status</th>
                <th>Place of inspection</th>
                <th>Report type</th>
                <th>Pending deviations</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {vessel.inspections.length ? (
                vessel.inspections.map((inspection) => (
                  <tr key={inspection.id}>
                    <td>{fmt.format(inspection.inspectionDate)}</td>
                    <td>{inspection.externalReference ?? inspection.title}</td>
                    <td>{inspection.title}</td>
                    <td>
                      <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                        {inspectionStatusLabel[inspection.status]}
                      </span>
                    </td>
                    <td>{[inspection.port, inspection.country].filter(Boolean).join(", ") || "Not recorded"}</td>
                    <td>{inspection.inspectionType.name}</td>
                    <td>{inspection.findings.length}</td>
                    <td>
                      <div className="table-actions">
                        <Link className="inline-link" href={`/inspections/${inspection.id}`}>
                          Workflow
                        </Link>
                        <Link className="inline-link" href={`/reports/inspection/${inspection.id}?variant=detailed`}>
                          Report
                        </Link>
                        {inspection.findings.length ? (
                          <Link className="inline-link" href={`/deviations/${inspection.id}?vesselId=${vessel.id}`}>
                            Deviation
                          </Link>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={8}>No inspection history recorded for this vessel yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <div className="detail-row-label">{label}</div>
      <div className="detail-row-value">{value}</div>
    </div>
  );
}
