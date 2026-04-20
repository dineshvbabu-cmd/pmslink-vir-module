import Link from "next/link";
import { ExternalReportConsole } from "@/app/imports/external-report-console";
import { TemplateImportConsole } from "@/app/imports/template-import-console";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const currentSession = await requireVirSession();

  if (!isOfficeSession(currentSession)) {
    return (
      <div className="page-stack">
        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h2 className="panel-title">Import engine</h2>
              <p className="panel-subtitle">This workspace is reserved for office review and governance.</p>
            </div>
          </div>
          <div className="empty-state">
            Vessel users can consume imported templates through live inspections, but they cannot run template imports
            or approve external report mapping sessions.
          </div>
        </section>
      </div>
    );
  }

  const { session } = await searchParams;

  const sessions = await prisma.virImportSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      inspectionType: { select: { name: true, code: true } },
      fieldReviews: {
        take: 5,
        orderBy: { createdAt: "desc" },
      },
    },
  });
  const selectedSession = session ? sessions.find((record) => record.id === session) ?? null : sessions[0] ?? null;
  const selectedPayload = unwrapTemplatePayload(selectedSession?.payload);

  return (
    <div className="page-stack">
      <TemplateImportConsole />
      <ExternalReportConsole />

      {selectedSession && selectedPayload ? (
        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <div className="eyebrow">Template review workspace</div>
              <h2 className="panel-title">Imported checklist review</h2>
              <p className="panel-subtitle">
                Review the inspection group, linked checklist template, questionnaire sections, and image capability
                before using the template across office and vessel workflows.
              </p>
            </div>
            <div className="meta-row">
              <span className={`chip ${selectedSession.status === "COMMITTED" ? "chip-success" : "chip-warning"}`}>
                {selectedSession.status}
              </span>
              {selectedSession.inspectionType ? <span className="chip chip-info">{selectedSession.inspectionType.name}</span> : null}
            </div>
          </div>

          <div className="template-review-grid">
            <div className="list-card">
              <div className="question-code">Inspection group</div>
              <div className="list-card-title">{selectedPayload.template.inspectionTypeName}</div>
              <div className="small-text">{selectedPayload.template.inspectionTypeCode}</div>
              <div className="meta-row" style={{ marginTop: "0.7rem" }}>
                <span className="chip chip-info">{selectedPayload.template.inspectionCategory}</span>
                <span className="chip chip-warning">v{selectedPayload.template.version}</span>
              </div>
            </div>

            <div className="list-card">
              <div className="question-code">Checklist template</div>
              <div className="list-card-title">{selectedPayload.template.templateName}</div>
              <div className="small-text">{selectedPayload.template.description ?? "No description supplied."}</div>
            </div>

            <div className="list-card">
              <div className="question-code">Normalization summary</div>
              <div className="small-text">
                {selectedPayload.summary?.sections ?? selectedPayload.template.sections.length} sections /{" "}
                {selectedPayload.summary?.questions ??
                  selectedPayload.template.sections.reduce((sum, record) => sum + record.questions.length, 0)}{" "}
                questions
              </div>
              <div className="meta-row" style={{ marginTop: "0.7rem" }}>
                <span className="chip chip-warning">
                  Mandatory {selectedPayload.summary?.mandatoryQuestions ?? 0}
                </span>
                <span className="chip chip-danger">CIR {selectedPayload.summary?.cicQuestions ?? 0}</span>
                <span className="chip chip-success">Photos enabled</span>
              </div>
            </div>
          </div>

          {selectedPayload.warnings.length ? (
            <div className="focus-banner" style={{ marginTop: "1rem" }}>
              <div>
                <strong>Normalization warnings</strong>
                <div className="small-text" style={{ marginTop: "0.25rem" }}>
                  These are the items management or the template owner should validate before live rollout.
                </div>
              </div>
              <div className="stack-list" style={{ minWidth: "min(100%, 28rem)" }}>
                {selectedPayload.warnings.map((warning) => (
                  <div className="small-text" key={warning}>
                    {warning}
                  </div>
                ))}
              </div>
            </div>
          ) : null}

          <div className="stack-list" style={{ marginTop: "1rem" }}>
            {selectedPayload.template.sections.map((section) => (
              <details className="question-section question-section-accordion" key={section.code} open={false}>
                <summary className="question-section-summary">
                  <div>
                    <strong>{section.title}</strong>
                    <div className="small-text">
                      {section.code} / {section.questions.length} questions
                    </div>
                  </div>
                  <div className="meta-row">
                    <span className="chip chip-info">Checklist</span>
                    <span className="chip chip-muted">
                      {section.questions.filter((question) => question.isMandatory).length} mandatory
                    </span>
                  </div>
                </summary>

                <div className="stack-list" style={{ marginTop: "0.85rem" }}>
                  {section.questions.map((question) => (
                    <div className="question-card question-card-compact" key={question.code}>
                      <div className="question-card-compact-main">
                        <div className="question-code">{question.code}</div>
                        <p className="question-prompt">{question.prompt}</p>
                        {question.helpText ? <div className="small-text">{question.helpText}</div> : null}
                      </div>
                      <div className="question-card-flags">
                        <span className="chip chip-info">{question.responseType}</span>
                        {question.isMandatory ? <span className="chip chip-warning">Mandatory</span> : null}
                        {question.isCicCandidate ? <span className="chip chip-danger">CIR focus</span> : null}
                        {question.referenceImageUrl ? <span className="chip chip-info">Reference image</span> : null}
                        {question.allowsPhoto ? <span className="chip chip-success">Actual upload enabled</span> : null}
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            ))}
          </div>
        </section>
      ) : null}

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Office governance</div>
            <h2 className="panel-title">Import session history</h2>
            <p className="panel-subtitle">
              Audit trail for checklist and questionnaire normalization across PSC, TMSA, RightShip, CID, SIRE 2.0,
              internal audits, and external audits.
            </p>
          </div>
        </div>

        <div className="stack-list">
          {sessions.map((record) => (
            <div className="list-card" key={record.id}>
              <div className="section-header">
                <div>
                  <div className="meta-row">
                    <span className={`chip ${record.id === session ? "chip-success" : "chip-info"}`}>{record.status}</span>
                    {record.inspectionType ? <span className="chip chip-warning">{record.inspectionType.name}</span> : null}
                  </div>
                  <div className="list-card-title">{record.sourceFileName}</div>
                  <div className="small-text">
                    {record.sourceSystem ?? "Unknown source"} / {fmt.format(record.createdAt)}
                    {record.confidenceAvg ? ` / ${Math.round(record.confidenceAvg * 100)}% confidence` : ""}
                  </div>
                </div>
              </div>

              <div className="small-text">
                Payload fields reviewed: {record.fieldReviews.length} / Session ID: {record.id}
              </div>
              <div className="actions-row" style={{ marginTop: "0.7rem" }}>
                <Link className="btn-secondary btn-compact" href={`/imports?session=${record.id}`}>
                  Review session
                </Link>
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}

type TemplateReviewPayload = {
  template: {
    inspectionTypeCode: string;
    inspectionTypeName: string;
    inspectionCategory: string;
    templateName: string;
    version: string;
    description: string | null;
    sections: Array<{
      code: string;
      title: string;
      questions: Array<{
        code: string;
        prompt: string;
        responseType: string;
        isMandatory: boolean;
        isCicCandidate: boolean;
        allowsPhoto: boolean;
        referenceImageUrl: string | null;
        helpText: string | null;
      }>;
    }>;
  };
  summary: {
    sections?: number;
    questions?: number;
    mandatoryQuestions?: number;
    cicQuestions?: number;
  } | null;
  warnings: string[];
};

function unwrapTemplatePayload(payload: unknown): TemplateReviewPayload | null {
  if (!payload || typeof payload !== "object") {
    return null;
  }

  const record = payload as Record<string, unknown>;
  const normalized = (record.normalized ?? record) as Record<string, unknown>;
  const sections = Array.isArray(normalized.sections) ? normalized.sections : [];

  if (typeof normalized.templateName !== "string" || typeof normalized.inspectionTypeName !== "string") {
    return null;
  }

  return {
    template: {
      inspectionTypeCode:
        typeof normalized.inspectionTypeCode === "string" ? normalized.inspectionTypeCode : "UNKNOWN",
      inspectionTypeName: normalized.inspectionTypeName,
      inspectionCategory:
        typeof normalized.inspectionCategory === "string" ? normalized.inspectionCategory : "INTERNAL",
      templateName: normalized.templateName,
      version: typeof normalized.version === "string" ? normalized.version : "n/a",
      description: typeof normalized.description === "string" ? normalized.description : null,
      sections: sections.map((section) => {
        const sectionRecord = section as Record<string, unknown>;
        const questions = Array.isArray(sectionRecord.questions) ? sectionRecord.questions : [];

        return {
          code: typeof sectionRecord.code === "string" ? sectionRecord.code : "SECTION",
          title: typeof sectionRecord.title === "string" ? sectionRecord.title : "Section",
          questions: questions.map((question) => {
            const questionRecord = question as Record<string, unknown>;
            return {
              code: typeof questionRecord.code === "string" ? questionRecord.code : "QUESTION",
              prompt: typeof questionRecord.prompt === "string" ? questionRecord.prompt : "Question prompt",
              responseType: typeof questionRecord.responseType === "string" ? questionRecord.responseType : "TEXT",
              isMandatory: Boolean(questionRecord.isMandatory),
              isCicCandidate: Boolean(questionRecord.isCicCandidate),
              allowsPhoto: questionRecord.allowsPhoto !== false,
              referenceImageUrl:
                typeof questionRecord.referenceImageUrl === "string" ? questionRecord.referenceImageUrl : null,
              helpText: typeof questionRecord.helpText === "string" ? questionRecord.helpText : null,
            };
          }),
        };
      }),
    },
    summary:
      record.summary && typeof record.summary === "object"
        ? (record.summary as TemplateReviewPayload["summary"])
        : null,
    warnings: Array.isArray(record.warnings)
      ? record.warnings.filter((value): value is string => typeof value === "string")
      : [],
  };
}
