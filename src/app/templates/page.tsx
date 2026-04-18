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
          {templates.map((template) => {
            const questionCount = template.sections.reduce((sum, section) => sum + section.questions.length, 0);
            const mandatoryCount = template.sections.reduce(
              (sum, section) => sum + section.questions.filter((question) => question.isMandatory).length,
              0
            );

            return (
              <div className="list-card" key={template.id}>
                <div className="section-header">
                  <div>
                    <div className="meta-row">
                      <span className="chip chip-info">{template.inspectionType.name}</span>
                      <span className="chip chip-warning">v{template.version}</span>
                    </div>
                    <div className="list-card-title">{template.name}</div>
                    <div className="small-text">
                      {template.sections.length} sections / {questionCount} questions / {mandatoryCount} mandatory
                    </div>
                    {template.description ? <p className="small-text">{template.description}</p> : null}
                  </div>
                </div>

                <div className="stack-list">
                  {template.sections.map((section) => (
                    <div className="question-section" key={section.id}>
                      <strong>{section.title}</strong>
                      {section.guidance ? <p className="small-text">{section.guidance}</p> : null}
                      <div className="stack-list" style={{ marginTop: "0.75rem" }}>
                        {section.questions.map((question) => (
                          <div className="question-card" key={question.id}>
                            <div className="question-code">{question.code}</div>
                            <p className="question-prompt">{question.prompt}</p>
                            <div className="meta-row">
                              <span className="chip chip-info">{question.responseType}</span>
                              {question.isMandatory ? <span className="chip chip-warning">Mandatory</span> : null}
                              {question.referenceImageUrl ? <span className="chip chip-success">Reference image</span> : null}
                              {question.isCicCandidate ? <span className="chip chip-info">CIC topic</span> : null}
                            </div>
                            {question.options.length > 0 ? (
                              <div className="small-text">Options: {question.options.map((option) => option.label).join(", ")}</div>
                            ) : null}
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
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
