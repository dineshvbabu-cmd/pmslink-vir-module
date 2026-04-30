import Link from "next/link";
import { ChevronRight, Copy, FilePlus, LayoutList, Pencil, Plus, Trash2, Upload } from "lucide-react";
import {
  cloneVirTemplateVersionAction,
  copyQuestionsFromSectionAction,
  createVirTemplateAction,
  deleteVirTemplateQuestionAction,
  deleteVirTemplateSectionAction,
  upsertVirTemplateAction,
  upsertVirTemplateSectionAction,
  upsertVirTemplateQuestionAction,
  upsertVirTemplateWorkflowAction,
} from "@/app/actions";
import { FloatingActivityFeed } from "@/components/floating-activity-feed";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const responseTypes = [
  "YES_NO_NA", "TEXT", "NUMBER", "DATE", "SINGLE_SELECT", "MULTI_SELECT", "SCORE",
] as const;

const responseTypeLabels: Record<string, string> = {
  YES_NO_NA: "Yes / No / N/A",
  TEXT: "Free Text",
  NUMBER: "Number",
  DATE: "Date",
  SINGLE_SELECT: "Single Select",
  MULTI_SELECT: "Multi Select",
  SCORE: "Score (1-5)",
};

export default async function TemplatesPage({
  searchParams,
}: {
  searchParams: Promise<{ type?: string; template?: string; section?: string; addSection?: string; copyFrom?: string }>;
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
          <div className="empty-state">Vessel users can execute live questionnaires but cannot govern the underlying template catalogue.</div>
        </section>
      </div>
    );
  }

  const { type, template, section, addSection, copyFrom } = await searchParams;

  const [templates, libraryTypes, importSessions] = await Promise.all([
    prisma.virTemplate.findMany({
      where: { isActive: true },
      orderBy: [{ createdAt: "desc" }],
      include: {
        inspectionType: true,
        questionnaireLibrary: { select: { id: true, name: true, code: true } },
        sections: {
          orderBy: { sortOrder: "asc" },
          include: {
            questions: {
              orderBy: { sortOrder: "asc" },
              include: {
                answerLibraryType: { select: { id: true, name: true, code: true } },
                options: { orderBy: { sortOrder: "asc" } },
              },
            },
          },
        },
        inspections: {
          where: { isDeleted: false },
          select: { id: true, status: true },
          take: 1,
        },
      },
    }),
    prisma.virLibraryType.findMany({
      where: { isActive: true },
      orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
      include: {
        items: { where: { isActive: true }, orderBy: [{ sortOrder: "asc" }, { label: "asc" }], take: 6 },
      },
    }),
    prisma.virImportSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: { inspectionType: { select: { id: true, name: true } } },
    }),
  ]);

  const inspectionTypes = await prisma.virInspectionType.findMany({
    where: { isActive: true, category: "INTERNAL" },
    orderBy: { name: "asc" },
  });

  const groupedTemplates = Array.from(
    templates.reduce((map, t) => {
      const key = t.inspectionType.name;
      const existing = map.get(key) ?? [];
      existing.push(t);
      map.set(key, existing);
      return map;
    }, new Map<string, typeof templates>())
  );

  const selectedGroup = groupedTemplates.find(([name]) => name === type) ?? null;
  const selectedTemplate =
    selectedGroup?.[1].find((t) => t.id === template) ??
    selectedGroup?.[1][0] ??
    null;
  const selectedSection =
    selectedTemplate?.sections.find((s) => s.id === section) ?? null;
  const templateLocked = (selectedTemplate?.inspections.length ?? 0) > 0;

  const templateActivity = selectedTemplate
    ? buildTemplateActivity(
        selectedTemplate,
        importSessions.filter((s) => s.inspectionType?.id === selectedTemplate.inspectionTypeId)
      )
    : [];

  // ── All sections across all templates (for copy-from picker) ──
  const allSectionsForCopy = templates.flatMap((t) =>
    t.sections.map((s) => ({
      id: s.id,
      title: s.title,
      questionCount: s.questions.length,
      templateName: t.name,
      groupName: t.inspectionType.name,
    }))
  );

  // ── Level 3: Section + Questions ──
  if (selectedTemplate && selectedSection) {
    const returnToSection = buildHref({ type, template: selectedTemplate.id });
    const returnToThis = buildHref({ type, template: selectedTemplate.id, section: selectedSection.id });

    return (
      <div className="page-stack">
        <section className="panel panel-elevated">
          {/* Breadcrumb */}
          <Breadcrumb items={[
            { label: "Template Library", href: "/templates" },
            { label: selectedGroup?.[0] ?? "Group", href: buildHref({ type }) },
            { label: selectedTemplate.name, href: returnToSection },
            { label: selectedSection.title },
          ]} />

          <div className="section-header" style={{ marginTop: "1rem" }}>
            <div>
              <div className="eyebrow">Section {(selectedTemplate.sections.indexOf(selectedSection) + 1)} of {selectedTemplate.sections.length}</div>
              <h2 className="panel-title">{selectedSection.title}</h2>
              <p className="panel-subtitle">{selectedSection.questions.length} questions / {selectedSection.code ?? "No code"}</p>
            </div>
            <div className="table-actions">
              {!templateLocked ? (
                <form action={deleteVirTemplateSectionAction.bind(null, selectedSection.id)}>
                  <input name="returnTo" type="hidden" value={returnToSection} />
                  <button className="btn-danger btn-compact" type="submit">
                    <Trash2 size={14} />
                    Delete section
                  </button>
                </form>
              ) : null}
            </div>
          </div>

          {/* Edit section metadata */}
          {!templateLocked ? (
            <details className="panel list-card" style={{ marginBottom: "1rem" }}>
              <summary style={{ cursor: "pointer", fontWeight: 600, padding: "0.25rem 0" }}>
                <Pencil size={13} style={{ display: "inline", marginRight: "0.4rem" }} />
                Edit section metadata
              </summary>
              <form action={upsertVirTemplateSectionAction} className="register-form" style={{ marginTop: "0.75rem" }}>
                <input name="id" type="hidden" value={selectedSection.id} />
                <input name="templateId" type="hidden" value={selectedTemplate.id} />
                <label>Title<input defaultValue={selectedSection.title} name="title" required type="text" /></label>
                <label>Code<input defaultValue={selectedSection.code ?? ""} name="code" type="text" /></label>
                <label>Sort order<input defaultValue={selectedSection.sortOrder} name="sortOrder" type="number" /></label>
                <label className="register-form-span">Guidance<textarea defaultValue={selectedSection.guidance ?? ""} name="guidance" rows={2} /></label>
                <div className="register-form-actions">
                  <button className="btn btn-compact" type="submit"><Pencil size={13} />Save section</button>
                </div>
              </form>
            </details>
          ) : null}

          {/* Questions table */}
          <div className="table-shell table-shell-compact" style={{ marginBottom: "1rem" }}>
            <table className="table data-table vir-data-table" style={{ tableLayout: "fixed" }}>
              <thead>
                <tr>
                  <th style={{ width: "3rem" }}>S.No</th>
                  <th style={{ width: "6rem" }}>CODE</th>
                  <th>QUESTION</th>
                  <th style={{ width: "7rem" }}>RESPONSE</th>
                  <th style={{ width: "5rem" }}>MANDATORY</th>
                  <th style={{ width: "4rem" }}>CIR</th>
                  <th style={{ width: "9rem" }}>LIBRARY / OPTIONS</th>
                  <th style={{ width: "5rem" }}>ACTIONS</th>
                </tr>
              </thead>
              <tbody>
                {selectedSection.questions.map((question, qi) => (
                  <tr key={question.id}>
                    <td style={{ textAlign: "center", color: "var(--color-ink-soft)", fontSize: "0.78rem" }}>{qi + 1}</td>
                    <td style={{ fontSize: "0.78rem", fontWeight: 600, fontFamily: "monospace" }}>{question.code}</td>
                    <td>
                      <div style={{ fontWeight: 500, fontSize: "0.83rem", marginBottom: "0.15rem" }}>{question.prompt}</div>
                      {question.helpText ? (
                        <div style={{ fontSize: "0.74rem", color: "var(--color-ink-soft)" }}>{question.helpText}</div>
                      ) : null}
                      {!templateLocked ? (
                        <QuestionEditForm question={question} sectionId={selectedSection.id} libraryTypes={libraryTypes} />
                      ) : (
                        <div className="small-text" style={{ color: "var(--color-muted)", marginTop: "0.25rem" }}>Read-only — clone to edit.</div>
                      )}
                    </td>
                    <td>
                      <span className="chip chip-info" style={{ fontSize: "0.7rem" }}>
                        {responseTypeLabels[question.responseType] ?? question.responseType}
                      </span>
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {question.isMandatory ? (
                        <span className="chip chip-warning" style={{ fontSize: "0.7rem" }}>M</span>
                      ) : (
                        <span style={{ color: "var(--color-ink-soft)", fontSize: "0.75rem" }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {question.isCicCandidate ? (
                        <span className="chip chip-danger" style={{ fontSize: "0.7rem" }}>CIR</span>
                      ) : (
                        <span style={{ color: "var(--color-ink-soft)", fontSize: "0.75rem" }}>—</span>
                      )}
                    </td>
                    <td style={{ fontSize: "0.75rem" }}>
                      {question.answerLibraryType ? (
                        <span className="chip chip-success" style={{ fontSize: "0.7rem" }}>{question.answerLibraryType.name}</span>
                      ) : question.options.length > 0 ? (
                        <span className="chip chip-muted" style={{ fontSize: "0.7rem" }}>{question.options.length} options</span>
                      ) : (
                        <span style={{ color: "var(--color-ink-soft)" }}>—</span>
                      )}
                    </td>
                    <td style={{ textAlign: "center" }}>
                      {!templateLocked ? (
                        <form action={deleteVirTemplateQuestionAction.bind(null, question.id)}>
                          <button className="btn-danger btn-compact" style={{ fontSize: "0.7rem", padding: "0.25rem 0.5rem" }} title="Delete question" type="submit">
                            <Trash2 size={12} />
                          </button>
                        </form>
                      ) : null}
                    </td>
                  </tr>
                ))}
                {selectedSection.questions.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", color: "var(--color-ink-soft)", padding: "1.5rem" }}>
                      No questions yet. Add the first question below.
                    </td>
                  </tr>
                ) : null}
              </tbody>
            </table>
          </div>

          {/* Add question + Copy from section */}
          {!templateLocked ? (
            <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
              {/* Copy from another section */}
              <details className="panel list-card">
                <summary style={{ cursor: "pointer", fontWeight: 600, padding: "0.25rem 0" }}>
                  <Copy size={13} style={{ display: "inline", marginRight: "0.4rem" }} />
                  Copy questions from another section
                </summary>
                <p className="panel-subtitle" style={{ margin: "0.5rem 0" }}>
                  Copies all questions from the selected section into this section. Duplicate codes are renamed automatically.
                </p>
                <form action={copyQuestionsFromSectionAction} className="register-form" style={{ marginTop: "0.5rem" }}>
                  <input name="targetSectionId" type="hidden" value={selectedSection.id} />
                  <input name="returnTo" type="hidden" value={returnToThis} />
                  <label className="register-form-span">
                    Source section
                    <select name="sourceSectionId" required>
                      <option value="">— Select a section —</option>
                      {allSectionsForCopy
                        .filter((s) => s.id !== selectedSection.id && s.questionCount > 0)
                        .map((s) => (
                          <option key={s.id} value={s.id}>
                            {s.groupName} / {s.templateName} / {s.title} ({s.questionCount} questions)
                          </option>
                        ))}
                    </select>
                  </label>
                  <div className="register-form-actions">
                    <button className="btn btn-compact" type="submit">
                      <Copy size={13} />
                      Copy questions
                    </button>
                  </div>
                </form>
              </details>

              {/* Add new question */}
              <article className="panel list-card">
                <div className="section-header">
                  <div>
                    <h4 className="panel-title">Add question</h4>
                    <p className="panel-subtitle">New questions are effective for inspections created from this version onward.</p>
                  </div>
                </div>
                <form action={upsertVirTemplateQuestionAction} className="register-form">
                  <input name="sectionId" type="hidden" value={selectedSection.id} />
                  <label>Question code<input name="code" placeholder="HULL_001" type="text" /></label>
                  <label>
                    Response type
                    <select defaultValue="YES_NO_NA" name="responseType">
                      {responseTypes.map((rt) => (
                        <option key={rt} value={rt}>{responseTypeLabels[rt] ?? rt}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Answer library (QHSE module)
                    <select defaultValue="" name="answerLibraryTypeId">
                      <option value="">— None / use inline options —</option>
                      {libraryTypes.map((lib) => (
                        <option key={lib.id} value={lib.id}>{lib.name}</option>
                      ))}
                    </select>
                  </label>
                  <label>Sort order<input defaultValue={selectedSection.questions.length + 1} name="sortOrder" type="number" /></label>
                  <label className="register-form-span">
                    Prompt
                    <textarea name="prompt" placeholder="Question shown to the inspector." required rows={3} />
                  </label>
                  <label className="register-form-span">
                    Help text
                    <textarea name="helpText" placeholder="Optional inspector guidance." rows={2} />
                  </label>
                  <label>CIR topic<input name="cicTopic" placeholder="Optional concentrated topic" type="text" /></label>
                  <label className="register-form-span">
                    Reference image URL
                    <input name="referenceImageUrl" placeholder="https://... or R2 path" type="text" />
                  </label>
                  <label className="register-form-span">
                    Inline options (if no library bound)
                    <textarea name="optionsText" placeholder={"YES|Yes|5\nNO|No|0\nNA|Not applicable|"} rows={3} />
                    <span className="small-text template-option-hint">One per line: VALUE|Label|Score</span>
                  </label>
                  <div className="template-editor-checks">
                    <label className="checkbox-row"><input defaultChecked name="isMandatory" type="checkbox" />Mandatory</label>
                    <label className="checkbox-row"><input defaultChecked name="allowsPhoto" type="checkbox" />Photo upload enabled</label>
                    <label className="checkbox-row"><input name="isCicCandidate" type="checkbox" />CIR focus candidate</label>
                  </div>
                  <div className="register-form-actions">
                    <button className="btn btn-compact" type="submit">
                      <Plus size={14} />
                      Add question
                    </button>
                  </div>
                </form>
              </article>
            </div>
          ) : (
            <div className="small-text" style={{ padding: "0.5rem 0", color: "var(--color-ink-soft)" }}>
              Template is locked — clone a new version to add or edit questions.
            </div>
          )}
        </section>

        <FloatingActivityFeed items={templateActivity} subtitle="Template creation, import review, and governance activity." title="Template activity" />
      </div>
    );
  }

  // ── Level 2: Template + Sections ──
  if (selectedTemplate) {
    const returnToGroup = buildHref({ type });

    return (
      <div className="page-stack">
        <section className="panel panel-elevated">
          {/* Breadcrumb */}
          <Breadcrumb items={[
            { label: "Template Library", href: "/templates" },
            { label: selectedGroup?.[0] ?? "Group", href: returnToGroup },
            { label: selectedTemplate.name },
          ]} />

          <div className="section-header" style={{ marginTop: "1rem" }}>
            <div>
              <div className="eyebrow">Template governance</div>
              <h2 className="panel-title">{selectedTemplate.name}</h2>
              <p className="panel-subtitle">
                v{selectedTemplate.version} / {selectedTemplate.inspectionType.name} /{" "}
                {templateLocked ? "Locked — inspections exist. Clone to restructure." : "Editable — no inspections yet."}
              </p>
            </div>
            <div className="table-actions">
              <Link className="btn-secondary btn-compact" href="/imports">
                <Upload size={14} />
                Import template
              </Link>
              <form action={cloneVirTemplateVersionAction.bind(null, selectedTemplate.id)}>
                <button className="btn btn-compact" type="submit">
                  <Copy size={14} />
                  Clone new version
                </button>
              </form>
            </div>
          </div>

          {/* Template settings */}
          <details className="panel question-section" open={!templateLocked} style={{ marginBottom: "1rem" }}>
            <summary style={{ cursor: "pointer", fontWeight: 600, padding: "0.5rem 0" }}>
              Template settings — name, module, activation
            </summary>
            <form action={upsertVirTemplateAction} className="register-form" style={{ marginTop: "0.75rem" }}>
              <input name="id" type="hidden" value={selectedTemplate.id} />
              <label>Template name<input defaultValue={selectedTemplate.name} name="name" required type="text" /></label>
              <label>Description<textarea defaultValue={selectedTemplate.description ?? ""} name="description" rows={3} /></label>
              <label>
                Questionnaire module (QHSE library)
                <select defaultValue={selectedTemplate.questionnaireLibraryId ?? ""} name="questionnaireLibraryId">
                  <option value="">— None (generic template) —</option>
                  {libraryTypes.map((lib) => (
                    <option key={lib.id} value={lib.id}>{lib.name}</option>
                  ))}
                </select>
              </label>
              <label className="checkbox-row">
                <input defaultChecked={selectedTemplate.isActive} name="isActive" type="checkbox" />
                Active template
              </label>
              <label className="checkbox-row">
                <input
                  defaultChecked={
                    selectedTemplate.workflowConfig &&
                    typeof selectedTemplate.workflowConfig === "object" &&
                    !Array.isArray(selectedTemplate.workflowConfig)
                      ? Boolean((selectedTemplate.workflowConfig as Record<string, unknown>).showCertificatesTab)
                      : false
                  }
                  name="showCertificatesTab"
                  type="checkbox"
                />
                Show Certificates tab in inspection
              </label>
              <div className="register-form-actions">
                <button className="btn btn-compact" type="submit">
                  <Pencil size={13} />
                  Save template settings
                </button>
              </div>
            </form>
          </details>

          {/* Workflow config */}
          <WorkflowConfigPanel template={selectedTemplate} />

          {/* Sections list */}
          <div className="section-header" style={{ marginTop: "1.5rem", marginBottom: "0.75rem" }}>
            <div>
              <h3 className="panel-title">
                <LayoutList size={16} style={{ display: "inline", marginRight: "0.4rem" }} />
                Sections
              </h3>
              <p className="panel-subtitle">{selectedTemplate.sections.length} sections / {selectedTemplate.sections.reduce((s, sec) => s + sec.questions.length, 0)} questions total</p>
            </div>
          </div>

          {selectedTemplate.sections.length === 0 ? (
            <div className="empty-state">No sections yet. Add the first section below.</div>
          ) : (
            <div className="stack-list" style={{ marginBottom: "1.5rem" }}>
              {selectedTemplate.sections.map((s, idx) => (
                <div className="section-nav-link" key={s.id} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: "0.75rem" }}>
                  <Link
                    className="table-link"
                    href={buildHref({ type, template: selectedTemplate.id, section: s.id })}
                    style={{ flex: 1 }}
                  >
                    <span style={{ fontWeight: 600 }}>{idx + 1}. {s.title}</span>
                    <span className="small-text" style={{ marginLeft: "0.5rem" }}>/ {s.code ?? "no code"}</span>
                  </Link>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                    <span className="chip chip-info" style={{ fontSize: "0.7rem" }}>{s.questions.length} questions</span>
                    <Link
                      className="btn-secondary btn-compact"
                      href={buildHref({ type, template: selectedTemplate.id, section: s.id })}
                      style={{ fontSize: "0.78rem", padding: "0.3rem 0.65rem" }}
                    >
                      Open
                      <ChevronRight size={13} />
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Add section */}
          {!templateLocked ? (
            <details className="panel list-card" open={!!addSection}>
              <summary style={{ cursor: "pointer", fontWeight: 600, padding: "0.25rem 0" }}>
                <FilePlus size={13} style={{ display: "inline", marginRight: "0.4rem" }} />
                Add new section
              </summary>
              <form action={upsertVirTemplateSectionAction} className="register-form" style={{ marginTop: "0.75rem" }}>
                <input name="templateId" type="hidden" value={selectedTemplate.id} />
                <label>Section title<input name="title" placeholder="Hull / Navigation / Machinery" required type="text" /></label>
                <label>Section code<input name="code" placeholder="HULL" type="text" /></label>
                <label>Sort order<input defaultValue={selectedTemplate.sections.length + 1} name="sortOrder" type="number" /></label>
                <div className="register-form-actions">
                  <button className="btn btn-compact" type="submit">
                    <FilePlus size={14} />
                    Add section
                  </button>
                </div>
              </form>
            </details>
          ) : (
            <div className="small-text" style={{ color: "var(--color-ink-soft)" }}>
              Template is locked — clone a new version to add sections.
            </div>
          )}
        </section>

        <FloatingActivityFeed items={templateActivity} subtitle="Template creation, import review, and governance activity." title="Template activity" />
      </div>
    );
  }

  // ── Level 1: Inspection Groups ──
  return (
    <div className="page-stack">
      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Template catalogue</div>
            <h2 className="panel-title">Inspection groups</h2>
            <p className="panel-subtitle">
              Select a group to manage templates, sections, and questionnaires.
            </p>
          </div>
          <Link className="btn-secondary btn-compact" href="/imports">
            <Upload size={14} />
            Import template
          </Link>
        </div>

        {groupedTemplates.length === 0 ? (
          <div className="empty-state">No templates yet. Create the first one below.</div>
        ) : (
          <div className="vessel-card-grid" style={{ marginBottom: "1.5rem" }}>
            {groupedTemplates.map(([groupName, records]) => {
              const totalSections = records.reduce((s, t) => s + t.sections.length, 0);
              const totalQuestions = records.reduce((s, t) => t.sections.reduce((ss, sec) => ss + sec.questions.length, 0) + s, 0);
              const firstTemplate = records[0];

              return (
                <article className="vessel-card" key={groupName}>
                  <div className="vessel-card-header" style={{ minHeight: "auto", paddingBottom: "0.75rem" }}>
                    <div className="vessel-card-copy" style={{ width: "100%" }}>
                      <div className="vessel-card-title-row">
                        <span style={{ fontWeight: 700, fontSize: "0.95rem" }}>{groupName}</span>
                      </div>
                      <div className="vessel-card-meta-grid">
                        <DetailLine label="Templates" value={String(records.length)} />
                        <DetailLine label="Sections" value={String(totalSections)} />
                        <DetailLine label="Questions" value={String(totalQuestions)} />
                        <DetailLine label="Version" value={`v${firstTemplate?.version ?? "1"}`} />
                      </div>
                    </div>
                  </div>
                  <div className="vessel-card-footer">
                    <div className="vessel-card-stats">
                      {records.some((t) => t.inspections.length > 0) ? (
                        <span className="chip chip-warning" style={{ fontSize: "0.7rem" }}>In use</span>
                      ) : (
                        <span className="chip chip-success" style={{ fontSize: "0.7rem" }}>Editable</span>
                      )}
                    </div>
                    <div className="table-actions table-actions-icons">
                      <Link
                        className="btn btn-compact"
                        href={buildHref({ type: groupName, template: firstTemplate?.id })}
                        style={{ fontSize: "0.8rem" }}
                      >
                        Open
                        <ChevronRight size={14} />
                      </Link>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Create new template */}
        <details className="panel question-section">
          <summary style={{ cursor: "pointer", fontWeight: 600, padding: "0.5rem 0" }}>
            <Plus size={13} style={{ display: "inline", marginRight: "0.4rem" }} />
            Create new template
          </summary>
          <p className="panel-subtitle" style={{ margin: "0.5rem 0 1rem" }}>
            Templates define the questionnaire structure for a VIR inspection. Bind QHSE questionnaire modules to provide standardised answer sets.
          </p>
          <NewTemplateForm inspectionTypes={inspectionTypes} libraryTypes={libraryTypes} />
        </details>
      </section>

      <FloatingActivityFeed
        items={importSessions.slice(0, 5).map((s) => ({
          id: s.id,
          title: `Import ${s.status.toLowerCase()}`,
          detail: s.sourceFileName,
          timeLabel: new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(s.createdAt),
          actor: s.createdBy ?? undefined,
          tone: s.status === "COMMITTED" ? ("success" as const) : ("warning" as const),
        }))}
        subtitle="Template import and governance activity."
        title="Template activity"
      />
    </div>
  );
}

// ── URL helpers ─────────────────────────────────────────────────────────────

function buildHref(params: { type?: string; template?: string; section?: string }) {
  const p = new URLSearchParams();
  if (params.type) p.set("type", params.type);
  if (params.template) p.set("template", params.template);
  if (params.section) p.set("section", params.section);
  const qs = p.toString();
  return qs ? `/templates?${qs}` : "/templates";
}

// ── Breadcrumb ───────────────────────────────────────────────────────────────

function Breadcrumb({ items }: { items: Array<{ label: string; href?: string }> }) {
  return (
    <nav style={{ display: "flex", alignItems: "center", gap: "0.35rem", flexWrap: "wrap", fontSize: "0.82rem", color: "var(--color-ink-soft)" }}>
      {items.map((item, i) => (
        <span key={i} style={{ display: "flex", alignItems: "center", gap: "0.35rem" }}>
          {i > 0 ? <ChevronRight size={12} /> : null}
          {item.href ? (
            <Link className="table-link" href={item.href} style={{ fontSize: "0.82rem" }}>{item.label}</Link>
          ) : (
            <span style={{ color: "var(--color-ink)", fontWeight: 600 }}>{item.label}</span>
          )}
        </span>
      ))}
    </nav>
  );
}

// ── Sub-components ───────────────────────────────────────────────────────────

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="vessel-card-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function QuestionEditForm({
  question, sectionId, libraryTypes,
}: {
  question: {
    id: string; code: string; prompt: string; responseType: string; isMandatory: boolean;
    allowsPhoto: boolean; isCicCandidate: boolean; cicTopic: string | null; helpText: string | null;
    referenceImageUrl: string | null; answerLibraryTypeId: string | null; sortOrder: number;
    options: Array<{ value: string; label: string; score: number | null }>;
  };
  sectionId: string;
  libraryTypes: Array<{ id: string; name: string; code: string }>;
}) {
  const inlineOptions = question.options.map((o) => `${o.value}|${o.label}|${o.score ?? ""}`).join("\n");

  return (
    <details style={{ marginTop: "0.4rem" }}>
      <summary style={{ cursor: "pointer", fontWeight: 500, fontSize: "0.8rem", padding: "0.2rem 0", color: "var(--color-primary)" }}>
        Edit question
      </summary>
      <form action={upsertVirTemplateQuestionAction} className="register-form" style={{ marginTop: "0.75rem" }}>
        <input name="id" type="hidden" value={question.id} />
        <input name="sectionId" type="hidden" value={sectionId} />
        <label>Question code<input defaultValue={question.code} name="code" type="text" /></label>
        <label>
          Response type
          <select defaultValue={question.responseType} name="responseType">
            {responseTypes.map((rt) => (
              <option key={rt} value={rt}>{responseTypeLabels[rt] ?? rt}</option>
            ))}
          </select>
        </label>
        <label>
          Answer library (QHSE module)
          <select defaultValue={question.answerLibraryTypeId ?? ""} name="answerLibraryTypeId">
            <option value="">— None / use inline options —</option>
            {libraryTypes.map((lib) => (
              <option key={lib.id} value={lib.id}>{lib.name}</option>
            ))}
          </select>
        </label>
        <label>Sort order<input defaultValue={question.sortOrder} name="sortOrder" type="number" /></label>
        <label className="register-form-span">Prompt<textarea defaultValue={question.prompt} name="prompt" required rows={3} /></label>
        <label className="register-form-span">Help text<textarea defaultValue={question.helpText ?? ""} name="helpText" rows={2} /></label>
        <label>CIR topic<input defaultValue={question.cicTopic ?? ""} name="cicTopic" type="text" /></label>
        <label className="register-form-span">Reference image URL<input defaultValue={question.referenceImageUrl ?? ""} name="referenceImageUrl" type="text" /></label>
        <label className="register-form-span">
          Inline options
          <textarea defaultValue={inlineOptions} name="optionsText" rows={3} />
          <span className="small-text template-option-hint">One per line: VALUE|Label|Score</span>
        </label>
        <div className="template-editor-checks">
          <label className="checkbox-row"><input defaultChecked={question.isMandatory} name="isMandatory" type="checkbox" />Mandatory</label>
          <label className="checkbox-row"><input defaultChecked={question.allowsPhoto} name="allowsPhoto" type="checkbox" />Photo upload enabled</label>
          <label className="checkbox-row"><input defaultChecked={question.isCicCandidate} name="isCicCandidate" type="checkbox" />CIR focus candidate</label>
        </div>
        <div className="register-form-actions">
          <button className="btn btn-compact" type="submit"><Pencil size={13} />Save question</button>
        </div>
      </form>
    </details>
  );
}

function NewTemplateForm({
  inspectionTypes, libraryTypes,
}: {
  inspectionTypes: Array<{ id: string; name: string; category: string }>;
  libraryTypes: Array<{ id: string; name: string; code: string }>;
}) {
  return (
    <form action={createVirTemplateAction} className="register-form">
      <label>
        Inspection type
        <select name="inspectionTypeId" required>
          <option value="">Select inspection type</option>
          <option value="NEW">— Create new inspection type —</option>
          {inspectionTypes.map((t) => (
            <option key={t.id} value={t.id}>{t.name} ({t.category})</option>
          ))}
        </select>
      </label>
      <label>New inspection type name <span className="small-text">(fill only if creating new above)</span><input name="newTypeName" placeholder="e.g. Vetting Inspection" type="text" /></label>
      <label>Template name<input name="name" placeholder="VIR Standard Checklist" required type="text" /></label>
      <label>Version<input defaultValue="1" name="version" placeholder="1" type="text" /></label>
      <label>
        Questionnaire module (QHSE library)
        <select defaultValue="" name="questionnaireLibraryId">
          <option value="">— None —</option>
          {libraryTypes.map((lib) => (
            <option key={lib.id} value={lib.id}>{lib.name}</option>
          ))}
        </select>
      </label>
      <label className="register-form-span">Description<textarea name="description" placeholder="Purpose and scope of this template." rows={2} /></label>
      <div className="register-form-actions">
        <button className="btn btn-compact" type="submit">
          <Plus size={14} />
          Create template
        </button>
      </div>
    </form>
  );
}

type WorkflowStageConfig = {
  stage: "SHORE_REVIEW" | "FINAL_ACKNOWLEDGEMENT";
  label: string;
  description?: string | null;
  actorRole?: string | null;
  isRequired: boolean;
};

const DEFAULT_WORKFLOW_STAGES: WorkflowStageConfig[] = [
  { stage: "SHORE_REVIEW", label: "Office review", description: "QHSE superintendent or office manager reviews findings, evidence, and questionnaire quality.", actorRole: "QHSE Superintendent / Office Manager", isRequired: true },
  { stage: "FINAL_ACKNOWLEDGEMENT", label: "Final acknowledgement", description: "Senior office manager or DPA provides final sign-off before closure.", actorRole: "DPA / Fleet Manager", isRequired: false },
];

function parseWorkflowConfig(raw: unknown): WorkflowStageConfig[] {
  if (!raw || typeof raw !== "object" || !("stages" in raw)) return DEFAULT_WORKFLOW_STAGES;
  const config = raw as { stages?: unknown };
  if (!Array.isArray(config.stages) || config.stages.length === 0) return DEFAULT_WORKFLOW_STAGES;
  return DEFAULT_WORKFLOW_STAGES.map((def) => {
    const saved = (config.stages as Array<{ stage: string; label?: string; description?: string | null; actorRole?: string | null; isRequired?: boolean }>)
      .filter((s) => s.stage !== "VESSEL_SUBMISSION")
      .find((s) => s.stage === def.stage);
    return saved
      ? { stage: def.stage, label: saved.label || def.label, description: saved.description ?? def.description, actorRole: saved.actorRole ?? def.actorRole, isRequired: saved.isRequired ?? def.isRequired }
      : def;
  });
}

function WorkflowConfigPanel({ template }: { template: { id: string; workflowConfig: unknown } }) {
  const stages = parseWorkflowConfig(template.workflowConfig);

  return (
    <details className="panel question-section" style={{ marginBottom: "1rem" }}>
      <summary style={{ cursor: "pointer", fontWeight: 600, padding: "0.5rem 0" }}>
        Workflow configuration — sign-off stages
      </summary>
      <p className="panel-subtitle" style={{ margin: "0.5rem 0 1rem" }}>
        Customise the label, actor role, and description for each sign-off stage.
      </p>
      <form action={upsertVirTemplateWorkflowAction} className="register-form">
        <input name="id" type="hidden" value={template.id} />
        {stages.map((stage, i) => (
          <div className="workflow-stage-row" key={stage.stage} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, paddingTop: i > 0 ? "1rem" : undefined, marginTop: i > 0 ? "0.5rem" : undefined }}>
            <div className="small-text" style={{ fontWeight: 600, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
              Stage {i + 1}: {stage.stage.replace(/_/g, " ")}
            </div>
            <input name={`stage_${stage.stage}_stage`} type="hidden" value={stage.stage} />
            <label>Stage label<input defaultValue={stage.label} name={`stage_${stage.stage}_label`} placeholder="Stage label shown in the inspection" type="text" /></label>
            <label>Actor role<input defaultValue={stage.actorRole ?? ""} name={`stage_${stage.stage}_actorRole`} placeholder="e.g. Inspector / Master" type="text" /></label>
            <label className="register-form-span">Stage description<textarea defaultValue={stage.description ?? ""} name={`stage_${stage.stage}_description`} placeholder="What this stage represents in the inspection workflow." rows={2} /></label>
            <label className="checkbox-row"><input defaultChecked={stage.isRequired} name={`stage_${stage.stage}_isRequired`} type="checkbox" />Required stage</label>
          </div>
        ))}
        <div className="register-form-actions">
          <button className="btn btn-compact" type="submit">
            <Pencil size={13} />
            Save workflow configuration
          </button>
        </div>
      </form>
    </details>
  );
}

function buildTemplateActivity(
  template: { id: string; name: string; createdAt: Date; updatedAt: Date; sections: Array<{ id: string; title: string }> },
  importSessions: Array<{ id: string; createdAt: Date; status: string; sourceFileName: string; createdBy: string | null }>
) {
  const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  return [
    { id: `${template.id}-created`, title: "Template created", detail: `${template.name} entered the questionnaire catalogue.`, timeLabel: fmt.format(template.createdAt), tone: "success" as const },
    { id: `${template.id}-updated`, title: "Template last updated", detail: `${template.sections.length} section groups currently active.`, timeLabel: fmt.format(template.updatedAt), tone: "info" as const },
    ...importSessions.map((session) => ({
      id: session.id,
      title: `Import ${session.status.toLowerCase()}`,
      detail: session.sourceFileName,
      timeLabel: fmt.format(session.createdAt),
      actor: session.createdBy ?? undefined,
      tone: session.status === "COMMITTED" ? ("success" as const) : ("warning" as const),
    })),
  ];
}
