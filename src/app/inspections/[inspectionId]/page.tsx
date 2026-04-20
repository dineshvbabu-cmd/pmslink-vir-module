import Link from "next/link";
import { notFound } from "next/navigation";
import {
  addCorrectiveActionAction,
  addFindingAction,
  addSignOffAction,
  saveInspectionAnswersAction,
  updateCorrectiveActionStatusAction,
  updateFindingStatusAction,
  updateInspectionStatusAction,
} from "@/app/actions";
import { EvidenceSyncPanel } from "@/components/evidence-sync-panel";
import { QuestionEvidenceInline } from "@/components/question-evidence-inline";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { calculateInspectionScore, summarizeProgress } from "@/lib/vir/analytics";
import { canAccessVessel, isOfficeSession, isVesselSession, requireVirSession } from "@/lib/vir/session";
import {
  correctiveActionStatusLabel,
  findingStatusLabel,
  inspectionStatusLabel,
  riskLabel,
  toneForCorrectiveActionStatus,
  toneForFindingStatus,
  toneForInspectionStatus,
  toneForRisk,
} from "@/lib/vir/workflow";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function InspectionDetailPage({ params }: { params: Promise<{ inspectionId: string }> }) {
  const session = await requireVirSession();
  const { inspectionId } = await params;

  const inspection = await prisma.virInspection.findUnique({
    where: { id: inspectionId },
    include: {
      vessel: true,
      inspectionType: true,
      previousInspection: {
        select: {
          id: true,
          title: true,
          inspectionDate: true,
          status: true,
        },
      },
      template: {
        include: {
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
      },
      answers: {
        include: {
          photos: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
      findings: {
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        include: {
          question: { select: { prompt: true, code: true } },
          carriedFromFinding: {
            select: {
              title: true,
              inspection: {
                select: {
                  title: true,
                  inspectionDate: true,
                },
              },
            },
          },
          correctiveActions: { orderBy: { createdAt: "desc" } },
        },
      },
      signOffs: {
        orderBy: { signedAt: "desc" },
      },
      photos: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!inspection) {
    notFound();
  }

  if (!canAccessVessel(session, inspection.vesselId)) {
    notFound();
  }

  const questions = inspection.template?.sections.flatMap((section) => section.questions) ?? [];
  const progress = summarizeProgress(questions, inspection.answers);
  const score = calculateInspectionScore(questions, inspection.answers, inspection.findings);
  const answerMap = new Map(inspection.answers.map((answer) => [answer.questionId, answer]));
  const templateQuestionCount = inspection.template?.sections.reduce((sum, section) => sum + section.questions.length, 0) ?? 0;
  const pendingCorrectiveActions = inspection.findings
    .flatMap((finding) => finding.correctiveActions)
    .filter((action) => ["OPEN", "IN_PROGRESS", "REJECTED"].includes(action.status)).length;
  const concentratedQuestions = questions.filter((question) => question.isCicCandidate);
  const sectionNavigation =
    inspection.template?.sections.map((section, index) => ({
      id: `section-${index + 1}-${slugify(section.title)}`,
      title: section.title,
      questionCount: section.questions.length,
      mandatoryCount: section.questions.filter((question) => question.isMandatory).length,
    })) ?? [];

  const saveAnswers = saveInspectionAnswersAction.bind(null, inspection.id);
  const addFinding = addFindingAction.bind(null, inspection.id);
  const addSignOff = addSignOffAction.bind(null, inspection.id);
  const questionOptions = questions.map((question) => ({
    id: question.id,
    label: `${question.code} / ${question.prompt}`,
  }));
  const findingOptions = inspection.findings.map((finding) => ({
    id: finding.id,
    label: finding.title,
  }));

  return (
    <div className="page-stack">
      <section className="hero-panel">
        <div>
          <div className="meta-row">
            <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
              {inspectionStatusLabel[inspection.status]}
            </span>
            <span className="chip chip-info">{inspection.inspectionType.name}</span>
            {inspection.template ? <span className="chip chip-warning">{inspection.template.name}</span> : null}
            {inspection.template ? <span className="chip chip-muted">v{inspection.template.version}</span> : null}
            <span className={`chip ${isOfficeSession(session) ? "chip-info" : "chip-success"}`}>
              {isOfficeSession(session) ? "Office lane" : "Vessel lane"}
            </span>
          </div>
          <h2 className="hero-title" style={{ marginTop: "1rem" }}>
            {inspection.title}
          </h2>
          <p className="hero-copy">
            {inspection.vessel.name} / {fmt.format(inspection.inspectionDate)}
            {inspection.port ? ` / ${inspection.port}` : ""}
            {inspection.country ? ` / ${inspection.country}` : ""}
          </p>
        </div>

        <div className="actions-row">
          <Link className="btn-secondary" href={`/reports/inspection/${inspection.id}`}>
            Printable pack
          </Link>
          <a className="btn-secondary" href={`/api/reports/inspection/${inspection.id}/pdf`}>
            PDF
          </a>
          {isVesselSession(session) ? (
            <form action={updateInspectionStatusAction.bind(null, inspection.id, "SUBMITTED")}>
              <SubmitButton className="btn">Submit to office</SubmitButton>
            </form>
          ) : null}

          {isOfficeSession(session) ? (
            <>
              <form action={updateInspectionStatusAction.bind(null, inspection.id, "RETURNED")}>
                <SubmitButton className="btn-danger">Return to vessel</SubmitButton>
              </form>
              <form action={updateInspectionStatusAction.bind(null, inspection.id, "SHORE_REVIEWED")}>
                <SubmitButton className="btn-secondary">Mark shore reviewed</SubmitButton>
              </form>
              <form action={updateInspectionStatusAction.bind(null, inspection.id, "CLOSED")}>
                <SubmitButton className="btn">Close VIR</SubmitButton>
              </form>
            </>
          ) : null}
        </div>
      </section>

      <section className="erp-metrics-grid">
        <MetricBox
          label="Completion"
          value={`${progress.completionPct}%`}
          note={`${progress.answeredQuestions}/${progress.totalQuestions} answered`}
        />
        <MetricBox
          label="Mandatory"
          value={`${progress.answeredMandatory}/${progress.mandatoryQuestions}`}
          note={`${progress.mandatoryPct}% mandatory coverage`}
        />
        <MetricBox
          label="Readiness score"
          value={score.finalScore !== null ? `${score.finalScore}` : "n/a"}
          note={score.rawAverage !== null ? `Raw ${score.rawAverage} / penalty ${score.penaltyPoints}` : "Builds as answers are saved"}
        />
        <MetricBox
          label="Open findings"
          value={`${inspection.findings.filter((finding) => finding.status !== "CLOSED").length}`}
          note={`${inspection.ncCount} NC / ${inspection.obsCount} Obs / ${inspection.recCount} Rec`}
        />
        <MetricBox label="Pending CAR" value={`${pendingCorrectiveActions}`} note="Open, in progress, or rejected" />
        <MetricBox
          label="Approved sign-offs"
          value={`${inspection.signOffs.filter((item) => item.approved).length}`}
          note="Workflow audit trail"
        />
        <MetricBox label="Evidence" value={`${inspection.photos.length}`} note="Synced photo records" />
      </section>

      <section className="detail-grid">
        <div className="page-stack">
          <section className="panel panel-elevated">
            <div className="section-jump-bar">
              <a className="filter-chip filter-chip-active" href="#questionnaire">
                Questionnaire
              </a>
              <a className="filter-chip" href="#findings">
                Findings
              </a>
              <a className="filter-chip" href="#evidence">
                Evidence
              </a>
              <a className="filter-chip" href="#signoff">
                Sign-off
              </a>
            </div>
          </section>

          <section className="panel panel-elevated" id="questionnaire">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Questionnaire execution</h3>
                <p className="panel-subtitle">
                  {isOfficeSession(session)
                    ? "Office can review the live answer set while vessel keeps ownership of execution."
                    : "Answer mandatory questions, capture evidence notes, and prepare for submission."}
                </p>
              </div>
              {isOfficeSession(session) ? <span className="chip chip-muted">Read only</span> : null}
            </div>

            {!inspection.template ? (
              <div className="empty-state">This inspection does not have a questionnaire template attached yet.</div>
            ) : (
              <form action={saveAnswers} className="page-stack">
                {concentratedQuestions.length > 0 ? (
                  <div className="focus-banner">
                    <div>
                      <strong>Concentrated inspection focus active</strong>
                      <div className="small-text" style={{ marginTop: "0.25rem" }}>
                        {concentratedQuestions.length} concentrated questions were detected from the imported template
                        and are highlighted below for fast review.
                      </div>
                    </div>
                    <div className="meta-row">
                      {concentratedQuestions.slice(0, 4).map((question) => (
                        <span className="chip chip-warning" key={question.id}>
                          {question.code}
                        </span>
                      ))}
                    </div>
                  </div>
                ) : null}

                {inspection.template.sections.map((section, sectionIndex) => (
                  <details
                    className="question-section question-section-accordion"
                    id={sectionNavigation[sectionIndex]?.id}
                    key={section.id}
                    open={sectionIndex < 2}
                  >
                    <summary className="question-section-summary">
                      <div>
                        <strong>{section.title}</strong>
                        <div className="small-text">
                          {section.questions.length} questions /{" "}
                          {section.questions.filter((question) => question.isMandatory).length} mandatory
                        </div>
                      </div>
                      <div className="meta-row">
                        <span className="chip chip-info">{section.code ?? "SECTION"}</span>
                        {section.questions.some((question) => question.isCicCandidate) ? (
                          <span className="chip chip-danger">CIR focus in section</span>
                        ) : null}
                      </div>
                    </summary>

                    {section.guidance ? <p className="small-text" style={{ marginTop: "0.8rem" }}>{section.guidance}</p> : null}

                    <div className="stack-list" style={{ marginTop: "0.85rem" }}>
                      {[...section.questions]
                        .sort((a, b) => Number(b.isCicCandidate) - Number(a.isCicCandidate) || a.sortOrder - b.sortOrder)
                        .map((question) => {
                          const answer = answerMap.get(question.id);
                          const selectedOptions = Array.isArray(answer?.selectedOptions)
                            ? answer.selectedOptions.filter((item): item is string => typeof item === "string")
                            : [];

                          return (
                            <div className={`question-card ${question.isCicCandidate ? "question-card-focus" : ""}`} key={question.id}>
                              <div className="question-header">
                                <div>
                                  <div className="question-code">{question.code}</div>
                                  <p className="question-prompt">{question.prompt}</p>
                                  <div className="meta-row">
                                    <span className={`chip ${toneForRisk(question.riskLevel)}`}>{riskLabel[question.riskLevel]}</span>
                                    <span className="chip chip-info">{question.responseType}</span>
                                    {question.isMandatory ? <span className="chip chip-warning">Mandatory</span> : null}
                                    {question.allowsPhoto ? <span className="chip chip-success">Actual upload enabled</span> : null}
                                    {question.isCicCandidate ? (
                                      <span className="chip chip-danger">
                                        {question.cicTopic ? `Concentrated / ${question.cicTopic}` : "Concentrated topic"}
                                      </span>
                                    ) : null}
                                  </div>
                                </div>
                                {question.referenceImageUrl ? (
                                  <a className="btn-secondary btn-compact" href={question.referenceImageUrl} rel="noreferrer" target="_blank">
                                    Open reference
                                  </a>
                                ) : null}
                              </div>

                              <div className="question-card-layout">
                                <div className="question-card-main">
                                  <QuestionInput
                                    answer={answer}
                                    disabled={isOfficeSession(session)}
                                    question={question}
                                    selectedOptions={selectedOptions}
                                  />

                                  <div className="field-wide" style={{ marginTop: "0.85rem" }}>
                                    <label htmlFor={`comment:${question.id}`}>Observation / evidence note</label>
                                    <textarea
                                      defaultValue={answer?.comment ?? ""}
                                      disabled={isOfficeSession(session)}
                                      id={`comment:${question.id}`}
                                      name={`comment:${question.id}`}
                                      placeholder="Record narrative, evidence note, or inspector observation."
                                    />
                                  </div>
                                </div>

                                <div className="question-card-side">
                                  {question.referenceImageUrl ? (
                                    <div className="reference-panel">
                                      <div className="small-text visual-label">Reference standard</div>
                                      <div className="reference-thumb">
                                        <img alt={`${question.code} reference`} src={question.referenceImageUrl} />
                                      </div>
                                      <div className="small-text">
                                        Smaller guidance image for side-by-side comparison against vessel evidence.
                                      </div>
                                    </div>
                                  ) : null}

                                  <QuestionEvidenceInline
                                    canUpload={isVesselSession(session)}
                                    existingCount={answer?.photos.length ?? 0}
                                    inspectionId={inspection.id}
                                    questionCode={question.code}
                                    questionId={question.id}
                                  />
                                </div>
                              </div>

                              {answer?.photos.length ? (
                                <div className="question-visual-lane">
                                  <div className="evidence-panel" style={{ gridColumn: "1 / -1" }}>
                                    <div className="small-text visual-label">Actual vessel evidence</div>
                                    <div className="question-evidence-gallery">
                                      {answer.photos.map((photo) => (
                                        <div className="question-evidence-card" key={photo.id}>
                                          <img alt={photo.caption ?? photo.fileName ?? "Vessel evidence"} src={photo.url} />
                                          <div className="small-text">
                                            {photo.caption ?? photo.fileName ?? "Uploaded evidence"}
                                          </div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                </div>
                              ) : null}
                            </div>
                          );
                        })}
                    </div>
                  </details>
                ))}

                {isVesselSession(session) ? <SubmitButton className="btn">Save questionnaire answers</SubmitButton> : null}
              </form>
            )}
          </section>

          <section className="panel panel-elevated" id="findings">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Findings and corrective flow</h3>
                <p className="panel-subtitle">
                  Vessel progresses findings and corrective actions; office verifies and closes them.
                </p>
              </div>
            </div>

            <form action={addFinding} className="form-grid" style={{ marginBottom: "1rem" }}>
              <div className="field">
                <label htmlFor="questionId">Linked question</label>
                <select id="questionId" name="questionId">
                  <option value="">General finding</option>
                  {questions.map((question) => (
                    <option key={question.id} value={question.id}>
                      {question.code} / {question.prompt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="findingType">Finding type</label>
                <select id="findingType" name="findingType" required>
                  <option value="OBSERVATION">Observation</option>
                  <option value="NON_CONFORMITY">Non-Conformity</option>
                  <option value="RECOMMENDATION">Recommendation</option>
                  <option value="POSITIVE">Positive</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="severity">Severity</label>
                <select id="severity" name="severity" required>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="dueDate">Target date</label>
                <input id="dueDate" name="dueDate" type="date" />
              </div>

              <div className="field-wide">
                <label htmlFor="title">Title</label>
                <input id="title" name="title" placeholder="Emergency fire pump delivery pressure below expected range" required />
              </div>

              <div className="field-wide">
                <label htmlFor="description">Description</label>
                <textarea id="description" name="description" placeholder="Describe the issue, evidence, and impact." required />
              </div>

              <div className="field">
                <label htmlFor="ownerName">Action owner</label>
                <input id="ownerName" name="ownerName" placeholder="Chief Engineer" />
              </div>

              <div className="field">
                <label htmlFor="vesselResponse">Immediate vessel response</label>
                <input id="vesselResponse" name="vesselResponse" placeholder="Spare pump test planned before sailing" />
              </div>

              <div className="field-wide">
                <SubmitButton className="btn">Raise finding</SubmitButton>
              </div>
            </form>

            <div className="stack-list">
              {inspection.findings.length === 0 ? (
                <div className="empty-state">No findings have been raised on this VIR yet.</div>
              ) : (
                inspection.findings.map((finding) => (
                  <div className="list-card" key={finding.id}>
                    <div className="section-header">
                      <div>
                        <div className="meta-row">
                          <span className={`chip ${toneForRisk(finding.severity)}`}>{riskLabel[finding.severity]}</span>
                          <span className={`chip ${toneForFindingStatus(finding.status)}`}>{findingStatusLabel[finding.status]}</span>
                        </div>
                        <div className="list-card-title">{finding.title}</div>
                        <p className="small-text">{finding.description}</p>
                        {finding.question ? (
                          <div className="small-text">
                            Linked to {finding.question.code} / {finding.question.prompt}
                          </div>
                        ) : null}
                        {finding.carriedFromFinding ? (
                          <div className="small-text">
                            Carried from {finding.carriedFromFinding.inspection.title} / {finding.carriedFromFinding.title}
                          </div>
                        ) : null}
                      </div>

                      <div className="actions-row">
                        {isVesselSession(session) ? (
                          <>
                            <form action={updateFindingStatusAction.bind(null, inspection.id, finding.id, "IN_PROGRESS")}>
                              <SubmitButton className="btn-secondary">In progress</SubmitButton>
                            </form>
                            <form action={updateFindingStatusAction.bind(null, inspection.id, finding.id, "READY_FOR_REVIEW")}>
                              <SubmitButton className="btn-secondary">Ready for review</SubmitButton>
                            </form>
                          </>
                        ) : null}

                        {isOfficeSession(session) ? (
                          <form action={updateFindingStatusAction.bind(null, inspection.id, finding.id, "CLOSED")}>
                            <SubmitButton className="btn">Close finding</SubmitButton>
                          </form>
                        ) : null}
                      </div>
                    </div>

                    <div className="stack-list">
                      {finding.correctiveActions.map((action) => (
                        <div className="question-card" key={action.id}>
                          <div className="section-header">
                            <div>
                              <div style={{ fontWeight: 700 }}>{action.actionText}</div>
                              <div className="small-text">
                                {action.ownerName ? `${action.ownerName} / ` : ""}
                                {action.targetDate ? `Target ${fmt.format(action.targetDate)}` : "No target date"}
                              </div>
                            </div>
                            <span className={`chip ${toneForCorrectiveActionStatus(action.status)}`}>
                              {correctiveActionStatusLabel[action.status]}
                            </span>
                          </div>
                          <div className="actions-row">
                            {isVesselSession(session) ? (
                              <>
                                <form action={updateCorrectiveActionStatusAction.bind(null, inspection.id, action.id, "IN_PROGRESS")}>
                                  <SubmitButton className="btn-secondary">Start</SubmitButton>
                                </form>
                                <form action={updateCorrectiveActionStatusAction.bind(null, inspection.id, action.id, "COMPLETED")}>
                                  <SubmitButton className="btn-secondary">Complete</SubmitButton>
                                </form>
                              </>
                            ) : null}

                            {isOfficeSession(session) ? (
                              <form action={updateCorrectiveActionStatusAction.bind(null, inspection.id, action.id, "VERIFIED")}>
                                <SubmitButton className="btn">Verify</SubmitButton>
                              </form>
                            ) : null}
                          </div>
                        </div>
                      ))}

                      <form action={addCorrectiveActionAction.bind(null, inspection.id, finding.id)} className="form-grid">
                        <div className="field-wide">
                          <label htmlFor={`actionText-${finding.id}`}>Add corrective action / CAR</label>
                          <textarea
                            id={`actionText-${finding.id}`}
                            name="actionText"
                            placeholder="Describe the corrective action to close this finding."
                          />
                        </div>
                        <div className="field">
                          <label htmlFor={`owner-${finding.id}`}>Owner</label>
                          <input id={`owner-${finding.id}`} name="ownerName" placeholder="Master / Chief Officer / CE" />
                        </div>
                        <div className="field">
                          <label htmlFor={`target-${finding.id}`}>Target date</label>
                          <input id={`target-${finding.id}`} name="targetDate" type="date" />
                        </div>
                        <div className="field-wide">
                          <SubmitButton className="btn-secondary">Add corrective action</SubmitButton>
                        </div>
                      </form>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>

          <div id="evidence">
            <EvidenceSyncPanel
              canUpload={isVesselSession(session)}
              existingPhotos={inspection.photos.map((photo) => ({
                id: photo.id,
                url: photo.url,
                caption: photo.caption,
                fileName: photo.fileName,
                uploadedBy: photo.uploadedBy,
                createdAt: photo.createdAt.toISOString(),
              }))}
              findingOptions={findingOptions}
              inspectionId={inspection.id}
              questionOptions={questionOptions}
            />
          </div>
        </div>

        <div className="page-stack">
          <section className="panel panel-elevated sticky-panel">
            <h3 className="panel-title">Inspection metadata</h3>
            <div className="stack-list" style={{ marginTop: "1rem" }}>
              <div className="list-card">
                <strong>Inspection / checklist / questionnaire</strong>
                <div className="small-text">{inspection.inspectionType.name}</div>
                <div className="small-text">
                  {inspection.template ? `${inspection.template.name} / v${inspection.template.version}` : "No template attached"}
                </div>
                <div className="small-text">
                  {inspection.template?.sections.length ?? 0} sections / {templateQuestionCount} questions
                </div>
              </div>
              <div className="list-card">
                <strong>Inspector / operator</strong>
                <div className="small-text">{inspection.inspectorName ?? "Not recorded"}</div>
              </div>
              <div className="list-card">
                <strong>Authority / company</strong>
                <div className="small-text">{inspection.inspectorCompany ?? "Not recorded"}</div>
              </div>
              <div className="list-card">
                <strong>Reference</strong>
                <div className="small-text">{inspection.externalReference ?? "Not recorded"}</div>
              </div>
              <div className="list-card">
                <strong>Previous VIR</strong>
                <div className="small-text">
                  {inspection.previousInspection
                    ? `${inspection.previousInspection.title} / ${fmt.format(inspection.previousInspection.inspectionDate)}`
                    : "No prior linked inspection"}
                </div>
              </div>
              <div className="list-card">
                <strong>Summary</strong>
                <div className="small-text">{inspection.summary ?? "No summary captured yet."}</div>
              </div>
              {sectionNavigation.length ? (
                <div className="list-card">
                  <strong>Questionnaire navigation</strong>
                  <div className="stack-list" style={{ marginTop: "0.75rem" }}>
                    {sectionNavigation.map((section) => (
                      <a className="section-nav-link" href={`#${section.id}`} key={section.id}>
                        <span>{section.title}</span>
                        <span className="small-text">
                          {section.questionCount} q / {section.mandatoryCount} mandatory
                        </span>
                      </a>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          </section>

          <section className="panel panel-elevated" id="signoff">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Sign-off trail</h3>
                <p className="panel-subtitle">
                  Separate vessel and office approvals are captured here before final closure.
                </p>
              </div>
            </div>

            <form action={addSignOff} className="form-grid" style={{ marginBottom: "1rem" }}>
              <input
                name="stage"
                type="hidden"
                value={isOfficeSession(session) ? "SHORE_REVIEW" : "FINAL_ACKNOWLEDGEMENT"}
              />

              <div className="field">
                <label htmlFor="approved">Decision</label>
                <select id="approved" name="approved">
                  <option value="YES">Approved</option>
                  <option value="NO">Rejected / returned</option>
                </select>
              </div>

              <div className="field-wide">
                <label htmlFor="comment">Comment</label>
                <textarea
                  id="comment"
                  name="comment"
                  placeholder={
                    isOfficeSession(session)
                      ? "Record shore review note or return reason."
                      : "Record final vessel acknowledgement note."
                  }
                />
              </div>

              <div className="field-wide">
                <SubmitButton className="btn-secondary">
                  {isOfficeSession(session) ? "Record office sign-off" : "Record vessel acknowledgement"}
                </SubmitButton>
              </div>
            </form>

            <div className="stack-list">
              {inspection.signOffs.length === 0 ? (
                <div className="empty-state">No sign-off records have been captured yet.</div>
              ) : (
                inspection.signOffs.map((signOff) => (
                  <div className="list-card" key={signOff.id}>
                    <div className="meta-row">
                      <span className={`chip ${signOff.approved ? "chip-success" : "chip-danger"}`}>
                        {signOff.approved ? "Approved" : "Returned"}
                      </span>
                      <span className="chip chip-info">{signOff.stage.replaceAll("_", " ")}</span>
                    </div>
                    <div className="list-card-title">{signOff.actorName ?? "Unnamed actor"}</div>
                    <div className="small-text">{signOff.actorRole ?? "Role not recorded"}</div>
                    {signOff.comment ? <p className="small-text">{signOff.comment}</p> : null}
                    <div className="small-text">{fmt.format(signOff.signedAt)}</div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      </section>
    </div>
  );
}

function MetricBox({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="metric-tile metric-tile-static">
      <div className="metric-tile-label">{label}</div>
      <div className="metric-tile-value">{value}</div>
      <div className="metric-tile-note">{note}</div>
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function QuestionInput({
  question,
  answer,
  selectedOptions,
  disabled,
}: {
  question: {
    id: string;
    responseType: string;
    options: Array<{ id: string; value: string; label: string }>;
  };
  answer:
    | {
        answerText: string | null;
        answerNumber: number | null;
        answerDate: Date | null;
      }
    | undefined;
  selectedOptions: string[];
  disabled: boolean;
}) {
  switch (question.responseType) {
    case "YES_NO_NA":
      return (
        <div className="field">
          <label htmlFor={`q:${question.id}`}>Answer</label>
          <select defaultValue={answer?.answerText ?? ""} disabled={disabled} id={`q:${question.id}`} name={`q:${question.id}`}>
            <option value="">Select</option>
            <option value="YES">Yes</option>
            <option value="NO">No</option>
            <option value="NA">N/A</option>
          </select>
        </div>
      );
    case "NUMBER":
    case "SCORE":
      return (
        <div className="field">
          <label htmlFor={`q:${question.id}`}>Value</label>
          <input
            defaultValue={answer?.answerNumber ?? ""}
            disabled={disabled}
            id={`q:${question.id}`}
            name={`q:${question.id}`}
            type="number"
          />
        </div>
      );
    case "DATE":
      return (
        <div className="field">
          <label htmlFor={`q:${question.id}`}>Date</label>
          <input
            defaultValue={answer?.answerDate ? new Date(answer.answerDate).toISOString().slice(0, 10) : ""}
            disabled={disabled}
            id={`q:${question.id}`}
            name={`q:${question.id}`}
            type="date"
          />
        </div>
      );
    case "SINGLE_SELECT":
      return (
        <div className="field">
          <label htmlFor={`q:${question.id}`}>Selection</label>
          <select defaultValue={answer?.answerText ?? ""} disabled={disabled} id={`q:${question.id}`} name={`q:${question.id}`}>
            <option value="">Select</option>
            {question.options.map((option) => (
              <option key={option.id} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    case "MULTI_SELECT":
      return (
        <div className="field">
          <label htmlFor={`q:${question.id}`}>Selections</label>
          <select defaultValue={selectedOptions} disabled={disabled} id={`q:${question.id}`} multiple name={`q:${question.id}`}>
            {question.options.map((option) => (
              <option key={option.id} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>
      );
    case "TEXT":
    default:
      return (
        <div className="field-wide">
          <label htmlFor={`q:${question.id}`}>Answer</label>
          <textarea defaultValue={answer?.answerText ?? ""} disabled={disabled} id={`q:${question.id}`} name={`q:${question.id}`} />
        </div>
      );
  }
}
