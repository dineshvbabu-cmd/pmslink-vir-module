import Link from "next/link";
import { FloatingActivityFeed } from "@/components/floating-activity-feed";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; template?: string; section?: string }>;
}) {
  const session = await requireVirSession();

  if (!isOfficeSession(session)) {
    return (
      <div className="page-stack">
        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h2 className="panel-title">Template library</h2>
              <p className="panel-subtitle">This module is available only from the office workspace.</p>
            </div>
          </div>
          <div className="empty-state">
            Vessel users can execute live questionnaires but cannot govern the underlying template catalogue.
          </div>
        </section>
      </div>
    );
  }

  const { type, template, section } = await searchParams;

  const templates = await prisma.virTemplate.findMany({
    where: { isActive: true },
    orderBy: [{ createdAt: "desc" }],
    include: {
      inspectionType: true,
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          questions: {
            orderBy: { sortOrder: "asc" },
            include: {
              options: {
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });
  const importSessions = await prisma.virImportSession.findMany({
    orderBy: { createdAt: "desc" },
    take: 60,
    include: {
      inspectionType: { select: { id: true, name: true } },
      fieldReviews: {
        take: 5,
        orderBy: { createdAt: "desc" },
      },
    },
  });
  const groupedTemplates = Array.from(
    templates.reduce((map, template) => {
      const key = template.inspectionType.name;
      const existing = map.get(key) ?? [];
      existing.push(template);
      map.set(key, existing);
      return map;
    }, new Map<string, typeof templates>())
  );
  const selectedGroup = groupedTemplates.find(([inspectionTypeName]) => inspectionTypeName === type) ?? groupedTemplates[0] ?? null;
  const selectedTemplate =
    (selectedGroup?.[1].find((record) => record.id === template) ?? null) ?? selectedGroup?.[1][0] ?? null;
  const selectedSection =
    (selectedTemplate?.sections.find((record) => record.id === section) ?? null) ?? selectedTemplate?.sections[0] ?? null;
  const templateActivity = selectedTemplate
    ? buildTemplateActivity(selectedTemplate, importSessions.filter((item) => item.inspectionTypeId === selectedTemplate.inspectionTypeId))
    : [];

  return (
    <div className="page-stack">
      <section className="workspace-console-shell">
        <aside className="workspace-console-rail">
          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <div className="eyebrow">Template catalogue</div>
                <h2 className="panel-title">Inspection groups</h2>
              </div>
            </div>

            <div className="stack-list">
              {groupedTemplates.map(([inspectionTypeName, records]) => (
                <Link
                  className={`section-nav-link ${selectedGroup?.[0] === inspectionTypeName ? "section-nav-link-active" : ""}`}
                  href={`/templates?type=${encodeURIComponent(inspectionTypeName)}&template=${records[0]?.id ?? ""}`}
                  key={inspectionTypeName}
                >
                  <span>{inspectionTypeName}</span>
                  <span className="small-text">{records.length} templates</span>
                </Link>
              ))}
            </div>
          </section>

          {selectedTemplate ? (
            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">Checklist sections</h3>
                  <p className="panel-subtitle">Open one section at a time instead of scrolling through the full bank.</p>
                </div>
              </div>
              <div className="stack-list">
                {selectedTemplate.sections.map((item) => (
                  <Link
                    className={`section-nav-link ${selectedSection?.id === item.id ? "section-nav-link-active" : ""}`}
                    href={`/templates?type=${encodeURIComponent(selectedGroup?.[0] ?? "")}&template=${selectedTemplate.id}&section=${item.id}`}
                    key={item.id}
                  >
                    <span>{item.title}</span>
                    <span className="small-text">{item.questions.length} q</span>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

        </aside>

        <section className="panel panel-elevated workspace-console-main">
        <div className="section-header">
          <div>
            <div className="eyebrow">Office governance</div>
            <h2 className="panel-title">Template library</h2>
            <p className="panel-subtitle">
              Review the live questionnaire set before it is used in vessel inspections and imports.
            </p>
          </div>
        </div>

        {selectedGroup && selectedTemplate && selectedSection ? (
          <div className="page-stack">
            <div className="template-review-grid">
              <div className="list-card">
                <div className="question-code">Inspection group</div>
                <div className="list-card-title">{selectedGroup[0]}</div>
                <div className="small-text">{selectedTemplate.inspectionType.category}</div>
              </div>
              <div className="list-card">
                <div className="question-code">Checklist template</div>
                <div className="list-card-title">{selectedTemplate.name}</div>
                <div className="small-text">v{selectedTemplate.version}</div>
              </div>
              <div className="list-card">
                <div className="question-code">Questionnaire density</div>
                <div className="small-text">
                  {selectedTemplate.sections.length} sections /{" "}
                  {selectedTemplate.sections.reduce((sum, item) => sum + item.questions.length, 0)} questions
                </div>
              </div>
            </div>

            <section className="panel question-section">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">{selectedSection.title}</h3>
                  <p className="panel-subtitle">
                    {selectedSection.code ?? "SECTION"} / {selectedSection.questions.length} questions /{" "}
                    {selectedSection.questions.filter((question) => question.isMandatory).length} mandatory
                  </p>
                </div>
                <div className="meta-row">
                  <span className="chip chip-success">Checklist template</span>
                  <span className="chip chip-danger">
                    {selectedSection.questions.filter((question) => question.isCicCandidate).length} CIR focus
                  </span>
                </div>
              </div>

              {selectedSection.guidance ? <p className="small-text">{selectedSection.guidance}</p> : null}

              <div className="question-list-viewport" style={{ marginTop: "1rem" }}>
                <div className="stack-list">
                  {selectedSection.questions.map((question) => (
                    <div className="question-card question-card-compact" key={question.id}>
                      <div className="question-card-compact-main">
                        <div className="question-code">{question.code}</div>
                        <p className="question-prompt">{question.prompt}</p>
                        {question.options.length > 0 ? (
                          <div className="small-text">Options: {question.options.map((option) => option.label).join(", ")}</div>
                        ) : null}
                      </div>
                      <div className="question-card-flags">
                        <span className="chip chip-info">{question.responseType}</span>
                        {question.isMandatory ? <span className="chip chip-warning">Mandatory</span> : null}
                        {question.isCicCandidate ? <span className="chip chip-danger">CIR focus</span> : null}
                        {question.allowsPhoto ? <span className="chip chip-success">Actual upload enabled</span> : null}
                        {question.referenceImageUrl ? <span className="chip chip-info">Reference image</span> : null}
                      </div>

                      {question.referenceImageUrl ? (
                        <div className="template-reference-preview">
                          <img alt={`${question.code} reference`} src={question.referenceImageUrl} />
                          <div className="small-text">Reference image available for side-by-side vessel comparison.</div>
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              </div>
            </section>
          </div>
        ) : (
          <div className="empty-state">No checklist template is currently selected.</div>
        )}
        </section>
      </section>

      <FloatingActivityFeed
        items={templateActivity}
        subtitle="Template creation, import review, and governance activity."
        title="Template activity"
      />
    </div>
  );
}

function buildTemplateActivity(
  template: {
    id: string;
    name: string;
    createdAt: Date;
    updatedAt: Date;
    sections: Array<{ id: string; title: string }>;
  },
  importSessions: Array<{
    id: string;
    createdAt: Date;
    status: string;
    sourceFileName: string;
    createdBy: string | null;
    fieldReviews: Array<{ id: string; fieldPath: string; reviewerName: string | null; reviewedAt: Date | null }>;
  }>
) {
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

  return [
    {
      id: `${template.id}-created`,
      title: "Template created",
      detail: `${template.name} entered the questionnaire catalogue.`,
      timeLabel: fmt.format(template.createdAt),
      tone: "success" as const,
    },
    {
      id: `${template.id}-updated`,
      title: "Template last updated",
      detail: `${template.sections.length} section groups currently active.`,
      timeLabel: fmt.format(template.updatedAt),
      tone: "info" as const,
    },
    ...importSessions.flatMap((session) => [
      {
        id: session.id,
        title: `Import ${session.status.toLowerCase()}`,
        detail: session.sourceFileName,
        timeLabel: fmt.format(session.createdAt),
        actor: session.createdBy,
        tone: session.status === "COMMITTED" ? ("success" as const) : ("warning" as const),
      },
      ...session.fieldReviews.map((review) => ({
        id: review.id,
        title: "Field reviewed",
        detail: review.fieldPath,
        timeLabel: review.reviewedAt ? fmt.format(review.reviewedAt) : "Pending",
        actor: review.reviewerName,
        tone: "info" as const,
      })),
    ]),
  ];
}
