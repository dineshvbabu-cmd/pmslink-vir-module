import Link from "next/link";
import { notFound } from "next/navigation";
import { FileDown, Mail } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { CompactBarChart } from "@/components/erp-charts";
import { prisma } from "@/lib/prisma";
import { calculateInspectionScore, summarizeProgress } from "@/lib/vir/analytics";
import { canAccessVessel, requireVirSession } from "@/lib/vir/session";
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

const reportVariants = [
  { id: "detailed", label: "Detailed Report" },
  { id: "summary", label: "Summary Report" },
  { id: "findings", label: "Finding Report" },
  { id: "consolidate", label: "Consolidate Report" },
] as const;

type ReportVariant = (typeof reportVariants)[number]["id"];
type ChecklistView = "grid" | "reasoning";
type ChapterView = "table" | "bar";

export default async function InspectionReportPage({
  params,
  searchParams,
}: {
  params: Promise<{ inspectionId: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const session = await requireVirSession();
  const { inspectionId } = await params;
  const reportParams = await searchParams;
  const selectedVariant = normalizeVariant(typeof reportParams.variant === "string" ? reportParams.variant : undefined);
  const selectedChecklistView = normalizeChecklistView(
    typeof reportParams.checklistView === "string" ? reportParams.checklistView : undefined
  );
  const selectedChapterView = normalizeChapterView(
    typeof reportParams.chapterView === "string" ? reportParams.chapterView : undefined
  );
  const imageMode = reportParams.imageMode === "selected" ? "selected" : "all";
  const selectedReportPhotoIds = new Set(normalizeArray(reportParams.image));

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
          question: {
            include: {
              section: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
          photos: {
            orderBy: { createdAt: "desc" },
          },
        },
      },
      findings: {
        include: {
          question: {
            include: {
              section: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
          correctiveActions: true,
          carriedFromFinding: {
            select: {
              title: true,
              inspection: {
                select: {
                  title: true,
                },
              },
            },
          },
          photos: {
            orderBy: { createdAt: "desc" },
          },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      },
      signOffs: {
        orderBy: { signedAt: "asc" },
      },
      photos: {
        orderBy: { createdAt: "desc" },
      },
    },
  });

  if (!inspection || !canAccessVessel(session, inspection.vesselId)) {
    notFound();
  }

  const questions = inspection.template?.sections.flatMap((section) => section.questions) ?? [];
  const progress = summarizeProgress(questions, inspection.answers);
  const score = calculateInspectionScore(questions, inspection.answers, inspection.findings);
  const answerMap = new Map(inspection.answers.map((answer) => [answer.questionId, answer]));
  const sectionRows =
    inspection.template?.sections.map((section) => {
      const sectionAnswers = inspection.answers.filter((answer) => answer.question.section.id === section.id);
      const sectionFindings = inspection.findings.filter((finding) => finding.question?.section.id === section.id);
      const sectionEvidence = sectionAnswers.reduce((sum, answer) => sum + answer.photos.length, 0);

      return {
        ...section,
        answers: sectionAnswers,
        findings: sectionFindings,
        evidenceCount: sectionEvidence,
        answeredCount: sectionAnswers.filter((answer) => hasRecordedAnswer(answer)).length,
      };
    }) ?? [];

  const chapterFindingRows = sectionRows
    .filter((section) => section.findings.length > 0)
    .map((section) => ({
      chapter: section.title,
      high: section.findings.filter((finding) => finding.severity === "HIGH" || finding.severity === "CRITICAL").length,
      medium: section.findings.filter((finding) => finding.severity === "MEDIUM").length,
      low: section.findings.filter((finding) => finding.severity === "LOW").length,
      total: section.findings.length,
    }));

  const outcomeRows = [
    { label: "Questions", value: `${progress.answeredQuestions}/${progress.totalQuestions}` },
    { label: "Mandatory", value: `${progress.answeredMandatory}/${progress.mandatoryQuestions}` },
    { label: "Open Findings", value: `${inspection.findings.filter((finding) => finding.status !== "CLOSED").length}` },
    { label: "Evidence", value: `${inspection.photos.length + inspection.answers.reduce((sum, answer) => sum + answer.photos.length, 0)}` },
    { label: "Score", value: score.finalScore !== null ? `${score.finalScore}` : "n/a" },
  ];
  const reportPhotos = collectReportPhotos(inspection);
  const selectedReportPhotos =
    imageMode === "selected"
      ? reportPhotos.filter((photo) => selectedReportPhotoIds.has(photo.id))
      : reportPhotos;
  const effectiveReportPhotos = selectedReportPhotos.length > 0 ? selectedReportPhotos : reportPhotos;
  const exportItems = reportVariants.map((variant) => ({
    label: variant.label,
    href: buildReportPdfHref(
      inspection.id,
      variant.id,
      imageMode,
      effectiveReportPhotos.map((photo) => photo.id)
    ),
  }));
  const shareItems = reportVariants.map((variant) => ({
    label: `Share ${variant.label}`,
    href: buildReportMailtoHref(
      inspection.vessel.name,
      inspection.title,
      variant.label,
      buildReportPdfHref(inspection.id, variant.id, imageMode, effectiveReportPhotos.map((photo) => photo.id))
    ),
  }));

  return (
    <div className="page-stack report-pack report-pack-live">
      <section className="panel panel-elevated report-command-bar">
        <div className="report-breadcrumbs">
          <Link className="table-link" href="/inspections?scope=approved">
            {inspection.vessel.name}
          </Link>
          <span>|</span>
          <span>{inspection.externalReference ?? inspection.title}</span>
          <span>|</span>
          <span>{inspectionStatusLabel[inspection.status]}</span>
          {inspection.shoreReviewedBy ? <span>({inspection.shoreReviewedBy})</span> : null}
        </div>

        <div className="report-command-actions">
          {reportVariants.map((item) => (
            <Link
              className={`btn-compact ${selectedVariant === item.id ? "btn" : "btn-secondary"}`}
              href={buildReportHref(inspection.id, {
                variant: item.id,
                checklistView: selectedChecklistView,
                chapterView: selectedChapterView,
                imageMode,
                imageIds: normalizeArray(reportParams.image),
              })}
              key={item.id}
            >
              {item.label}
            </Link>
          ))}
          <PrintButton />
          <details className="export-menu">
            <summary aria-label="Export PDFs" className="btn-secondary btn-compact export-menu-trigger export-menu-trigger-icon" title="Export PDFs">
              <FileDown size={16} />
            </summary>
            <div className="export-menu-popover">
              {exportItems.map((item) => (
                <a className="export-menu-item" href={item.href} key={item.label}>
                  {item.label}
                </a>
              ))}
            </div>
          </details>
          <details className="export-menu">
            <summary aria-label="Share reports" className="btn-secondary btn-compact export-menu-trigger export-menu-trigger-icon" title="Share reports">
              <Mail size={16} />
            </summary>
            <div className="export-menu-popover">
              {shareItems.map((item) => (
                <a className="export-menu-item" href={item.href} key={item.label}>
                  {item.label}
                </a>
              ))}
            </div>
          </details>
          <Link className="btn-secondary btn-compact" href={`/inspections/${inspection.id}`}>
            Open Workflow
          </Link>
        </div>
      </section>

      <section className="panel panel-elevated report-hero-panel">
        <div className="report-vessel-grid">
          <div>
            <div className="report-section-label">Vessel &amp; Inspection Details</div>
            <div className="report-detail-grid">
              <DetailRow label="Vessel Name" value={inspection.vessel.name} />
              <DetailRow label="IMO Number" value={inspection.vessel.imoNumber ?? "Not recorded"} />
              <DetailRow label="Flag Registry" value={inspection.vessel.flag ?? "Not recorded"} />
              <DetailRow label="Classification" value={inspection.vessel.manager ?? "Not recorded"} />
              <DetailRow label="Solas/Marpol/ISM Category" value={inspection.vessel.vesselType ?? "Not recorded"} />
              <DetailRow label="Report Type" value={inspection.inspectionType.name} />
              <DetailRow label="Inspection Mode" value={inferInspectionMode(inspection.title, inspection.inspectionType.name)} />
              <DetailRow label="Inspection From Date" value={fmt.format(inspection.inspectionDate)} />
              <DetailRow label="Inspection To Date" value={fmt.format(inspection.closedAt ?? inspection.inspectionDate)} />
              <DetailRow label="Place of Inspection From" value={inspection.port ?? "Not recorded"} />
              <DetailRow label="Place of Inspection To" value={inspection.country ?? "Not recorded"} />
              <DetailRow label="Inspection Authority" value={inspection.inspectorCompany ?? "Not recorded"} />
              <DetailRow label="Inspector Names" value={inspection.inspectorName ?? "Not recorded"} />
              <DetailRow label="Previous VIR Link" value={inspection.previousInspection?.title ?? "No previous VIR linked"} />
            </div>
          </div>

          <div className="report-hero-image-card">
            {inspection.photos[0] ? (
              <img alt={inspection.photos[0].caption ?? inspection.photos[0].fileName ?? inspection.title} src={inspection.photos[0].url} />
            ) : (
              <div className="report-image-placeholder">No cover image linked</div>
            )}
          </div>
        </div>
      </section>

      <section className="panel panel-elevated">
        <div className="report-section-label">Executive Summary</div>
        <p className="report-copy">
          {inspection.summary ??
            "Inspection summary not yet recorded. Use the workflow page to update the executive narrative before the final demo pack is exported."}
        </p>
      </section>

      {selectedVariant !== "findings" ? (
        <section className="vir-kpi-grid">
          {outcomeRows.map((item) => (
            <div className="panel panel-elevated vir-kpi-card" key={item.label}>
              <div className="vir-kpi-label">{item.label}</div>
              <div className="vir-kpi-value">{item.value}</div>
            </div>
          ))}
        </section>
      ) : null}

      {selectedVariant === "detailed" ? (
        <>
          <section className="questionnaire-summary-grid">
            {sectionRows.map((section) => (
              <div className="questionnaire-summary-card" key={section.id}>
                <span>{section.title}</span>
                <strong>
                  {section.answeredCount}/{section.questions.length}
                </strong>
                <div className="small-text">
                  {section.findings.length} findings / {section.evidenceCount} evidence /{" "}
                  {section.questions.filter((question) => question.isCicCandidate).length} concentrated
                </div>
              </div>
            ))}
          </section>

          <section className="panel panel-elevated">
            <div className="report-image-toolbar">
              <div>
                <h3 className="panel-title">Detailed report composition</h3>
                <p className="panel-subtitle">
                  Select the evidence images that should appear in the detailed annex and its PDF export.
                </p>
              </div>
              <div className="report-image-selector">
                <form className="report-image-selector-form" method="get">
                  <input name="variant" type="hidden" value="detailed" />
                  <div className="field">
                    <label htmlFor="imageMode">Image annex mode</label>
                    <select defaultValue={imageMode} id="imageMode" name="imageMode">
                      <option value="all">All available images</option>
                      <option value="selected">Only selected images</option>
                    </select>
                  </div>
                  <div className="report-image-choice-strip">
                    {reportPhotos.slice(0, 12).map((photo) => (
                      <label className="report-image-choice" key={photo.id}>
                        <input
                          defaultChecked={imageMode === "all" || selectedReportPhotoIds.has(photo.id)}
                          name="image"
                          type="checkbox"
                          value={photo.id}
                        />
                        <img alt={photo.caption} src={photo.url} />
                        <span className="report-image-choice-copy">
                          <strong>{photo.label}</strong>
                          <span className="small-text">{photo.caption}</span>
                        </span>
                      </label>
                    ))}
                  </div>
                  <div className="report-image-selector-actions">
                    <button className="btn-secondary" type="submit">
                      Update detailed report
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Chapterwise Finding</h3>
                <p className="panel-subtitle">Summary by chapter before drilling into questionnaire rows.</p>
              </div>
              <div className="actions-row">
                <Link
                  className={`btn-compact ${selectedChapterView === "table" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "detailed",
                    checklistView: selectedChecklistView,
                    chapterView: "table",
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                >
                  Table view
                </Link>
                <Link
                  className={`btn-compact ${selectedChapterView === "bar" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "detailed",
                    checklistView: selectedChecklistView,
                    chapterView: "bar",
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                >
                  Bar chart
                </Link>
              </div>
            </div>
            <div className="table-shell table-shell-compact">
              <ChapterFindingBlock rows={chapterFindingRows} view={selectedChapterView} />
            </div>
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Vessel inspection checklist</h3>
                <p className="panel-subtitle">Switch between compact grid and reasoning mode for questionnaire walkthroughs.</p>
              </div>
              <div className="actions-row">
                <Link
                  className={`btn-compact ${selectedChecklistView === "grid" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "detailed",
                    checklistView: "grid",
                    chapterView: selectedChapterView,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                >
                  Grid view
                </Link>
                <Link
                  className={`btn-compact ${selectedChecklistView === "reasoning" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "detailed",
                    checklistView: "reasoning",
                    chapterView: selectedChapterView,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                >
                  Reasoning view
                </Link>
              </div>
            </div>
          </section>

          <section className="page-stack">
            {sectionRows.map((section) => (
              <section className="panel panel-elevated report-section-panel" key={section.id}>
                <div className="section-header">
                  <div>
                    <h3 className="panel-title">{section.title}</h3>
                    <p className="panel-subtitle">
                      {section.answeredCount}/{section.questions.length} answered / {section.findings.length} findings / {section.evidenceCount} evidence items
                    </p>
                  </div>
                  <div className="mini-metrics">
                    <span className="chip chip-info">Questions {section.questions.length}</span>
                    <span className="chip chip-warning">Findings {section.findings.length}</span>
                    <span className="chip chip-success">Images {section.evidenceCount}</span>
                  </div>
                </div>

                <SectionSummaryBoard section={section} />

                {selectedChecklistView === "grid" ? (
                  <div className="table-shell table-shell-compact">
                    <table className="table data-table vir-data-table">
                      <thead>
                        <tr>
                          <th>S.No</th>
                          <th>Question</th>
                          <th>Response</th>
                          <th>Comments</th>
                          <th>Reference</th>
                          <th>Actual Upload</th>
                          <th>Findings</th>
                          <th>Action</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.questions.map((question, index) => {
                          const answer = answerMap.get(question.id);
                          const questionFindings = inspection.findings.filter((finding) => finding.questionId === question.id);
                          return (
                            <tr key={question.id}>
                              <td>{index + 1}</td>
                              <td>
                                <div className="report-question-code">{question.code}</div>
                                <div>{question.prompt}</div>
                                {question.helpText ? <div className="small-text">{question.helpText}</div> : null}
                              </td>
                              <td>{renderAnswerValue(answer)}</td>
                              <td>{answer?.comment ?? "-"}</td>
                              <td>
                                {question.referenceImageUrl ? (
                                  <div className="report-thumb-row">
                                    <img
                                      alt={`${question.code} reference`}
                                      className="report-thumb report-thumb-reference"
                                      src={question.referenceImageUrl}
                                    />
                                    <a
                                      className="inline-link"
                                      href={question.referenceImageUrl}
                                      rel="noreferrer"
                                      target="_blank"
                                    >
                                      View reference
                                    </a>
                                  </div>
                                ) : (
                                  "-"
                                )}
                              </td>
                              <td>
                                <div className="report-thumb-row">
                                  {answer?.photos.slice(0, 3).map((photo) => (
                                    <img
                                      alt={photo.caption ?? photo.fileName ?? question.code}
                                      className="report-thumb"
                                      key={photo.id}
                                      src={photo.url}
                                    />
                                  ))}
                                  {!answer?.photos.length ? "-" : null}
                                </div>
                              </td>
                              <td>{questionFindings.length}</td>
                              <td>
                                <QuestionActionLinks
                                  answer={answer}
                                  inspectionId={inspection.id}
                                  question={question}
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="page-stack">
                    {section.questions.map((question, index) => {
                      const answer = answerMap.get(question.id);
                      const questionFindings = inspection.findings.filter((finding) => finding.questionId === question.id);
                      return (
                        <QuestionReasoningCard
                          answer={answer}
                          index={index}
                          inspectionId={inspection.id}
                          key={question.id}
                          question={question}
                          questionFindings={questionFindings}
                        />
                      );
                    })}
                  </div>
                )}
              </section>
            ))}
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Selected image annex</h3>
                <p className="panel-subtitle">Detailed report evidence set based on the current image selection.</p>
              </div>
            </div>
            <div className="report-photo-annex">
              {effectiveReportPhotos.length ? (
                effectiveReportPhotos.map((photo) => (
                  <div className="report-photo-card" key={photo.id}>
                    <img alt={photo.caption} src={photo.url} />
                    <div className="report-photo-meta">
                      <strong>{photo.label}</strong>
                      <span className="small-text">{photo.caption}</span>
                    </div>
                  </div>
                ))
              ) : (
                <div className="empty-state">No images are selected for the detailed annex.</div>
              )}
            </div>
          </section>
        </>
      ) : null}

      {selectedVariant === "summary" ? (
        <section className="page-stack">
          <section className="questionnaire-summary-grid">
            {sectionRows.map((section) => (
              <div className="questionnaire-summary-card" key={section.id}>
                <span>{section.title}</span>
                <strong>{section.answeredCount}/{section.questions.length}</strong>
                <div className="small-text">
                  {section.findings.length} findings / {section.evidenceCount} evidence /{" "}
                  {section.questions.filter((question) => question.isCicCandidate).length} concentrated
                </div>
              </div>
            ))}
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Section summary</h3>
                <p className="panel-subtitle">Management view with per-section completion, findings, and evidence posture.</p>
              </div>
            </div>
            <div className="table-shell table-shell-compact">
              <table className="table data-table vir-data-table">
                <thead>
                  <tr>
                    <th>Chapter Name</th>
                    <th>Answered</th>
                    <th>Findings</th>
                    <th>Condition</th>
                    <th>Section Images</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionRows.map((section) => (
                    <tr key={section.id}>
                      <td>{section.title}</td>
                      <td>
                        {section.answeredCount}/{section.questions.length}
                      </td>
                      <td>{section.findings.length}</td>
                      <td>{section.findings.length > 0 ? "Review required" : "In Order"}</td>
                      <td>{section.evidenceCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Chapterwise Finding</h3>
                <p className="panel-subtitle">Condensed chapter totals for summary-only report circulation.</p>
              </div>
              <div className="actions-row">
                <Link
                  className={`btn-compact ${selectedChapterView === "table" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "summary",
                    checklistView: selectedChecklistView,
                    chapterView: "table",
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                >
                  Table view
                </Link>
                <Link
                  className={`btn-compact ${selectedChapterView === "bar" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "summary",
                    checklistView: selectedChecklistView,
                    chapterView: "bar",
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                >
                  Bar chart
                </Link>
              </div>
            </div>
            <div className="table-shell table-shell-compact">
              <ChapterFindingBlock rows={chapterFindingRows} view={selectedChapterView} />
            </div>
          </section>
        </section>
      ) : null}

      {selectedVariant === "findings" ? (
        <section className="page-stack">
          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Findings</h3>
                <p className="panel-subtitle">Report-first view for all observations and corrective actions.</p>
              </div>
            </div>
            <div className="table-shell table-shell-compact">
              <table className="table data-table vir-data-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>Checklist Question</th>
                    <th>Desc of Finding</th>
                    <th>Type of Finding</th>
                    <th>Severity</th>
                    <th>Status</th>
                    <th>Finding Images</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {inspection.findings.map((finding, index) => (
                    <tr key={finding.id}>
                      <td>{index + 1}</td>
                      <td>{finding.question?.prompt ?? "General finding"}</td>
                      <td>{finding.description}</td>
                      <td>{finding.findingType}</td>
                      <td>{finding.severity}</td>
                      <td>
                        <span className={`chip ${toneForFindingStatus(finding.status)}`}>{findingStatusLabel[finding.status]}</span>
                      </td>
                      <td>{finding.photos.length}</td>
                      <td>{finding.correctiveActions.length}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="page-stack">
            {inspection.findings.map((finding) => (
              <article className="panel panel-elevated finding-card" key={finding.id}>
                <div className="meta-row">
                  <span className={`chip ${toneForRisk(finding.severity)}`}>{riskLabel[finding.severity]}</span>
                  <span className={`chip ${toneForFindingStatus(finding.status)}`}>{findingStatusLabel[finding.status]}</span>
                  <span className="chip chip-info">{finding.findingType}</span>
                </div>
                <h3 className="panel-title">{finding.title}</h3>
                <p className="report-copy">{finding.description}</p>
                <div className="small-text">
                  Chapter {finding.question?.section.title ?? "General"} / Checklist {finding.question?.prompt ?? "General finding"}
                </div>
                {finding.carriedFromFinding ? (
                  <div className="small-text">
                    Carry-forward from {finding.carriedFromFinding.inspection.title} / {finding.carriedFromFinding.title}
                  </div>
                ) : null}

                <div className="report-thumb-row report-thumb-row-spacious">
                  {finding.photos.map((photo) => (
                    <img alt={photo.caption ?? photo.fileName ?? finding.title} className="report-thumb report-thumb-large" key={photo.id} src={photo.url} />
                  ))}
                  {!finding.photos.length ? <div className="small-text">No finding images linked.</div> : null}
                </div>

                <div className="stack-list">
                  {finding.correctiveActions.map((action) => (
                    <div className="question-card" key={action.id}>
                      <div className="section-header">
                        <div>
                          <strong>{action.actionText}</strong>
                          <div className="small-text">
                            {action.ownerName ?? "Owner not assigned"}
                            {action.targetDate ? ` / target ${fmt.format(action.targetDate)}` : ""}
                          </div>
                        </div>
                        <span className={`chip ${toneForCorrectiveActionStatus(action.status)}`}>
                          {correctiveActionStatusLabel[action.status]}
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            ))}
          </section>
        </section>
      ) : null}

      {selectedVariant === "consolidate" ? (
        <section className="dashboard-grid dashboard-grid-equal">
          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Consolidated inspection summary</h3>
                <p className="panel-subtitle">One-page review for management and approvers.</p>
              </div>
            </div>
            <div className="table-shell table-shell-compact">
              <table className="table data-table vir-data-table">
                <tbody>
                  <tr>
                    <td>Status</td>
                    <td>{inspectionStatusLabel[inspection.status]}</td>
                  </tr>
                  <tr>
                    <td>Inspector</td>
                    <td>{inspection.inspectorName ?? "Not recorded"}</td>
                  </tr>
                  <tr>
                    <td>Location</td>
                    <td>{[inspection.port, inspection.country].filter(Boolean).join(", ") || "Not recorded"}</td>
                  </tr>
                  <tr>
                    <td>Open Findings</td>
                    <td>{inspection.findings.filter((finding) => finding.status !== "CLOSED").length}</td>
                  </tr>
                  <tr>
                    <td>Evidence</td>
                    <td>{effectiveReportPhotos.length}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Workflow sign-off register</h3>
                <p className="panel-subtitle">Office and vessel checkpoint audit trail.</p>
              </div>
            </div>
            <div className="stack-list">
              {inspection.signOffs.map((signOff) => (
                <div className="list-card" key={`${signOff.stage}-${signOff.signedAt.toISOString()}`}>
                  <div className="meta-row">
                    <span className={`chip ${signOff.approved ? "chip-success" : "chip-danger"}`}>
                      {signOff.approved ? "Approved" : "Returned"}
                    </span>
                    <span className="chip chip-info">{signOff.stage.replaceAll("_", " ")}</span>
                  </div>
                  <div className="small-text">{signOff.actorName ?? "Unknown actor"}</div>
                  <div className="small-text">{fmt.format(signOff.signedAt)}</div>
                  {signOff.comment ? <div className="small-text">{signOff.comment}</div> : null}
                </div>
              ))}
            </div>
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Section review matrix</h3>
                <p className="panel-subtitle">Condensed chapter-level readiness and evidence coverage.</p>
              </div>
              <div className="actions-row">
                <Link
                  className={`btn-compact ${selectedChapterView === "table" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "consolidate",
                    checklistView: selectedChecklistView,
                    chapterView: "table",
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                >
                  Table view
                </Link>
                <Link
                  className={`btn-compact ${selectedChapterView === "bar" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "consolidate",
                    checklistView: selectedChecklistView,
                    chapterView: "bar",
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                >
                  Bar chart
                </Link>
              </div>
            </div>
            <div className="table-shell table-shell-compact">
              <ChapterFindingBlock rows={chapterFindingRows} view={selectedChapterView} />
            </div>
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Photo annex</h3>
                <p className="panel-subtitle">Branded evidence set for demo export and review.</p>
              </div>
            </div>
            <div className="report-photo-annex">
              {effectiveReportPhotos.map((photo) => (
                <div className="report-photo-card" key={photo.id}>
                  <img alt={photo.caption} src={photo.url} />
                  <div className="report-photo-meta">
                    <strong>{photo.label}</strong>
                    <span className="small-text">{photo.caption}</span>
                  </div>
                </div>
              ))}
              {!effectiveReportPhotos.length ? <div className="small-text">No inspection-level photos linked.</div> : null}
            </div>
          </section>
        </section>
      ) : null}
    </div>
  );
}

function normalizeVariant(value: string | undefined): ReportVariant {
  return reportVariants.some((item) => item.id === value) ? (value as ReportVariant) : "detailed";
}

function normalizeChecklistView(value: string | undefined): ChecklistView {
  return value === "reasoning" ? "reasoning" : "grid";
}

function normalizeChapterView(value: string | undefined): ChapterView {
  return value === "bar" ? "bar" : "table";
}

function normalizeArray(value: string | string[] | undefined) {
  if (!value) {
    return [];
  }

  return Array.isArray(value) ? value : [value];
}

function buildReportHref(
  inspectionId: string,
  options: {
    variant: ReportVariant;
    checklistView: ChecklistView;
    chapterView: ChapterView;
    imageMode: "all" | "selected";
    imageIds: string[];
  }
) {
  const params = new URLSearchParams();
  params.set("variant", options.variant);
  params.set("checklistView", options.checklistView);
  params.set("chapterView", options.chapterView);
  params.set("imageMode", options.imageMode);
  options.imageIds.forEach((id) => params.append("image", id));
  return `/reports/inspection/${inspectionId}?${params.toString()}`;
}

function buildReportMailtoHref(vesselName: string, inspectionTitle: string, variantLabel: string, pdfHref: string) {
  const absoluteUrl = pdfHref.startsWith("http") ? pdfHref : `https://pmslink-vir-module-production.up.railway.app${pdfHref}`;
  const subject = `${variantLabel} | ${vesselName} | ${inspectionTitle}`;
  const body = `Please find the selected ${variantLabel.toLowerCase()} for review.%0D%0A%0D%0A${absoluteUrl}`;
  return `mailto:?subject=${encodeURIComponent(subject)}&body=${body}`;
}

function inferInspectionMode(title: string, inspectionTypeName: string) {
  const source = `${title} ${inspectionTypeName}`.toUpperCase();

  if (source.includes("SAILING")) {
    return source.includes("REMOTE") ? "Sailing (Remote)" : "Sailing";
  }

  if (source.includes("PORT")) {
    return source.includes("REMOTE") ? "Port (Remote)" : "Port";
  }

  return "Sailing";
}

function hasRecordedAnswer(answer: {
  answerText: string | null;
  answerNumber: number | null;
  answerBoolean: boolean | null;
  answerDate: Date | null;
  selectedOptions: unknown;
}) {
  return Boolean(
    answer.answerText ||
      answer.answerNumber !== null ||
      answer.answerBoolean !== null ||
      answer.answerDate ||
      (Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0)
  );
}

function renderAnswerValue(
  answer:
    | {
        answerText: string | null;
        answerNumber: number | null;
        answerBoolean: boolean | null;
        answerDate: Date | null;
        selectedOptions: unknown;
      }
    | undefined
) {
  if (!answer) {
    return "Pending";
  }

  if (Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0) {
    return answer.selectedOptions.join(", ");
  }

  if (answer.answerBoolean !== null) {
    return answer.answerBoolean ? "Yes" : "No";
  }

  if (answer.answerNumber !== null) {
    return `${answer.answerNumber}`;
  }

  if (answer.answerDate) {
    return fmt.format(answer.answerDate);
  }

  return answer.answerText ?? "Pending";
}

function buildReportPdfHref(inspectionId: string, variant: ReportVariant, imageMode: "all" | "selected", imageIds: string[]) {
  const params = new URLSearchParams();
  params.set("variant", variant);
  params.set("imageMode", imageMode);
  imageIds.forEach((id) => params.append("image", id));
  return `/api/reports/inspection/${inspectionId}/pdf?${params.toString()}`;
}

function collectReportPhotos(inspection: {
  title: string;
  photos: Array<{ id: string; url: string; caption: string | null; fileName: string | null }>;
  answers: Array<{
    photos: Array<{ id: string; url: string; caption: string | null; fileName: string | null }>;
    question: { code: string; prompt: string; section: { title: string } };
  }>;
  findings: Array<{
    title: string;
    photos: Array<{ id: string; url: string; caption: string | null; fileName: string | null }>;
    question: { section: { title: string } } | null;
  }>;
}) {
  return [
    ...inspection.photos.map((photo) => ({
      id: photo.id,
      url: photo.url,
      caption: photo.caption ?? photo.fileName ?? "Inspection evidence",
      label: "Inspection photo",
    })),
    ...inspection.answers.flatMap((answer) =>
      answer.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        caption: photo.caption ?? photo.fileName ?? `${answer.question.code} evidence`,
        label: `${answer.question.section.title} / ${answer.question.code}`,
      }))
    ),
    ...inspection.findings.flatMap((finding) =>
      finding.photos.map((photo) => ({
        id: photo.id,
        url: photo.url,
        caption: photo.caption ?? photo.fileName ?? finding.title,
        label: `${finding.question?.section.title ?? "General"} / Finding`,
      }))
    ),
  ];
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <div className="detail-row-label">{label}</div>
      <div className="detail-row-value">{value}</div>
    </div>
  );
}

function QuestionActionLinks({
  inspectionId,
  question,
  answer,
}: {
  inspectionId: string;
  question: any;
  answer: any;
}) {
  const firstActualImage = answer?.photos?.[0]?.url;

  return (
    <div className="table-actions">
      {firstActualImage ? (
        <a className="inline-link" href={firstActualImage} rel="noreferrer" target="_blank">
          View images
        </a>
      ) : null}
      <Link className="inline-link" href={`/inspections/${inspectionId}`}>
        Workflow
      </Link>
      {question.allowsPhoto ? (
        <Link className="inline-link" href={`/inspections/${inspectionId}`}>
          Upload docs
        </Link>
      ) : null}
    </div>
  );
}

function QuestionFindingCard({ finding }: { finding: any }) {
  const severityKey: keyof typeof riskLabel =
    typeof finding.severity === "string" && finding.severity in riskLabel
      ? (finding.severity as keyof typeof riskLabel)
      : "LOW";
  const statusKey: keyof typeof findingStatusLabel =
    typeof finding.status === "string" && finding.status in findingStatusLabel
      ? (finding.status as keyof typeof findingStatusLabel)
      : "OPEN";

  return (
    <div className="list-card">
      <div className="meta-row">
        <span className={`chip ${toneForRisk(severityKey)}`}>{riskLabel[severityKey]}</span>
        <span className={`chip ${toneForFindingStatus(statusKey)}`}>{findingStatusLabel[statusKey]}</span>
      </div>
      <div className="list-card-title">{finding.title}</div>
      <div className="small-text">{finding.description}</div>
    </div>
  );
}

function QuestionReasoningCard({
  index,
  question,
  answer,
  questionFindings,
  inspectionId,
}: {
  index: number;
  question: any;
  answer: any;
  questionFindings: any[];
  inspectionId: string;
}) {
  const riskKey: keyof typeof riskLabel =
    typeof question.riskLevel === "string" && question.riskLevel in riskLabel
      ? (question.riskLevel as keyof typeof riskLabel)
      : "LOW";

  return (
    <article className={`question-card ${question.isCicCandidate ? "question-card-focus" : ""}`}>
      <div className="question-card-layout">
        <div className="question-card-main">
          <div className="question-header">
            <div>
              <div className="question-code">
                {index + 1}. {question.code}
              </div>
              <div className="question-prompt">{question.prompt}</div>
            </div>
            <div className="question-card-flags">
              {question.isMandatory ? <span className="chip chip-warning">Mandatory</span> : null}
              {question.isCicCandidate ? <span className="chip chip-danger">Concentrated</span> : null}
              <span className={`chip ${toneForRisk(riskKey)}`}>{riskLabel[riskKey]}</span>
            </div>
          </div>

          <div className="inspection-summary-grid">
            <div className="matrix-card">
              <strong>Recorded response</strong>
              <div className="small-text" style={{ marginTop: "0.35rem" }}>
                {renderAnswerValue(answer)}
              </div>
            </div>
            <div className="matrix-card">
              <strong>Inspector reasoning</strong>
              <div className="small-text" style={{ marginTop: "0.35rem" }}>
                {answer?.comment ?? question.helpText ?? "No inspector reasoning recorded for this row."}
              </div>
            </div>
          </div>

          {questionFindings.length ? (
            <div className="question-inline-actions">
              <div className="small-text" style={{ marginBottom: "0.55rem" }}>
                Linked findings
              </div>
              <div className="stack-list">
                {questionFindings.map((finding) => (
                  <QuestionFindingCard finding={finding} key={finding.id} />
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="question-card-side">
          <div className="question-visual-lane">
            <div className="reference-panel">
              <div className="visual-label">Reference image</div>
              {question.referenceImageUrl ? (
                <>
                  <img alt={`${question.code} reference`} className="reference-thumb" src={question.referenceImageUrl} />
                  <a className="inline-link" href={question.referenceImageUrl} rel="noreferrer" target="_blank">
                    Open reference
                  </a>
                </>
              ) : (
                <div className="small-text">No reference image linked.</div>
              )}
            </div>

            <div className="evidence-panel">
              <div className="visual-label">Actual upload</div>
              <div className="report-thumb-row report-thumb-row-spacious">
                {answer?.photos?.length ? (
                  answer.photos.map((photo: any) => (
                    <a href={photo.url} key={photo.id} rel="noreferrer" target="_blank">
                      <img
                        alt={photo.caption ?? photo.fileName ?? question.code}
                        className="report-thumb report-thumb-large"
                        src={photo.url}
                      />
                    </a>
                  ))
                ) : (
                  <div className="small-text">No actual upload yet.</div>
                )}
              </div>
            </div>

            <div className="questionnaire-section-actions">
              <QuestionActionLinks answer={answer} inspectionId={inspectionId} question={question} />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function SectionSummaryBoard({ section }: { section: any }) {
  const concentratedCount = section.questions.filter((question: any) => question.isCicCandidate).length;

  return (
    <div className="questionnaire-section-summary">
      <div className="chart-bar-list">
        {[
          { label: "Answered", value: section.answeredCount, note: `${section.questions.length} questions` },
          { label: "Findings", value: section.findings.length, note: "Open and carried findings" },
          { label: "Evidence", value: section.evidenceCount, note: "Photos linked to answers" },
          { label: "Concentrated", value: concentratedCount, note: "Highlighted CIR/CIC prompts" },
        ].map((item) => (
          <div className="chart-bar-row" key={`${section.id}-${item.label}`}>
            <div className="chart-bar-copy">
              <strong>{item.label}</strong>
              <div className="small-text">{item.note}</div>
            </div>
            <div className="chart-bar-track">
              <div
                className="chart-bar-fill"
                style={{
                  width: `${Math.max(
                    8,
                    (item.value /
                      Math.max(
                        section.questions.length,
                        section.answeredCount,
                        section.findings.length,
                        section.evidenceCount,
                        concentratedCount,
                        1
                      )) *
                      100
                  )}%`,
                }}
              />
            </div>
            <div className="chart-bar-value">{item.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function ChapterFindingBlock({
  rows,
  view,
}: {
  rows: Array<{ chapter: string; high: number; medium: number; low: number; total: number }>;
  view: ChapterView;
}) {
  if (view === "bar") {
    return (
      <div className="chart-bar-list">
        {rows.length ? (
          rows.map((row) => (
            <div className="chart-bar-row" key={row.chapter}>
              <div className="chart-bar-copy">
                <strong>{row.chapter}</strong>
                <div className="small-text">
                  High {row.high} / Medium {row.medium} / Low {row.low}
                </div>
              </div>
              <div className="chart-bar-track">
                <div className="chart-bar-fill" style={{ width: `${Math.max(8, row.total * 12)}%` }} />
              </div>
              <div className="chart-bar-value">{row.total}</div>
            </div>
          ))
        ) : (
          <div className="empty-state">No chapter-level findings recorded.</div>
        )}
      </div>
    );
  }

  return <ChapterFindingTable rows={rows} />;
}

function ChapterFindingTable({
  rows,
}: {
  rows: Array<{ chapter: string; high: number; medium: number; low: number; total: number }>;
}) {
  return (
    <table className="table data-table vir-data-table">
      <thead>
        <tr>
          <th>Chapter</th>
          <th>High</th>
          <th>Medium</th>
          <th>Low</th>
          <th>Total</th>
        </tr>
      </thead>
      <tbody>
        {rows.length ? (
          rows.map((row) => (
            <tr key={row.chapter}>
              <td>{row.chapter}</td>
              <td>{row.high}</td>
              <td>{row.medium}</td>
              <td>{row.low}</td>
              <td>{row.total}</td>
            </tr>
          ))
        ) : (
          <tr>
            <td colSpan={5}>No chapter-level findings recorded.</td>
          </tr>
        )}
      </tbody>
    </table>
  );
}
