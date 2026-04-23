import Link from "next/link";
import { FloatingActivityFeed } from "@/components/floating-activity-feed";
import { prisma } from "@/lib/prisma";
import {
  buildLiveChecklist,
  normalizeRemoteAssetUrl,
  type LiveChecklistQuestion,
  type LiveChecklistSection,
} from "@/lib/vir/live-checklist";
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
    where: {
      isActive: true,
      inspectionType: {
        category: "INTERNAL",
      },
    },
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
    where: {
      inspectionType: {
        category: "INTERNAL",
      },
    },
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
  const templateChecklist = selectedTemplate ? buildLiveChecklist({ metadata: (selectedTemplate as any).metadata }) : null;
  const templateSections = templateChecklist?.sections ?? selectedTemplate?.sections ?? [];
  const liveSelectedSection: LiveChecklistSection | null = templateChecklist
    ? (templateChecklist.sections.find((record) => record.id === section) ?? null) ?? templateChecklist.sections[0] ?? null
    : null;
  const legacySelectedSection: any = !templateChecklist
    ? (selectedTemplate?.sections.find((record: any) => record.id === section) ?? null) ?? selectedTemplate?.sections[0] ?? null
    : null;
  const selectedSection = liveSelectedSection ?? legacySelectedSection;
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
                {templateSections.map((item: any) => (
                  <Link
                    className={`section-nav-link ${selectedSection?.id === item.id ? "section-nav-link-active" : ""}`}
                    href={`/templates?type=${encodeURIComponent(selectedGroup?.[0] ?? "")}&template=${selectedTemplate.id}&section=${item.id}`}
                    key={item.id}
                  >
                    <span>{item.title}</span>
                    <span className="small-text">
                      {templateChecklist ? item.summary?.questionCount ?? 0 : item.questions.length} q
                    </span>
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
                  {templateSections.length} sections /{" "}
                  {templateChecklist
                    ? templateChecklist.summary.questionCount
                    : selectedTemplate.sections.reduce((sum, item) => sum + item.questions.length, 0)}{" "}
                  questions
                </div>
              </div>
            </div>

            <section className="panel question-section">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">{selectedSection.title}</h3>
                  <p className="panel-subtitle">
                    {templateChecklist ? liveSelectedSection?.id : (legacySelectedSection as any)?.code ?? "SECTION"} /{" "}
                    {templateChecklist
                      ? liveSelectedSection?.summary?.questionCount ?? 0
                      : legacySelectedSection?.questions.length ?? 0}{" "}
                    questions /{" "}
                    {templateChecklist
                      ? liveSelectedSection?.subsections?.reduce(
                          (sum: number, subsection: any) => sum + (subsection.rating?.mandatoryQuestions ?? 0),
                          0
                        ) ?? 0
                      : legacySelectedSection?.questions.filter((question: any) => question.isMandatory).length ?? 0}{" "}
                    mandatory
                  </p>
                </div>
                <div className="meta-row">
                  <span className="chip chip-success">Checklist template</span>
                  <span className="chip chip-danger">
                    {templateChecklist
                      ? liveSelectedSection?.subsections?.reduce(
                          (sum: number, subsection: any) =>
                            sum +
                            subsection.questions.filter((question: LiveChecklistQuestion) => question.isCicCandidate)
                              .length,
                          0
                        ) ?? 0
                      : legacySelectedSection?.questions.filter((question: any) => question.isCicCandidate).length ?? 0}{" "}
                    CIR focus
                  </span>
                </div>
              </div>

              {!templateChecklist && legacySelectedSection?.guidance ? (
                <p className="small-text">{legacySelectedSection.guidance}</p>
              ) : null}
              {templateChecklist && liveSelectedSection?.comments ? (
                <p className="small-text">{liveSelectedSection.comments}</p>
              ) : null}

              <div className="question-list-viewport" style={{ marginTop: "1rem" }}>
                <div className="stack-list">
                  {templateChecklist
                    ? liveSelectedSection?.subsections.map((subsection: any) => (
                        <section className="panel question-section" key={subsection.id}>
                          <div className="section-header">
                            <div>
                              <h4 className="panel-title">{subsection.title}</h4>
                              <p className="panel-subtitle">
                                {subsection.summary?.questionCount ?? subsection.questions.length} questions /{" "}
                                {subsection.rating?.mandatoryQuestions ?? 0} mandatory /{" "}
                                {subsection.summary?.totalFindings ?? 0} findings
                              </p>
                            </div>
                            <div className="meta-row">
                              <span className="chip chip-info">{subsection.location || "Subsection"}</span>
                              <span className="chip chip-success">
                                {(subsection.condition?.score ?? 0).toFixed(1)} condition
                              </span>
                            </div>
                          </div>

                          {subsection.comments ? <p className="small-text">{subsection.comments}</p> : null}

                          <div className="stack-list">
                            {subsection.questions.map((question: LiveChecklistQuestion) => (
                              <div className={`question-card question-card-compact ${question.isCicCandidate ? "question-card-focus" : ""}`} key={question.id}>
                                <div className="question-card-compact-main">
                                  <div className="question-code">{question.code}</div>
                                  <p className="question-prompt">{question.prompt}</p>
                                  <div className="small-text">
                                    Outcome: {formatTemplateOutcome(question)} / Score: {question.score ?? "N/A"}
                                  </div>
                                  {question.comments ? <div className="small-text">{question.comments}</div> : null}
                                </div>
                                <div className="question-card-flags">
                                  <span className="chip chip-info">{inferTemplateResponseType(question)}</span>
                                  {question.isMandatory ? <span className="chip chip-warning">Mandatory</span> : null}
                                  {question.isCicCandidate ? <span className="chip chip-danger">CIR focus</span> : null}
                                  {question.allowsPhoto ? <span className="chip chip-success">Actual upload enabled</span> : null}
                                  {question.referenceImageUrl ? <span className="chip chip-info">Reference image</span> : null}
                                </div>

                                {question.referenceImageUrl ? (
                                  <div className="template-reference-preview">
                                    <img alt={`${question.code} reference`} src={normalizeRemoteAssetUrl(question.referenceImageUrl)} />
                                    <div className="small-text">Reference image available for side-by-side vessel comparison.</div>
                                  </div>
                                ) : null}
                              </div>
                            ))}
                          </div>
                        </section>
                      ))
                    : legacySelectedSection?.questions.map((question: any) => (
                        <div className="question-card question-card-compact" key={question.id}>
                          <div className="question-card-compact-main">
                            <div className="question-code">{question.code}</div>
                            <p className="question-prompt">{question.prompt}</p>
                            {question.options.length > 0 ? (
                              <div className="small-text">Options: {question.options.map((option: any) => option.label).join(", ")}</div>
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
                              <img alt={`${question.code} reference`} src={normalizeRemoteAssetUrl(question.referenceImageUrl)} />
                              <div className="small-text">Reference image available for side-by-side vessel comparison.</div>
                            </div>
                          ) : null}
                        </div>
                      )) ?? null}
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

function inferTemplateResponseType(question: LiveChecklistQuestion) {
  if (question.notApplicable || question.notSighted || question.tested || question.inspected) {
    return "YES_NO_NA";
  }

  if (question.score !== null && question.score !== undefined) {
    return "SCORE";
  }

  return "TEXT";
}

function formatTemplateOutcome(question: LiveChecklistQuestion) {
  if (question.tested) {
    return "Tested";
  }
  if (question.inspected) {
    return "Inspected";
  }
  if (question.notSighted) {
    return "Not sighted";
  }
  if (question.notApplicable) {
    return "Not applicable";
  }
  return "Pending";
}
