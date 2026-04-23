import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft, Eye, FileDown, Gauge, ImageIcon, ListChecks, Mail, X } from "lucide-react";
import { PrintButton } from "@/components/print-button";
import { CompactBarChart } from "@/components/erp-charts";
import { prisma } from "@/lib/prisma";
import {
  buildLiveChecklist,
  buildLiveSectionRows,
  buildLiveVesselCondition,
  buildLiveVesselRating,
  describeLiveQuestionOutcome,
  getQuestionUploads,
  normalizeRemoteAssetUrl,
  stripHtml,
} from "@/lib/vir/live-checklist";
import {
  calculateChecklistOutcome,
  calculateInspectionScore,
  calculateVesselCondition,
  calculateVesselRating,
  summarizeProgress,
} from "@/lib/vir/analytics";
import { canAccessVessel, requireVirSession } from "@/lib/vir/session";
import { buildVesselProfile } from "@/lib/vir/vessel-profile";
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
type ReportDialog = "outcome" | "rating" | "condition" | "section-summary" | "image-preview";
type ReportLinkState = {
  variant: ReportVariant;
  checklistView: ChecklistView;
  chapterView: ChapterView;
  imageMode: "all" | "selected";
  imageIds: string[];
  sectionId?: string;
};

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
  const selectedSectionParam = typeof reportParams.section === "string" ? reportParams.section : undefined;
  const imageMode = reportParams.imageMode === "selected" ? "selected" : "all";
  const selectedReportPhotoIds = new Set(normalizeArray(reportParams.image));
  const selectedDialog = normalizeDialog(typeof reportParams.dialog === "string" ? reportParams.dialog : undefined);
  const selectedDialogSectionId =
    typeof reportParams.dialogSection === "string" ? reportParams.dialogSection : undefined;
  const selectedDialogImageId =
    typeof reportParams.dialogImage === "string" ? reportParams.dialogImage : undefined;

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

  const inspectionMode = inferInspectionMode(inspection.title, inspection.inspectionType.name);
  const vesselProfile = buildVesselProfile(inspection.vessel);
  const liveChecklist = buildLiveChecklist(inspection);
  const questions = liveChecklist
    ? liveChecklist.sections.flatMap((section) => section.subsections.flatMap((subsection) => subsection.questions))
    : inspection.template?.sections.flatMap((section) => section.questions) ?? [];
  const progress = liveChecklist
    ? {
        answeredQuestions:
          liveChecklist.summary.tested +
          liveChecklist.summary.inspected +
          liveChecklist.summary.notSighted +
          liveChecklist.summary.notApplicable,
        totalQuestions: liveChecklist.summary.questionCount,
        completionPercent:
          liveChecklist.summary.questionCount > 0
            ? Math.round(
                ((liveChecklist.summary.tested +
                  liveChecklist.summary.inspected +
                  liveChecklist.summary.notSighted +
                  liveChecklist.summary.notApplicable) /
                  liveChecklist.summary.questionCount) *
                  100
              )
            : 0,
      }
    : summarizeProgress(questions as any[], inspection.answers);
  const score = liveChecklist
    ? {
        percentage: liveChecklist.summary.conditionScore
          ? Math.round((liveChecklist.summary.conditionScore / 5) * 100)
          : 0,
        rawScore: liveChecklist.summary.conditionScore ? Math.round((liveChecklist.summary.conditionScore / 5) * 100) : 0,
        penaltyCount: liveChecklist.summary.totalFindings,
      }
    : calculateInspectionScore(questions as any[], inspection.answers, inspection.findings);
  const checklistOutcome = liveChecklist
    ? {
        answered:
          liveChecklist.summary.tested +
          liveChecklist.summary.inspected +
          liveChecklist.summary.notSighted +
          liveChecklist.summary.notApplicable,
        totalQuestions: liveChecklist.summary.questionCount,
        tested: liveChecklist.summary.tested,
        inspected: liveChecklist.summary.inspected,
        notSighted: liveChecklist.summary.notSighted,
        notApplicable: liveChecklist.summary.notApplicable,
        totalFindings: liveChecklist.summary.totalFindings,
      }
    : calculateChecklistOutcome(questions as any[], inspection.answers, inspection.findings);
  const vesselRating = liveChecklist
    ? buildLiveVesselRating(liveChecklist, inspectionMode)
    : calculateVesselRating(questions as any[], inspection.answers, inspection.findings, inspectionMode);
  const vesselCondition = liveChecklist
    ? buildLiveVesselCondition(liveChecklist)
    : calculateVesselCondition(questions as any[], inspection.answers);
  const answerMap = new Map(inspection.answers.map((answer) => [answer.questionId, answer]));
  const sectionRows = liveChecklist
    ? buildLiveSectionRows(liveChecklist, inspectionMode)
    : inspection.template?.sections.map((section) => {
        const sectionAnswers = inspection.answers.filter((answer) => answer.question.section.id === section.id);
        const sectionFindings = inspection.findings.filter((finding) => finding.question?.section.id === section.id);
        const sectionEvidence = sectionAnswers.reduce((sum, answer) => sum + answer.photos.length, 0);
        const sectionFindingImageCount = sectionFindings.reduce((sum, finding) => sum + finding.photos.length, 0);
        const sectionCondition = calculateVesselCondition(section.questions, sectionAnswers);
        const sectionRating = calculateVesselRating(section.questions, sectionAnswers, sectionFindings, inspectionMode);

        return {
          ...section,
          answers: sectionAnswers,
          findings: sectionFindings,
          evidenceCount: sectionEvidence,
          findingImageCount: sectionFindingImageCount,
          answeredCount: sectionAnswers.filter((answer) => hasRecordedAnswer(answer)).length,
          condition: sectionCondition,
          rating: sectionRating,
          subsections: [],
          comments: "",
        };
      }) ?? [];
  const selectedSectionId =
    selectedSectionParam && sectionRows.some((section) => section.id === selectedSectionParam)
      ? selectedSectionParam
      : sectionRows[0]?.id;
  const visibleDetailedSections = selectedSectionId
    ? sectionRows.filter((section) => section.id === selectedSectionId)
    : sectionRows;

  const chapterFindingRows = sectionRows
    .filter((section) => section.findings.length > 0)
    .map((section) => ({
      chapter: section.title,
      high: section.findings.filter((finding) => finding.severity === "HIGH" || finding.severity === "CRITICAL").length,
      medium: section.findings.filter((finding) => finding.severity === "MEDIUM").length,
      low: section.findings.filter((finding) => finding.severity === "LOW").length,
      total: section.findings.length,
    }));

  const reportPhotos = collectReportPhotos(inspection, sectionRows);
  const previewPhoto = selectedDialogImageId ? reportPhotos.find((photo) => photo.id === selectedDialogImageId) : undefined;
  const dialogSection =
    selectedDialogSectionId && sectionRows.some((section) => section.id === selectedDialogSectionId)
      ? sectionRows.find((section) => section.id === selectedDialogSectionId)
      : selectedSectionId
        ? sectionRows.find((section) => section.id === selectedSectionId)
        : undefined;
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
  const reportNarratives = buildInspectionNarratives(inspection, reportPhotos);
  const reportLinkState: ReportLinkState = {
    variant: selectedVariant,
    checklistView: selectedChecklistView,
    chapterView: selectedChapterView,
    sectionId: selectedSectionId,
    imageMode,
    imageIds: normalizeArray(reportParams.image),
  };

  return (
    <div className="page-stack report-pack report-pack-live">
      <Link className="back-link" href={`/inspections/${inspection.id}?pane=questionnaire${selectedSectionId ? `&section=${selectedSectionId}` : ""}`} scroll={false}>
        <ArrowLeft size={16} />
        <span>Back to workflow</span>
      </Link>

      <section className="panel panel-elevated report-command-bar">
        <div className="report-breadcrumbs">
          <Link className="table-link" href={`/vessels/${inspection.vesselId}`} scroll={false}>
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
                sectionId: selectedSectionId,
                imageMode,
                imageIds: normalizeArray(reportParams.image),
              })}
              key={item.id}
              scroll={false}
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
          <Link className="btn-secondary btn-compact" href={`/inspections/${inspection.id}?pane=questionnaire${selectedSectionId ? `&section=${selectedSectionId}` : ""}`} scroll={false}>
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
              <DetailRow label="Inspection Mode" value={inspectionMode} />
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
              <a href={inspection.photos[0].url} rel="noreferrer" target="_blank">
                <img alt={inspection.photos[0].caption ?? inspection.photos[0].fileName ?? inspection.title} src={inspection.photos[0].url} />
              </a>
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
        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h3 className="panel-title">VesselInspection Checklist</h3>
              <p className="panel-subtitle">Outcome counts, vessel rating guidance, and vessel condition score for this VIR.</p>
            </div>
          </div>

          <div className="report-checklist-grid">
            <article className="report-insight-card">
              <div className="report-insight-header">
                <h4>Inspection Outcome</h4>
                <Link
                  aria-label="Open inspection outcome summary"
                  className="action-icon-link action-icon-link-primary"
                  href={buildReportHref(inspection.id, {
                    variant: selectedVariant,
                    checklistView: selectedChecklistView,
                    chapterView: selectedChapterView,
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                    dialog: "outcome",
                  })}
                  scroll={false}
                  title="View inspection outcome"
                >
                  <ListChecks size={16} />
                </Link>
              </div>

              <CompactBarChart
                bars={[
                  { label: "I", value: checklistOutcome.inspected, note: "Inspected" },
                  { label: "T", value: checklistOutcome.tested, note: "Tested" },
                  { label: "NS", value: checklistOutcome.notSighted, note: "Not Sighted" },
                  { label: "NA", value: checklistOutcome.notApplicable, note: "Not Applicable" },
                  { label: "TF", value: checklistOutcome.totalFindings, note: "Total Findings" },
                ]}
                subtitle={`${checklistOutcome.answered}/${checklistOutcome.totalQuestions} answered`}
                title="Inspection Outcome"
              />
            </article>

            <article className="report-insight-card">
              <div className="report-insight-header">
                <h4>Vessel Rating</h4>
                <Link
                  aria-label="Open vessel rating guidance"
                  className="action-icon-link action-icon-link-primary"
                  href={buildReportHref(inspection.id, {
                    variant: selectedVariant,
                    checklistView: selectedChecklistView,
                    chapterView: selectedChapterView,
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                    dialog: "rating",
                  })}
                  scroll={false}
                  title="View vessel rating guide"
                >
                  <Gauge size={16} />
                </Link>
              </div>
              <div className="report-score-card">
                <div className={`chip ${toneForRisk((vesselRating.band === "LOW" ? "HIGH" : vesselRating.band) as keyof typeof riskLabel)}`}>{vesselRating.label}</div>
                <div className="report-score-number">{Math.round(vesselRating.ratio)}%</div>
                <div className="small-text">
                  {vesselRating.mandatoryQuestionsWithFindings}/{vesselRating.mandatoryQuestions} mandatory questions with findings
                </div>
              </div>
            </article>

            <article className="report-insight-card">
              <div className="report-insight-header">
                <h4>Vessel Condition</h4>
                <Link
                  aria-label="Open vessel condition guide"
                  className="action-icon-link action-icon-link-primary"
                  href={buildReportHref(inspection.id, {
                    variant: selectedVariant,
                    checklistView: selectedChecklistView,
                    chapterView: selectedChapterView,
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                    dialog: "condition",
                  })}
                  scroll={false}
                  title="View vessel condition guide"
                >
                  <ImageIcon size={16} />
                </Link>
              </div>
              <div className="report-score-card">
                <div className="chip chip-info">{vesselCondition.label}</div>
                <div className="report-score-number">{vesselCondition.score?.toFixed(1) ?? "n/a"}</div>
                <div className="small-text">{vesselCondition.scoredResponses} scored checklist responses</div>
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {selectedVariant === "detailed" ? (
        <>
          <section className="questionnaire-summary-grid">
            {sectionRows.map((section) => (
              <Link
                className={`questionnaire-summary-card${selectedSectionId === section.id ? " questionnaire-summary-card-active" : ""}`}
                href={buildReportHref(inspection.id, {
                  variant: "detailed",
                  checklistView: selectedChecklistView,
                  chapterView: selectedChapterView,
                  sectionId: section.id,
                  imageMode,
                  imageIds: normalizeArray(reportParams.image),
                })}
                key={section.id}
                scroll={false}
              >
                <span>{section.title}</span>
                <strong>
                  {section.answeredCount}/{section.questions.length}
                </strong>
                <div className="small-text">
                  {section.findings.length} findings / {section.evidenceCount} evidence /{" "}
                  {section.questions.filter((question) => question.isCicCandidate).length} concentrated
                </div>
              </Link>
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
                  <input name="checklistView" type="hidden" value={selectedChecklistView} />
                  <input name="chapterView" type="hidden" value={selectedChapterView} />
                  {selectedSectionId ? <input name="section" type="hidden" value={selectedSectionId} /> : null}
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
                        <Link
                          href={buildReportHref(inspection.id, {
                            ...reportLinkState,
                            dialog: "image-preview",
                            dialogImageId: photo.id,
                          })}
                          scroll={false}
                        >
                          <img alt={photo.caption} src={photo.url} />
                        </Link>
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
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                  scroll={false}
                >
                  Table view
                </Link>
                <Link
                  className={`btn-compact ${selectedChapterView === "bar" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "detailed",
                    checklistView: selectedChecklistView,
                    chapterView: "bar",
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                  scroll={false}
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
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                  scroll={false}
                >
                  Grid view
                </Link>
                <Link
                  className={`btn-compact ${selectedChecklistView === "reasoning" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "detailed",
                    checklistView: "reasoning",
                    chapterView: selectedChapterView,
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                  scroll={false}
                >
                  Reasoning view
                </Link>
              </div>
            </div>
          </section>

          <section className="panel panel-elevated">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Section review register</h3>
                <p className="panel-subtitle">Chapter, rating, summary, condition, and evidence matrix for the selected VIR.</p>
              </div>
            </div>
            <div className="table-shell table-shell-compact">
              <table className="table data-table vir-data-table">
                <thead>
                  <tr>
                    <th>Chapter Name</th>
                    <th>Rating</th>
                    <th>View Summary</th>
                    <th>Findings</th>
                    <th>Condition</th>
                    <th>Section Images</th>
                    <th>Finding Images</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {sectionRows.map((section) => (
                    <tr key={section.id}>
                      <td>
                        <div className="section-register-title">{section.title}</div>
                        <div className="small-text">{section.questions.length} questions</div>
                      </td>
                      <td>
                        <span
                          className={`chip ${toneForRisk(
                            (section.rating.band === "LOW" ? "HIGH" : section.rating.band) as keyof typeof riskLabel,
                          )}`}
                        >
                          {section.rating.band === "HIGH" ? "High" : section.rating.band === "MEDIUM" ? "Medium" : "Low"}
                        </span>
                      </td>
                      <td>
                        <Link
                          aria-label={`Open summary for ${section.title}`}
                          className="action-icon-link action-icon-link-primary"
                          href={buildReportHref(inspection.id, {
                            ...reportLinkState,
                            dialog: "section-summary",
                            dialogSectionId: section.id,
                          })}
                          scroll={false}
                          title={`View summary for ${section.title}`}
                        >
                          <Eye size={16} />
                        </Link>
                      </td>
                      <td>{section.findings.length || ""}</td>
                      <td>
                        {typeof section.condition === "number"
                          ? section.condition.toFixed(1)
                          : section.condition?.score?.toFixed(1) ?? ""}
                      </td>
                      <td>{section.evidenceCount || ""}</td>
                      <td>{section.findingImageCount || ""}</td>
                      <td>
                        <Link
                          className="action-icon-link action-icon-link-primary"
                          href={buildReportHref(inspection.id, {
                            ...reportLinkState,
                            sectionId: section.id,
                          })}
                          scroll={false}
                          title={`Open ${section.title}`}
                        >
                          <ArrowLeft size={16} />
                        </Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="page-stack">
            {visibleDetailedSections.map((section) => (
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
                {section.comments ? <div className="report-section-comment">{section.comments}</div> : null}

                <div className="report-subsection-stack">
                  {(section.subsections?.length
                    ? section.subsections
                    : [
                        {
                          ...section,
                          title: section.title,
                          location: "On board",
                        },
                      ]
                  ).map((subsection: any) => (
                    <DetailedSubsectionBlock
                      answerMap={answerMap}
                      inspectionFindings={inspection.findings}
                      inspectionId={inspection.id}
                      isLiveChecklist={Boolean(liveChecklist)}
                      key={subsection.id}
                      reportLinkState={reportLinkState}
                      sectionId={section.id}
                      selectedChecklistView={selectedChecklistView}
                      subsection={subsection}
                    />
                  ))}
                </div>
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
                    <Link
                      href={buildReportHref(inspection.id, {
                        ...reportLinkState,
                        dialog: "image-preview",
                        dialogImageId: photo.id,
                      })}
                      scroll={false}
                    >
                      <img alt={photo.caption} src={photo.url} />
                    </Link>
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

          <section className="page-stack">
            {reportNarratives.map((block) => (
              <section className="panel panel-elevated narrative-block" key={block.id}>
                <div className="report-section-label">{block.title}</div>
                {block.body.length ? (
                  block.mode === "list" ? (
                    <ol className="narrative-list">
                      {block.body.map((item, index) => (
                        <li key={`${block.id}-${index}`}>{item}</li>
                      ))}
                    </ol>
                  ) : (
                    <div className="narrative-copy">
                      {block.body.map((item, index) => (
                        <p key={`${block.id}-${index}`}>{item}</p>
                      ))}
                    </div>
                  )
                ) : (
                  <div className="small-text">No text recorded.</div>
                )}

                {block.attachments?.length ? (
                  <div className="report-thumb-row report-thumb-row-spacious">
                    {block.attachments.map((attachment) => (
                      <Link
                        className="report-photo-card report-photo-card-compact"
                        href={buildReportHref(inspection.id, {
                          ...reportLinkState,
                          dialog: "image-preview",
                          dialogImageId: attachment.id,
                        })}
                        key={attachment.id}
                        scroll={false}
                      >
                        <img alt={attachment.caption} className="report-thumb report-thumb-large" src={attachment.url} />
                        <div className="report-photo-meta">
                          <strong>{attachment.label}</strong>
                          <span className="small-text">{attachment.caption}</span>
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </section>
            ))}
          </section>
        </>
      ) : null}

      {selectedVariant === "summary" ? (
        <section className="page-stack">
          <section className="questionnaire-summary-grid">
            {sectionRows.map((section) => (
              <Link
                className={`questionnaire-summary-card${selectedSectionId === section.id ? " questionnaire-summary-card-active" : ""}`}
                href={buildReportHref(inspection.id, {
                  variant: "summary",
                  checklistView: selectedChecklistView,
                  chapterView: selectedChapterView,
                  sectionId: section.id,
                  imageMode,
                  imageIds: normalizeArray(reportParams.image),
                })}
                key={section.id}
                scroll={false}
              >
                <span>{section.title}</span>
                <strong>{section.answeredCount}/{section.questions.length}</strong>
                <div className="small-text">
                  {section.findings.length} findings / {section.evidenceCount} evidence /{" "}
                  {section.questions.filter((question) => question.isCicCandidate).length} concentrated
                </div>
              </Link>
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
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                  scroll={false}
                >
                  Table view
                </Link>
                <Link
                  className={`btn-compact ${selectedChapterView === "bar" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "summary",
                    checklistView: selectedChecklistView,
                    chapterView: "bar",
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                  scroll={false}
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
                    <a href={photo.url} key={photo.id} rel="noreferrer" target="_blank">
                      <img alt={photo.caption ?? photo.fileName ?? finding.title} className="report-thumb report-thumb-large" src={photo.url} />
                    </a>
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
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                  scroll={false}
                >
                  Table view
                </Link>
                <Link
                  className={`btn-compact ${selectedChapterView === "bar" ? "btn" : "btn-secondary"}`}
                  href={buildReportHref(inspection.id, {
                    variant: "consolidate",
                    checklistView: selectedChecklistView,
                    chapterView: "bar",
                    sectionId: selectedSectionId,
                    imageMode,
                    imageIds: normalizeArray(reportParams.image),
                  })}
                  scroll={false}
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
                  <Link
                    href={buildReportHref(inspection.id, {
                      ...reportLinkState,
                      dialog: "image-preview",
                      dialogImageId: photo.id,
                    })}
                    scroll={false}
                  >
                    <img alt={photo.caption} src={photo.url} />
                  </Link>
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

      {selectedDialog ? (
        <div className="dialog-backdrop">
          <div className={`dialog-shell ${selectedDialog === "image-preview" ? "dialog-shell-wide" : ""}`}>
            <div className="dialog-header">
              <div className="dialog-title">
                {selectedDialog === "outcome"
                  ? "Inspection Outcome"
                  : selectedDialog === "rating"
                    ? "Vessel Rating"
                    : selectedDialog === "condition"
                      ? "Vessel Condition"
                      : selectedDialog === "section-summary"
                        ? `${dialogSection?.title ?? "Section"} Summary`
                        : previewPhoto?.label ?? "Image Preview"}
              </div>
              <Link
                aria-label="Close dialog"
                className="action-icon-link action-icon-link-danger"
                href={buildReportHref(inspection.id, reportLinkState)}
                scroll={false}
                title="Close"
              >
                <X size={16} />
              </Link>
            </div>

            {selectedDialog === "outcome" ? (
              <table className="table data-table vir-data-table">
                <thead>
                  <tr>
                    <th>S.No</th>
                    <th>T</th>
                    <th>I</th>
                    <th>NS</th>
                    <th>NA</th>
                    <th>TF</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>1</td>
                    <td>{checklistOutcome.tested}</td>
                    <td>{checklistOutcome.inspected}</td>
                    <td>{checklistOutcome.notSighted}</td>
                    <td>{checklistOutcome.notApplicable}</td>
                    <td>{checklistOutcome.totalFindings}</td>
                  </tr>
                  <tr>
                    <td />
                    <td>Tested</td>
                    <td>Inspected</td>
                    <td>Not Sighted</td>
                    <td>Not Applicable</td>
                    <td>Total Findings</td>
                  </tr>
                </tbody>
              </table>
            ) : null}

            {selectedDialog === "rating" ? (
              <table className="table data-table vir-data-table">
                <thead>
                  <tr>
                    <th>Vessel Rating</th>
                    <th>Sailing Inspection</th>
                    <th>P/S Inspection</th>
                  </tr>
                </thead>
                <tbody>
                  {vesselProfile.vesselRatingGuide.map((entry) => (
                    <tr key={entry.rating}>
                      <td>
                        <div
                          className={`chip ${
                            entry.rating.startsWith("HIGH")
                              ? "chip-success"
                              : entry.rating.startsWith("MEDIUM")
                                ? "chip-warning"
                                : "chip-danger"
                          }`}
                        >
                          {entry.rating.split(" ")[0]}
                        </div>
                        <div className="small-text">{entry.rating}</div>
                      </td>
                      <td>{entry.sailingInspection}</td>
                      <td>{entry.portInspection}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {selectedDialog === "condition" ? (
              <table className="table data-table vir-data-table">
                <thead>
                  <tr>
                    <th>Description</th>
                    <th>Criteria</th>
                    <th>Score range</th>
                    <th>Reference</th>
                  </tr>
                </thead>
                <tbody>
                  {vesselProfile.vesselConditionGuide.map((entry, index) => (
                    <tr key={`${entry.description}-${index}`}>
                      <td>{entry.description}</td>
                      <td>{entry.criteria}</td>
                      <td>{entry.scoreRange}</td>
                      <td>
                        {entry.referenceImageUrl ? (
                          <img
                            alt={entry.description}
                            className="report-thumb report-thumb-large"
                            src={normalizeRemoteAssetUrl(entry.referenceImageUrl)}
                          />
                        ) : (
                          ""
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : null}

            {selectedDialog === "section-summary" && dialogSection ? <SectionSummaryBoard section={dialogSection} /> : null}

            {selectedDialog === "image-preview" && previewPhoto ? (
              <div className="report-image-preview">
                <img alt={previewPhoto.caption} src={previewPhoto.url} />
                <div className="report-photo-meta">
                  <strong>{previewPhoto.label}</strong>
                  <span>{previewPhoto.caption}</span>
                </div>
              </div>
            ) : null}
          </div>
        </div>
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

function normalizeDialog(value: string | undefined): ReportDialog | undefined {
  return value === "outcome" ||
    value === "rating" ||
    value === "condition" ||
    value === "section-summary" ||
    value === "image-preview"
    ? value
    : undefined;
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
    sectionId?: string;
    dialog?: ReportDialog;
    dialogSectionId?: string;
    dialogImageId?: string;
  }
) {
  const params = new URLSearchParams();
  params.set("variant", options.variant);
  params.set("checklistView", options.checklistView);
  params.set("chapterView", options.chapterView);
  params.set("imageMode", options.imageMode);
  options.imageIds.forEach((id) => params.append("image", id));
  if (options.sectionId) {
    params.set("section", options.sectionId);
  }
  if (options.dialog) {
    params.set("dialog", options.dialog);
  }
  if (options.dialogSectionId) {
    params.set("dialogSection", options.dialogSectionId);
  }
  if (options.dialogImageId) {
    params.set("dialogImage", options.dialogImageId);
  }
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

function collectReportPhotos(
  inspection: {
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
  },
  sectionRows: any[] = []
) {
  const livePhotos = sectionRows.flatMap((section) =>
    (section.subsections?.length
      ? section.subsections
      : [{ id: `${section.id}-default`, title: section.title, questions: section.questions ?? [] }]
    ).flatMap((subsection: any) =>
      (subsection.questions ?? []).flatMap((question: any) =>
        (question.files ?? []).map((file: any) => ({
          id: file.id,
          url: normalizeRemoteAssetUrl(file.url),
          caption: file.caption ?? file.fileName ?? question.prompt,
          label: `${section.title} / ${subsection.title ?? section.title}`,
        }))
      )
    )
  );

  const reportPhotos = [
    ...livePhotos,
    ...inspection.photos.map((photo) => ({
      id: photo.id,
      url: normalizeRemoteAssetUrl(photo.url),
      caption: photo.caption ?? photo.fileName ?? "Inspection evidence",
      label: "Inspection photo",
    })),
    ...inspection.answers.flatMap((answer) =>
      answer.photos.map((photo) => ({
        id: photo.id,
        url: normalizeRemoteAssetUrl(photo.url),
        caption: photo.caption ?? photo.fileName ?? `${answer.question.code} evidence`,
        label: `${answer.question.section.title} / ${answer.question.code}`,
      }))
    ),
    ...inspection.findings.flatMap((finding) =>
      finding.photos.map((photo) => ({
        id: photo.id,
        url: normalizeRemoteAssetUrl(photo.url),
        caption: photo.caption ?? photo.fileName ?? finding.title,
        label: `${finding.question?.section.title ?? "General"} / Finding`,
      }))
    ),
  ];

  return reportPhotos.filter(
    (photo, index, items) =>
      Boolean(photo.url) &&
      items.findIndex((candidate) => candidate.url === photo.url && candidate.caption === photo.caption) === index
  );
}

function buildInspectionNarratives(
  inspection: {
    summary: string | null;
    metadata: unknown;
    findings: Array<{ description: string; title: string }>;
    inspectionDate: Date;
    closedAt: Date | null;
  },
  reportPhotos: Array<{ id: string; url: string; caption: string; label: string }>
) {
  const metadata = (inspection.metadata ?? {}) as Record<string, unknown>;
  const itemsOfConcern = normalizeNarrativeList(
    metadata.itemsOfConcern,
    inspection.findings.slice(0, 5).map((finding) => finding.description || finding.title)
  );
  const bestPractice = normalizeNarrativeList(metadata.bestPractice, [
    inspection.summary ?? "Ship staff demonstrated positive support and responsiveness during the inspection walk-through.",
  ]);
  const equipmentNotWorking = normalizeNarrativeList(metadata.equipmentNotWorking, [
    "No critical equipment was confirmed as permanently defective during this review. Any trial limitations should be tracked in follow-up remarks.",
  ]);
  const safetyMeeting = normalizeNarrativeList(metadata.safetyMeeting, [
    "Safety meeting held with ship staff and key observations were discussed before close-out.",
  ]);
  const openingMeeting = normalizeNarrativeList(metadata.openingMeeting, [
    `Opening meeting held on ${fmt.format(inspection.inspectionDate)} to align scope, test expectations, and crew coordination.`,
  ]);
  const closingMeeting = normalizeNarrativeList(metadata.closingMeeting, [
    `Closing meeting held on ${fmt.format(inspection.closedAt ?? inspection.inspectionDate)} to review findings, actions, and office follow-up.`,
  ]);
  const conclusion = normalizeNarrativeList(metadata.conclusion, [
    inspection.summary ?? "Inspection concluded with the vessel generally meeting expected readiness, subject to closure of listed findings.",
  ]);

  return [
    { id: "items-of-concern", title: "Items of concern", mode: "list" as const, body: itemsOfConcern },
    {
      id: "best-practice",
      title: "Best Practice",
      mode: "paragraph" as const,
      body: bestPractice,
    },
    {
      id: "best-practice-documents",
      title: "Best Practice Documents",
      mode: "attachments" as const,
      body: ["(Only images, pdf, doc, docs, xls, xlsx are allowed)"],
      attachments: reportPhotos.slice(0, 2),
    },
    {
      id: "equipment-not-working",
      title: "Equipment Not Working / Never Tried Out",
      mode: "paragraph" as const,
      body: equipmentNotWorking,
    },
    {
      id: "equipment-not-working-documents",
      title: "Equipment Not Working / Never Tried Out Documents",
      mode: "attachments" as const,
      body: ["(Only images, pdf, doc, docs, xls, xlsx are allowed)"],
      attachments: reportPhotos.slice(2, 4),
    },
    {
      id: "safety-meeting",
      title: "Safety Meeting",
      mode: "list" as const,
      body: safetyMeeting,
    },
    {
      id: "safety-meeting-documents",
      title: "Safety Meeting Documents",
      mode: "attachments" as const,
      body: ["(Only images, pdf, doc, docs, xls, xlsx are allowed)"],
      attachments: reportPhotos.slice(4, 6),
    },
    {
      id: "other-documents",
      title: "Other Documents",
      mode: "attachments" as const,
      body: ["(Only images, pdf, doc, docs, xls, xlsx are allowed)"],
      attachments: reportPhotos.slice(6, 12),
    },
    { id: "opening-meeting", title: "Opening Meeting", mode: "list" as const, body: openingMeeting },
    { id: "closing-meeting", title: "Closing Meeting", mode: "list" as const, body: closingMeeting },
    { id: "conclusion", title: "Conclusion", mode: "list" as const, body: conclusion },
  ];
}

function normalizeNarrativeList(value: unknown, fallback: string[]) {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) {
    return [value.trim()];
  }
  return fallback.filter(Boolean);
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="detail-row">
      <div className="detail-row-label">{label}</div>
      <div className="detail-row-value">{value}</div>
    </div>
  );
}

function buildQuestionFindings(question: any, inspectionFindings: any[], isLiveChecklist: boolean) {
  if (isLiveChecklist) {
    return question.finding
      ? [
          {
            id: `${question.id}-finding`,
            title: question.prompt,
            description: question.comments || stripHtml(question.guidanceNotes) || question.prompt,
            severity: question.severity || "LOW",
            typeOfFinding: question.typeOfFinding,
            areaOfConcern: question.areaOfConcern,
            subAreaOfConcern: question.subAreaOfConcern,
            photos: question.files ?? [],
          },
        ]
      : [];
  }

  return inspectionFindings.filter((finding) => finding.questionId === question.id);
}

function getQuestionHelpText(question: any, isLiveChecklist: boolean) {
  return isLiveChecklist ? question.guidanceNotes : question.helpText;
}

function renderOutcomeMarker(isMarked: boolean) {
  return isMarked ? "Y" : "";
}

function QuestionActionLinks({
  inspectionId,
  question,
  answer,
  sectionId,
  reportLinkState,
}: {
  inspectionId: string;
  question: any;
  answer: any;
  sectionId?: string;
  reportLinkState: ReportLinkState;
}) {
  const actualUploads = getQuestionUploads(question, answer);
  const firstActualImage = actualUploads[0];
  const workflowHref = `/inspections/${inspectionId}?pane=questionnaire${sectionId ? `&section=${sectionId}` : ""}`;

  return (
    <div className="table-actions">
      {firstActualImage ? (
        <Link
          className="inline-link"
          href={buildReportHref(inspectionId, {
            ...reportLinkState,
            dialog: "image-preview",
            dialogImageId: firstActualImage.id,
          })}
          scroll={false}
        >
          View images
        </Link>
      ) : null}
      <Link className="inline-link" href={workflowHref} scroll={false}>
        Workflow
      </Link>
      {question.allowsPhoto ? (
        <Link className="inline-link" href={workflowHref} scroll={false}>
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
  sectionId,
  reportLinkState,
}: {
  index: number;
  question: any;
  answer: any;
  questionFindings: any[];
  inspectionId: string;
  sectionId?: string;
  reportLinkState: ReportLinkState;
}) {
  const riskKey: keyof typeof riskLabel =
    typeof question.riskLevel === "string" && question.riskLevel in riskLabel
      ? (question.riskLevel as keyof typeof riskLabel)
      : "LOW";
  const actualUploads =
    getQuestionUploads(question, answer);

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
                  <a href={normalizeRemoteAssetUrl(question.referenceImageUrl)} rel="noreferrer" target="_blank">
                    <img
                      alt={`${question.code} reference`}
                      className="reference-thumb"
                      src={normalizeRemoteAssetUrl(question.referenceImageUrl)}
                    />
                  </a>
                  <a
                    className="inline-link"
                    href={normalizeRemoteAssetUrl(question.referenceImageUrl)}
                    rel="noreferrer"
                    target="_blank"
                  >
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
                {actualUploads.length ? (
                  actualUploads.map((photo: any) => (
                    <Link
                      href={buildReportHref(inspectionId, {
                        ...reportLinkState,
                        dialog: "image-preview",
                        dialogImageId: photo.id,
                      })}
                      key={photo.id}
                      scroll={false}
                    >
                      <img
                        alt={photo.caption ?? photo.fileName ?? question.code}
                        className="report-thumb report-thumb-large"
                        src={photo.url}
                      />
                    </Link>
                  ))
                ) : (
                  <div className="small-text">No actual upload yet.</div>
                )}
              </div>
            </div>

            <div className="questionnaire-section-actions">
              <QuestionActionLinks
                answer={answer}
                inspectionId={inspectionId}
                question={question}
                reportLinkState={reportLinkState}
                sectionId={sectionId}
              />
            </div>
          </div>
        </div>
      </div>
    </article>
  );
}

function SubsectionQuestionTable({
  subsection,
  answerMap,
  inspectionFindings,
  inspectionId,
  sectionId,
  reportLinkState,
  isLiveChecklist,
}: {
  subsection: any;
  answerMap: Map<string, any>;
  inspectionFindings: any[];
  inspectionId: string;
  sectionId: string;
  reportLinkState: ReportLinkState;
  isLiveChecklist: boolean;
}) {
  return (
    <div className="table-shell table-shell-compact report-table-shell">
      <table className="table data-table vir-data-table">
        <thead>
          <tr>
            <th>S.No</th>
            <th>Question</th>
            <th>T</th>
            <th>I</th>
            <th>NS</th>
            <th>NA</th>
            <th>Score</th>
            <th>Finding</th>
            <th>Comments</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {subsection.questions.map((question: any, index: number) => {
            const answer = answerMap.get(question.id);
            const answerState = isLiveChecklist
              ? describeLiveQuestionOutcome(question)
              : describeQuestionOutcome(question, answer);
            const questionScore = isLiveChecklist ? question.score : deriveQuestionScore(question, answer);
            const questionFindings = buildQuestionFindings(question, inspectionFindings, isLiveChecklist);
            const questionHelpText = getQuestionHelpText(question, isLiveChecklist);

            return (
              <tr key={question.id}>
                <td>{index + 1}</td>
                <td>
                  <div className="report-question-code">{question.code}</div>
                  <div>{question.prompt}</div>
                  {stripHtml(questionHelpText) ? <div className="small-text">{stripHtml(questionHelpText)}</div> : null}
                </td>
                <td>{renderOutcomeMarker(answerState === "tested")}</td>
                <td>{renderOutcomeMarker(answerState === "inspected")}</td>
                <td>{renderOutcomeMarker(answerState === "notSighted")}</td>
                <td>{renderOutcomeMarker(answerState === "notApplicable")}</td>
                <td>{questionScore ?? ""}</td>
                <td>{questionFindings.length ? "N" : ""}</td>
                <td>{isLiveChecklist ? question.comments : answer?.comment ?? renderAnswerValue(answer)}</td>
                <td>
                  <QuestionActionLinks
                    answer={answer}
                    inspectionId={inspectionId}
                    question={question}
                    reportLinkState={reportLinkState}
                    sectionId={sectionId}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function DetailedSubsectionBlock({
  subsection,
  answerMap,
  inspectionFindings,
  inspectionId,
  sectionId,
  reportLinkState,
  selectedChecklistView,
  isLiveChecklist,
}: {
  subsection: any;
  answerMap: Map<string, any>;
  inspectionFindings: any[];
  inspectionId: string;
  sectionId: string;
  reportLinkState: ReportLinkState;
  selectedChecklistView: ChecklistView;
  isLiveChecklist: boolean;
}) {
  const subsectionFindings = subsection.questions.flatMap((question: any) =>
    buildQuestionFindings(question, inspectionFindings, isLiveChecklist)
  );
  const subsectionEvidenceCount = subsection.questions.reduce(
    (total: number, question: any) => total + getQuestionUploads(question, answerMap.get(question.id)).length,
    0
  );
  const subsectionCondition =
    typeof subsection.condition?.score === "number" ? subsection.condition.score.toFixed(1) : "NA";

  return (
    <details className="report-subsection-shell" open>
      <summary className="report-subsection-summary">
        <div className="report-subsection-copy">
          <strong>{subsection.title}</strong>
          <span className="small-text">{subsection.location ?? "On board"}</span>
        </div>
        <div className="mini-metrics">
          <span className="chip chip-info">Q {subsection.questions.length}</span>
          <span className="chip chip-success">Ans {subsection.summary?.answered ?? 0}</span>
          <span className="chip chip-warning">Findings {subsectionFindings.length}</span>
          <span className="chip chip-info">Cond {subsectionCondition}</span>
          <span className="chip chip-success">Images {subsectionEvidenceCount}</span>
        </div>
      </summary>

      <div className="report-subsection-body">
        {subsection.comments ? <div className="report-subsection-comment">{subsection.comments}</div> : null}
        {subsection.summary ? (
          <div className="report-subsection-summary-strip small-text">
            {subsection.summary.tested ?? 0} tested / {subsection.summary.inspected ?? 0} inspected /{" "}
            {subsection.summary.notSighted ?? 0} not sighted / {subsection.summary.notApplicable ?? 0} not applicable /{" "}
            {subsection.summary.totalFindings ?? 0} findings
          </div>
        ) : null}

        {selectedChecklistView === "grid" ? (
          <SubsectionQuestionTable
            answerMap={answerMap}
            inspectionFindings={inspectionFindings}
            inspectionId={inspectionId}
            isLiveChecklist={isLiveChecklist}
            reportLinkState={reportLinkState}
            sectionId={sectionId}
            subsection={subsection}
          />
        ) : (
          <div className="page-stack report-subsection-reasoning">
            {subsection.questions.map((question: any, index: number) => {
              const answer = answerMap.get(question.id);
              const questionFindings = buildQuestionFindings(question, inspectionFindings, isLiveChecklist);

              return (
                <QuestionReasoningCard
                  answer={answer}
                  index={index}
                  inspectionId={inspectionId}
                  key={question.id}
                  question={question}
                  questionFindings={questionFindings}
                  reportLinkState={reportLinkState}
                  sectionId={sectionId}
                />
              );
            })}
          </div>
        )}
      </div>
    </details>
  );
}

function SectionSummaryBoard({ section }: { section: any }) {
  const concentratedCount = section.questions.filter((question: any) => question.isCicCandidate).length;

  if (section.subsections?.length) {
    return (
      <div className="questionnaire-section-summary">
        <div className="table-shell table-shell-compact">
          <table className="table data-table vir-data-table">
            <thead>
              <tr>
                <th>Subsection</th>
                <th>Location</th>
                <th>Questions</th>
                <th>Answered</th>
                <th>Findings</th>
                <th>Condition</th>
                <th>Images</th>
              </tr>
            </thead>
            <tbody>
              {section.subsections.map((subsection: any) => (
                <tr key={subsection.id}>
                  <td>{subsection.title}</td>
                  <td>{subsection.location ?? "On board"}</td>
                  <td>{subsection.questions?.length ?? 0}</td>
                  <td>{subsection.summary?.answered ?? 0}</td>
                  <td>{subsection.summary?.totalFindings ?? 0}</td>
                  <td>{subsection.condition?.score ?? "NA"}</td>
                  <td>{subsection.summary?.evidenceCount ?? 0}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    );
  }

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

function describeQuestionOutcome(question: any, answer: any) {
  if (!answer || !hasRecordedAnswer(answer)) {
    return "notSighted" as const;
  }
  if (typeof answer.answerText === "string" && ["NA", "N/A", "NOT APPLICABLE"].includes(answer.answerText.toUpperCase())) {
    return "notApplicable" as const;
  }
  const prompt = `${question.prompt ?? ""} ${question.code ?? ""}`.toUpperCase();
  if (
    prompt.includes("TEST") ||
    prompt.includes("TRIAL") ||
    prompt.includes("ALARM") ||
    prompt.includes("DRILL") ||
    prompt.includes("PUMP") ||
    prompt.includes("RELEASE GEAR")
  ) {
    return "tested" as const;
  }
  return "inspected" as const;
}

function deriveQuestionScore(question: any, answer: any) {
  if (!answer || !hasRecordedAnswer(answer)) {
    return null;
  }
  if (typeof answer.answerNumber === "number") {
    return answer.answerNumber;
  }
  if (typeof answer.answerBoolean === "boolean") {
    return answer.answerBoolean ? 4 : 2;
  }
  if (typeof answer.answerText === "string") {
    const value = answer.answerText.toUpperCase();
    if (["YES", "CLEAR", "GOOD", "SATISFACTORY", "HIGH", "UP_TO_DATE"].includes(value)) {
      return 4;
    }
    if (["PARTIAL", "OBSERVATION", "WATCH", "MEDIUM", "MINOR_TOUCH_UP", "MINOR_DEFECT", "MONITOR"].includes(value)) {
      return 3;
    }
    if (["NO", "POOR", "DEFICIENT", "LOW", "MAJOR_DEFECT", "ATTENTION", "GAP"].includes(value)) {
      return 2;
    }
  }
  if (Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0) {
    return 3;
  }
  const firstScoredOption = question.options?.find((option: any) => option.value === answer.answerText && typeof option.score === "number");
  if (firstScoredOption?.score !== undefined && firstScoredOption.score !== null) {
    return Math.max(1, Math.min(5, Number((firstScoredOption.score / 20).toFixed(1))));
  }
  return 4;
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
