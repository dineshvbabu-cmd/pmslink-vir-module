import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function TemplatesPage() {
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
      <section className="panel">
        <div className="section-header">
          <div>
            <h2 className="panel-title">Template Library</h2>
            <p className="panel-subtitle">
              Review and validate questionnaire templates before they are used in vessel inspections and imports.
            </p>
          </div>
        </div>
        <div className="list">
          {templates.map((template) => {
            const questionCount = template.sections.reduce((sum, section) => sum + section.questions.length, 0);
            const referenceImageCount = template.sections.reduce(
              (sum, section) => sum + section.questions.filter((question) => question.referenceImageUrl).length,
              0
            );

            return (
              <div className="list-card" key={template.id}>
                <div className="section-header" style={{ marginBottom: "0.65rem" }}>
                  <div>
                    <div className="meta-row">
                      <span className="chip chip-info">{template.inspectionType.name}</span>
                      <span className="chip chip-warning">v{template.version}</span>
                    </div>
                    <div style={{ fontWeight: 800, marginTop: "0.65rem" }}>{template.name}</div>
                    <div className="small-text">
                      {template.sections.length} sections · {questionCount} questions · {referenceImageCount} reference image links
                    </div>
                    {template.description ? <p className="small-text" style={{ marginTop: "0.35rem" }}>{template.description}</p> : null}
                  </div>
                </div>

                <div className="list">
                  {template.sections.map((section) => (
                    <div className="question-section" key={section.id}>
                      <strong>{section.title}</strong>
                      {section.guidance ? <p className="small-text" style={{ marginTop: "0.25rem" }}>{section.guidance}</p> : null}
                      <div className="list" style={{ marginTop: "0.7rem" }}>
                        {section.questions.map((question) => (
                          <div className="question-card" key={question.id}>
                            <div className="question-code">{question.code}</div>
                            <p className="question-prompt">{question.prompt}</p>
                            <div className="meta-row" style={{ marginTop: "0.45rem" }}>
                              <span className="chip chip-info">{question.responseType}</span>
                              {question.isMandatory ? <span className="chip chip-warning">Mandatory</span> : null}
                              {question.referenceImageUrl ? <span className="chip chip-success">Reference Image</span> : null}
                              {question.isCicCandidate ? <span className="chip chip-info">CIC Topic</span> : null}
                            </div>
                            {question.options.length > 0 ? (
                              <div className="small-text" style={{ marginTop: "0.45rem" }}>
                                Options: {question.options.map((option) => option.label).join(", ")}
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
