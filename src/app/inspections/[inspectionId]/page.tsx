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
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { calculateInspectionScore, summarizeProgress } from "@/lib/vir/analytics";
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
  const { inspectionId } = await params;

  const inspection = await prisma.virInspection.findUnique({
    where: { id: inspectionId },
    include: {
      vessel: true,
      inspectionType: true,
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
      answers: true,
      findings: {
        orderBy: [{ severity: "desc" }, { createdAt: "desc" }],
        include: {
          question: { select: { prompt: true, code: true } },
          correctiveActions: { orderBy: { createdAt: "desc" } },
        },
      },
      signOffs: {
        orderBy: { signedAt: "desc" },
      },
    },
  });

  if (!inspection) {
    notFound();
  }

  const questions = inspection.template?.sections.flatMap((section) => section.questions) ?? [];
  const progress = summarizeProgress(questions, inspection.answers);
  const score = calculateInspectionScore(questions, inspection.answers, inspection.findings);
  const answerMap = new Map(inspection.answers.map((answer) => [answer.questionId, answer]));

  const saveAnswers = saveInspectionAnswersAction.bind(null, inspection.id);
  const addFinding = addFindingAction.bind(null, inspection.id);
  const addSignOff = addSignOffAction.bind(null, inspection.id);

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-header">
          <div>
            <div className="meta-row">
              <span className={`chip ${toneForInspectionStatus(inspection.status)}`}>
                {inspectionStatusLabel[inspection.status]}
              </span>
              <span className="chip chip-info">{inspection.inspectionType.name}</span>
            </div>
            <h2 className="panel-title" style={{ marginTop: "0.75rem" }}>
              {inspection.title}
            </h2>
            <p className="panel-subtitle">
              {inspection.vessel.name} · {fmt.format(inspection.inspectionDate)}
              {inspection.port ? ` · ${inspection.port}` : ""}
              {inspection.country ? ` · ${inspection.country}` : ""}
            </p>
          </div>

          <div className="actions-row">
            <form action={updateInspectionStatusAction.bind(null, inspection.id, "SUBMITTED")}>
              <SubmitButton className="btn">Submit To Shore</SubmitButton>
            </form>
            <form action={updateInspectionStatusAction.bind(null, inspection.id, "SHORE_REVIEWED")}>
              <SubmitButton className="btn-secondary">Mark Shore Reviewed</SubmitButton>
            </form>
            <form action={updateInspectionStatusAction.bind(null, inspection.id, "CLOSED")}>
              <SubmitButton className="btn-secondary">Close Inspection</SubmitButton>
            </form>
          </div>
        </div>

        <div className="metric-stack">
          <MetricBox label="Completion" value={`${progress.completionPct}%`} note={`${progress.answeredQuestions}/${progress.totalQuestions} answered`} />
          <MetricBox label="Mandatory" value={`${progress.mandatoryPct}%`} note={`${progress.answeredMandatory}/${progress.mandatoryQuestions} mandatory answered`} />
          <MetricBox label="Readiness Score" value={score.finalScore !== null ? `${score.finalScore}` : "—"} note={score.rawAverage !== null ? `Raw ${score.rawAverage} · penalty ${score.penaltyPoints}` : "Score builds as answers are committed"} />
          <MetricBox label="Open Findings" value={`${inspection.findings.filter((finding) => finding.status !== "CLOSED").length}`} note={`${inspection.ncCount} NC · ${inspection.obsCount} Obs · ${inspection.recCount} Rec`} />
        </div>
      </section>

      <section className="detail-grid">
        <div className="page-stack">
          <section className="panel">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Questionnaire Execution</h3>
                <p className="panel-subtitle">
                  Live answer capture with mandatory question tracking, evidence comments, and reference-image visibility.
                </p>
              </div>
            </div>

            {!inspection.template ? (
              <div className="empty-state">This inspection does not have a template attached yet.</div>
            ) : (
              <form action={saveAnswers} className="page-stack">
                {inspection.template.sections.map((section) => (
                  <div className="question-section" key={section.id}>
                    <h4 style={{ margin: 0, color: "var(--color-navy)" }}>{section.title}</h4>
                    {section.guidance ? <p className="small-text" style={{ marginTop: "0.4rem" }}>{section.guidance}</p> : null}

                    {section.questions.map((question) => {
                      const answer = answerMap.get(question.id);
                      const selectedOptions = Array.isArray(answer?.selectedOptions)
                        ? answer?.selectedOptions.filter((item): item is string => typeof item === "string")
                        : [];

                      return (
                        <div className="question-card" key={question.id}>
                          <div className="question-header">
                            <div>
                              <div className="question-code">{question.code}</div>
                              <p className="question-prompt">{question.prompt}</p>
                              <div className="meta-row" style={{ marginTop: "0.55rem" }}>
                                <span className={`chip ${toneForRisk(question.riskLevel)}`}>{riskLabel[question.riskLevel]}</span>
                                {question.isMandatory ? <span className="chip chip-warning">Mandatory</span> : null}
                                {question.isCicCandidate ? <span className="chip chip-info">CIC / Focus Topic</span> : null}
                              </div>
                            </div>
                            {question.referenceImageUrl ? (
                              <a className="btn-secondary" href={question.referenceImageUrl} rel="noreferrer" target="_blank">
                                Reference Image
                              </a>
                            ) : null}
                          </div>

                          <QuestionInput question={question} answer={answer} selectedOptions={selectedOptions} />

                          <div className="field-wide" style={{ marginTop: "0.85rem" }}>
                            <label htmlFor={`comment:${question.id}`}>Observation / Evidence Note</label>
                            <textarea
                              defaultValue={answer?.comment ?? ""}
                              id={`comment:${question.id}`}
                              name={`comment:${question.id}`}
                              placeholder="Record narrative, evidence note, or inspector observation."
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ))}

                <SubmitButton className="btn">Save Questionnaire Answers</SubmitButton>
              </form>
            )}
          </section>

          <section className="panel">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Findings and Corrective Actions</h3>
                <p className="panel-subtitle">
                  Raise observations and non-conformities directly against the inspection, then drive CAR closure.
                </p>
              </div>
            </div>

            <form action={addFinding} className="form-grid" style={{ marginBottom: "1rem" }}>
              <div className="field">
                <label htmlFor="questionId">Linked Question</label>
                <select id="questionId" name="questionId">
                  <option value="">General finding</option>
                  {questions.map((question) => (
                    <option key={question.id} value={question.id}>
                      {question.code} · {question.prompt}
                    </option>
                  ))}
                </select>
              </div>

              <div className="field">
                <label htmlFor="findingType">Finding Type</label>
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
                <label htmlFor="dueDate">Target Date</label>
                <input id="dueDate" name="dueDate" type="date" />
              </div>

              <div className="field-wide">
                <label htmlFor="title">Title</label>
                <input id="title" name="title" placeholder="Emergency fire pump delivery pressure below expected range" required />
              </div>

              <div className="field-wide">
                <label htmlFor="description">Description</label>
                <textarea id="description" name="description" placeholder="Describe the issue, evidence, and operational impact." required />
              </div>

              <div className="field">
                <label htmlFor="ownerName">Action Owner</label>
                <input id="ownerName" name="ownerName" placeholder="Chief Engineer" />
              </div>

              <div className="field">
                <label htmlFor="vesselResponse">Immediate Vessel Response</label>
                <input id="vesselResponse" name="vesselResponse" placeholder="Spare pump test planned before sailing" />
              </div>

              <div className="field-wide">
                <SubmitButton className="btn">Raise Finding</SubmitButton>
              </div>
            </form>

            <div className="list">
              {inspection.findings.length === 0 ? (
                <div className="empty-state">No findings have been raised on this VIR yet.</div>
              ) : (
                inspection.findings.map((finding) => (
                  <div className="list-card" key={finding.id}>
                    <div className="section-header" style={{ marginBottom: "0.65rem" }}>
                      <div>
                        <div className="meta-row">
                          <span className={`chip ${toneForRisk(finding.severity)}`}>{riskLabel[finding.severity]}</span>
                          <span className={`chip ${toneForFindingStatus(finding.status)}`}>{findingStatusLabel[finding.status]}</span>
                        </div>
                        <div style={{ fontWeight: 800, marginTop: "0.65rem" }}>{finding.title}</div>
                        <p className="small-text" style={{ marginTop: "0.25rem" }}>{finding.description}</p>
                        {finding.question ? (
                          <div className="small-text">
                            Linked to {finding.question.code} · {finding.question.prompt}
                          </div>
                        ) : null}
                      </div>
                      <div className="actions-row">
                        <form action={updateFindingStatusAction.bind(null, inspection.id, finding.id, "IN_PROGRESS")}>
                          <SubmitButton className="btn-secondary">In Progress</SubmitButton>
                        </form>
                        <form action={updateFindingStatusAction.bind(null, inspection.id, finding.id, "READY_FOR_REVIEW")}>
                          <SubmitButton className="btn-secondary">Ready For Review</SubmitButton>
                        </form>
                        <form action={updateFindingStatusAction.bind(null, inspection.id, finding.id, "CLOSED")}>
                          <SubmitButton className="btn-secondary">Close</SubmitButton>
                        </form>
                      </div>
                    </div>

                    <div className="list">
                      {finding.correctiveActions.map((action) => (
                        <div className="question-card" key={action.id}>
                          <div className="section-header" style={{ marginBottom: "0.35rem" }}>
                            <div>
                              <div style={{ fontWeight: 700 }}>{action.actionText}</div>
                              <div className="small-text">
                                {action.ownerName ? `${action.ownerName} · ` : ""}
                                {action.targetDate ? `Target ${fmt.format(action.targetDate)}` : "No target date"}
                              </div>
                            </div>
                            <span className={`chip ${toneForCorrectiveActionStatus(action.status)}`}>
                              {correctiveActionStatusLabel[action.status]}
                            </span>
                          </div>
                          <div className="actions-row">
                            <form action={updateCorrectiveActionStatusAction.bind(null, inspection.id, action.id, "IN_PROGRESS")}>
                              <SubmitButton className="btn-secondary">Start</SubmitButton>
                            </form>
                            <form action={updateCorrectiveActionStatusAction.bind(null, inspection.id, action.id, "COMPLETED")}>
                              <SubmitButton className="btn-secondary">Complete</SubmitButton>
                            </form>
                            <form action={updateCorrectiveActionStatusAction.bind(null, inspection.id, action.id, "VERIFIED")}>
                              <SubmitButton className="btn-secondary">Verify</SubmitButton>
                            </form>
                          </div>
                        </div>
                      ))}

                      <form action={addCorrectiveActionAction.bind(null, inspection.id, finding.id)} className="form-grid">
                        <div className="field-wide">
                          <label htmlFor={`actionText-${finding.id}`}>Add Corrective Action / CAR</label>
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
                          <label htmlFor={`target-${finding.id}`}>Target Date</label>
                          <input id={`target-${finding.id}`} name="targetDate" type="date" />
                        </div>
                        <div className="field-wide">
                          <SubmitButton className="btn-secondary">Add Corrective Action</SubmitButton>
                        </div>
                      </form>
                    </div>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>

        <div className="page-stack">
          <section className="panel">
            <h3 className="panel-title">Inspection Metadata</h3>
            <div className="list" style={{ marginTop: "1rem" }}>
              <div className="list-card">
                <strong>Inspector</strong>
                <div className="small-text">{inspection.inspectorName ?? "Not recorded"}</div>
              </div>
              <div className="list-card">
                <strong>Authority / Company</strong>
                <div className="small-text">{inspection.inspectorCompany ?? "Not recorded"}</div>
              </div>
              <div className="list-card">
                <strong>Reference</strong>
                <div className="small-text">{inspection.externalReference ?? "Not recorded"}</div>
              </div>
              <div className="list-card">
                <strong>Summary</strong>
                <div className="small-text">{inspection.summary ?? "No summary captured yet."}</div>
              </div>
            </div>
          </section>

          <section className="panel">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Sign-Off Trail</h3>
                <p className="panel-subtitle">Inspector, ship, and shore acknowledgement trail.</p>
              </div>
            </div>

            <form action={addSignOff} className="form-grid" style={{ marginBottom: "1rem" }}>
              <div className="field">
                <label htmlFor="stage">Stage</label>
                <select id="stage" name="stage">
                  <option value="VESSEL_SUBMISSION">Vessel Submission</option>
                  <option value="SHORE_REVIEW">Shore Review</option>
                  <option value="FINAL_ACKNOWLEDGEMENT">Final Acknowledgement</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="approved">Decision</label>
                <select id="approved" name="approved">
                  <option value="YES">Approved</option>
                  <option value="NO">Rejected / Returned</option>
                </select>
              </div>
              <div className="field">
                <label htmlFor="actorName">Actor</label>
                <input id="actorName" name="actorName" placeholder="Inspector / Master / TSI" />
              </div>
              <div className="field">
                <label htmlFor="actorRole">Role</label>
                <input id="actorRole" name="actorRole" placeholder="Inspector / Master / Shore Reviewer" />
              </div>
              <div className="field-wide">
                <label htmlFor="comment">Comment</label>
                <textarea id="comment" name="comment" placeholder="Decision note, rejection reason, or completion comment." />
              </div>
              <div className="field-wide">
                <SubmitButton className="btn-secondary">Record Sign-Off</SubmitButton>
              </div>
            </form>

            <div className="list">
              {inspection.signOffs.length === 0 ? (
                <div className="empty-state">No sign-off records have been captured yet.</div>
              ) : (
                inspection.signOffs.map((signOff) => (
                  <div className="list-card" key={signOff.id}>
                    <div className="meta-row">
                      <span className={`chip ${signOff.approved ? "chip-success" : "chip-danger"}`}>{signOff.approved ? "Approved" : "Returned"}</span>
                      <span className="chip chip-info">{signOff.stage.replaceAll("_", " ")}</span>
                    </div>
                    <div style={{ marginTop: "0.65rem", fontWeight: 700 }}>{signOff.actorName ?? "Unnamed actor"}</div>
                    <div className="small-text">{signOff.actorRole ?? "Role not recorded"}</div>
                    {signOff.comment ? <p className="small-text" style={{ marginTop: "0.35rem" }}>{signOff.comment}</p> : null}
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
    <div className="metric-box">
      <span>{label}</span>
      <strong>{value}</strong>
      <div className="small-text">{note}</div>
    </div>
  );
}

function QuestionInput({
  question,
  answer,
  selectedOptions,
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
}) {
  switch (question.responseType) {
    case "YES_NO_NA":
      return (
        <div className="field">
          <label htmlFor={`q:${question.id}`}>Answer</label>
          <select defaultValue={answer?.answerText ?? ""} id={`q:${question.id}`} name={`q:${question.id}`}>
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
          <input defaultValue={answer?.answerNumber ?? ""} id={`q:${question.id}`} name={`q:${question.id}`} type="number" />
        </div>
      );
    case "DATE":
      return (
        <div className="field">
          <label htmlFor={`q:${question.id}`}>Date</label>
          <input
            defaultValue={answer?.answerDate ? new Date(answer.answerDate).toISOString().slice(0, 10) : ""}
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
          <select defaultValue={answer?.answerText ?? ""} id={`q:${question.id}`} name={`q:${question.id}`}>
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
          <select defaultValue={selectedOptions} id={`q:${question.id}`} multiple name={`q:${question.id}`}>
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
          <textarea defaultValue={answer?.answerText ?? ""} id={`q:${question.id}`} name={`q:${question.id}`} />
        </div>
      );
  }
}
