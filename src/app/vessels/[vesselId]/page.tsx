import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, FileText, TriangleAlert } from "lucide-react";
import { ActionIconLink } from "@/components/action-icon-link";
import { prisma } from "@/lib/prisma";
import { canAccessVessel, requireVirSession } from "@/lib/vir/session";
import { buildVesselProfile } from "@/lib/vir/vessel-profile";
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
  const vesselProfile = buildVesselProfile(vessel);

  return (
    <div className="page-stack">
      <Link className="back-link" href={`/inspections?scope=history&vesselId=${vessel.id}`} scroll={false}>
        <ArrowLeft size={16} />
        <span>Back to inspection history</span>
      </Link>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Vessel details</div>
            <h2 className="hero-title">{vessel.name}</h2>
            <p className="hero-copy">Vessel particulars and inspection history drill-down for office and vessel workflows.</p>
          </div>
          <div className="actions-row">
            <Link className="btn-secondary btn-compact" href={`/inspections/new?vesselId=${vessel.id}`}>
              Create inspection-new format
            </Link>
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
            <h3 className="panel-title">Vessel particulars</h3>
            <p className="panel-subtitle">Principal particulars, management information, and reference data for vessel workflow drill-down.</p>
          </div>
        </div>

        <div className="report-detail-grid">
          {vesselProfile.principalParticulars.map((item) => (
            <DetailRow key={item.label} label={item.label} value={item.value} />
          ))}
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Ship specific component list</h3>
            <p className="panel-subtitle">One-time vessel configuration used to support inspection planning and questionnaire interpretation.</p>
          </div>
        </div>

        <div className="table-shell table-shell-compact">
          <table className="table data-table vir-data-table">
            <thead>
              <tr>
                <th>Component</th>
                <th>Configuration</th>
              </tr>
            </thead>
            <tbody>
              {vesselProfile.componentConfiguration.map((item) => (
                <tr key={item.label}>
                  <td>{item.label}</td>
                  <td>{item.value}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Machinery particulars</h3>
            <p className="panel-subtitle">Engine, auxiliary, boiler, and gas-system particulars for the deeper vessel workflow.</p>
          </div>
        </div>

        <div className="stack-list">
          {vesselProfile.machineryBlocks.map((block) => (
            <div className="list-card" key={block.title}>
              <div className="list-card-title">{block.title}</div>
              <div className="report-detail-grid" style={{ marginTop: "1rem" }}>
                {block.rows.map((item) => (
                  <DetailRow key={`${block.title}-${item.label}`} label={item.label} value={item.value} />
                ))}
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Vessel rating guide</h3>
            <p className="panel-subtitle">Shared rating logic for sailing and port inspection review, matching the deeper workflow expectation.</p>
          </div>
        </div>

        <div className="table-shell table-shell-compact">
          <table className="table data-table vir-data-table">
            <thead>
              <tr>
                <th>Vessel rating</th>
                <th>Sailing inspection</th>
                <th>P/S inspection</th>
              </tr>
            </thead>
            <tbody>
              {vesselProfile.vesselRatingGuide.map((item) => (
                <tr key={item.rating}>
                  <td>{item.rating}</td>
                  <td>{item.sailingInspection}</td>
                  <td>{item.portInspection}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Vessel condition guide</h3>
            <p className="panel-subtitle">Condition scoring reference used during chapter review and section-summary reasoning.</p>
          </div>
        </div>

        <div className="table-shell table-shell-compact">
          <table className="table data-table vir-data-table">
            <thead>
              <tr>
                <th>Description</th>
                <th>Criteria</th>
                <th>Score range</th>
                <th>Reference</th>
              </tr>
            </thead>
            <tbody>
              {vesselProfile.vesselConditionGuide.map((item, index) => (
                <tr key={`${item.description}-${index + 1}`}>
                  <td>{item.description}</td>
                  <td>{item.criteria}</td>
                  <td>{item.scoreRange}</td>
                  <td>
                    {item.referenceImageUrl ? (
                      <a className="inline-link" href={item.referenceImageUrl} target="_blank" rel="noreferrer">
                        View reference
                      </a>
                    ) : (
                      "n/a"
                    )}
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
                      <div className="table-actions table-actions-icons">
                        <ActionIconLink href={`/inspections/${inspection.id}`} icon={Eye} label="Inspection workflow" tone="primary" />
                        <ActionIconLink
                          href={`/reports/inspection/${inspection.id}?variant=detailed`}
                          icon={FileText}
                          label="Detailed report"
                          tone="success"
                        />
                        {inspection.findings.length ? (
                          <ActionIconLink
                            href={`/deviations/${inspection.id}?vesselId=${vessel.id}`}
                            icon={TriangleAlert}
                            label="Deviation approval flow"
                            tone="warning"
                          />
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
