import Link from "next/link";
import {
  cloneVirTemplateVersionAction,
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
  "YES_NO_NA",
  "TEXT",
  "NUMBER",
  "DATE",
  "SINGLE_SELECT",
  "MULTI_SELECT",
  "SCORE",
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
              <p className="panel-subtitle">
                This module is available only from the office workspace.
              </p>
            </div>
          </div>
          <div className="empty-state">
            Vessel users can execute live questionnaires but cannot govern the
            underlying template catalogue.
          </div>
        </section>
      </div>
    );
  }

  const { type, template, section } = await searchParams;

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
                answerLibraryType: {
                  select: { id: true, name: true, code: true },
                },
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
        items: {
          where: { isActive: true },
          orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
          take: 6,
        },
      },
    }),
    prisma.virImportSession.findMany({
      orderBy: { createdAt: "desc" },
      take: 40,
      include: {
        inspectionType: { select: { id: true, name: true } },
      },
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

  const selectedGroup =
    groupedTemplates.find(([name]) => name === type) ??
    groupedTemplates[0] ??
    null;
  const selectedTemplate =
    selectedGroup?.[1].find((t) => t.id === template) ??
    selectedGroup?.[1][0] ??
    null;
  const selectedSection =
    selectedTemplate?.sections.find((s) => s.id === section) ??
    selectedTemplate?.sections[0] ??
    null;
  const templateLocked = (selectedTemplate?.inspections.length ?? 0) > 0;

  const templateActivity = selectedTemplate
    ? buildTemplateActivity(
        selectedTemplate,
        importSessions.filter(
          (s) => s.inspectionType?.id === selectedTemplate.inspectionTypeId
        )
      )
    : [];

  return (
    <div className="page-stack">
      <section className="workspace-console-shell">
        {/* ── Left rail ── */}
        <aside className="workspace-console-rail">
          {/* Inspection type groups */}
          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <div className="eyebrow">Template catalogue</div>
                <h2 className="panel-title">Inspection groups</h2>
              </div>
              <Link className="button button-secondary" href="/register">
                Library register
              </Link>
            </div>
            <div className="stack-list">
              {groupedTemplates.map(([groupName, records]) => (
                <Link
                  className={`section-nav-link ${selectedGroup?.[0] === groupName ? "section-nav-link-active" : ""}`}
                  href={`/templates?type=${encodeURIComponent(groupName)}&template=${records[0]?.id ?? ""}`}
                  key={groupName}
                >
                  <span>{groupName}</span>
                  <span className="small-text">{records.length} templates</span>
                </Link>
              ))}
            </div>
          </section>

          {/* Sections for selected template */}
          {selectedTemplate ? (
            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <h3 className="panel-title">Sections</h3>
                  <p className="panel-subtitle">
                    {selectedTemplate.sections.length} sections /{" "}
                    {selectedTemplate.sections.reduce(
                      (sum, s) => sum + s.questions.length,
                      0
                    )}{" "}
                    questions
                  </p>
                </div>
              </div>

              <div className="stack-list">
                {selectedTemplate.sections.map((s) => (
                  <Link
                    className={`section-nav-link ${selectedSection?.id === s.id ? "section-nav-link-active" : ""}`}
                    href={`/templates?type=${encodeURIComponent(selectedGroup?.[0] ?? "")}&template=${selectedTemplate.id}&section=${s.id}`}
                    key={s.id}
                  >
                    <span>{s.title}</span>
                    <span className="small-text">{s.questions.length} q</span>
                  </Link>
                ))}
              </div>

              <div className="template-editor-divider" />

              {/* Add section inline */}
              {!templateLocked ? (
                <form
                  action={upsertVirTemplateSectionAction}
                  className="register-form"
                >
                  <input
                    name="templateId"
                    type="hidden"
                    value={selectedTemplate.id}
                  />
                  <label>
                    New section title
                    <input
                      name="title"
                      placeholder="Hull / Navigation / Machinery"
                      required
                      type="text"
                    />
                  </label>
                  <label>
                    Section code
                    <input name="code" placeholder="HULL" type="text" />
                  </label>
                  <div className="register-form-actions">
                    <button className="button button-primary" type="submit">
                      Add section
                    </button>
                  </div>
                </form>
              ) : (
                <div className="small-text" style={{ padding: "0.5rem 0" }}>
                  Template is in use by inspections. Clone a new version to add
                  sections.
                </div>
              )}
            </section>
          ) : null}

          {/* Available QHSE questionnaire libraries */}
          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">QHSE Libraries</h3>
                <p className="panel-subtitle">
                  Bind these answer libraries to questions in the template
                  editor.
                </p>
              </div>
            </div>
            <div className="stack-list">
              {libraryTypes.length === 0 ? (
                <div className="empty-state">
                  No questionnaire libraries defined yet.{" "}
                  <Link className="inline-link" href="/register">
                    Open library register
                  </Link>{" "}
                  to create them.
                </div>
              ) : (
                libraryTypes.map((lib) => (
                  <div className="list-card" key={lib.id}>
                    <div className="list-card-title">{lib.name}</div>
                    <div className="small-text">
                      {lib.code} /{" "}
                      {lib.items.length > 0
                        ? lib.items
                            .slice(0, 3)
                            .map((i) => i.label)
                            .join(", ") +
                          (lib.items.length > 3
                            ? ` +${lib.items.length - 3} more`
                            : "")
                        : "No items yet"}
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </aside>

        {/* ── Main content ── */}
        <section className="panel panel-elevated workspace-console-main">
          {selectedTemplate ? (
            <div className="page-stack">
              {/* Template header + metadata editor */}
              <div className="section-header">
                <div>
                  <div className="eyebrow">Template governance</div>
                  <h2 className="panel-title">{selectedTemplate.name}</h2>
                  <p className="panel-subtitle">
                    v{selectedTemplate.version} /{" "}
                    {selectedTemplate.inspectionType.name} /{" "}
                    {templateLocked
                      ? "Locked — inspections exist. Clone to restructure."
                      : "Editable — no inspections yet."}
                  </p>
                </div>
                <div className="template-editor-toolbar">
                  <Link
                    className="button button-secondary"
                    href="/imports"
                  >
                    Import engine
                  </Link>
                  <form
                    action={cloneVirTemplateVersionAction.bind(
                      null,
                      selectedTemplate.id
                    )}
                  >
                    <button className="button button-primary" type="submit">
                      Clone new version
                    </button>
                  </form>
                </div>
              </div>

              {/* Template metadata form */}
              <section className="panel question-section">
                <div className="section-header">
                  <div>
                    <h3 className="panel-title">Template settings</h3>
                    <p className="panel-subtitle">
                      Name, questionnaire module, and activation state.
                    </p>
                  </div>
                </div>
                <form
                  action={upsertVirTemplateAction}
                  className="register-form"
                >
                  <input
                    name="id"
                    type="hidden"
                    value={selectedTemplate.id}
                  />
                  <label>
                    Template name
                    <input
                      defaultValue={selectedTemplate.name}
                      name="name"
                      required
                      type="text"
                    />
                  </label>
                  <label>
                    Description
                    <textarea
                      defaultValue={selectedTemplate.description ?? ""}
                      name="description"
                      rows={3}
                    />
                  </label>
                  <label>
                    Questionnaire module (QHSE library)
                    <select
                      defaultValue={
                        selectedTemplate.questionnaireLibraryId ?? ""
                      }
                      name="questionnaireLibraryId"
                    >
                      <option value="">— None (generic template) —</option>
                      {libraryTypes.map((lib) => (
                        <option key={lib.id} value={lib.id}>
                          {lib.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="checkbox-row">
                    <input
                      defaultChecked={selectedTemplate.isActive}
                      name="isActive"
                      type="checkbox"
                    />
                    Active template
                  </label>
                  <div className="register-form-actions">
                    <button
                      className="button button-secondary"
                      type="submit"
                    >
                      Save template settings
                    </button>
                  </div>
                </form>
              </section>

              {/* Workflow configuration */}
              <WorkflowConfigPanel template={selectedTemplate} />

              {/* Selected section + questions */}
              {selectedSection ? (
                <section className="panel question-section">
                  <div className="section-header">
                    <div>
                      <h3 className="panel-title">{selectedSection.title}</h3>
                      <p className="panel-subtitle">
                        {selectedSection.questions.length} questions /{" "}
                        {selectedSection.code ?? "No code"}
                      </p>
                    </div>
                    <div className="meta-row">
                      <span className="chip chip-success">
                        Section {selectedTemplate.sections.indexOf(selectedSection) + 1} of{" "}
                        {selectedTemplate.sections.length}
                      </span>
                      {!templateLocked ? (
                        <form action={deleteVirTemplateSectionAction.bind(null, selectedSection.id)}>
                          <button className="button button-ghost-danger" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }} type="submit">
                            Delete section
                          </button>
                        </form>
                      ) : null}
                    </div>
                  </div>

                  {/* Edit section metadata */}
                  {!templateLocked ? (
                    <details className="panel list-card" style={{ marginBottom: "1rem" }}>
                      <summary style={{ cursor: "pointer", fontWeight: 600 }}>
                        Edit section metadata
                      </summary>
                      <form
                        action={upsertVirTemplateSectionAction}
                        className="register-form"
                        style={{ marginTop: "0.75rem" }}
                      >
                        <input
                          name="id"
                          type="hidden"
                          value={selectedSection.id}
                        />
                        <input
                          name="templateId"
                          type="hidden"
                          value={selectedTemplate.id}
                        />
                        <label>
                          Title
                          <input
                            defaultValue={selectedSection.title}
                            name="title"
                            required
                            type="text"
                          />
                        </label>
                        <label>
                          Code
                          <input
                            defaultValue={selectedSection.code ?? ""}
                            name="code"
                            type="text"
                          />
                        </label>
                        <label>
                          Sort order
                          <input
                            defaultValue={selectedSection.sortOrder}
                            name="sortOrder"
                            type="number"
                          />
                        </label>
                        <label className="register-form-span">
                          Guidance
                          <textarea
                            defaultValue={selectedSection.guidance ?? ""}
                            name="guidance"
                            rows={2}
                          />
                        </label>
                        <div className="register-form-actions">
                          <button
                            className="button button-secondary"
                            type="submit"
                          >
                            Save section
                          </button>
                        </div>
                      </form>
                    </details>
                  ) : null}

                  {/* Questions list */}
                  <div className="question-list-viewport">
                    <div className="stack-list">
                      {selectedSection.questions.map((question) => (
                        <article className="list-card" key={question.id}>
                          <div className="section-header">
                            <div>
                              <div className="question-code">
                                {question.code}
                              </div>
                              <p className="question-prompt">
                                {question.prompt}
                              </p>
                            </div>
                            <div className="meta-row">
                              <span className="chip chip-info">
                                {responseTypeLabels[question.responseType] ?? question.responseType}
                              </span>
                              {question.isMandatory ? (
                                <span className="chip chip-warning">
                                  Mandatory
                                </span>
                              ) : null}
                              {question.isCicCandidate ? (
                                <span className="chip chip-danger">
                                  CIR focus
                                </span>
                              ) : null}
                              {question.answerLibraryType ? (
                                <span className="chip chip-success">
                                  {question.answerLibraryType.name}
                                </span>
                              ) : question.options.length > 0 ? (
                                <span className="chip chip-muted">
                                  {question.options.length} inline options
                                </span>
                              ) : null}
                            </div>
                          </div>

                          {!templateLocked ? (
                            <QuestionEditForm
                              question={question}
                              sectionId={selectedSection.id}
                              libraryTypes={libraryTypes}
                            />
                          ) : (
                            <div className="small-text" style={{ padding: "0.35rem 0", color: "var(--color-muted)" }}>
                              Read-only — template in use. Clone a new version to edit.
                            </div>
                          )}
                        </article>
                      ))}

                      {/* Add new question */}
                      {!templateLocked ? (
                        <article className="list-card">
                          <div className="section-header">
                            <div>
                              <h4 className="panel-title">Add question</h4>
                              <p className="panel-subtitle">
                                New questions are effective for inspections
                                created from this version onward.
                              </p>
                            </div>
                          </div>
                          <form
                            action={upsertVirTemplateQuestionAction}
                            className="register-form"
                          >
                            <input
                              name="sectionId"
                              type="hidden"
                              value={selectedSection.id}
                            />
                            <label>
                              Question code
                              <input
                                name="code"
                                placeholder="HULL_001"
                                type="text"
                              />
                            </label>
                            <label>
                              Response type
                              <select defaultValue="YES_NO_NA" name="responseType">
                                {responseTypes.map((rt) => (
                                  <option key={rt} value={rt}>
                                    {responseTypeLabels[rt] ?? rt}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Answer library (QHSE module)
                              <select
                                defaultValue=""
                                name="answerLibraryTypeId"
                              >
                                <option value="">
                                  — None / use inline options —
                                </option>
                                {libraryTypes.map((lib) => (
                                  <option key={lib.id} value={lib.id}>
                                    {lib.name}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <label>
                              Sort order
                              <input
                                defaultValue={
                                  selectedSection.questions.length + 1
                                }
                                name="sortOrder"
                                type="number"
                              />
                            </label>
                            <label className="register-form-span">
                              Prompt
                              <textarea
                                name="prompt"
                                placeholder="Question shown to the inspector."
                                required
                                rows={3}
                              />
                            </label>
                            <label className="register-form-span">
                              Help text
                              <textarea
                                name="helpText"
                                placeholder="Optional inspector guidance."
                                rows={2}
                              />
                            </label>
                            <label>
                              CIR topic
                              <input
                                name="cicTopic"
                                placeholder="Optional concentrated topic"
                                type="text"
                              />
                            </label>
                            <label className="register-form-span">
                              Reference image URL
                              <input
                                name="referenceImageUrl"
                                placeholder="https://... or R2 path"
                                type="text"
                              />
                            </label>
                            <label className="register-form-span">
                              Inline options (if no library bound)
                              <textarea
                                name="optionsText"
                                placeholder={"YES|Yes|5\nNO|No|0\nNA|Not applicable|"}
                                rows={3}
                              />
                              <span className="small-text template-option-hint">
                                One per line: VALUE|Label|Score
                              </span>
                            </label>
                            <div className="template-editor-checks">
                              <label className="checkbox-row">
                                <input
                                  defaultChecked
                                  name="isMandatory"
                                  type="checkbox"
                                />
                                Mandatory
                              </label>
                              <label className="checkbox-row">
                                <input
                                  defaultChecked
                                  name="allowsPhoto"
                                  type="checkbox"
                                />
                                Photo upload enabled
                              </label>
                              <label className="checkbox-row">
                                <input
                                  name="isCicCandidate"
                                  type="checkbox"
                                />
                                CIR focus candidate
                              </label>
                            </div>
                            <div className="register-form-actions">
                              <button
                                className="button button-primary"
                                type="submit"
                              >
                                Add question
                              </button>
                            </div>
                          </form>
                        </article>
                      ) : null}
                    </div>
                  </div>
                </section>
              ) : (
                <div className="empty-state">
                  Add a checklist section to start building this template.
                </div>
              )}
            </div>
          ) : (
            <div className="page-stack">
              <div className="section-header">
                <div>
                  <div className="eyebrow">Office governance</div>
                  <h2 className="panel-title">Template library</h2>
                  <p className="panel-subtitle">
                    Create and manage questionnaire templates. Bind QHSE library
                    modules from the register.
                  </p>
                </div>
                <Link className="button button-secondary" href="/imports">
                  Import engine
                </Link>
              </div>

              {/* Create new template */}
              <section className="panel question-section">
                <div className="section-header">
                  <div>
                    <h3 className="panel-title">Create template</h3>
                    <p className="panel-subtitle">
                      Templates define the questionnaire structure for a VIR
                      inspection. Bind QHSE questionnaire modules to provide
                      standardised answer sets.
                    </p>
                  </div>
                </div>
                <NewTemplateForm
                  inspectionTypes={inspectionTypes}
                  libraryTypes={libraryTypes}
                />
              </section>

              <div className="empty-state">
                Select an inspection group from the left rail to browse and
                edit templates.
              </div>
            </div>
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

function QuestionEditForm({
  question,
  sectionId,
  libraryTypes,
}: {
  question: {
    id: string;
    code: string;
    prompt: string;
    responseType: string;
    isMandatory: boolean;
    allowsPhoto: boolean;
    isCicCandidate: boolean;
    cicTopic: string | null;
    helpText: string | null;
    referenceImageUrl: string | null;
    answerLibraryTypeId: string | null;
    sortOrder: number;
    options: Array<{ value: string; label: string; score: number | null }>;
  };
  sectionId: string;
  libraryTypes: Array<{ id: string; name: string; code: string }>;
}) {
  const inlineOptions = question.options
    .map((o) => `${o.value}|${o.label}|${o.score ?? ""}`)
    .join("\n");

  return (
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginTop: "0.5rem", gap: "0.5rem" }}>
    <details style={{ flex: 1 }}>
      <summary style={{ cursor: "pointer", fontWeight: 500, padding: "0.35rem 0" }}>
        Edit question
      </summary>
      <form
        action={upsertVirTemplateQuestionAction}
        className="register-form"
        style={{ marginTop: "0.75rem" }}
      >
        <input name="id" type="hidden" value={question.id} />
        <input name="sectionId" type="hidden" value={sectionId} />
        <label>
          Question code
          <input defaultValue={question.code} name="code" type="text" />
        </label>
        <label>
          Response type
          <select defaultValue={question.responseType} name="responseType">
            {responseTypes.map((rt) => (
              <option key={rt} value={rt}>
                {responseTypeLabels[rt] ?? rt}
              </option>
            ))}
          </select>
        </label>
        <label>
          Answer library (QHSE module)
          <select
            defaultValue={question.answerLibraryTypeId ?? ""}
            name="answerLibraryTypeId"
          >
            <option value="">— None / use inline options —</option>
            {libraryTypes.map((lib) => (
              <option key={lib.id} value={lib.id}>
                {lib.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Sort order
          <input
            defaultValue={question.sortOrder}
            name="sortOrder"
            type="number"
          />
        </label>
        <label className="register-form-span">
          Prompt
          <textarea
            defaultValue={question.prompt}
            name="prompt"
            required
            rows={3}
          />
        </label>
        <label className="register-form-span">
          Help text
          <textarea
            defaultValue={question.helpText ?? ""}
            name="helpText"
            rows={2}
          />
        </label>
        <label>
          CIR topic
          <input
            defaultValue={question.cicTopic ?? ""}
            name="cicTopic"
            type="text"
          />
        </label>
        <label className="register-form-span">
          Reference image URL
          <input
            defaultValue={question.referenceImageUrl ?? ""}
            name="referenceImageUrl"
            type="text"
          />
        </label>
        <label className="register-form-span">
          Inline options (if no library bound)
          <textarea
            defaultValue={inlineOptions}
            name="optionsText"
            rows={3}
          />
          <span className="small-text template-option-hint">
            One per line: VALUE|Label|Score
          </span>
        </label>
        <div className="template-editor-checks">
          <label className="checkbox-row">
            <input
              defaultChecked={question.isMandatory}
              name="isMandatory"
              type="checkbox"
            />
            Mandatory
          </label>
          <label className="checkbox-row">
            <input
              defaultChecked={question.allowsPhoto}
              name="allowsPhoto"
              type="checkbox"
            />
            Photo upload enabled
          </label>
          <label className="checkbox-row">
            <input
              defaultChecked={question.isCicCandidate}
              name="isCicCandidate"
              type="checkbox"
            />
            CIR focus candidate
          </label>
        </div>
        <div className="register-form-actions">
          <button className="button button-secondary" type="submit">
            Save question
          </button>
        </div>
      </form>
    </details>
    <form action={deleteVirTemplateQuestionAction.bind(null, question.id)}>
      <button className="button button-ghost-danger" style={{ fontSize: "0.72rem", padding: "0.2rem 0.5rem" }} type="submit">
        Delete
      </button>
    </form>
    </div>
  );
}

function NewTemplateForm({
  inspectionTypes,
  libraryTypes,
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
            <option key={t.id} value={t.id}>
              {t.name} ({t.category})
            </option>
          ))}
        </select>
      </label>
      <label>
        New inspection type name <span className="small-text">(fill only if creating new above)</span>
        <input name="newTypeName" placeholder="e.g. Vetting Inspection" type="text" />
      </label>
      <label>
        Template name
        <input
          name="name"
          placeholder="VIR Standard Checklist"
          required
          type="text"
        />
      </label>
      <label>
        Version
        <input defaultValue="1" name="version" placeholder="1" type="text" />
      </label>
      <label>
        Questionnaire module (QHSE library)
        <select defaultValue="" name="questionnaireLibraryId">
          <option value="">— None —</option>
          {libraryTypes.map((lib) => (
            <option key={lib.id} value={lib.id}>
              {lib.name}
            </option>
          ))}
        </select>
      </label>
      <label className="register-form-span">
        Description
        <textarea name="description" placeholder="Purpose and scope of this template." rows={2} />
      </label>
      <div className="register-form-actions">
        <button className="button button-primary" type="submit">
          Create template
        </button>
      </div>
    </form>
  );
}

type WorkflowStageConfig = {
  stage: "VESSEL_SUBMISSION" | "SHORE_REVIEW" | "FINAL_ACKNOWLEDGEMENT";
  label: string;
  description?: string | null;
  actorRole?: string | null;
  isRequired: boolean;
};

const DEFAULT_WORKFLOW_STAGES: WorkflowStageConfig[] = [
  {
    stage: "VESSEL_SUBMISSION",
    label: "Vessel submission",
    description: "Inspector or master submits the completed questionnaire from the vessel.",
    actorRole: "Inspector / Master",
    isRequired: true,
  },
  {
    stage: "SHORE_REVIEW",
    label: "Office review",
    description: "QHSE superintendent reviews findings, evidence, and questionnaire quality.",
    actorRole: "QHSE Superintendent",
    isRequired: true,
  },
  {
    stage: "FINAL_ACKNOWLEDGEMENT",
    label: "Final acknowledgement",
    description: "Vessel acknowledges the office review outcome before closure.",
    actorRole: "Inspector / Master",
    isRequired: false,
  },
];

function parseWorkflowConfig(raw: unknown): WorkflowStageConfig[] {
  if (!raw || typeof raw !== "object" || !("stages" in raw)) {
    return DEFAULT_WORKFLOW_STAGES;
  }
  const config = raw as { stages?: unknown };
  if (!Array.isArray(config.stages) || config.stages.length === 0) {
    return DEFAULT_WORKFLOW_STAGES;
  }
  return DEFAULT_WORKFLOW_STAGES.map((def) => {
    const saved = (config.stages as WorkflowStageConfig[]).find((s) => s.stage === def.stage);
    return saved
      ? {
          stage: def.stage,
          label: saved.label || def.label,
          description: saved.description ?? def.description,
          actorRole: saved.actorRole ?? def.actorRole,
          isRequired: saved.isRequired ?? def.isRequired,
        }
      : def;
  });
}

function WorkflowConfigPanel({ template }: { template: { id: string; workflowConfig: unknown } }) {
  const stages = parseWorkflowConfig(template.workflowConfig);

  return (
    <section className="panel question-section">
      <details>
        <summary style={{ cursor: "pointer", fontWeight: 600, padding: "0.5rem 0" }}>
          Workflow configuration — sign-off stages
        </summary>
        <p className="panel-subtitle" style={{ margin: "0.5rem 0 1rem" }}>
          Customise the label, actor role, and description for each sign-off stage. These labels appear in the inspection sign-off panel.
        </p>
        <form action={upsertVirTemplateWorkflowAction} className="register-form">
          <input name="id" type="hidden" value={template.id} />
          {stages.map((stage, i) => (
            <div className="workflow-stage-row" key={stage.stage} style={{ borderTop: i > 0 ? "1px solid var(--border)" : undefined, paddingTop: i > 0 ? "1rem" : undefined, marginTop: i > 0 ? "0.5rem" : undefined }}>
              <div className="small-text" style={{ fontWeight: 600, marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                Stage {i + 1}: {stage.stage.replace(/_/g, " ")}
              </div>
              <input name={`stage_${stage.stage}_stage`} type="hidden" value={stage.stage} />
              <label>
                Stage label
                <input
                  defaultValue={stage.label}
                  name={`stage_${stage.stage}_label`}
                  placeholder="Stage label shown in the inspection"
                  type="text"
                />
              </label>
              <label>
                Actor role
                <input
                  defaultValue={stage.actorRole ?? ""}
                  name={`stage_${stage.stage}_actorRole`}
                  placeholder="e.g. Inspector / Master"
                  type="text"
                />
              </label>
              <label className="register-form-span">
                Stage description
                <textarea
                  defaultValue={stage.description ?? ""}
                  name={`stage_${stage.stage}_description`}
                  placeholder="What this stage represents in the inspection workflow."
                  rows={2}
                />
              </label>
              <label className="checkbox-row">
                <input
                  defaultChecked={stage.isRequired}
                  name={`stage_${stage.stage}_isRequired`}
                  type="checkbox"
                />
                Required stage
              </label>
            </div>
          ))}
          <div className="register-form-actions">
            <button className="button button-secondary" type="submit">
              Save workflow configuration
            </button>
          </div>
        </form>
      </details>
    </section>
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
  }>
) {
  const fmt = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

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
    ...importSessions.map((session) => ({
      id: session.id,
      title: `Import ${session.status.toLowerCase()}`,
      detail: session.sourceFileName,
      timeLabel: fmt.format(session.createdAt),
      actor: session.createdBy,
      tone:
        session.status === "COMMITTED"
          ? ("success" as const)
          : ("warning" as const),
    })),
  ];
}
