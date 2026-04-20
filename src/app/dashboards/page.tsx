import Link from "next/link";
import { CompactBarChart, DonutChart, TrendLineChart } from "@/components/erp-charts";
import { prisma } from "@/lib/prisma";
import { calculateInspectionScore } from "@/lib/vir/analytics";
import {
  defaultDashboardScopedVesselCodes,
  isOfficeSession,
  isTsiSession,
  requireVirSession,
} from "@/lib/vir/session";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

type BoardKey = "overview" | "tmsa" | "class" | "psc-sire";
type RangeKey = "30" | "90" | "180" | "365";

const boardOptions: Array<{ key: BoardKey; label: string }> = [
  { key: "overview", label: "Fleet / vessel overview" },
  { key: "tmsa", label: "TMSA compliance" },
  { key: "class", label: "Class and statutory" },
  { key: "psc-sire", label: "PSC and SIRE / vetting" },
];

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

function toSearchParams({
  board,
  scope,
  vesselCode,
  range,
}: {
  board: BoardKey;
  scope?: string | null;
  vesselCode?: string | null;
  range?: string | null;
}) {
  const params = new URLSearchParams();
  params.set("board", board);

  if (scope) {
    params.set("scope", scope);
  }

  if (vesselCode) {
    params.set("vesselCode", vesselCode);
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
  const params = await searchParams;
  const board = normalizeBoard(params.board);
  const range = normalizeRange(typeof params.range === "string" ? params.range : undefined);
  const scope = typeof params.scope === "string" ? params.scope : null;
  const requestedVesselCode = typeof params.vesselCode === "string" ? params.vesselCode : null;
  const defaultScopedCodes = defaultDashboardScopedVesselCodes(session);
  const showExpandedScope = isOfficeSession(session) && scope === "all";
  const enforcedVesselCodes = defaultScopedCodes.length > 0 && !showExpandedScope ? defaultScopedCodes : [];

  const vesselWhere = {
    isActive: true,
    ...(enforcedVesselCodes.length > 0 ? { code: { in: enforcedVesselCodes } } : {}),
    ...(requestedVesselCode ? { code: requestedVesselCode } : {}),
  };

  const now = new Date();
  const sinceDate = new Date();
  sinceDate.setDate(now.getDate() - Number(range));
  const dueSoonDate = new Date();
  dueSoonDate.setDate(now.getDate() + 45);

  const [vessels, inspections, overdueActions, importSessions, templates] = await Promise.all([
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
    prisma.virImportSession.findMany({
      where: {
        ...(requestedVesselCode ? { vessel: { code: requestedVesselCode } } : {}),
      },
      include: {
        inspectionType: { select: { code: true, name: true, category: true } },
      },
      orderBy: { createdAt: "desc" },
      take: 12,
    }),
    prisma.virTemplate.findMany({
      where: {
        inspectionType: {
          ...(requestedVesselCode ? {} : {}),
        },
      },
      include: {
        inspectionType: { select: { code: true, name: true, category: true } },
        sections: {
          select: {
            title: true,
            questions: {
              select: {
                id: true,
                isCicCandidate: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
      take: 24,
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
  const concentratedQuestionCount = templates.reduce(
    (sum, template) => sum + template.sections.reduce((inner, section) => inner + section.questions.filter((question) => question.isCicCandidate).length, 0),
    0
  );

  const visibleScopeLabel =
    session.workspace === "VESSEL"
      ? session.vesselName ?? "Assigned vessel"
      : isTsiSession(session) && !showExpandedScope
        ? session.dashboardScopeLabel ?? "TSI assigned vessels"
        : requestedVesselCode
          ? vessels.find((vessel) => vessel.code === requestedVesselCode)?.name ?? requestedVesselCode
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
            Separate operational boards for overview, TMSA, class/statutory, and PSC/SIRE, with role-aware scope and drill-down into the live VIR workflow.
          </p>
        </div>
        <div className="actions-row">
          <Link className="btn btn-compact" href="/schedule">
            Open scheduler
          </Link>
          <Link className="btn-secondary btn-compact" href="/reports/management">
            Management pack
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

        <div className="board-switcher">
          {boardOptions.map((option) => (
            <Link
              className={`board-tab ${board === option.key ? "board-tab-active" : ""}`}
              href={toSearchParams({ board: option.key, scope, vesselCode: requestedVesselCode, range })}
              key={option.key}
            >
              {option.label}
            </Link>
          ))}
        </div>

        <div className="filter-toolbar" style={{ marginTop: "1rem" }}>
          <div className="filter-chips">
            {(["30", "90", "180", "365"] as RangeKey[]).map((option) => (
              <Link
                className={`filter-chip ${range === option ? "filter-chip-active" : ""}`}
                href={toSearchParams({ board, scope, vesselCode: requestedVesselCode, range: option })}
                key={option}
              >
                {option}d
              </Link>
            ))}
            <Link
              className={`filter-chip ${!requestedVesselCode ? "filter-chip-active" : ""}`}
              href={toSearchParams({ board, scope, vesselCode: null, range })}
            >
              All visible vessels
            </Link>
            {vessels.map((vessel) => (
              <Link
                className={`filter-chip ${requestedVesselCode === vessel.code ? "filter-chip-active" : ""}`}
                href={toSearchParams({ board, scope, vesselCode: vessel.code, range })}
                key={vessel.code}
              >
                {vessel.name}
              </Link>
            ))}
          </div>

          {isTsiSession(session) ? (
            <div className="filter-chips">
              <Link
                className={`filter-chip ${!showExpandedScope ? "filter-chip-active" : ""}`}
                href={toSearchParams({ board, scope: "default", vesselCode: requestedVesselCode, range })}
              >
                Assigned scope
              </Link>
              <Link
                className={`filter-chip ${showExpandedScope ? "filter-chip-active" : ""}`}
                href={toSearchParams({ board, scope: "all", vesselCode: requestedVesselCode, range })}
              >
                Expand to fleet
              </Link>
            </div>
          ) : null}
        </div>
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

      {board === "overview" ? (
        <>
          <section className="erp-metrics-grid">
            <MetricTile label="Visible vessels" note="Current scope" value={vessels.length} />
            <MetricTile label="Inspections" note="Last 180 days" value={filteredInspections.length} />
            <MetricTile label="Open findings" note="Across visible scope" value={openFindings.length} />
            <MetricTile label="Average score" note="Inspection readiness" value={averageScore !== null ? `${averageScore}` : "n/a"} />
            <MetricTile label="Overdue CARs" note="Needs office push" value={overdueActions.length} />
            <MetricTile
              label="Upcoming 45d"
              note="Planned near term"
              value={filteredInspections.filter((inspection) => inspection.inspectionDate >= now && inspection.inspectionDate <= dueSoonDate).length}
            />
          </section>

          <section className="dashboard-grid dashboard-grid-wide">
            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">Fleet or vessel overview</h3>
                  <p className="panel-subtitle">Interactive drilling from performance posture straight into the operational queue.</p>
                </div>
              </div>

              <div className="stack-list">
                {latestByVessel.map((row) => (
                  <div className="bar-card" key={row.vessel.code}>
                    <div className="bar-card-header">
                      <div>
                        <strong>{row.vessel.name}</strong>
                        <div className="small-text">
                          {row.vessel.fleet ?? "No fleet"} / {row.vessel.manager ?? "No manager"}
                        </div>
                      </div>
                      <Link className="btn-secondary btn-compact" href={`/inspections?vesselId=${row.vessel.id}`}>
                        Drill down
                      </Link>
                    </div>
                    <div className="kpi-rail">
                      {Array.from({ length: 12 }, (_, index) => (
                        <div
                          className={`kpi-segment ${index < Math.max(1, Math.round((row.averageScore ?? 0) / 10)) ? "kpi-segment-active" : ""}`}
                          key={`${row.vessel.code}-${index}`}
                        />
                      ))}
                    </div>
                    <div className="mini-metrics">
                      <span className="chip chip-info">Score {row.averageScore ?? "n/a"}</span>
                      <span className="chip chip-warning">Open findings {row.openFindings}</span>
                      <span className="chip chip-danger">Critical {row.criticalFindings}</span>
                    </div>
                    {row.latest ? (
                      <div className="small-text" style={{ marginTop: "0.65rem" }}>
                        Latest: {row.latest.title} / {fmt.format(row.latest.inspectionDate)} / {row.latest.inspectionType.name}
                      </div>
                    ) : (
                      <div className="small-text" style={{ marginTop: "0.65rem" }}>
                        No inspection activity in the visible horizon.
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">Priority watchlist</h3>
                  <p className="panel-subtitle">Near-term items management can act on immediately.</p>
                </div>
              </div>

              <div className="stack-list">
                {inspectionScores.slice(0, 8).map((item) => (
                  <div className="list-card" key={item.inspection.id}>
                    <div className="meta-row">
                      <span className={`chip ${toneForInspectionStatus(item.inspection.status)}`}>
                        {inspectionStatusLabel[item.inspection.status]}
                      </span>
                      <span className="chip chip-info">{item.inspection.inspectionType.name}</span>
                    </div>
                    <div className="list-card-title">{item.inspection.title}</div>
                    <div className="small-text">
                      {item.inspection.vessel.name} / {fmt.format(item.inspection.inspectionDate)}
                    </div>
                    <div className="small-text">
                      Score {item.score ?? "n/a"} / findings {item.inspection.findings.length} / CIC {item.cicCount}
                    </div>
                    <Link className="inline-link" href={`/inspections/${item.inspection.id}`}>
                      Open live inspection
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
                value: row.openFindings,
                note: `Critical ${row.criticalFindings} / score ${row.averageScore ?? "n/a"}`,
              }))}
              subtitle="Open issue concentration by vessel."
              title="Fleet exposure bars"
            />
            <CompactBarChart
              bars={buildInspectionFamilySummary(inspectionScores).slice(0, 8).map((family) => ({
                label: family.label,
                value: family.count,
                note: `Findings ${family.findings} / score ${family.score ?? "n/a"}`,
              }))}
              subtitle="Inspection family volume in the selected range."
              title="Inspection family mix"
            />
          </section>
        </>
      ) : null}

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
              label="Imported questionnaires"
              note="Template governance"
              value={templates.filter((template) => template.inspectionType.code.includes("TMSA")).length}
            />
            <MetricTile
              label="Import sessions"
              note="Recent AI/OCR review"
              value={importSessions.filter((item) => item.inspectionType?.code?.includes("TMSA")).length}
            />
          </section>

          <section className="dashboard-grid dashboard-grid-equal">
            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">TMSA compliance posture</h3>
                  <p className="panel-subtitle">Element-level readiness view based on the latest live inspections and imports.</p>
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
            <MetricTile label="Concentrated questions" note="Template-import pipeline" value={concentratedQuestionCount} />
            <MetricTile
              label="Critical findings"
              note="Highest risk observations"
              value={pscSireInspections.reduce(
                (sum, item) => sum + item.inspection.findings.filter((finding) => finding.severity === "CRITICAL").length,
                0
              )}
            />
            <MetricTile
              label="Import review sessions"
              note="OCR / AI intake"
              value={importSessions.filter((item) => {
                const code = item.inspectionType?.code ?? "";
                return ["PORT_STATE_CONTROL", "PSC_SELF_ASSESSMENT", "SIRE", "SIRE_2_0", "RIGHTSHIP", "CID"].some((match) =>
                  code.includes(match)
                );
              }).length}
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
                  <p className="panel-subtitle">Readiness, concentrated topics, and the live queue by vessel and inspection family.</p>
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
                      <span className="chip chip-info">{family.cicCount} CIC</span>
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
                  <h3 className="panel-title">Concentrated topic register</h3>
                  <p className="panel-subtitle">Imported CIC-sensitive questions remain visible for fast onboard review.</p>
                </div>
              </div>
              <div className="stack-list">
                {templates
                  .filter((template) =>
                    ["PSC", "VETTING"].includes(template.inspectionType.category) ||
                    ["PORT_STATE_CONTROL", "SIRE", "SIRE_2_0", "RIGHTSHIP", "CID"].includes(template.inspectionType.code)
                  )
                  .slice(0, 8)
                  .map((template) => {
                    const cicCount = template.sections.reduce(
                      (sum, section) => sum + section.questions.filter((question) => question.isCicCandidate).length,
                      0
                    );

                    return (
                      <div className="list-card" key={template.id}>
                        <div className="meta-row">
                          <span className="chip chip-warning">CIC {cicCount}</span>
                          <span className="chip chip-info">{template.inspectionType.name}</span>
                        </div>
                        <div className="list-card-title">{template.name}</div>
                        <div className="small-text">
                          {template.sections.length} sections / imported into the standardized VIR model
                        </div>
                        <Link className="inline-link" href="/templates">
                          Open template library
                        </Link>
                      </div>
                    );
                  })}
              </div>
            </section>
          </section>

          <section className="dashboard-grid dashboard-grid-equal">
            <CompactBarChart
              bars={buildInspectionFamilySummary(pscSireInspections).map((family) => ({
                label: family.label,
                value: family.cicCount,
                note: `${family.count} inspections / findings ${family.findings}`,
              }))}
              subtitle="Concentrated-topic intensity by inspection family."
              title="CIR focus bars"
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

      {board === "overview" ? (
        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Overdue corrective actions</h3>
              <p className="panel-subtitle">Remains common across all boards because it is the cross-workflow management trigger.</p>
            </div>
          </div>

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
        </section>
      ) : null}
    </div>
  );
}

function normalizeBoard(value: string | string[] | undefined): BoardKey {
  const board = Array.isArray(value) ? value[0] : value;

  if (board === "tmsa" || board === "class" || board === "psc-sire") {
    return board;
  }

  return "overview";
}

function normalizeRange(value: string | undefined): RangeKey {
  if (value === "30" || value === "90" || value === "365") {
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
