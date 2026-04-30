import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, FileText, Plus, TriangleAlert } from "lucide-react";
import { ActionIconLink } from "@/components/action-icon-link";
import { prisma } from "@/lib/prisma";
import { normalizeRemoteAssetUrl } from "@/lib/vir/live-checklist";
import { canAccessVessel, isOfficeSession, requireVirSession } from "@/lib/vir/session";
import { buildVesselProfile } from "@/lib/vir/vessel-profile";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
const fmtInput = (d: Date) => d.toISOString().slice(0, 10);

type TabKey = "details" | "history";

export default async function VesselDetailsPage({
  params,
  searchParams,
}: {
  params: Promise<{ vesselId: string }>;
  searchParams: Promise<{ tab?: string; from?: string; to?: string }>;
}) {
  const session = await requireVirSession();
  const { vesselId } = await params;
  const { tab, from, to } = await searchParams;

  const activeTab: TabKey = tab === "history" ? "history" : "details";

  // Date filter for history tab
  const today = new Date();
  const defaultFrom = new Date(today.getFullYear() - 2, 0, 1);
  const fromDate = from ? new Date(from) : defaultFrom;
  const toDate = to ? new Date(to) : today;

  const vessel = await prisma.vessel.findUnique({
    where: { id: vesselId },
    include: {
      inspections: {
        where: {
          isDeleted: false,
          ...(activeTab === "history"
            ? {
                status: { in: ["SHORE_REVIEWED", "CLOSED"] },
                inspectionDate: { gte: fromDate, lte: toDate },
              }
            : {
                status: { not: "ARCHIVED" },
                inspectionType: { is: { category: { in: ["INTERNAL", "CLASS"] } } },
              }),
        },
        orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
        include: {
          inspectionType: { select: { name: true, category: true } },
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
  const pendingDeviationCount = vessel.inspections.reduce((sum, i) => sum + i.findings.length, 0);
  const vesselProfile = buildVesselProfile(vessel);

  const tabHref = (t: TabKey, extra?: Record<string, string>) => {
    const p = new URLSearchParams({ tab: t, ...extra });
    return `/vessels/${vessel.id}?${p.toString()}`;
  };

  return (
    <div className="page-stack">
      <Link className="back-link" href="/vessels" scroll={false}>
        <ArrowLeft size={16} />
        <span>Back to vessel register</span>
      </Link>

      {/* Tab bar */}
      <div className="panel panel-elevated" style={{ padding: 0, overflow: "hidden" }}>
        <div style={{ display: "flex", borderBottom: "1px solid var(--color-border)" }}>
          {(["details", "history"] as TabKey[]).map((t) => (
            <Link
              className={`vir-pane-tab${activeTab === t ? " vir-pane-tab-active" : ""}`}
              href={tabHref(t)}
              key={t}
              scroll={false}
            >
              {t === "details" ? "Vessel Details" : "Inspection History"}
            </Link>
          ))}
          {isOfficeSession(session) && (
            <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: "0.5rem", padding: "0 1rem" }}>
              <Link className="btn btn-compact" href={`/inspections/new?vesselId=${vessel.id}`}>
                <Plus size={14} style={{ marginRight: "0.25rem" }} />
                Create inspection
              </Link>
            </div>
          )}
        </div>
      </div>

      {activeTab === "details" ? (
        <>
          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <div className="eyebrow">Vessel details</div>
                <h2 className="hero-title">{vessel.name}</h2>
                <p className="hero-copy">Vessel particulars, machinery details, and component configuration.</p>
              </div>
              <div className="actions-row">
                {session.workspace === "OFFICE" ? (
                  <Link className="btn-secondary btn-compact" href={`/vessels?dialog=edit-vessel&vesselId=${vessel.id}`}>
                    Edit vessel
                  </Link>
                ) : null}
                {latestInspection ? (
                  <Link className="btn btn-compact" href={`/reports/inspection/${latestInspection.id}?variant=detailed`}>
                    Latest report
                  </Link>
                ) : null}
              </div>
            </div>

            <div style={{ display: "flex", gap: "1.5rem", alignItems: "flex-start", flexWrap: "wrap" }}>
              {vessel.imageUrl ? (
                <img
                  alt={vessel.name}
                  src={normalizeRemoteAssetUrl(vessel.imageUrl)}
                  style={{ width: "220px", height: "140px", objectFit: "cover", borderRadius: "8px", border: "1px solid var(--color-border)", flexShrink: 0 }}
                />
              ) : null}
              <div className="report-detail-grid" style={{ flex: 1 }}>
                <DetailRow label="Vessel code" value={vessel.code} />
                <DetailRow label="IMO number" value={vessel.imoNumber ?? "Not recorded"} />
                <DetailRow label="Type" value={vessel.vesselType ?? "Not recorded"} />
                <DetailRow label="Fleet" value={vessel.fleet ?? "Not recorded"} />
                <DetailRow label="Flag" value={vessel.flag ?? "Not recorded"} />
                <DetailRow label="Manager" value={vessel.manager ?? "Not recorded"} />
                <DetailRow label="Latest inspection" value={latestInspection ? fmt.format(latestInspection.inspectionDate) : "Not recorded"} />
                <DetailRow label="Pending deviations" value={`${pendingDeviationCount}`} />
              </div>
            </div>
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Vessel particulars</h3>
                <p className="panel-subtitle">Principal particulars, management information, and reference data.</p>
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
              </div>
            </div>
            <div className="table-shell table-shell-compact">
              <table className="table data-table vir-data-table">
                <thead>
                  <tr><th>Component</th><th>Configuration</th></tr>
                </thead>
                <tbody>
                  {vesselProfile.componentConfiguration.map((item) => (
                    <tr key={item.label}><td>{item.label}</td><td>{item.value}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div><h3 className="panel-title">Machinery particulars</h3></div>
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
              </div>
            </div>
            <div className="table-shell table-shell-compact">
              <table className="table data-table vir-data-table">
                <thead>
                  <tr><th>Rating</th><th>Sailing inspection</th><th>P/S inspection</th></tr>
                </thead>
                <tbody>
                  {vesselProfile.vesselRatingGuide.map((item) => (
                    <tr key={item.rating}>
                      <td>{item.rating}</td><td>{item.sailingInspection}</td><td>{item.portInspection}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div><h3 className="panel-title">Vessel condition guide</h3></div>
            </div>
            <div className="table-shell table-shell-compact">
              <table className="table data-table vir-data-table">
                <thead>
                  <tr><th>Description</th><th>Criteria</th><th>Score range</th><th>Reference</th></tr>
                </thead>
                <tbody>
                  {vesselProfile.vesselConditionGuide.map((item, index) => (
                    <tr key={`${item.description}-${index + 1}`}>
                      <td>{item.description}</td>
                      <td>{item.criteria}</td>
                      <td>{item.scoreRange}</td>
                      <td>
                        {item.referenceImageUrl ? (
                          <a className="inline-link" href={normalizeRemoteAssetUrl(item.referenceImageUrl)} rel="noreferrer" target="_blank">
                            View reference
                          </a>
                        ) : "n/a"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : (
        /* ── HISTORY TAB ── */
        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <div className="eyebrow">{vessel.name}</div>
              <h3 className="panel-title">Closed inspection history</h3>
              <p className="panel-subtitle">Showing approved and closed inspections only. Use date filter to narrow the range.</p>
            </div>
          </div>

          {/* Date filter */}
          <form method="get" action={`/vessels/${vessel.id}`} style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginBottom: "1rem", flexWrap: "wrap" }}>
            <input type="hidden" name="tab" value="history" />
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 600 }}>
              From
              <input
                className="field-input"
                defaultValue={fmtInput(fromDate)}
                name="from"
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                type="date"
              />
            </label>
            <label style={{ display: "flex", alignItems: "center", gap: "0.4rem", fontSize: "0.8rem", fontWeight: 600 }}>
              To
              <input
                className="field-input"
                defaultValue={fmtInput(toDate)}
                name="to"
                style={{ padding: "0.25rem 0.5rem", fontSize: "0.8rem" }}
                type="date"
              />
            </label>
            <button className="btn-secondary btn-compact" type="submit">Apply filter</button>
            <Link className="btn-secondary btn-compact" href={tabHref("history")}>Reset</Link>
            <span style={{ fontSize: "0.78rem", color: "var(--color-ink-soft)", marginLeft: "auto" }}>
              {vessel.inspections.length} record{vessel.inspections.length !== 1 ? "s" : ""} found
            </span>
          </form>

          <div className="table-shell table-shell-compact">
            <table className="table data-table vir-data-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Ref no</th>
                  <th>Inspection</th>
                  <th>Type</th>
                  <th>Status</th>
                  <th>Place</th>
                  <th>Last sign-off</th>
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
                      <td>{inspection.inspectionType.name}</td>
                      <td>
                        <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                          {inspectionStatusLabel[inspection.status]}
                        </span>
                      </td>
                      <td>{[inspection.port, inspection.country].filter(Boolean).join(", ") || "—"}</td>
                      <td>
                        {inspection.signOffs[0]
                          ? `${inspection.signOffs[0].actorName ?? "—"} · ${fmt.format(inspection.signOffs[0].signedAt)}`
                          : "—"}
                      </td>
                      <td>{inspection.findings.length}</td>
                      <td>
                        <div className="table-actions table-actions-icons">
                          <ActionIconLink href={`/inspections/${inspection.id}`} icon={Eye} label="Open workflow" tone="primary" />
                          <ActionIconLink href={`/reports/inspection/${inspection.id}?variant=detailed`} icon={FileText} label="Detailed report" tone="success" />
                          {inspection.findings.length ? (
                            <ActionIconLink href={`/deviations/${inspection.id}?vesselId=${vessel.id}`} icon={TriangleAlert} label="Deviation approval" tone="warning" />
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={9} style={{ textAlign: "center", color: "var(--color-ink-soft)" }}>
                      No closed inspections found in the selected date range.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}
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
