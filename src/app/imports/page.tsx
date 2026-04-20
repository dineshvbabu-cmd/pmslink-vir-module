import Link from "next/link";
import { ExternalReportConsole } from "@/app/imports/external-report-console";
import { TemplateImportConsole } from "@/app/imports/template-import-console";
import { ActivityFeed } from "@/components/activity-feed";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; section?: string }>;
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

  const { session, section } = await searchParams;

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
  const sectionCodes = selectedPayload?.template.sections.map((item) => item.code) ?? [];
  const selectedSectionCode =
    section && sectionCodes.includes(section) ? section : selectedPayload?.template.sections[0]?.code ?? null;
  const selectedSection =
    selectedPayload?.template.sections.find((item) => item.code === selectedSectionCode) ??
    selectedPayload?.template.sections[0] ??
    null;
  const sessionActivity = selectedSession ? buildImportActivity(selectedSession) : [];

  return (
    <div className="page-stack">
      <TemplateImportConsole />
      <ExternalReportConsole />

      {selectedSession && selectedPayload ? (
        <section className="workspace-console-shell">
          <aside className="workspace-console-rail">
            <section className="panel panel-elevated">
              <div className="section-header">
                <div>
                  <div className="eyebrow">Import navigator</div>
                  <h2 className="panel-title">Checklist review lanes</h2>
                </div>
              </div>

              <div className="stack-list">
                {selectedPayload.template.sections.map((item) => (
                  <Link
                    className={`section-nav-link ${item.code === selectedSectionCode ? "section-nav-link-active" : ""}`}
                    href={`/imports?session=${selectedSession.id}&section=${item.code}`}
                    key={item.code}
                  >
                    <span>{item.title}</span>
                    <span className="small-text">{item.questions.length} q</span>
                  </Link>
                ))}
              </div>
            </section>

            <ActivityFeed
              items={sessionActivity}
              subtitle="Who created, reviewed, and committed this import session."
              title="Import activity"
            />
          </aside>

          <section className="panel panel-elevated workspace-console-main">
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

          {selectedSection ? (
            <div className="stack-list" style={{ marginTop: "1rem" }}>
              <section className="panel question-section">
                <div className="section-header">
                  <div>
                    <h3 className="panel-title">{selectedSection.title}</h3>
                    <p className="panel-subtitle">
                      {selectedSection.code} / {selectedSection.questions.length} questions /{" "}
                      {selectedSection.questions.filter((question) => question.isMandatory).length} mandatory
                    </p>
                  </div>
                  <div className="meta-row">
                    <span className="chip chip-info">Checklist group</span>
                    <span className="chip chip-danger">
                      {selectedSection.questions.filter((question) => question.isCicCandidate).length} CIR focus
                    </span>
                  </div>
                </div>

                <div className="question-list-viewport">
                  <div className="stack-list">
                    {selectedSection.questions.map((question) => (
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
                </div>
              </section>
            </div>
          ) : null}
          </section>
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

function buildImportActivity(
  session: {
    id: string;
    createdAt: Date;
    createdBy: string | null;
    status: string;
    sourceFileName: string;
    fieldReviews: Array<{ id: string; fieldPath: string; reviewedAt: Date | null; reviewerName: string | null; accepted: boolean | null }>;
  }
) {
  const fmtTime = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "short",
    year: "numeric",
  });

  const items = [
    {
      id: `session-${session.id}`,
      title: `Import session ${session.status.toLowerCase()}`,
      detail: `${session.sourceFileName} entered the review lane.`,
      timeLabel: fmtTime.format(session.createdAt),
      actor: session.createdBy,
      tone: session.status === "COMMITTED" ? ("success" as const) : ("info" as const),
    },
    ...session.fieldReviews.map((review) => ({
      id: review.id,
      title: review.accepted === false ? "Field overridden" : "Field reviewed",
      detail: review.fieldPath,
      timeLabel: review.reviewedAt ? fmtTime.format(review.reviewedAt) : "Pending review",
      actor: review.reviewerName,
      tone: review.accepted === false ? ("warning" as const) : ("success" as const),
    })),
  ];

  return items.sort((left, right) => right.timeLabel.localeCompare(left.timeLabel));
}
