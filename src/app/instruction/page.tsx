import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const platformMap = [
  "Dashboard",
  "Approved inspections",
  "Inspection history",
  "VIR Calendar",
  "Instruction",
];

const officeWorkflow = [
  "Open Dashboard to review total vessels, completed inspection, pending task, and not synced exceptions.",
  "Use Approved inspections for finalized reports, PDF exports, and vessel-by-vessel drill-down review.",
  "Use Inspection history for draft, returned, submitted, shore reviewed, and approved work in one register.",
  "Use VIR Calendar to monitor last VIR done date, next due date, inspection compliance, and sailing compliance.",
  "Open the inspection record, review questionnaire progress, findings, evidence, and sign-off before closure.",
];

const vesselWorkflow = [
  "Open the assigned VIR from Dashboard, Inspection history, or the active vessel register.",
  "Answer the questionnaire section by section, starting with mandatory and concentrated-focus questions.",
  "Attach actual evidence against the question or finding while comparing it with the reference image.",
  "Complete section comments, findings, corrective actions, and sign-off before submission to shore.",
  "Monitor synced count, pending queue, and offline evidence status until the shared record is fully updated.",
];

const statusLegend = [
  { label: "In Window", detail: "Next due date remains comfortably ahead of the planning threshold." },
  { label: "Due Range", detail: "Inspection is nearing due window and requires planner visibility." },
  { label: "Overdue", detail: "Latest due date has passed and the vessel requires immediate intervention." },
  { label: "No 2 VIR", detail: "Inspection compliance exception against the expected recurring cycle." },
  { label: "No Sailing", detail: "Latest sailing-mode inspection requirement is not in order." },
  { label: "Synced", detail: "Office and vessel records are aligned for report and evidence data." },
  { label: "Not Synced", detail: "Draft, returned, or offline queue items still need synchronization." },
];

const reviewModes = [
  {
    title: "Table / Grid View",
    text: "Use the dense table register for fleet-level triage, planner actions, and rapid office review across many inspections.",
  },
  {
    title: "Summary View",
    text: "Use the summary cards when management wants a lighter vessel-by-vessel snapshot before entering the report.",
  },
  {
    title: "Questionnaire View",
    text: "Use section navigation to work through the live checklist without loading the full questionnaire as one long page.",
  },
  {
    title: "Report Drill-down",
    text: "Open Detailed, Summary, Finding, or Consolidate report views from the inspection itself for deeper review.",
  },
];

const signOffRules = [
  "Vessel submission confirms that the questionnaire, findings, evidence, and comments are ready for shore review.",
  "Office review can approve, return, or close the VIR based on completion, evidence quality, and corrective action readiness.",
  "Every workflow action must appear in the activity timeline so the inspection retains a full operational audit trail.",
];

export default async function InstructionPage() {
  const session = await requireVirSession();
  const isOffice = isOfficeSession(session);

  return (
    <div className="page-stack">
      <section className={`hero-panel ${isOffice ? "" : "hero-panel-vessel"}`}>
        <div>
          <div className="eyebrow">Vessel Inspection Checklist</div>
          <h2 className="hero-title">{isOffice ? "Office instruction and review manual" : "Vessel execution and sync manual"}</h2>
          <p className="hero-copy">
            This instruction page mirrors the live operating workflow of the VIR platform while keeping the demo neutral,
            anonymized, and ready for management review.
          </p>
        </div>
        <div className="actions-row">
          <a className="btn-secondary btn-compact" href="/instruction" rel="noreferrer" target="_blank">
            Web manual
          </a>
          <a className="btn-secondary btn-compact" href="/api/reports/manual/pdf?kind=offline" rel="noreferrer" target="_blank">
            Offline manual
          </a>
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Preface</div>
            <h3 className="panel-title">Purpose and operating intent</h3>
            <p className="panel-subtitle">
              The VIR application is used to plan, execute, review, approve, and report vessel inspections from a single
              office-and-vessel workflow. The same record must support planner visibility, questionnaire completion,
              findings management, evidence capture, approval, sync traceability, and PDF reporting.
            </p>
          </div>
        </div>

        <div className="instruction-manual-grid">
          <article className="list-card">
            <div className="question-code">Platform map</div>
            <div className="list-card-title">Primary operating lanes</div>
            <div className="stack-list" style={{ marginTop: "0.85rem" }}>
              {platformMap.map((item, index) => (
                <div className="instruction-line" key={item}>
                  <span className="instruction-step-no">{index + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>

          <article className="list-card">
            <div className="question-code">{isOffice ? "Office workflow" : "Vessel workflow"}</div>
            <div className="list-card-title">{isOffice ? "Required review sequence" : "Required execution sequence"}</div>
            <div className="stack-list" style={{ marginTop: "0.85rem" }}>
              {(isOffice ? officeWorkflow : vesselWorkflow).map((item, index) => (
                <div className="instruction-line" key={item}>
                  <span className="instruction-step-no">{index + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        <article className="panel panel-elevated">
          <div className="section-header">
            <div>
              <div className="eyebrow">Status language</div>
              <h3 className="panel-title">Planner and sync legend</h3>
            </div>
          </div>

          <div className="instruction-legend-grid">
            {statusLegend.map((item) => (
              <div className="list-card" key={item.label}>
                <div className="list-card-title">{item.label}</div>
                <div className="small-text" style={{ marginTop: "0.45rem" }}>
                  {item.detail}
                </div>
              </div>
            ))}
          </div>
        </article>

        <article className="panel panel-elevated">
          <div className="section-header">
            <div>
              <div className="eyebrow">Review modes</div>
              <h3 className="panel-title">How records should be read</h3>
            </div>
          </div>

          <div className="stack-list">
            {reviewModes.map((item) => (
              <div className="list-card" key={item.title}>
                <div className="list-card-title">{item.title}</div>
                <div className="small-text" style={{ marginTop: "0.45rem" }}>
                  {item.text}
                </div>
              </div>
            ))}
          </div>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        <article className="panel panel-elevated">
          <div className="section-header">
            <div>
              <div className="eyebrow">Evidence and sync</div>
              <h3 className="panel-title">Photo capture and office-vessel alignment</h3>
            </div>
          </div>
          <div className="stack-list">
            <div className="list-card">
              Reference images are used as smaller guidance visuals while actual vessel evidence remains larger and tied
              directly to the questionnaire item or finding.
            </div>
            <div className="list-card">
              Offline uploads must queue locally, display pending count, and sync back into the same shared inspection
              record once connectivity is restored.
            </div>
            <div className="list-card">
              Office must always see the resulting synced evidence in the same inspection, report, and approval flow
              without duplication.
            </div>
          </div>
        </article>

        <article className="panel panel-elevated">
          <div className="section-header">
            <div>
              <div className="eyebrow">Sign-off and control</div>
              <h3 className="panel-title">Approval discipline</h3>
            </div>
          </div>
          <div className="stack-list">
            {signOffRules.map((item) => (
              <div className="list-card" key={item}>
                {item}
              </div>
            ))}
          </div>
        </article>
      </section>
    </div>
  );
}
