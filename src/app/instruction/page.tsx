import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const platformMap = [
  "Dashboard",
  "Approved inspections",
  "Inspection history",
  "Inspection Calendar",
  "Help",
];

const officeWorkflow = [
  "Create the Inspection Report from office as a draft and keep it in Inspection Register for manager approval.",
  "Approve the draft from office management so the inspection can be synced to vessel for execution.",
  "Monitor execution, evidence, findings, and vessel responses after the synced record is worked by superintendent or external inspectors.",
  "Review returned vessel updates from office, send back for vessel updates when required, and complete the second office approval.",
  "Use Approved inspections for finalized double-approved reports, PDF exports, and vessel-by-vessel drill-down review.",
];

const vesselWorkflow = [
  "Open only the synced Inspection Report assigned from office using Dashboard, Inspection Register, or Inspection history.",
  "Execute the questionnaire section by section, starting with mandatory and concentrated-focus questions.",
  "Attach actual evidence against the question or finding while comparing it with the reference image.",
  "Complete section comments, findings, corrective actions, and sign-off before submission back to office review.",
  "Monitor sync status and office feedback until the shared record is fully updated and finally approved.",
];

const statusLegend = [
  { label: "In Window", detail: "Next due date remains comfortably ahead of the planning threshold." },
  { label: "Due Range", detail: "Inspection is nearing due window and requires planner visibility." },
  { label: "Overdue", detail: "Latest due date has passed and the vessel requires immediate intervention." },
  { label: "Inspection Overdue", detail: "Inspection compliance exception against the expected recurring cycle." },
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
  "Manager approval is required before a draft Inspection Report is released from office and synced to vessel.",
  "Vessel submission confirms that the questionnaire, findings, evidence, and comments are ready for office review.",
  "Office review can return the VIR for vessel updates, then apply the second approval before closure and approved-register release.",
  "Every workflow action must appear in the activity timeline so the inspection retains a full operational audit trail.",
];

const workflowDiagram = [
  {
    lane: "Office",
    step: "1. Create Inspection Report",
    detail:
      "Select vessel, report type, inspection mode, date range, location, alongside-by, operations at inspection, inspection authority, cause analysis page, and corrective action plan target before saving the inspection as draft.",
  },
  {
    lane: "Office",
    step: "2. Manager approval and sync",
    detail:
      "Approve the draft from office management, bind the matching questionnaire template, and sync the approved draft to vessel for execution.",
  },
  {
    lane: "Vessel",
    step: "3. Execute questionnaire",
    detail:
      "Work section by section, answer mandatory questions first, add comments, attach actual evidence, and raise findings or corrective actions without leaving the active section.",
  },
  {
    lane: "Vessel",
    step: "4. Submit to office review",
    detail:
      "Confirm section summaries, findings, evidence, meetings, sign-offs, and sync status before sending the Inspection Report back to office review.",
  },
  {
    lane: "Office",
    step: "5. Review, return, or second approve",
    detail:
      "Use inspection history, report views, deviation flow, and evidence drill-down to review completeness. Return when vessel updates are needed or apply the second office approval when ready.",
  },
  {
    lane: "Office",
    step: "6. Close Inspection Report",
    detail:
      "Close only after questionnaire review, findings review, action review, approval confirmation, sync confirmation, and management-ready reporting are complete.",
  },
];

const fieldGuidance = [
  {
    title: "Create Inspection Report - mandatory selections",
    items: [
      "Report Type",
      "Inspection Mode",
      "Alongside by",
      "Operations at the time of inspection",
      "Inspection Authority",
      "Cause Analysis target",
      "Corrective Action Plan target",
    ],
  },
  {
    title: "Create Inspection Report - free text / date fields",
    items: [
      "Inspection from / to dates",
      "Location and draft fields",
      "Last port of call",
      "Place last inspected / place of inspection from",
      "Master / Chief Engineer particulars",
      "Officer / crew numbers and nationality",
    ],
  },
  {
    title: "Inspection review essentials",
    items: [
      "Section summary",
      "Detailed questionnaire",
      "Raise / view findings",
      "Actual uploads and reference images",
      "Opening and closing meeting notes",
      "Best practice, items of concern, and conclusion",
    ],
  },
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
            This instruction page mirrors the live operating workflow of the Inspection Report platform while keeping the demo neutral,
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

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Workflow diagram</div>
            <h3 className="panel-title">Create Inspection Report to close VIR</h3>
            <p className="panel-subtitle">
              The office and vessel workflow should be followed in sequence so that launch, execution, evidence,
              approval, and closure remain aligned in the same inspection record.
            </p>
          </div>
        </div>

        <div className="workflow-diagram">
          {workflowDiagram.map((item, index) => (
            <article className="workflow-step-card" key={`${item.lane}-${item.step}`}>
              <div className={`workflow-lane-pill ${item.lane === "Office" ? "workflow-lane-pill-office" : "workflow-lane-pill-vessel"}`}>
                {item.lane}
              </div>
              <div className="workflow-step-title">{item.step}</div>
              <div className="small-text">{item.detail}</div>
              {index < workflowDiagram.length - 1 ? <div className="workflow-step-arrow">↓</div> : null}
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        {fieldGuidance.map((group) => (
          <article className="panel panel-elevated" key={group.title}>
            <div className="section-header">
              <div>
                <div className="eyebrow">Field guide</div>
                <h3 className="panel-title">{group.title}</h3>
              </div>
            </div>
            <div className="stack-list">
              {group.items.map((item, index) => (
                <div className="instruction-line" key={item}>
                  <span className="instruction-step-no">{index + 1}</span>
                  <span>{item}</span>
                </div>
              ))}
            </div>
          </article>
        ))}
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
