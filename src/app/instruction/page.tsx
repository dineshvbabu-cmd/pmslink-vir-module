import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const officeBlocks = [
  {
    title: "Office review workflow",
    points: [
      "Use Dashboard for fleet review and exception monitoring.",
      "Use Approved inspections for final approved records and printable outputs.",
      "Use Inspection history for all statuses including Draft, Pending approval, and Approved.",
      "Use VIR Calendar for due planning, inspection status, sailing compliance, and rescheduling.",
      "Use Import Engine to normalize checklist and questionnaire source files before publishing.",
    ],
  },
  {
    title: "What office must see",
    points: [
      "Sync status at inspection and evidence level.",
      "Progress bar and mandatory coverage before approval.",
      "Table/Grid View and Summary View for dense review.",
      "Section summaries, finding counts, and carry-forward visibility.",
      "Activity feed for import, review, approval, return, and sign-off events.",
    ],
  },
  {
    title: "Planner status language",
    points: [
      "Inspection Status should use In Window, Due Range, Overdue, No 2 VIR, and No Sailing where applicable.",
      "Last and Previous vessel inspection details should remain visible in the planner grid.",
      "Scheduling changes should happen directly from the gantt or planner board.",
    ],
  },
];

const vesselBlocks = [
  {
    title: "Vessel execution workflow",
    points: [
      "Open assigned inspections from Dashboard, Inspection history, or My VIR Queue.",
      "Complete the Checklist Questionnaire with chapter and sub chapter drill-down.",
      "Monitor the progress bar and mandatory question coverage while working.",
      "Use the finding and evidence lanes to attach actual photos against the relevant question or finding.",
      "Submit only after section summaries, comments, and sign-off checks are complete.",
    ],
  },
  {
    title: "Offline and sync",
    points: [
      "Checklist data must be usable in offline mode.",
      "Evidence should queue when offline and sync back into the shared office-vessel record on reconnect.",
      "Users must see synced count, pending queue, last synced state, and conflict warnings.",
      "Multi-image selection and drag-drop remain part of the evidence workflow.",
    ],
  },
  {
    title: "Questionnaire review modes",
    points: [
      "Questionnaire mode for answering.",
      "Condition Report mode for section outcome review.",
      "Summary mode for chapter-wise rollup.",
      "Table/Grid View for dense office-style review even on vessel-side quality checks.",
    ],
  },
];

export default async function InstructionPage() {
  const session = await requireVirSession();
  const isOffice = isOfficeSession(session);
  const blocks = isOffice ? officeBlocks : vesselBlocks;

  return (
    <div className="page-stack">
      <section className={`hero-panel ${isOffice ? "" : "hero-panel-vessel"}`}>
        <div>
          <div className="eyebrow">Instruction</div>
          <h2 className="hero-title">{isOffice ? "Office workflow and planner guidance" : "Vessel execution and sync guidance"}</h2>
          <p className="hero-copy">
            This instruction lane captures the validated workflow behaviors from the VIR web and offline guidance so the
            redesigned product preserves operational functionality while improving density, speed, and review clarity.
          </p>
        </div>
      </section>

      <section className="dashboard-grid dashboard-grid-equal">
        {blocks.map((block) => (
          <article className="panel panel-elevated" key={block.title}>
            <div className="section-header">
              <div>
                <h3 className="panel-title">{block.title}</h3>
              </div>
            </div>
            <div className="stack-list">
              {block.points.map((point) => (
                <div className="list-card" key={point}>
                  {point}
                </div>
              ))}
            </div>
          </article>
        ))}
      </section>
    </div>
  );
}
