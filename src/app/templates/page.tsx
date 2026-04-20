import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
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
  const groupedTemplates = Array.from(
    templates.reduce((map, template) => {
      const key = template.inspectionType.name;
      const existing = map.get(key) ?? [];
      existing.push(template);
      map.set(key, existing);
      return map;
    }, new Map<string, typeof templates>())
  );

  return (
    <div className="page-stack">
      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Office governance</div>
            <h2 className="panel-title">Template library</h2>
            <p className="panel-subtitle">
              Review the live questionnaire set before it is used in vessel inspections and imports.
            </p>
          </div>
        </div>

        <div className="stack-list">
          {groupedTemplates.map(([inspectionTypeName, records]) => {
            const questionCount = records.reduce(
              (sum, template) => sum + template.sections.reduce((sectionSum, section) => sectionSum + section.questions.length, 0),
              0
            );
            const mandatoryCount = records.reduce(
              (sum, template) =>
                sum +
                template.sections.reduce(
                  (sectionSum, section) => sectionSum + section.questions.filter((question) => question.isMandatory).length,
                  0
                ),
              0
            );

            return (
              <details className="list-card template-group-card" key={inspectionTypeName} open>
                <summary className="question-section-summary">
                  <div>
                    <div className="meta-row">
                      <span className="chip chip-info">{records[0]?.inspectionType.category}</span>
                      <span className="chip chip-warning">{records.length} templates</span>
                    </div>
                    <div className="list-card-title">{inspectionTypeName}</div>
                    <div className="small-text">
                      {questionCount} questions / {mandatoryCount} mandatory / grouped checklist catalogue
                    </div>
                  </div>
                </summary>

                <div className="stack-list" style={{ marginTop: "1rem" }}>
                  {records.map((template) => {
                    const templateQuestionCount = template.sections.reduce((sum, section) => sum + section.questions.length, 0);
                    const templateMandatoryCount = template.sections.reduce(
                      (sum, section) => sum + section.questions.filter((question) => question.isMandatory).length,
                      0
                    );

                    return (
                      <details className="question-section question-section-accordion" key={template.id}>
                        <summary className="question-section-summary">
                          <div>
                            <strong>{template.name}</strong>
                            <div className="small-text">
                              v{template.version} / {template.sections.length} sections / {templateQuestionCount} questions /{" "}
                              {templateMandatoryCount} mandatory
                            </div>
                          </div>
                          <div className="meta-row">
                            <span className="chip chip-success">Checklist template</span>
                            <span className="chip chip-info">{template.inspectionType.name}</span>
                          </div>
                        </summary>

                        {template.description ? <p className="small-text" style={{ marginTop: "0.8rem" }}>{template.description}</p> : null}

                        <div className="stack-list" style={{ marginTop: "0.85rem" }}>
                          {template.sections.map((section) => (
                            <details className="question-section question-section-accordion" key={section.id}>
                              <summary className="question-section-summary">
                                <div>
                                  <strong>{section.title}</strong>
                                  <div className="small-text">
                                    {section.questions.length} questions /{" "}
                                    {section.questions.filter((question) => question.isMandatory).length} mandatory
                                  </div>
                                </div>
                                <span className="chip chip-muted">{section.code ?? "SECTION"}</span>
                              </summary>

                              {section.guidance ? <p className="small-text" style={{ marginTop: "0.8rem" }}>{section.guidance}</p> : null}

                              <div className="stack-list" style={{ marginTop: "0.8rem" }}>
                                {section.questions.map((question) => (
                                  <div className="question-card question-card-compact" key={question.id}>
                                    <div className="question-card-compact-main">
                                      <div className="question-code">{question.code}</div>
                                      <p className="question-prompt">{question.prompt}</p>
                                      {question.options.length > 0 ? (
                                        <div className="small-text">
                                          Options: {question.options.map((option) => option.label).join(", ")}
                                        </div>
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
                                        <div className="small-text">
                                          Standard reference image stored against this questionnaire item.
                                        </div>
                                      </div>
                                    ) : null}
                                  </div>
                                ))}
                              </div>
                            </details>
                          ))}
                        </div>
                      </details>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </div>
      </section>
    </div>
  );
}
