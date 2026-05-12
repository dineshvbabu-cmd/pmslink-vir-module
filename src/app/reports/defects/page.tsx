import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireVirSession, canAccessVessel } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const statusLabel: Record<string, string> = {
  OPEN: "Open",
  IN_PROGRESS: "In Progress",
  CLOSED: "Closed",
  CANCELLED: "Cancelled",
};

const statusTone: Record<string, string> = {
  OPEN: "chip-danger",
  IN_PROGRESS: "chip-warning",
  CLOSED: "chip-success",
  CANCELLED: "chip-info",
};

const targetLabel: Record<string, string> = {
  PMS: "PMS",
  QHSE: "QHSE",
  BOTH: "PMS + QHSE",
  FINDINGS_ONLY: "Findings Only",
};

export default async function DefectTraceabilityPage({
  searchParams,
}: {
  searchParams: Promise<{ target?: string; status?: string; vesselId?: string }>;
}) {
  const session = await requireVirSession();
  const { target, status, vesselId } = await searchParams;

  const records = await prisma.virFindingDefectRecord.findMany({
    where: {
      ...(target ? { defectTarget: target as "PMS" | "QHSE" | "BOTH" | "FINDINGS_ONLY" } : {}),
      ...(status ? { status: status as "OPEN" | "IN_PROGRESS" | "CLOSED" | "CANCELLED" } : {}),
      inspection: {
        isDeleted: false,
        ...(vesselId ? { vesselId } : {}),
      },
    },
    include: {
      finding: { select: { findingType: true, severity: true } },
      inspection: {
        select: {
          id: true,
          title: true,
          inspectionDate: true,
          vessel: { select: { id: true, name: true } },
        },
      },
    },
    orderBy: { raisedAt: "desc" },
    take: 500,
  });

  const filtered = records.filter((r) => canAccessVessel(session, r.inspection.vessel.id));

  const vessels = await prisma.vessel.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: "asc" },
  });

  return (
    <div className="page-stack">
      <div className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h2 className="panel-title">Defect Traceability Register</h2>
            <p className="panel-subtitle">Centralised view of all finding defect records across inspections.</p>
          </div>
          <Link className="btn-ghost btn-compact" href="/reports/management">← Management Reports</Link>
        </div>

        <form className="filter-bar" method="GET" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", marginBottom: "1rem", alignItems: "flex-end" }}>
          <div className="field" style={{ minWidth: "160px" }}>
            <label htmlFor="f-vessel" style={{ fontSize: "0.8rem" }}>Vessel</label>
            <select defaultValue={vesselId ?? ""} id="f-vessel" name="vesselId" style={{ fontSize: "0.82rem" }}>
              <option value="">All vessels</option>
              {vessels.map((v) => (
                <option key={v.id} value={v.id}>{v.name}</option>
              ))}
            </select>
          </div>
          <div className="field" style={{ minWidth: "140px" }}>
            <label htmlFor="f-target" style={{ fontSize: "0.8rem" }}>Route</label>
            <select defaultValue={target ?? ""} id="f-target" name="target" style={{ fontSize: "0.82rem" }}>
              <option value="">All routes</option>
              <option value="PMS">PMS</option>
              <option value="QHSE">QHSE</option>
              <option value="BOTH">PMS + QHSE</option>
              <option value="FINDINGS_ONLY">Findings Only</option>
            </select>
          </div>
          <div className="field" style={{ minWidth: "130px" }}>
            <label htmlFor="f-status" style={{ fontSize: "0.8rem" }}>Status</label>
            <select defaultValue={status ?? ""} id="f-status" name="status" style={{ fontSize: "0.82rem" }}>
              <option value="">All statuses</option>
              <option value="OPEN">Open</option>
              <option value="IN_PROGRESS">In Progress</option>
              <option value="CLOSED">Closed</option>
              <option value="CANCELLED">Cancelled</option>
            </select>
          </div>
          <button className="btn-secondary btn-compact" style={{ fontSize: "0.82rem" }} type="submit">Filter</button>
        </form>

        <div className="small-text" style={{ marginBottom: "0.75rem", color: "var(--color-ink-soft)" }}>
          {filtered.length} record{filtered.length !== 1 ? "s" : ""}
        </div>

        {filtered.length === 0 ? (
          <div className="empty-state">No defect records found for the selected filters.</div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table className="vir-crew-table" style={{ fontSize: "0.82rem" }}>
              <thead>
                <tr>
                  <th>Ref</th>
                  <th>Vessel</th>
                  <th>Inspection</th>
                  <th>Title</th>
                  <th>Classification</th>
                  <th>Route</th>
                  <th>Status</th>
                  <th>Raised</th>
                  <th>QHSE Ref</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((rec) => (
                  <tr key={rec.id}>
                    <td style={{ fontFamily: "monospace", fontWeight: 600, whiteSpace: "nowrap" }}>{rec.defectRef}</td>
                    <td style={{ whiteSpace: "nowrap" }}>{rec.inspection.vessel.name}</td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--color-ink-soft)" }}>
                      {rec.inspection.title}
                      <br />
                      <span style={{ fontSize: "0.75rem" }}>{fmt.format(rec.inspection.inspectionDate)}</span>
                    </td>
                    <td style={{ maxWidth: "260px" }}>{rec.title}</td>
                    <td>
                      {rec.defectClassification === "SEP" ? (
                        <span className="chip-sep">SEP</span>
                      ) : rec.defectClassification === "NORMAL" ? (
                        <span className="chip chip-info" style={{ fontSize: "0.65rem" }}>Normal</span>
                      ) : (
                        <span style={{ color: "var(--color-ink-soft)" }}>—</span>
                      )}
                    </td>
                    <td>
                      <span className="chip chip-info" style={{ fontSize: "0.65rem" }}>
                        {targetLabel[rec.defectTarget] ?? rec.defectTarget}
                      </span>
                    </td>
                    <td>
                      <span className={`chip ${statusTone[rec.status] ?? "chip-info"}`} style={{ fontSize: "0.65rem" }}>
                        {statusLabel[rec.status] ?? rec.status}
                      </span>
                    </td>
                    <td style={{ whiteSpace: "nowrap", color: "var(--color-ink-soft)", fontSize: "0.75rem" }}>
                      {fmt.format(rec.raisedAt)}
                    </td>
                    <td style={{ color: "var(--color-ink-soft)", fontSize: "0.75rem" }}>{rec.qhseRef ?? "—"}</td>
                    <td>
                      <Link
                        className="btn-ghost btn-compact"
                        href={`/inspections/${rec.inspection.id}?pane=findings`}
                        style={{ fontSize: "0.75rem", padding: "2px 8px" }}
                      >
                        View
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
