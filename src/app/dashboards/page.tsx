import Link from "next/link";
import { FileDown } from "lucide-react";
import { CompactBarChart, DonutChart, TrendLineChart } from "@/components/erp-charts";
import { prisma } from "@/lib/prisma";
import { calculateInspectionScore } from "@/lib/vir/analytics";
import {
  defaultDashboardScopedVesselCodes,
  getVirWorkspaceFilter,
  isOfficeSession,
  isTsiSession,
  requireVirSession,
} from "@/lib/vir/session";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

type BoardKey = "tmsa" | "class" | "psc-sire";
type RangeKey = "90" | "180" | "365";

const boardOptions: Array<{ key: BoardKey; label: string }> = [
  { key: "tmsa", label: "TMSA compliance" },
  { key: "class", label: "Class and statutory" },
  { key: "psc-sire", label: "PSC and SIRE / vetting" },
];

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function toSearchParams({
  board,
  scope,
  vesselId,
  range,
}: {
  board: BoardKey;
  scope?: string | null;
  vesselId?: string | null;
  range?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("board", board);

  if (scope) {
    params.set("scope", scope);
  }

  if (vesselId) {
    params.set("vesselId", vesselId);
  }

  if (range) {
    params.set("range", range);
  }

  return `/dashboards?${params.toString()}`;
}

export default async function DashboardBoardsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireVirSession();
  const workspaceFilter = await getVirWorkspaceFilter();
  const params = await searchParams;
  const board = normalizeBoard(params.board);
  const range = normalizeRange(
    typeof params.range === "string" ? params.range : workspaceFilter?.range ?? undefined
  );
  const scope = typeof params.scope === "string" ? params.scope : null;
  const requestedVesselId =
    typeof params.vesselId === "string"
      ? params.vesselId
      : session.workspace === "OFFICE"
        ? workspaceFilter?.vesselId ?? null
        : session.vesselId;
  const defaultScopedCodes = defaultDashboardScopedVesselCodes(session);
  const showExpandedScope = isOfficeSession(session) && scope === "all";
  const enforcedVesselCodes = defaultScopedCodes.length > 0 && !showExpandedScope ? defaultScopedCodes : [];

  const vesselWhere = {
    isActive: true,
    ...(session.workspace === "VESSEL" && session.vesselId ? { id: session.vesselId } : {}),
    ...(enforcedVesselCodes.length > 0 ? { code: { in: enforcedVesselCodes } } : {}),
    ...(requestedVesselId ? { id: requestedVesselId } : {}),
  };

  const now = new Date();
  const sinceDate = new Date();
  sinceDate.setDate(now.getDate() - Number(range));
  const dueSoonDate = new Date();
  dueSoonDate.setDate(now.getDate() + 45);

  const [vessels, inspections, overdueActions] = await Promise.all([
    prisma.vessel.findMany({
      where: vesselWhere,
      orderBy: { name: "asc" },
      select: {
        id: true,
        code: true,
        name: true,
        fleet: true,
        manager: true,
      },
    }),
    prisma.virInspection.findMany({
      where: {
        status: { not: "ARCHIVED" },
        inspectionDate: { gte: sinceDate },
        vessel: vesselWhere,
      },
      orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
      include: {
        vessel: { select: { id: true, code: true, name: true, fleet: true } },
        inspectionType: { select: { id: true, code: true, name: true, category: true } },
        template: {
          select: {
            sections: {
              select: {
                title: true,
                questions: {
                  select: {
                    id: true,
                    responseType: true,
                    riskLevel: true,
                    isMandatory: true,
                    isCicCandidate: true,
                    options: {
                      select: {
                        value: true,
                        score: true,
                      },
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
        findings: {
          where: {
            status: { in: ["OPEN", "IN_PROGRESS", "READY_FOR_REVIEW", "CARRIED_OVER"] },
          },
          select: {
            id: true,
            title: true,
            severity: true,
            status: true,
          },
        },
      },
    }),
    prisma.virCorrectiveAction.findMany({
      where: {
        status: { in: ["OPEN", "IN_PROGRESS", "REJECTED"] },
        targetDate: { lt: now },
        finding: {
          inspection: {
            vessel: vesselWhere,
          },
        },
      },
      include: {
        finding: {
          select: {
            title: true,
            inspection: {
              select: {
                id: true,
                title: true,
                vessel: { select: { name: true, code: true } },
              },
            },
          },
        },
      },
      orderBy: { targetDate: "asc" },
      take: 12,
    }),
  ]);

  const vesselCodes = new Set(vessels.map((vessel) => vessel.code));
  const filteredInspections = inspections.filter((inspection) => vesselCodes.has(inspection.vessel.code));
  const inspectionScores = filteredInspections.map((inspection) => {
    const questions = inspection.template?.sections.flatMap((section) => section.questions) ?? [];
    const score = calculateInspectionScore(questions, inspection.answers, inspection.findings);

    return {
      inspection,
      score: score.finalScore,
      cicCount: questions.filter((question) => question.isCicCandidate).length,
    };
  });

  const openFindings = filteredInspections.flatMap((inspection) =>
    inspection.findings.map((finding) => ({
      ...finding,
      inspectionId: inspection.id,
      inspectionTitle: inspection.title,
      vesselName: inspection.vessel.name,
      inspectionTypeName: inspection.inspectionType.name,
    }))
  );
  const averageScore = average(inspectionScores.map((item) => item.score).filter((value): value is number => value !== null));
  const latestByVessel = vessels.map((vessel) => {
    const vesselInspections = inspectionScores.filter((item) => item.inspection.vessel.code === vessel.code);

    return {
      vessel,
      inspections: vesselInspections,
      latest: vesselInspections[0]?.inspection ?? null,
      averageScore: average(vesselInspections.map((item) => item.score).filter((value): value is number => value !== null)),
      openFindings: vesselInspections.reduce((sum, item) => sum + item.inspection.findings.length, 0),
      criticalFindings: vesselInspections.reduce(
        (sum, item) => sum + item.inspection.findings.filter((finding) => finding.severity === "CRITICAL").length,
        0
      ),
    };
  });

  const tmsaInspections = inspectionScores.filter(
    (item) => item.inspection.inspectionType.code.includes("TMSA") || item.inspection.inspectionType.name.includes("TMSA")
  );
  const classInspections = inspectionScores.filter((item) => item.inspection.inspectionType.category === "CLASS");
  const pscSireInspections = inspectionScores.filter(
    (item) =>
      item.inspection.inspectionType.category === "PSC" ||
      item.inspection.inspectionType.category === "VETTING" ||
      ["SIRE", "SIRE_2_0", "RIGHTSHIP", "CID"].includes(item.inspection.inspectionType.code)
  );
  const visibleScopeLabel =
    session.workspace === "VESSEL"
      ? session.vesselName ?? "Assigned vessel"
      : isTsiSession(session) && !showExpandedScope
        ? session.dashboardScopeLabel ?? "TSI assigned vessels"
        : requestedVesselId
          ? vessels.find((vessel) => vessel.id === requestedVesselId)?.name ?? requestedVesselId
          : "Fleet-wide view";

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="eyebrow">Enterprise analytics boards</div>
          <h2 className="hero-title">
            {session.workspace === "VESSEL" ? "Vessel performance, compliance, and execution" : "Fleet performance and assurance boards"}
          </h2>
          <p className="hero-copy">
            Separate operational boards for TMSA, class/statutory, and PSC/SIRE, with role-aware scope and drill-down into the live VIR workflow.
          </p>
        </div>
        <div className="actions-row">
          <AnalyticsExportMenu
            items={[
              {
                href: `/api/reports/dashboard/pdf?kind=analytics&board=${board}&range=${range}${requestedVesselId ? `&vesselId=${encodeURIComponent(requestedVesselId)}` : ""}`,
                label: "Analytics PDF",
              },
              {
                href: `/api/reports/dashboard/pdf?kind=dashboard&range=${range}${requestedVesselId ? `&vesselId=${encodeURIComponent(requestedVesselId)}` : ""}`,
                label: "Dashboard PDF",
              },
            ]}
          />
          <Link className="btn btn-compact" href="/schedule">
            Open scheduler
          </Link>
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Board selector</h3>
            <p className="panel-subtitle">
              Scope: {visibleScopeLabel}
              {isTsiSession(session) ? " / TSI defaults to assigned vessels but can widen scope when needed." : ""}
            </p>
          </div>
        </div>

        <form className="inline-form inline-form-wide" method="get" style={{ marginTop: "1rem" }}>
          <label className="inline-form-label" htmlFor="board">
            Board
          </label>
          <select defaultValue={board} id="board" name="board">
            {boardOptions.map((option) => (
              <option key={option.key} value={option.key}>
                {option.label}
              </option>
            ))}
          </select>
          <label className="inline-form-label" htmlFor="range">
            Timeline
          </label>
          <select defaultValue={range} id="range" name="range">
            <option value="90">3 months to today</option>
            <option value="180">6 months to today</option>
            <option value="365">1 year to today</option>
          </select>
          <label className="inline-form-label" htmlFor="vesselId">
            Vessel
          </label>
          <select defaultValue={requestedVesselId ?? ""} id="vesselId" name="vesselId">
            <option value="">All visible vessels</option>
            {vessels.map((vessel) => (
              <option key={vessel.id} value={vessel.id}>
                {vessel.name}
              </option>
            ))}
          </select>
          {isTsiSession(session) ? (
            <>
              <label className="inline-form-label" htmlFor="scope">
                Scope
              </label>
              <select defaultValue={showExpandedScope ? "all" : "default"} id="scope" name="scope">
                <option value="default">Assigned scope</option>
                <option value="all">Expand to fleet</option>
              </select>
            </>
          ) : null}
          <button className="btn-secondary" type="submit">
            Apply
          </button>
        </form>
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        <TrendLineChart
          points={buildInspectionTrend(filteredInspections, Number(range))}
          subtitle={`Inspection activity trend over the last ${range} days.`}
          title="Inspection trend"
        />
        <DonutChart
          segments={buildStatusSegments(filteredInspections)}
          subtitle="Live status mix in the current board scope."
          title="Status distribution"
        />
      </section>

      {board === "tmsa" ? (
        <>
          <section className="erp-metrics-grid">
            <MetricTile label="TMSA inspections" note="Visible scope" value={tmsaInspections.length} />
            <MetricTile label="Average TMSA score" note="Derived from live answers" value={average(tmsaInspections.map((item) => item.score).filter((value): value is number => value !== null)) ?? "n/a"} />
            <MetricTile
              label="Shore approved"
              note="Released by office"
              value={tmsaInspections.filter((item) => item.inspection.status === "SHORE_REVIEWED" || item.inspection.status === "CLOSED").length}
            />
            <MetricTile
              label="Open gaps"
              note="Audit findings still active"
              value={tmsaInspections.reduce((sum, item) => sum + item.inspection.findings.length, 0)}
            />
            <MetricTile
              label="Returned"
              note="Needs rework"
              value={tmsaInspections.filter((item) => item.inspection.status === "RETURNED").length}
            />
            <MetricTile
              label="Draft / submitted"
              note="Still in vessel-office flow"
              value={tmsaInspections.filter((item) => ["DRAFT", "SUBMITTED"].includes(item.inspection.status)).length}
            />
          </section>

          <section className="dashboard-grid dashboard-grid-equal">
            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">TMSA compliance posture</h3>
                  <p className="panel-subtitle">Element-level readiness view based on the latest live inspections in the selected scope.</p>
                </div>
              </div>
              <div className="matrix-grid">
                {buildTmsaMatrix(tmsaInspections).map((item) => (
                  <div className="matrix-card" key={item.title}>
                    <strong>{item.title}</strong>
                    <div className="small-text" style={{ marginTop: "0.35rem" }}>
                      {item.note}
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill bar-fill-success" style={{ width: `${item.score}%` }} />
                    </div>
                    <div className="small-text" style={{ marginTop: "0.35rem" }}>
                      Readiness {item.score}%
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">TMSA gap register</h3>
                  <p className="panel-subtitle">Office can move directly into the inspection and close the real workflow item.</p>
                </div>
              </div>
              <div className="stack-list">
                {tmsaInspections.flatMap((item) => item.inspection.findings).length === 0 ? (
                  <div className="empty-state">No open TMSA findings are currently in scope.</div>
                ) : (
                  tmsaInspections.flatMap((item) =>
                    item.inspection.findings.slice(0, 3).map((finding) => (
                      <div className="list-card" key={finding.id}>
                        <div className="meta-row">
                          <span className="chip chip-warning">{finding.severity}</span>
                          <span className="chip chip-info">{item.inspection.vessel.name}</span>
                        </div>
                        <div className="list-card-title">{finding.title}</div>
                        <div className="small-text">{item.inspection.title}</div>
                        <Link className="inline-link" href={`/inspections/${item.inspection.id}`}>
                          Open inspection
                        </Link>
                      </div>
                    ))
                  )
                )}
              </div>
            </section>
          </section>

          <section className="dashboard-grid dashboard-grid-equal">
            <CompactBarChart
              bars={buildTmsaMatrix(tmsaInspections).map((item) => ({
                label: item.title,
                value: item.score,
                note: item.note,
              }))}
              subtitle="TMSA element readiness at a glance."
              title="TMSA readiness bars"
            />
            <DonutChart
              segments={[
                { label: "Approved", value: tmsaInspections.filter((item) => ["SHORE_REVIEWED", "CLOSED"].includes(item.inspection.status)).length, className: "donut-segment-success" },
                { label: "In progress", value: tmsaInspections.filter((item) => ["DRAFT", "RETURNED", "SUBMITTED"].includes(item.inspection.status)).length, className: "donut-segment-warning" },
                { label: "Open gaps", value: tmsaInspections.reduce((sum, item) => sum + item.inspection.findings.length, 0), className: "donut-segment-danger" },
              ]}
              subtitle="TMSA workflow distribution in the selected timeline."
              title="TMSA workflow pie"
            />
          </section>
        </>
      ) : null}

      {board === "class" ? (
        <>
          <section className="erp-metrics-grid">
            <MetricTile label="Class inspections" note="Visible scope" value={classInspections.length} />
            <MetricTile label="Open class findings" note="Still to close" value={classInspections.reduce((sum, item) => sum + item.inspection.findings.length, 0)} />
            <MetricTile
              label="Due 45d"
              note="Near-term statutory focus"
              value={classInspections.filter((item) => item.inspection.inspectionDate >= now && item.inspection.inspectionDate <= dueSoonDate).length}
            />
            <MetricTile
              label="Closed / shore reviewed"
              note="Governed by office"
              value={classInspections.filter((item) => ["SHORE_REVIEWED", "CLOSED"].includes(item.inspection.status)).length}
            />
            <MetricTile label="Average score" note="Condition and readiness" value={average(classInspections.map((item) => item.score).filter((value): value is number => value !== null)) ?? "n/a"} />
            <MetricTile label="Overdue CARs" note="Regulatory risk" value={overdueActions.filter((item) => item.finding.inspection.title.toLowerCase().includes("class")).length} />
          </section>

          <section className="dashboard-grid dashboard-grid-wide">
            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">Class and statutory board</h3>
                  <p className="panel-subtitle">Vessel-specific class posture, renewal cadence, and closure pressure.</p>
                </div>
              </div>
              <div className="stack-list">
                {latestByVessel.map((row) => {
                  const latestClass = classInspections.find((item) => item.inspection.vessel.code === row.vessel.code)?.inspection ?? null;
                  return (
                    <div className="bar-card" key={`class-${row.vessel.code}`}>
                      <div className="bar-card-header">
                        <div>
                          <strong>{row.vessel.name}</strong>
                          <div className="small-text">{latestClass ? latestClass.inspectionType.name : "No recent class inspection"}</div>
                        </div>
                        <Link className="btn-secondary btn-compact" href={`/inspections?vesselId=${row.vessel.id}`}>
                          Open register
                        </Link>
                      </div>
                      <div className="mini-metrics">
                        <span className="chip chip-info">Score {row.averageScore ?? "n/a"}</span>
                        <span className="chip chip-warning">Open findings {row.openFindings}</span>
                        <span className="chip chip-danger">Critical {row.criticalFindings}</span>
                      </div>
                      <div className="small-text" style={{ marginTop: "0.65rem" }}>
                        {latestClass ? `${fmt.format(latestClass.inspectionDate)} / ${latestClass.title}` : "Awaiting class activity in current scope."}
                      </div>
                    </div>
                  );
                })}
              </div>
            </section>

            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">Regulatory watchlist</h3>
                  <p className="panel-subtitle">Flag the live inspections most likely to impact statutory posture.</p>
                </div>
              </div>
              <div className="stack-list">
                {classInspections.slice(0, 8).map((item) => (
                  <div className="list-card" key={item.inspection.id}>
                    <div className="meta-row">
                      <span className={`chip ${toneForInspectionStatus(item.inspection.status)}`}>
                        {inspectionStatusLabel[item.inspection.status]}
                      </span>
                      <span className="chip chip-warning">Findings {item.inspection.findings.length}</span>
                    </div>
                    <div className="list-card-title">{item.inspection.title}</div>
                    <div className="small-text">
                      {item.inspection.vessel.name} / {fmt.format(item.inspection.inspectionDate)}
                    </div>
                    <Link className="inline-link" href={`/inspections/${item.inspection.id}`}>
                      Open workflow
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <section className="dashboard-grid dashboard-grid-equal">
            <CompactBarChart
              bars={latestByVessel.slice(0, 8).map((row) => ({
                label: row.vessel.name,
                value: row.criticalFindings + row.openFindings,
                note: `Critical ${row.criticalFindings} / review ${row.openFindings}`,
              }))}
              subtitle="Class/statutory burden by vessel."
              title="Class burden bars"
            />
            <TrendLineChart
              points={buildInspectionTrend(classInspections.map((item) => item.inspection), Number(range))}
              subtitle={`Class and statutory inspection volume over the last ${range} days.`}
              title="Class trend"
            />
          </section>
        </>
      ) : null}

      {board === "psc-sire" ? (
        <>
          <section className="erp-metrics-grid">
            <MetricTile
              label="PSC inspections"
              note="Live and recent"
              value={pscSireInspections.filter((item) => item.inspection.inspectionType.category === "PSC").length}
            />
            <MetricTile
              label="SIRE / vetting"
              note="Vetting categories"
              value={pscSireInspections.filter((item) => item.inspection.inspectionType.category === "VETTING").length}
            />
            <MetricTile
              label="Submitted / returned"
              note="Pending office intervention"
              value={pscSireInspections.filter((item) => ["SUBMITTED", "RETURNED"].includes(item.inspection.status)).length}
            />
            <MetricTile
              label="Critical findings"
              note="Highest risk observations"
              value={pscSireInspections.reduce(
                (sum, item) => sum + item.inspection.findings.filter((finding) => finding.severity === "CRITICAL").length,
                0
              )}
            />
            <MetricTile
              label="Approved"
              note="Released by office"
              value={pscSireInspections.filter((item) => ["SHORE_REVIEWED", "CLOSED"].includes(item.inspection.status)).length}
            />
            <MetricTile
              label="Average score"
              note="PSC / SIRE readiness"
              value={average(pscSireInspections.map((item) => item.score).filter((value): value is number => value !== null)) ?? "n/a"}
            />
          </section>

          <section className="dashboard-grid dashboard-grid-equal">
            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">PSC and SIRE board</h3>
                  <p className="panel-subtitle">Readiness, vessel pressure, and the live queue by vessel and inspection family.</p>
                </div>
              </div>
              <div className="stack-list">
                {buildInspectionFamilySummary(pscSireInspections).map((family) => (
                  <div className="bar-card" key={family.label}>
                    <div className="bar-card-header">
                      <div>
                        <strong>{family.label}</strong>
                        <div className="small-text">
                          {family.count} inspections / {family.findings} open findings / average score {family.score ?? "n/a"}
                        </div>
                      </div>
                      <span className="chip chip-info">Findings {family.findings}</span>
                    </div>
                    <div className="bar-track">
                      <div className="bar-fill" style={{ width: `${Math.max(10, family.score ?? 25)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">Vetting and PSC watchlist</h3>
                  <p className="panel-subtitle">Live queue of high-risk inspections needing follow-up in the selected scope.</p>
                </div>
              </div>
              <div className="stack-list">
                {pscSireInspections.slice(0, 8).map((item) => (
                  <div className="list-card" key={`watch-${item.inspection.id}`}>
                    <div className="meta-row">
                      <span className={`chip ${toneForInspectionStatus(item.inspection.status)}`}>
                        {inspectionStatusLabel[item.inspection.status]}
                      </span>
                      <span className="chip chip-warning">Findings {item.inspection.findings.length}</span>
                    </div>
                    <div className="list-card-title">{item.inspection.title}</div>
                    <div className="small-text">
                      {item.inspection.vessel.name} / average score {item.score ?? "n/a"}
                    </div>
                    <Link className="inline-link" href={`/reports/inspection/${item.inspection.id}?variant=summary`}>
                      Open report
                    </Link>
                  </div>
                ))}
              </div>
            </section>
          </section>

          <section className="dashboard-grid dashboard-grid-equal">
            <CompactBarChart
              bars={buildInspectionFamilySummary(pscSireInspections).map((family) => ({
                label: family.label,
                value: family.findings,
                note: `${family.count} inspections / score ${family.score ?? "n/a"}`,
              }))}
              subtitle="Open finding burden by inspection family."
              title="Finding focus bars"
            />
            <DonutChart
              segments={[
                { label: "PSC", value: pscSireInspections.filter((item) => item.inspection.inspectionType.category === "PSC").length, className: "donut-segment-info" },
                { label: "Vetting", value: pscSireInspections.filter((item) => item.inspection.inspectionType.category === "VETTING").length, className: "donut-segment-success" },
                { label: "Critical findings", value: pscSireInspections.reduce((sum, item) => sum + item.inspection.findings.filter((finding) => finding.severity === "CRITICAL").length, 0), className: "donut-segment-danger" },
              ]}
              subtitle="PSC/SIRE/vetting mix in the selected range."
              title="PSC / SIRE pie"
            />
          </section>
        </>
      ) : null}

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Overdue corrective actions</h3>
            <p className="panel-subtitle">Cross-workflow management triggers for the selected vessel and timeline scope.</p>
          </div>
        </div>

        <div className="table-shell table-shell-compact">
          <table className="table data-table">
            <thead>
              <tr>
                <th>Vessel</th>
                <th>Inspection</th>
                <th>Action</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {overdueActions.length === 0 ? (
                <tr>
                  <td colSpan={4}>No overdue corrective actions in the visible scope.</td>
                </tr>
              ) : (
                overdueActions.map((action) => (
                  <tr key={action.id}>
                    <td>{action.finding.inspection.vessel.name}</td>
                    <td>
                      <Link className="table-link" href={`/inspections/${action.finding.inspection.id}`}>
                        {action.finding.inspection.title}
                      </Link>
                    </td>
                    <td>{action.actionText}</td>
                    <td>{action.status}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}

function normalizeBoard(value: string | string[] | undefined): BoardKey {
  const board = Array.isArray(value) ? value[0] : value;

  if (board === "tmsa" || board === "class" || board === "psc-sire") {
    return board;
  }

  return "tmsa";
}

function normalizeRange(value: string | undefined): RangeKey {
  if (value === "90" || value === "180" || value === "365") {
    return value;
  }

  return "180";
}

function average(values: number[]) {
  if (values.length === 0) {
    return null;
  }

  return Math.round(values.reduce((sum, value) => sum + value, 0) / values.length);
}

function buildTmsaMatrix(
  inspections: Array<{
    inspection: {
      findings: Array<{ severity: string }>;
      template: { sections: Array<{ title: string }> } | null;
    };
    score: number | null;
  }>
) {
  const baseTitles = [
    "Leadership and accountability",
    "Risk and change",
    "Incident learning",
    "Navigational assurance",
    "Engineering control",
    "Environmental discipline",
  ];

  return baseTitles.map((title, index) => {
    const inspection = inspections[index % Math.max(inspections.length, 1)];
    const score = Math.max(35, (inspection?.score ?? 68) - index * 3);

    return {
      title,
      score,
      note: inspection
        ? `${inspection.inspection.findings.length} open findings influencing this discipline view.`
        : "No TMSA inspection yet; awaiting live questionnaire data or imported assessment.",
    };
  });
}

function buildInspectionFamilySummary(
  inspections: Array<{
    inspection: {
      inspectionType: { name: string };
      findings: Array<unknown>;
    };
    score: number | null;
    cicCount: number;
  }>
) {
  const map = new Map<string, { count: number; findings: number; scoreValues: number[]; cicCount: number }>();

  for (const item of inspections) {
    const key = item.inspection.inspectionType.name;
    const current = map.get(key) ?? { count: 0, findings: 0, scoreValues: [], cicCount: 0 };
    current.count += 1;
    current.findings += item.inspection.findings.length;
    current.cicCount += item.cicCount;

    if (typeof item.score === "number") {
      current.scoreValues.push(item.score);
    }

    map.set(key, current);
  }

  return [...map.entries()].map(([label, value]) => ({
    label,
    count: value.count,
    findings: value.findings,
    cicCount: value.cicCount,
    score: average(value.scoreValues),
  }));
}

function buildInspectionTrend(
  inspections: Array<{
    inspectionDate: Date;
  }>,
  rangeDays: number
) {
  const bucketCount = Math.min(8, Math.max(4, Math.round(rangeDays / 30)));
  const bucketSize = Math.max(1, Math.round(rangeDays / bucketCount));
  const now = new Date();
  const buckets = Array.from({ length: bucketCount }, (_, index) => {
    const bucketStart = new Date(now);
    bucketStart.setDate(now.getDate() - rangeDays + index * bucketSize);
    const bucketEnd = new Date(bucketStart);
    bucketEnd.setDate(bucketStart.getDate() + bucketSize);

    return {
      label: bucketStart.toLocaleDateString("en-GB", { day: "2-digit", month: "short" }),
      value: inspections.filter((inspection) => inspection.inspectionDate >= bucketStart && inspection.inspectionDate < bucketEnd).length,
    };
  });

  return buckets;
}

function buildStatusSegments(
  inspections: Array<{
    status: string;
  }>
) {
  const groups = [
    {
      label: "Draft / return",
      value: inspections.filter((inspection) => ["DRAFT", "RETURNED"].includes(inspection.status)).length,
      className: "donut-segment-warning",
    },
    {
      label: "Submitted / review",
      value: inspections.filter((inspection) => ["SUBMITTED", "SHORE_REVIEWED"].includes(inspection.status)).length,
      className: "donut-segment-info",
    },
    {
      label: "Closed",
      value: inspections.filter((inspection) => inspection.status === "CLOSED").length,
      className: "donut-segment-success",
    },
  ];

  return groups;
}

function MetricTile({ label, note, value }: { label: string; note: string; value: number | string | null }) {
  return (
    <div className="metric-tile metric-tile-static">
      <div className="metric-tile-label">{label}</div>
      <div className="metric-tile-value">{value ?? "n/a"}</div>
      <div className="metric-tile-note">{note}</div>
    </div>
  );
}

function AnalyticsExportMenu({
  items,
}: {
  items: Array<{ href: string; label: string }>;
}) {
  return (
    <details className="export-menu">
      <summary aria-label="Export PDFs" className="btn-secondary btn-compact export-menu-trigger export-menu-trigger-icon" title="Export PDFs">
        <FileDown size={16} />
      </summary>
      <div className="export-menu-popover">
        {items.map((item) => (
          <a className="export-menu-item" href={item.href} key={item.label}>
            {item.label}
          </a>
        ))}
      </div>
    </details>
  );
}
