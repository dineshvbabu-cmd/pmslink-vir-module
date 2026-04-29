import type { ReactNode } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { AlignJustify, Edit, Eye, FileText, Grid2x2, TriangleAlert } from "lucide-react";
import {
  addCorrectiveActionAction,
  addFindingAction,
  addSignOffAction,
  saveInspectionAnswersAction,
  saveInspectionHeaderAction,
  updateCorrectiveActionStatusAction,
  updateFindingStatusAction,
  updateInspectionStatusAction,
} from "@/app/actions";
import { ActionIconLink } from "@/components/action-icon-link";
import { EvidenceSyncPanel } from "@/components/evidence-sync-panel";
import { FloatingActivityFeed } from "@/components/floating-activity-feed";
import { QuestionEvidenceInline } from "@/components/question-evidence-inline";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { calculateInspectionScore, summarizeProgress } from "@/lib/vir/analytics";
import {
  buildLiveChecklist,
  getQuestionUploads,
  normalizeRemoteAssetUrl,
  type LiveChecklistQuestion,
} from "@/lib/vir/live-checklist";
import { canAccessVessel, isOfficeSession, isVesselSession, requireVirSession } from "@/lib/vir/session";
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
const fmtDate = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "2-digit", year: "numeric" });

const signOffStageLabels: Record<string, string> = {
  VESSEL_SUBMISSION: "Vessel Submission",
  SHORE_REVIEW: "Office Review",
  FINAL_ACKNOWLEDGEMENT: "Final Acknowledgement",
};

const VESSEL_CERTIFICATES: Array<{ key: string; name: string }> = [
  { key: "smc", name: "Safety Management Certificate (SMC)" },
  { key: "doc", name: "Document of Compliance (DOC)" },
  { key: "issc", name: "International Ship Security Certificate (ISSC)" },
  { key: "ll", name: "International Load Line Certificate" },
  { key: "safcon", name: "Safety Construction Certificate" },
  { key: "safeq", name: "Safety Equipment Certificate" },
  { key: "safrad", name: "Safety Radio Certificate" },
  { key: "iopp", name: "International Oil Pollution Prevention Certificate (IOPP)" },
  { key: "iapp", name: "International Air Pollution Prevention Certificate (IAPP)" },
  { key: "iwm", name: "International Sewage Pollution Prevention Certificate (ISPP)" },
  { key: "inert", name: "International Noxious Liquid Substances Certificate (NLS)" },
  { key: "tonnage", name: "International Tonnage Certificate" },
  { key: "clc", name: "Civil Liability Certificate (CLC)" },
  { key: "mlc", name: "Maritime Labour Convention Certificate (MLC)" },
  { key: "class", name: "Class Certificate" },
  { key: "bow", name: "Continuous Synopsis Record (CSR)" },
  { key: "iwwp", name: "Garbage Management Plan" },
];

export default async function InspectionDetailPage({
  params,
  searchParams,
}: {
  params: Promise<{ inspectionId: string }>;
  searchParams: Promise<{ pane?: string; section?: string; findingQ?: string; view?: string; error?: string }>;
}) {
  const session = await requireVirSession();
  const { inspectionId } = await params;
  const { pane, section, findingQ, error } = await searchParams;

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
                  answerLibraryType: {
                    include: {
                      items: {
                        where: { isActive: true },
                        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
                      },
                    },
                  },
                },
              },
            },
          },
          inspectionType: { select: { name: true } },
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

  const canEditInspection = canAccessVessel(session, inspection.vesselId);

  const questions = inspection.template?.sections.flatMap((section) => section.questions) ?? [];
  const questionWorkflow =
    inspection.metadata && typeof inspection.metadata === "object" && !Array.isArray(inspection.metadata)
      ? ((inspection.metadata as Record<string, unknown>).questionWorkflow as Record<
          string,
          { surveyStatus?: string | null; score?: number | null; comment?: string | null } | undefined
        > | undefined) ?? {}
      : {};
  const enrichedAnswers = inspection.answers.map((answer) => ({
    ...answer,
    surveyStatus: questionWorkflow[answer.questionId]?.surveyStatus ?? null,
    score: questionWorkflow[answer.questionId]?.score ?? null,
  }));
  const answerMap = new Map(enrichedAnswers.map((answer) => [answer.questionId, answer]));
  const progressBase = summarizeProgress(questions, enrichedAnswers);
  const score = calculateInspectionScore(questions, enrichedAnswers, inspection.findings);
  const liveChecklist = buildLiveChecklist(inspection);
  const liveSections = liveChecklist?.sections ?? [];
  const templateQuestionCount = liveChecklist
    ? liveChecklist.summary.questionCount
    : inspection.template?.sections.reduce((sum, section) => sum + section.questions.length, 0) ?? 0;
  const liveUnboundAnswered = liveChecklist
    ? Object.entries(questionWorkflow).filter(
        ([key, wf]) => key.startsWith("live-") && (Boolean(wf?.surveyStatus) || typeof wf?.score === "number")
      ).length
    : 0;
  const liveTotal = liveChecklist ? templateQuestionCount : progressBase.totalQuestions;
  const liveAnswered = progressBase.answeredQuestions + liveUnboundAnswered;
  const progress = {
    ...progressBase,
    answeredQuestions: liveAnswered,
    totalQuestions: liveTotal,
    completionPct: liveTotal > 0 ? Math.round((liveAnswered / liveTotal) * 100) : 0,
  };
  const concentratedQuestions = liveChecklist
    ? liveSections.flatMap((section) =>
        section.subsections.flatMap((subsection) => subsection.questions.filter((question) => question.isCicCandidate))
      )
    : questions.filter((question) => question.isCicCandidate);
  const sectionNavigation = liveChecklist
    ? liveSections.map((section, index) => ({
        sectionId: section.id,
        id: `section-${index + 1}-${slugify(section.title)}`,
        title: section.title,
        questionCount: section.summary?.questionCount ?? 0,
        mandatoryCount: section.subsections.reduce(
          (sum, subsection) => sum + (subsection.rating?.mandatoryQuestions ?? 0),
          0
        ),
      }))
    : inspection.template?.sections.map((section, index) => ({
        sectionId: section.id,
        id: `section-${index + 1}-${slugify(section.title)}`,
        title: section.title,
        questionCount: section.questions.length,
        mandatoryCount: section.questions.filter((question) => question.isMandatory).length,
      })) ?? [];
  const dbQuestionByPrompt = new Map(questions.map((question) => [normalizeLookupKey(question.prompt), question]));
  const dbQuestionByCode = new Map(
    questions
      .filter((question) => Boolean(question.code))
      .map((question) => [normalizeLookupKey(question.code), question])
  );
  const activePane = normalizeInspectionPane(pane);
  const selectedSectionId =
    section && sectionNavigation.some((item) => item.sectionId === section)
      ? section
      : sectionNavigation[0]?.sectionId ?? null;
  const liveSelectedSection = liveChecklist
    ? liveSections.find((item) => item.id === selectedSectionId) ?? liveSections[0] ?? null
    : null;
  const legacySelectedSection = !liveChecklist
    ? inspection.template?.sections.find((item) => item.id === selectedSectionId) ?? inspection.template?.sections[0] ?? null
    : null;
  const selectedSection = liveSelectedSection ?? legacySelectedSection;

  const narrativeMetadata =
    inspection.metadata && typeof inspection.metadata === "object" && !Array.isArray(inspection.metadata)
      ? (inspection.metadata as Record<string, unknown>)
      : {};
  const activityItems = buildInspectionActivity(inspection);
  const vesselProfile = buildVesselProfile(inspection.vessel);
  const selectedSectionQuery = selectedSectionId ? `&section=${selectedSectionId}` : "";
  const historyHref = `/inspections?scope=history&vesselId=${inspection.vesselId}`;
  const closeHref = `/inspections/${inspection.id}?pane=${activePane}${selectedSectionQuery}`;

  const saveAnswers = saveInspectionAnswersAction.bind(null, inspection.id);
  const saveHeader = saveInspectionHeaderAction.bind(null, inspection.id);
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

  const pendingCorrectiveActions = inspection.findings
    .flatMap((finding) => finding.correctiveActions)
    .filter((action) => ["OPEN", "IN_PROGRESS", "REJECTED"].includes(action.status)).length;

  const approvedSignOffs = inspection.signOffs.filter((item) => item.approved);
  const refNo = inspection.externalReference ?? inspection.title;

  // Finding question panel data — support both DB question IDs and live-* IDs
  const findingQuestion = findingQ
    ? questions.find((q) => q.id === findingQ) ?? null
    : null;
  const allLiveQuestions = liveChecklist
    ? liveSections.flatMap((s: any) => s.subsections.flatMap((ss: any) => ss.questions))
    : [];
  const findingLiveQuestion = findingQ && !findingQuestion
    ? (allLiveQuestions.find((q: any) => `live-${q.id}` === findingQ) ?? null)
    : null;
  const findingPanelPrompt = findingQuestion?.prompt ?? (findingLiveQuestion as any)?.prompt ?? "";
  const findingPanelCode = findingQuestion?.code ?? (findingLiveQuestion as any)?.code ?? "";

  const isInternalAudit = inspection.inspectionType.category === "INTERNAL";
  const isAuditCategory = isInternalAudit || inspection.inspectionType.category === "AUDIT";

  return (
    <div className="page-stack">
      {/* ── Inspection topbar ── */}
      <div className="panel panel-elevated" style={{ padding: 0, overflow: "hidden" }}>
        <div className="vir-topbar">
          <div className="vir-topbar-left">
            <Link className="vir-topbar-back" href={historyHref}>← Register</Link>
            <span className="vir-topbar-divider">|</span>
            <span className="vir-topbar-vessel">{inspection.vessel.name}</span>
            <span className="vir-topbar-divider">|</span>
            <span className="vir-topbar-refno">{refNo}</span>
            <span className="vir-topbar-divider">|</span>
            <span
              className={`chip ${toneForInspectionStatus(inspection.status)}`}
              style={{ fontSize: "0.68rem", padding: "2px 7px", borderRadius: "4px" }}
            >
              {inspectionStatusLabel[inspection.status]}
            </span>
            {approvedSignOffs.length > 0 ? (
              <span className="vir-topbar-approver">
                ({approvedSignOffs.map((s) => s.actorName).filter(Boolean).join(", ")})
              </span>
            ) : null}
          </div>
          <div className="vir-topbar-right">
            <div className="vir-topbar-progress-wrap">
              <div className="vir-progress-track">
                <div className="vir-progress-fill" style={{ width: `${progress.completionPct}%` }} />
              </div>
              <span className="vir-topbar-pct">{progress.completionPct}%</span>
            </div>
            {isVesselSession(session) && (inspection.status === "DRAFT" || inspection.status === "RETURNED") ? (
              <form action={updateInspectionStatusAction.bind(null, inspection.id, "SUBMITTED")}>
                <SubmitButton className="btn btn-compact" style={{ fontSize: "0.74rem", padding: "0.26rem 0.6rem" }}>
                  Send for approval
                </SubmitButton>
              </form>
            ) : null}
            {isOfficeSession(session) && (inspection.status === "DRAFT" || inspection.status === "RETURNED") ? (
              <form action={updateInspectionStatusAction.bind(null, inspection.id, "SUBMITTED")}>
                <SubmitButton className="btn btn-compact" style={{ fontSize: "0.74rem", padding: "0.26rem 0.6rem" }}>
                  Submit for review
                </SubmitButton>
              </form>
            ) : null}
            {isVesselSession(session) && inspection.status === "SHORE_REVIEWED" ? (
              <form action={addSignOff}>
                <input name="stage" type="hidden" value="FINAL_ACKNOWLEDGEMENT" />
                <input name="approved" type="hidden" value="YES" />
                <input name="comment" type="hidden" value="Acknowledged by vessel." />
                <SubmitButton className="btn btn-compact" style={{ fontSize: "0.74rem", padding: "0.26rem 0.6rem" }}>
                  Acknowledge
                </SubmitButton>
              </form>
            ) : null}
            {isOfficeSession(session) && inspection.status === "SUBMITTED" ? (
              <>
                <form action={updateInspectionStatusAction.bind(null, inspection.id, "RETURNED")}>
                  <SubmitButton className="btn-danger btn-compact" style={{ fontSize: "0.74rem", padding: "0.26rem 0.6rem" }}>
                    Return
                  </SubmitButton>
                </form>
                <form action={updateInspectionStatusAction.bind(null, inspection.id, "SHORE_REVIEWED")}>
                  <SubmitButton className="btn-secondary btn-compact" style={{ fontSize: "0.74rem", padding: "0.26rem 0.6rem" }}>
                    Approve
                  </SubmitButton>
                </form>
              </>
            ) : null}
            {isOfficeSession(session) && inspection.status === "SHORE_REVIEWED" ? (
              <form action={updateInspectionStatusAction.bind(null, inspection.id, "CLOSED")}>
                <SubmitButton
                  className="btn btn-compact"
                  confirmMessage="Close Inspection after all reviews and sign-offs are complete. Continue?"
                  style={{ fontSize: "0.74rem", padding: "0.26rem 0.6rem" }}
                >
                  Close Inspection
                </SubmitButton>
              </form>
            ) : null}
            <Link
              className={`vir-topbar-icon-btn${activePane === "questionnaire" ? " vir-topbar-icon-btn-active" : ""}`}
              href={`/inspections/${inspection.id}?pane=questionnaire${selectedSectionQuery}`}
              scroll={false}
              title="Checklist"
            >
              <Grid2x2 size={15} />
            </Link>
            <Link
              className={`vir-topbar-icon-btn${activePane === "report" ? " vir-topbar-icon-btn-active" : ""}`}
              href={`/inspections/${inspection.id}?pane=report`}
              scroll={false}
              title="Report view"
            >
              <AlignJustify size={15} />
            </Link>
            <a
              className="vir-topbar-icon-btn"
              href={`/api/reports/inspection/${inspection.id}/pdf?variant=detailed`}
              title="Download PDF"
            >
              <FileText size={15} />
            </a>
          </div>
        </div>

        {/* Secondary navigation tabs */}
        <div className="vir-pane-tabs">
          {[
            { id: "details", label: "Report Details" },
            { id: "findings", label: `Findings (${inspection.findings.length})` },
            { id: "evidence", label: `Evidence (${inspection.photos.length})` },
            { id: "signoff", label: `Sign-off (${inspection.signOffs.length})` },
            ...(isAuditCategory ? [{ id: "certificates", label: "Certificates" }] : []),
            ...(isAuditCategory ? [{ id: "narrative", label: "Narrative" }] : []),
          ].map((item) => (
            <Link
              className={`vir-pane-tab ${activePane === item.id ? "vir-pane-tab-active" : ""}`}
              href={`/inspections/${inspection.id}?pane=${item.id}${selectedSectionQuery}`}
              key={item.id}
              scroll={false}
            >
              {item.label}
            </Link>
          ))}
        </div>
      </div>

      {/* ── Error banner ── */}
      {error === "mandatory-incomplete" ? (
        <div className="sync-banner" style={{ borderColor: "var(--color-danger, #e53935)", background: "rgba(229,57,53,0.06)", color: "var(--color-danger, #c62828)", fontWeight: 600 }}>
          Not all mandatory questions have been answered. Complete all mandatory items before submitting for review.
        </div>
      ) : null}

      {/* ── Metrics strip ── */}
      <section className="erp-metrics-grid">
        <MetricBox label="Completion" value={`${progress.completionPct}%`} note={`${progress.answeredQuestions}/${progress.totalQuestions} answered`} />
        <MetricBox label="Mandatory" value={`${progress.answeredMandatory}/${progress.mandatoryQuestions}`} note={`${progress.mandatoryPct}% coverage`} />
        <MetricBox
          label="Condition"
          value={inspection.conditionScore !== null && inspection.conditionScore !== undefined ? `${inspection.conditionScore}%` : score.rawAverage !== null ? `${Math.round(score.rawAverage)}%` : "n/a"}
          note="Derived from scored answers"
        />
        <MetricBox label="Readiness" value={score.finalScore !== null ? `${score.finalScore}` : "n/a"} note={`Avg ${score.rawAverage ?? "—"} / penalty ${score.penaltyPoints}`} />
        <MetricBox label="Open findings" value={`${inspection.findings.filter((f) => f.status !== "CLOSED").length}`} note={`${inspection.ncCount} NC / ${inspection.obsCount} Obs`} />
        <MetricBox label="Pending CAR" value={`${pendingCorrectiveActions}`} note="Open or in progress" />
        <MetricBox label="Sign-offs" value={`${approvedSignOffs.length}`} note="Approved workflow records" />
        <MetricBox label="Evidence" value={`${inspection.photos.length}`} note="Synced photo records" />
      </section>

      {/* ── PANE: Report Details ── */}
      {activePane === "details" ? (
        <div className="vir-details-pane panel panel-elevated" style={{ padding: 0 }}>
          {/* Vessel Particulars */}
          <div className="vir-report-section">
            <div className="vir-report-section-title">Vessel Particulars</div>
            <div className="vir-detail-grid">
              <VirField label="Vessel Name" value={inspection.vessel.name} />
              <VirField label="IMO Number" value={inspection.vessel.imoNumber ?? "—"} />
              <VirField label="Flag Registry" value={inspection.vessel.flag ?? "—"} />
              <VirField label="Vessel Type" value={inspection.vessel.vesselType ?? "—"} />
              <VirField label="Fleet" value={inspection.vessel.fleet ?? "—"} />
              {vesselProfile.principalParticulars.slice(0, 4).map((item) => (
                <VirField key={item.label} label={item.label} value={item.value} />
              ))}
            </div>
          </div>

          {/* Internal Audit Inspection */}
          <div className="vir-report-section">
            <div className="vir-report-section-title">Inspection Details</div>
            <form action={saveHeader}>
              <div className="vir-detail-grid" style={{ marginBottom: "0.8rem" }}>
                <VirField label="Vessel Name" value={inspection.vessel.name} />
                <VirField label="Audit Type" value={inspection.inspectionType.name} />
                <VirField label="Audit From Date" value={fmtDate.format(inspection.inspectionDate)} />
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Audit From Time</span>
                  <input
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.auditFromTime === "string" ? narrativeMetadata.auditFromTime : ""}
                    disabled={!canEditInspection}
                    name="auditFromTime"
                    placeholder="e.g. 09:00 AM"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                    type="text"
                  />
                </div>
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Audit To Date</span>
                  <input
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.auditEndDate === "string" ? narrativeMetadata.auditEndDate : ""}
                    disabled={!canEditInspection}
                    name="auditEndDate"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                    type="date"
                  />
                </div>
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Audit To Time</span>
                  <input
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.auditToTime === "string" ? narrativeMetadata.auditToTime : ""}
                    disabled={!canEditInspection}
                    name="auditToTime"
                    placeholder="e.g. 05:00 PM"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                    type="text"
                  />
                </div>
                <VirField label="Place of Audit" value={[inspection.port, inspection.country].filter(Boolean).join(", ") || "—"} />
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Port of Disembarkation</span>
                  <input
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.portOfDisembarkation === "string" ? narrativeMetadata.portOfDisembarkation : ""}
                    disabled={!canEditInspection}
                    name="portOfDisembarkation"
                    placeholder="Port name"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                    type="text"
                  />
                </div>
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Audit Based on Incidents?</span>
                  <select
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.auditBasedOnIncidents === "string" ? narrativeMetadata.auditBasedOnIncidents : "No"}
                    disabled={!canEditInspection}
                    name="auditBasedOnIncidents"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Audit Based on External?</span>
                  <select
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.auditBasedOnExternal === "string" ? narrativeMetadata.auditBasedOnExternal : "No"}
                    disabled={!canEditInspection}
                    name="auditBasedOnExternal"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                  >
                    <option value="No">No</option>
                    <option value="Yes">Yes</option>
                  </select>
                </div>
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Operations at Time of Inspection</span>
                  <input
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.operationsAtTime === "string" ? narrativeMetadata.operationsAtTime : ""}
                    disabled={!canEditInspection}
                    name="operationsAtTime"
                    placeholder="e.g. Berthing — Mooring"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                    type="text"
                  />
                </div>
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Audit Authority</span>
                  <input
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.auditAuthority === "string" ? narrativeMetadata.auditAuthority : ""}
                    disabled={!canEditInspection}
                    name="auditAuthority"
                    placeholder="e.g. MSI, BV, LR"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                    type="text"
                  />
                </div>
              </div>

              {/* Auditor Details */}
              <div className="vir-report-section-title">Auditor Details</div>
              <div className="vir-detail-grid" style={{ marginBottom: "0.8rem" }}>
                <VirField label="Auditor Name" value={inspection.inspectorName ?? "—"} />
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Qualification</span>
                  <input
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.auditorQualification === "string" ? narrativeMetadata.auditorQualification : ""}
                    disabled={!canEditInspection}
                    name="auditorQualification"
                    placeholder="e.g. Master / Internal Auditor"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                    type="text"
                  />
                </div>
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Command Experience</span>
                  <input
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.commandExperience === "string" ? narrativeMetadata.commandExperience : ""}
                    disabled={!canEditInspection}
                    name="commandExperience"
                    placeholder="e.g. 50 months"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                    type="text"
                  />
                </div>
                <div className="vir-detail-field">
                  <span className="vir-detail-label">Audit Experience</span>
                  <input
                    className="field-input"
                    defaultValue={typeof narrativeMetadata.auditExperience === "string" ? narrativeMetadata.auditExperience : ""}
                    disabled={!canEditInspection}
                    name="auditExperience"
                    placeholder="e.g. 24 months"
                    style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                    type="text"
                  />
                </div>
              </div>

              {/* Auditees */}
              <div className="vir-report-section-title">Auditees</div>
              <table className="vir-crew-table" style={{ marginBottom: "0.5rem" }}>
                <thead>
                  <tr>
                    <th style={{ width: "40px" }}>Sl.no</th>
                    <th>Crew Name</th>
                    <th>Rank</th>
                  </tr>
                </thead>
                <tbody>
                  {parseCrewList(narrativeMetadata.auditees).map((crew, i) => (
                    <tr key={i}>
                      <td>{i + 1}</td>
                      <td>{crew.name}</td>
                      <td>{crew.rank}</td>
                    </tr>
                  ))}
                  {parseCrewList(narrativeMetadata.auditees).length === 0 ? (
                    <tr><td colSpan={3} style={{ color: "var(--color-ink-soft)", fontStyle: "italic", textAlign: "center" }}>No auditees added yet</td></tr>
                  ) : null}
                </tbody>
              </table>
              {canEditInspection ? (
                <div className="form-grid" style={{ marginBottom: "0.8rem" }}>
                  <div className="field-wide">
                    <label htmlFor="auditees">Auditees (one per line: Name, Rank)</label>
                    <textarea
                      defaultValue={typeof narrativeMetadata.auditees === "string" ? narrativeMetadata.auditees : ""}
                      id="auditees"
                      name="auditees"
                      placeholder={"John Smith, Chief Officer\nSantos Cruz, 2nd Engineer"}
                      rows={4}
                    />
                  </div>
                </div>
              ) : null}

              {/* Opening / Closing Meeting Attendees */}
              <div className="vir-report-section-title">Opening Meeting Attendees</div>
              {canEditInspection ? (
                <div className="form-grid" style={{ marginBottom: "0.8rem" }}>
                  <div className="field-wide">
                    <textarea
                      defaultValue={typeof narrativeMetadata.openingMeetingAttendees === "string" ? narrativeMetadata.openingMeetingAttendees : ""}
                      name="openingMeetingAttendees"
                      placeholder={"John Smith, Chief Officer\nSantos Cruz, 2nd Engineer"}
                      rows={3}
                    />
                  </div>
                </div>
              ) : (
                <table className="vir-crew-table" style={{ marginBottom: "0.5rem" }}>
                  <thead><tr><th style={{ width: "40px" }}>Sl.no</th><th>Crew Name</th><th>Rank</th></tr></thead>
                  <tbody>
                    {parseCrewList(narrativeMetadata.openingMeetingAttendees).map((c, i) => (
                      <tr key={i}><td>{i + 1}</td><td>{c.name}</td><td>{c.rank}</td></tr>
                    ))}
                  </tbody>
                </table>
              )}

              <div className="vir-report-section-title">Closing Meeting Attendees</div>
              {canEditInspection ? (
                <div className="form-grid" style={{ marginBottom: "0.8rem" }}>
                  <div className="field-wide">
                    <textarea
                      defaultValue={typeof narrativeMetadata.closingMeetingAttendees === "string" ? narrativeMetadata.closingMeetingAttendees : ""}
                      name="closingMeetingAttendees"
                      placeholder={"John Smith, Chief Officer\nSantos Cruz, 2nd Engineer"}
                      rows={3}
                    />
                  </div>
                </div>
              ) : null}

              {/* Summary */}
              <div className="vir-report-section-title">Summary</div>
              <div className="form-grid" style={{ marginBottom: "0.8rem" }}>
                <div className="field-wide">
                  <textarea
                    defaultValue={inspection.summary ?? ""}
                    disabled={!canEditInspection}
                    name="summary"
                    placeholder="Overall inspection summary and key observations..."
                    rows={4}
                  />
                </div>
              </div>

              {canEditInspection ? (
                <div style={{ display: "flex", justifyContent: "flex-end", padding: "0.5rem 0" }}>
                  <SubmitButton className="btn">Save report details</SubmitButton>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}

      {/* ── PANE: Checklist (Synergy split-pane table) ── */}
      {activePane === "questionnaire" ? (
        <div className="checklist-shell">
          {/* LEFT: Chapter tree */}
          <div className="checklist-tree">
            <div className="checklist-tree-header">
              <div style={{ fontSize: "0.88rem", fontWeight: 800 }}>
                {progress.completionPct}% COMPLETED
              </div>
              <div style={{ fontSize: "0.76rem", opacity: 0.85 }}>
                {progress.answeredQuestions} / {templateQuestionCount}
              </div>
              <div className="checklist-tree-progress-bar">
                <div className="checklist-tree-progress-fill" style={{ width: `${progress.completionPct}%` }} />
              </div>
            </div>
            <div className="checklist-tree-tabs">
              <span className="checklist-tree-tab checklist-tree-tab-active">Chapter</span>
              <span className="checklist-tree-tab">Location</span>
            </div>
            {sectionNavigation.map((sectionItem) => {
              const isActive = selectedSectionId === sectionItem.sectionId;
              const liveSection = liveChecklist
                ? liveSections.find((s) => s.id === sectionItem.sectionId)
                : null;
              const sectionBindings = liveSection
                ? collectSectionQuestionBindings(liveSection, dbQuestionByPrompt, dbQuestionByCode, answerMap)
                : [];
              const answeredCount = liveChecklist
                ? sectionBindings.filter((b) => {
                    if (isSavedAnswer(b.answer)) return true;
                    if (!b.bindingQuestion) {
                      const liveWf = questionWorkflow[`live-${(b.question as { id: string }).id}`];
                      return Boolean(liveWf?.surveyStatus) || typeof liveWf?.score === "number";
                    }
                    return false;
                  }).length
                : (inspection.template?.sections
                    .find((s) => s.id === sectionItem.sectionId)
                    ?.questions.filter((q) => isSavedAnswer(answerMap.get(q.id))).length ?? 0);
              const isComplete = answeredCount >= sectionItem.questionCount && sectionItem.questionCount > 0;

              return (
                <div className="checklist-tree-chapter" key={sectionItem.sectionId}>
                  <Link
                    className={`checklist-tree-chapter-link ${isActive ? "checklist-tree-chapter-link-active" : ""}`}
                    href={`/inspections/${inspection.id}?pane=questionnaire&section=${sectionItem.sectionId}`}
                    scroll={false}
                  >
                    <span style={{ flex: 1 }}>{sectionItem.title}</span>
                    <span className="checklist-tree-chapter-count">
                      {isComplete ? <span className="checklist-tree-check">✔</span> : null}
                      {answeredCount}/{sectionItem.questionCount}
                    </span>
                  </Link>
                  {isActive && liveSection ? (
                    <div className="checklist-tree-sub">
                      {liveSection.subsections.map((sub) => {
                        const subAnswered = sub.questions.filter((q) => {
                          const bq = findBoundQuestion(q, dbQuestionByPrompt, dbQuestionByCode);
                          if (bq) return isSavedAnswer(answerMap.get(bq.id));
                          const liveWf = questionWorkflow[`live-${(q as { id: string }).id}`];
                          return Boolean(liveWf?.surveyStatus) || typeof liveWf?.score === "number";
                        }).length;
                        const subTotal = sub.questions.length;
                        return (
                          <div className="checklist-tree-sub-link" key={sub.id}>
                            <span>{sub.title}</span>
                            <span style={{ fontSize: "0.72rem", color: "var(--color-ink-soft)" }}>
                              ({subAnswered}/{subTotal})
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  ) : isActive && legacySelectedSection ? null : null}
                </div>
              );
            })}
          </div>

          {/* RIGHT: Question table */}
          <div className="checklist-main">
            <div className="checklist-notes-bar">
              Note: T – Tested &nbsp;|&nbsp; I – Inspected &nbsp;|&nbsp; NS – Not Sighted &nbsp;|&nbsp; NA – Not Applicable &nbsp;|&nbsp;
              Score: 1 – Unsatisfactory / 2 – Fair / 3 – Good / 4 – Very Good / 5 – Excellent
            </div>

            {concentratedQuestions.length > 0 ? (
              <div style={{ padding: "0.4rem 0.85rem", background: "var(--color-amber-soft)", borderBottom: "1px solid var(--color-border)", fontSize: "0.78rem", color: "var(--color-amber)" }}>
                ⚡ {concentratedQuestions.length} concentrated inspection items detected
              </div>
            ) : null}

            {selectedSection ? (
              <div className="checklist-section-label">
                {selectedSection.title}
              </div>
            ) : null}

            <form action={saveAnswers} style={{ display: "contents" }}>
              <div className="checklist-table-scroll">
                <table className="vir-q-table">
                  <thead>
                    <tr>
                      <th style={{ width: "26px" }}>S.No</th>
                      <th style={{ width: "26px" }}>⊕</th>
                      <th className="th-left">QUESTION</th>
                      <th className="th-left" style={{ minWidth: "100px" }}>RESPONSE</th>
                      <th style={{ width: "28px" }}>T</th>
                      <th style={{ width: "28px" }}>I</th>
                      <th style={{ width: "28px" }}>NS</th>
                      <th style={{ width: "28px" }}>NA</th>
                      <th style={{ width: "58px" }}>SCORE</th>
                      <th style={{ width: "76px" }}>FINDING</th>
                      <th>COMMENTS</th>
                      <th style={{ width: "28px" }}>ACT</th>
                    </tr>
                  </thead>
                  <tbody>
                    {!selectedSection ? (
                      <tr><td colSpan={12} style={{ textAlign: "center", padding: "2rem", color: "var(--color-ink-soft)" }}>No section selected</td></tr>
                    ) : liveChecklist && liveSelectedSection ? (
                      liveSelectedSection.subsections.map((subsection: any) => (
                        <>
                          <tr className="checklist-subsection-label-row" key={`sub-${subsection.id}`}>
                            <td colSpan={12}>{subsection.title}{subsection.location ? ` — ${subsection.location}` : ""}</td>
                          </tr>
                          {subsection.questions.map((question: LiveChecklistQuestion, qi: number) => {
                            const bindingQuestion = findBoundQuestion(question, dbQuestionByPrompt, dbQuestionByCode);
                            const answer = bindingQuestion ? answerMap.get(bindingQuestion.id) : undefined;
                            const surveyStatus = answer?.surveyStatus ?? null;
                            const manualScore = answer?.score ?? null;
                            const isCic = question.isCicCandidate ?? bindingQuestion?.isCicCandidate ?? false;
                            const hasFinding = inspection.findings.some((f) => f.questionId === bindingQuestion?.id);
                            const questionKey = bindingQuestion?.id ?? `live-${question.id}`;
                            const guidanceText = question.guidanceNotes
                              ? stripInlineHtml(question.guidanceNotes).slice(0, 120)
                              : bindingQuestion?.helpText?.slice(0, 120) ?? null;

                            const liveWorkflow = questionWorkflow[questionKey];
                            const effectiveSurveyStatus = surveyStatus ?? liveWorkflow?.surveyStatus ?? null;
                            const effectiveScore = manualScore ?? liveWorkflow?.score ?? null;

                            return (
                              <tr className={isCic ? "cic-row" : ""} key={questionKey}>
                                <td className="td-no">{qi + 1}</td>
                                <td className="td-guidance">
                                  {guidanceText ? (
                                    <span className="guidance-btn" title={guidanceText}>?</span>
                                  ) : null}
                                </td>
                                <td className="td-question">
                                  {question.code ? <span style={{ fontWeight: 700, color: "var(--color-blue)", fontSize: "0.72rem", marginRight: "0.3rem" }}>{question.code}</span> : null}
                                  {question.prompt}
                                  {isCic ? <span className="chip chip-warning" style={{ marginLeft: "0.3rem", fontSize: "0.62rem", padding: "1px 5px" }}>CIC</span> : null}
                                </td>
                                <td className="td-response" style={{ minWidth: "80px" }}>—</td>
                                {(["T", "I", "NS", "NA"] as const).map((status) => (
                                  <td className="td-checkbox survey-radio" key={status}>
                                    <input
                                      defaultChecked={effectiveSurveyStatus === status}
                                      name={`status:${questionKey}`}
                                      type="radio"
                                      value={status}
                                    />
                                  </td>
                                ))}
                                <td className="td-score">
                                  <select
                                    className="score-select"
                                    defaultValue={effectiveScore !== null ? String(effectiveScore) : ""}
                                    name={`score:${questionKey}`}
                                  >
                                    <option value="">—</option>
                                    <option value="1">1</option>
                                    <option value="2">2</option>
                                    <option value="3">3</option>
                                    <option value="4">4</option>
                                    <option value="5">5</option>
                                  </select>
                                </td>
                                <td className="td-finding">
                                  <div className="finding-radio-group">
                                    <Link
                                      className={`finding-yn-btn${hasFinding ? " finding-yn-btn-y-active" : ""}`}
                                      href={`/inspections/${inspection.id}?pane=questionnaire&section=${selectedSectionId}&findingQ=${questionKey}`}
                                      scroll={false}
                                      title="Yes — raise a finding"
                                    >
                                      Y
                                    </Link>
                                    <Link
                                      className={`finding-yn-btn${!hasFinding ? " finding-yn-btn-n-active" : ""}`}
                                      href={`/inspections/${inspection.id}?pane=questionnaire&section=${selectedSectionId}`}
                                      scroll={false}
                                      title="No finding"
                                    >
                                      N
                                    </Link>
                                  </div>
                                </td>
                                <td className="td-comments">
                                  <input
                                    className="comment-input"
                                    defaultValue={answer?.comment ?? liveWorkflow?.comment ?? ""}
                                    name={`comment:${questionKey}`}
                                    placeholder="Comment..."
                                    type="text"
                                  />
                                </td>
                                <td className="td-action">
                                  <Link
                                    href={`/inspections/${inspection.id}?pane=questionnaire&section=${selectedSectionId}&findingQ=${questionKey}`}
                                    scroll={false}
                                    style={{ color: "var(--color-blue)", fontSize: "0.85rem" }}
                                    title="Add / view finding"
                                  >
                                    ✏
                                  </Link>
                                </td>
                              </tr>
                            );
                          })}
                        </>
                      ))
                    ) : !liveChecklist && legacySelectedSection ? (
                      [...(legacySelectedSection as any).questions]
                        .sort((a, b) => Number(b.isCicCandidate) - Number(a.isCicCandidate) || a.sortOrder - b.sortOrder)
                        .map((question, qi) => {
                          const answer = answerMap.get(question.id);
                          const surveyStatus = answer?.surveyStatus ?? null;
                          const manualScore = answer?.score ?? null;
                          const hasFinding = inspection.findings.some((f) => f.questionId === question.id);
                          return (
                            <tr className={question.isCicCandidate ? "cic-row" : ""} key={question.id}>
                              <td className="td-no">{qi + 1}</td>
                              <td className="td-guidance">
                                {question.helpText ? (
                                  <span className="guidance-btn" title={question.helpText}>?</span>
                                ) : null}
                              </td>
                              <td className="td-question">
                                <span style={{ fontWeight: 700, color: "var(--color-blue)", fontSize: "0.72rem", marginRight: "0.3rem" }}>{question.code}</span>
                                {question.prompt}
                                {question.isCicCandidate ? <span className="chip chip-warning" style={{ marginLeft: "0.3rem", fontSize: "0.62rem", padding: "1px 5px" }}>CIC</span> : null}
                              </td>
                              <td className="td-response" style={{ minWidth: "100px" }}>
                                {question.responseType === "YES_NO_NA" ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    {(["YES", "NO", "NA"] as const).map((v) => (
                                      <label key={v} style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "0.72rem" }}>
                                        <input defaultChecked={answer?.answerText === v} disabled={!canEditInspection} name={`q:${question.id}`} type="radio" value={v} />
                                        {v}
                                      </label>
                                    ))}
                                  </div>
                                ) : question.responseType === "TEXT" ? (
                                  <input className="comment-input" defaultValue={answer?.answerText ?? ""} disabled={!canEditInspection} name={`q:${question.id}`} placeholder="Enter text" style={{ width: "100%" }} type="text" />
                                ) : question.responseType === "NUMBER" || question.responseType === "SCORE" ? (
                                  <input defaultValue={answer?.answerNumber !== null && answer?.answerNumber !== undefined ? String(answer.answerNumber) : ""} disabled={!canEditInspection} name={`q:${question.id}`} style={{ width: "70px" }} type="number" />
                                ) : question.responseType === "DATE" ? (
                                  <input defaultValue={answer?.answerDate instanceof Date ? answer.answerDate.toISOString().slice(0, 10) : ""} disabled={!canEditInspection} name={`q:${question.id}`} type="date" />
                                ) : question.responseType === "SINGLE_SELECT" ? (
                                  <select className="score-select" defaultValue={answer?.answerText ?? ""} disabled={!canEditInspection} name={`q:${question.id}`} style={{ minWidth: "90px" }}>
                                    <option value="">—</option>
                                    {question.options.map((o: any) => (
                                      <option key={o.value} value={o.value}>{o.label}</option>
                                    ))}
                                  </select>
                                ) : question.responseType === "MULTI_SELECT" ? (
                                  <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                                    {question.options.map((o: any) => {
                                      const selected = answer?.selectedOptions;
                                      const isChecked = Array.isArray(selected) && (selected as string[]).includes(o.value);
                                      return (
                                        <label key={o.value} style={{ display: "flex", alignItems: "center", gap: "3px", fontSize: "0.72rem" }}>
                                          <input defaultChecked={isChecked} disabled={!canEditInspection} name={`q:${question.id}`} type="checkbox" value={o.value} />
                                          {o.label}
                                        </label>
                                      );
                                    })}
                                  </div>
                                ) : null}
                              </td>
                              {(["T", "I", "NS", "NA"] as const).map((status) => (
                                <td className="td-checkbox survey-radio" key={status}>
                                  <input
                                    defaultChecked={surveyStatus === status}
                                    disabled={!canEditInspection}
                                    name={`status:${question.id}`}
                                    type="radio"
                                    value={status}
                                  />
                                </td>
                              ))}
                              <td className="td-score">
                                <select
                                  className="score-select"
                                  defaultValue={manualScore !== null ? String(manualScore) : ""}
                                  disabled={!canEditInspection}
                                  name={`score:${question.id}`}
                                >
                                  <option value="">—</option>
                                  <option value="1">1</option>
                                  <option value="2">2</option>
                                  <option value="3">3</option>
                                  <option value="4">4</option>
                                  <option value="5">5</option>
                                </select>
                              </td>
                              <td className="td-finding">
                                <div className="finding-radio-group">
                                  <Link
                                    className={`finding-yn-btn${hasFinding ? " finding-yn-btn-y-active" : ""}`}
                                    href={`/inspections/${inspection.id}?pane=questionnaire&section=${selectedSectionId}&findingQ=${question.id}`}
                                    scroll={false}
                                    title="Yes — raise a finding"
                                  >
                                    Y
                                  </Link>
                                  <Link
                                    className={`finding-yn-btn${!hasFinding ? " finding-yn-btn-n-active" : ""}`}
                                    href={`/inspections/${inspection.id}?pane=questionnaire&section=${selectedSectionId}`}
                                    scroll={false}
                                    title="No finding"
                                  >
                                    N
                                  </Link>
                                </div>
                              </td>
                              <td className="td-comments">
                                <input
                                  className="comment-input"
                                  defaultValue={answer?.comment ?? ""}
                                  disabled={!canEditInspection}
                                  name={`comment:${question.id}`}
                                  placeholder="Comment..."
                                  type="text"
                                />
                              </td>
                              <td className="td-action">
                                <Link
                                  href={`/inspections/${inspection.id}?pane=questionnaire&section=${selectedSectionId}&findingQ=${question.id}`}
                                  scroll={false}
                                  style={{ color: "var(--color-blue)", fontSize: "0.85rem" }}
                                  title="Add / view finding"
                                >
                                  ✏
                                </Link>
                              </td>
                            </tr>
                          );
                        })
                    ) : null}
                  </tbody>
                </table>
              </div>

              {canEditInspection ? (
                <div className="checklist-mark-done">
                  <span className="small-text" style={{ color: "var(--color-ink-soft)" }}>
                    Save answers for <strong>{selectedSection?.title}</strong>
                  </span>
                  <SubmitButton className="btn">Mark as done</SubmitButton>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}

      {/* ── PANE: Findings ── */}
      {activePane === "findings" ? (
        <section className="panel panel-elevated" id="findings">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Findings and corrective flow</h3>
              <p className="panel-subtitle">
                Vessel progresses findings; office verifies and closes them.
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
                    {question.code} / {question.prompt.slice(0, 80)}
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
              <input id="title" name="title" placeholder="Finding title" required />
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
              <input id="vesselResponse" name="vesselResponse" placeholder="Immediate action taken" />
            </div>
            <div className="field-wide">
              <label style={{ fontSize: "0.8rem" }}>Attachments (images)</label>
              <input accept=".png,.jpg,.jpeg,.gif,.tif,.tiff,.webp,.heic" multiple name="attachments" type="file" style={{ fontSize: "0.8rem" }} />
            </div>
            <div className="field-wide">
              <SubmitButton className="btn">Raise finding</SubmitButton>
            </div>
          </form>

          <div className="stack-list">
            {inspection.findings.length === 0 ? (
              <div className="empty-state">No findings have been raised on this inspection yet.</div>
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
                        <div className="small-text">Linked to {finding.question.code} / {finding.question.prompt}</div>
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

                  {(() => {
                    const findingPhotos = inspection.photos.filter((p) => p.findingId === finding.id);
                    return findingPhotos.length > 0 ? (
                      <div className="evidence-gallery" style={{ marginTop: "0.75rem", marginBottom: "0.5rem" }}>
                        {findingPhotos.map((photo) => (
                          <div className="evidence-card" key={photo.id}>
                            <div className="evidence-thumb">
                              {photo.contentType?.startsWith("image/") ? (
                                <img
                                  alt={photo.caption ?? photo.fileName ?? "Finding evidence"}
                                  src={normalizeRemoteAssetUrl(photo.url)}
                                />
                              ) : (
                                <a
                                  className="evidence-file-tile"
                                  href={normalizeRemoteAssetUrl(photo.url)}
                                  rel="noreferrer"
                                  target="_blank"
                                >
                                  {photo.fileName?.split(".").pop()?.toUpperCase() ?? "FILE"}
                                </a>
                              )}
                            </div>
                            <div className="small-text">{photo.caption ?? photo.fileName ?? "Finding evidence"}</div>
                          </div>
                        ))}
                      </div>
                    ) : null;
                  })()}

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
                        <textarea id={`actionText-${finding.id}`} name="actionText" placeholder="Describe the corrective action to close this finding." />
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
      ) : null}

      {/* ── PANE: Evidence ── */}
      {activePane === "evidence" ? (
        <div id="evidence">
          <EvidenceSyncPanel
            canUpload={canEditInspection}
            existingEvidence={inspection.photos.map((photo) => ({
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
      ) : null}

      {/* ── PANE: Sign-off ── */}
      {activePane === "signoff" ? (
        <section className="panel panel-elevated" id="signoff">
          <div className="section-header">
            <div>
              <h3 className="panel-title">Sign-off trail</h3>
              <p className="panel-subtitle">Vessel submission, office review, and final acknowledgement.</p>
            </div>
          </div>

          <div className="signoff-stage-grid">
            {buildSignoffStages(inspection.signOffs, inspection.template?.workflowConfig ?? null).map((stage) => (
              <div className="list-card signoff-stage-card" key={stage.key}>
                <div className="meta-row">
                  <span className={`chip ${stage.approved ? "chip-success" : stage.present ? "chip-warning" : "chip-muted"}`}>
                    {stage.approved ? "Approved" : stage.present ? "Captured" : "Pending"}
                  </span>
                  <span className="chip chip-info">{stage.label}</span>
                </div>
                <div className="list-card-title">{stage.actor ?? "Awaiting action"}</div>
                <div className="small-text">{stage.comment ?? "No note recorded yet."}</div>
                <div className="small-text">{stage.timeLabel ?? "No timestamp yet."}</div>
              </div>
            ))}
          </div>

          <form action={addSignOff} className="form-grid" style={{ marginBottom: "1rem" }}>
            <input name="stage" type="hidden" value={isOfficeSession(session) ? "SHORE_REVIEW" : "FINAL_ACKNOWLEDGEMENT"} />
            <div className="field">
              <label htmlFor="approved">Decision</label>
              <select id="approved" name="approved">
                <option value="YES">Approved</option>
                <option value="NO">Rejected / returned</option>
              </select>
            </div>
            <div className="field-wide">
              <label htmlFor="comment">Comment</label>
              <textarea id="comment" name="comment" placeholder={isOfficeSession(session) ? "Shore review note." : "Final vessel acknowledgement."} />
            </div>
            <div className="field-wide">
              <SubmitButton className="btn-secondary">
                {isOfficeSession(session) ? "Record office sign-off" : "Record vessel acknowledgement"}
              </SubmitButton>
            </div>
          </form>

          <div className="stack-list">
            {inspection.signOffs.length === 0 ? (
              <div className="empty-state">No sign-off records captured yet.</div>
            ) : (
              inspection.signOffs.map((signOff) => (
                <div className="list-card" key={signOff.id}>
                  <div className="meta-row">
                    <span className={`chip ${signOff.approved ? "chip-success" : "chip-danger"}`}>
                      {signOff.approved ? "Approved" : "Returned"}
                    </span>
                    <span className="chip chip-info">{signOffStageLabels[signOff.stage] ?? signOff.stage.replaceAll("_", " ")}</span>
                  </div>
                  <div className="list-card-title">{signOff.actorName ?? "Unnamed actor"}</div>
                  {signOff.comment ? <p className="small-text">{signOff.comment}</p> : null}
                  <div className="small-text">{fmt.format(signOff.signedAt)}</div>
                </div>
              ))
            )}
          </div>
        </section>
      ) : null}

      {/* ── PANE: Report view ── */}
      {activePane === "report" ? (
        <div className="panel panel-elevated" style={{ padding: 0, overflow: "hidden" }}>
          <div className="vir-report-view">
            {/* Chapter Summary Table */}
            <div>
              <div className="vir-report-section-heading">Chapter Summary</div>
              <div className="table-shell" style={{ maxHeight: "none" }}>
                <table className="vir-report-chapter-table">
                  <thead>
                    <tr>
                      <th>Chapter Name</th>
                      <th>Rating</th>
                      <th style={{ textAlign: "center" }}>Findings</th>
                      <th style={{ textAlign: "center" }}>Questions</th>
                      <th style={{ textAlign: "center" }}>Completion</th>
                      <th>Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sectionNavigation.map((sectionItem) => {
                      const sectionQuestionIds = !liveChecklist
                        ? (inspection.template?.sections.find((s) => s.id === sectionItem.sectionId)?.questions.map((q) => q.id) ?? [])
                        : [];
                      const liveSection = liveChecklist ? liveSections.find((s) => s.id === sectionItem.sectionId) : null;
                      const sectionFindingCount = liveChecklist
                        ? (liveSection?.summary.totalFindings ?? 0)
                        : inspection.findings.filter((f) => f.questionId && sectionQuestionIds.includes(f.questionId)).length;
                      const sectionAnsweredCount = liveChecklist
                        ? (liveSection?.summary.answered ?? 0)
                        : sectionQuestionIds.filter((id) => answerMap.has(id)).length;
                      const completionPct = sectionItem.questionCount > 0
                        ? Math.round((sectionAnsweredCount / sectionItem.questionCount) * 100)
                        : 0;
                      const ratingLabel = sectionFindingCount === 0 ? "Good" : sectionFindingCount <= 2 ? "Medium" : "Poor";
                      const ratingClass = sectionFindingCount === 0 ? "rating-chip-good" : sectionFindingCount <= 2 ? "rating-chip-medium" : "rating-chip-poor";
                      return (
                        <tr key={sectionItem.sectionId}>
                          <td style={{ fontWeight: 600 }}>{sectionItem.title}</td>
                          <td><span className={ratingClass}>{ratingLabel}</span></td>
                          <td style={{ textAlign: "center" }}>{sectionFindingCount > 0 ? sectionFindingCount : "—"}</td>
                          <td style={{ textAlign: "center" }}>{sectionItem.questionCount}</td>
                          <td style={{ textAlign: "center" }}>
                            <div style={{ display: "flex", alignItems: "center", gap: "0.35rem", justifyContent: "center" }}>
                              <div className="hist-progress-bar-track" style={{ width: "50px" }}>
                                <div className="hist-progress-bar-fill" style={{ width: `${completionPct}%` }} />
                              </div>
                              <span style={{ fontSize: "0.7rem", color: "var(--color-ink-soft)" }}>{completionPct}%</span>
                            </div>
                          </td>
                          <td>
                            <Link
                              className="inline-link"
                              href={`/inspections/${inspection.id}?pane=questionnaire&section=${sectionItem.sectionId}`}
                              scroll={false}
                              style={{ fontSize: "0.76rem" }}
                            >
                              View checklist
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Findings Table */}
            {inspection.findings.length > 0 ? (
              <div>
                <div className="vir-report-section-heading">Findings ({inspection.findings.length})</div>
                <div className="table-shell" style={{ maxHeight: "none" }}>
                  <table className="vir-report-chapter-table">
                    <thead>
                      <tr>
                        <th style={{ width: "36px" }}>No.</th>
                        <th>Question / Finding</th>
                        <th>Type</th>
                        <th>Severity</th>
                        <th>Status</th>
                        <th>Due Date</th>
                      </tr>
                    </thead>
                    <tbody>
                      {inspection.findings.map((finding, index) => (
                        <tr key={finding.id}>
                          <td style={{ textAlign: "center", fontWeight: 700, color: "var(--color-ink-soft)" }}>{index + 1}</td>
                          <td>
                            {finding.question?.code ? (
                              <div style={{ fontSize: "0.7rem", color: "var(--color-blue)", fontWeight: 700, marginBottom: "2px" }}>
                                {finding.question.code}
                              </div>
                            ) : null}
                            <div style={{ fontWeight: 600 }}>{finding.title}</div>
                            {finding.description ? (
                              <div style={{ fontSize: "0.75rem", color: "var(--color-ink-soft)" }}>{finding.description.slice(0, 90)}{finding.description.length > 90 ? "…" : ""}</div>
                            ) : null}
                          </td>
                          <td>
                            <span className="chip chip-info" style={{ fontSize: "0.68rem" }}>
                              {finding.findingType?.replace(/_/g, " ") ?? "Observation"}
                            </span>
                          </td>
                          <td>
                            <span className={`chip ${toneForRisk(finding.severity)}`} style={{ fontSize: "0.68rem" }}>
                              {riskLabel[finding.severity]}
                            </span>
                          </td>
                          <td>
                            <span className={`chip ${toneForFindingStatus(finding.status)}`} style={{ fontSize: "0.68rem" }}>
                              {findingStatusLabel[finding.status]}
                            </span>
                          </td>
                          <td style={{ fontSize: "0.78rem", whiteSpace: "nowrap" }}>
                            {finding.dueDate ? fmt.format(finding.dueDate) : "—"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="empty-state">No findings raised on this inspection.</div>
            )}
          </div>
        </div>
      ) : null}

      {/* ── PANE: Certificates (Internal audits only) ── */}
      {activePane === "certificates" && isAuditCategory ? (
        <div className="panel panel-elevated" style={{ padding: 0, overflow: "hidden" }}>
          <div className="vir-narrative-pane">
            <form action={saveHeader}>
              <div className="vir-narrative-card">
                <div className="vir-narrative-card-header">
                  <div className="vir-narrative-card-title">Vessel Certificates — Status Register</div>
                </div>
                <div className="vir-narrative-card-body">
                  <p className="small-text" style={{ marginBottom: "1rem", color: "var(--color-ink-soft)" }}>
                    Record the current status and expiry dates of statutory and class certificates reviewed during this inspection.
                  </p>
                  <div className="table-shell" style={{ maxHeight: "none" }}>
                    <table className="table data-table">
                      <thead>
                        <tr>
                          <th>Certificate</th>
                          <th>Issue Date</th>
                          <th>Expiry Date</th>
                          <th>Status</th>
                          <th>Remarks</th>
                        </tr>
                      </thead>
                      <tbody>
                        {VESSEL_CERTIFICATES.map((cert) => {
                          const key = cert.key;
                          const issueVal = typeof narrativeMetadata[`cert_${key}_issue`] === "string" ? narrativeMetadata[`cert_${key}_issue`] as string : "";
                          const expiryVal = typeof narrativeMetadata[`cert_${key}_expiry`] === "string" ? narrativeMetadata[`cert_${key}_expiry`] as string : "";
                          const statusVal = typeof narrativeMetadata[`cert_${key}_status`] === "string" ? narrativeMetadata[`cert_${key}_status`] as string : "Valid";
                          const remarksVal = typeof narrativeMetadata[`cert_${key}_remarks`] === "string" ? narrativeMetadata[`cert_${key}_remarks`] as string : "";
                          const isExpired = expiryVal && new Date(expiryVal) < new Date();
                          const isDueSoon = expiryVal && !isExpired && new Date(expiryVal) < new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
                          const autoStatus = isExpired ? "Expired" : isDueSoon ? "Due Soon" : statusVal || "Valid";
                          return (
                            <tr key={key}>
                              <td style={{ fontWeight: 600, fontSize: "0.82rem", whiteSpace: "nowrap" }}>{cert.name}</td>
                              <td>
                                <input
                                  className="field-input"
                                  defaultValue={issueVal}
                                  disabled={!canEditInspection}
                                  name={`cert_${key}_issue`}
                                  style={{ padding: "0.2rem 0.4rem", fontSize: "0.8rem", width: "110px" }}
                                  type="date"
                                />
                              </td>
                              <td>
                                <input
                                  className="field-input"
                                  defaultValue={expiryVal}
                                  disabled={!canEditInspection}
                                  name={`cert_${key}_expiry`}
                                  style={{ padding: "0.2rem 0.4rem", fontSize: "0.8rem", width: "110px" }}
                                  type="date"
                                />
                              </td>
                              <td>
                                <select
                                  className="field-input"
                                  defaultValue={autoStatus}
                                  disabled={!canEditInspection}
                                  name={`cert_${key}_status`}
                                  style={{ padding: "0.2rem 0.4rem", fontSize: "0.8rem" }}
                                >
                                  <option value="Valid">Valid</option>
                                  <option value="Due Soon">Due Soon</option>
                                  <option value="Expired">Expired</option>
                                  <option value="Not Applicable">Not Applicable</option>
                                </select>
                              </td>
                              <td>
                                <input
                                  className="field-input"
                                  defaultValue={remarksVal}
                                  disabled={!canEditInspection}
                                  name={`cert_${key}_remarks`}
                                  placeholder="Remarks..."
                                  style={{ padding: "0.2rem 0.4rem", fontSize: "0.8rem", width: "100%" }}
                                  type="text"
                                />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                  {canEditInspection ? (
                    <div style={{ display: "flex", justifyContent: "flex-end", padding: "0.75rem 0 0" }}>
                      <SubmitButton className="btn">Save certificates</SubmitButton>
                    </div>
                  ) : null}
                </div>
              </div>
            </form>
          </div>
        </div>
      ) : null}

      {/* ── PANE: Narrative (Internal audits only) ── */}
      {activePane === "narrative" && isAuditCategory ? (
        <div className="panel panel-elevated" style={{ padding: 0, overflow: "hidden" }}>
          <div className="vir-narrative-pane">
            <form action={saveHeader} encType="multipart/form-data">
              {/* Items of Concern */}
              <div className="vir-narrative-card">
                <div className="vir-narrative-card-header">
                  <div className="vir-narrative-card-title">Items of Concern</div>
                </div>
                <div className="vir-narrative-card-body">
                  <textarea
                    defaultValue={typeof narrativeMetadata.itemsOfConcern === "string" ? narrativeMetadata.itemsOfConcern : ""}
                    disabled={!canEditInspection}
                    name="itemsOfConcern"
                    placeholder="List items of concern observed during the audit..."
                    rows={4}
                    style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "0.65rem", padding: "0.65rem", resize: "vertical" }}
                  />
                </div>
              </div>

              {/* Best Practice */}
              <div className="vir-narrative-card">
                <div className="vir-narrative-card-header">
                  <div className="vir-narrative-card-title">Best Practice</div>
                </div>
                <div className="vir-narrative-card-body">
                  <textarea
                    defaultValue={typeof narrativeMetadata.bestPractice === "string" ? narrativeMetadata.bestPractice : ""}
                    disabled={!canEditInspection}
                    name="bestPractice"
                    placeholder="Describe best practices observed during the audit..."
                    rows={4}
                    style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "0.65rem", padding: "0.65rem", resize: "vertical" }}
                  />
                  <div className="vir-narrative-upload-zone">
                    📎 Upload supporting documents
                    <input accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" multiple name="bestPracticeFiles" type="file" style={{ display: "block", margin: "0.4rem auto 0", fontSize: "0.76rem" }} />
                  </div>
                </div>
              </div>

              {/* Equipment Not Working */}
              <div className="vir-narrative-card">
                <div className="vir-narrative-card-header">
                  <div className="vir-narrative-card-title">Equipment Not Working / Never Tried Out</div>
                </div>
                <div className="vir-narrative-card-body">
                  <textarea
                    defaultValue={typeof narrativeMetadata.equipmentNotWorking === "string" ? narrativeMetadata.equipmentNotWorking : ""}
                    disabled={!canEditInspection}
                    name="equipmentNotWorking"
                    placeholder="List equipment that was not working or never tried out..."
                    rows={4}
                    style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "0.65rem", padding: "0.65rem", resize: "vertical" }}
                  />
                  <div className="vir-narrative-upload-zone">
                    📎 Upload supporting documents
                    <input accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" multiple name="equipmentFiles" type="file" style={{ display: "block", margin: "0.4rem auto 0", fontSize: "0.76rem" }} />
                  </div>
                </div>
              </div>

              {/* Safety Meeting */}
              <div className="vir-narrative-card">
                <div className="vir-narrative-card-header">
                  <div className="vir-narrative-card-title">Safety Meeting</div>
                </div>
                <div className="vir-narrative-card-body">
                  <textarea
                    defaultValue={typeof narrativeMetadata.safetyMeeting === "string" ? narrativeMetadata.safetyMeeting : ""}
                    disabled={!canEditInspection}
                    name="safetyMeeting"
                    placeholder="Safety meeting notes and discussion points..."
                    rows={4}
                    style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "0.65rem", padding: "0.65rem", resize: "vertical" }}
                  />
                  <div className="vir-narrative-upload-zone">
                    📎 Upload safety meeting records
                    <input accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" multiple name="safetyMeetingFiles" type="file" style={{ display: "block", margin: "0.4rem auto 0", fontSize: "0.76rem" }} />
                  </div>
                </div>
              </div>

              {/* Other Documents */}
              <div className="vir-narrative-card">
                <div className="vir-narrative-card-header">
                  <div className="vir-narrative-card-title">Other Documents</div>
                </div>
                <div className="vir-narrative-card-body">
                  <div className="vir-narrative-upload-zone">
                    📎 Upload other audit-related documents
                    <input accept=".pdf,.doc,.docx,.png,.jpg,.jpeg" multiple name="otherDocuments" type="file" style={{ display: "block", margin: "0.4rem auto 0", fontSize: "0.76rem" }} />
                  </div>
                </div>
              </div>

              {/* Opening Meeting */}
              <div className="vir-narrative-card">
                <div className="vir-narrative-card-header">
                  <div className="vir-narrative-card-title">Opening Meeting</div>
                </div>
                <div className="vir-narrative-card-body">
                  <div className="vir-narrative-meeting-grid">
                    <div className="vir-detail-field">
                      <span className="vir-detail-label">Date</span>
                      <input
                        className="field-input"
                        defaultValue={typeof narrativeMetadata.openingMeetingDate === "string" ? narrativeMetadata.openingMeetingDate : ""}
                        disabled={!canEditInspection}
                        name="openingMeetingDate"
                        style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                        type="date"
                      />
                    </div>
                    <div className="vir-detail-field">
                      <span className="vir-detail-label">From Time</span>
                      <input
                        className="field-input"
                        defaultValue={typeof narrativeMetadata.openingMeetingFromTime === "string" ? narrativeMetadata.openingMeetingFromTime : ""}
                        disabled={!canEditInspection}
                        name="openingMeetingFromTime"
                        placeholder="09:00 AM"
                        style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                        type="text"
                      />
                    </div>
                    <div className="vir-detail-field">
                      <span className="vir-detail-label">To Time</span>
                      <input
                        className="field-input"
                        defaultValue={typeof narrativeMetadata.openingMeetingToTime === "string" ? narrativeMetadata.openingMeetingToTime : ""}
                        disabled={!canEditInspection}
                        name="openingMeetingToTime"
                        placeholder="10:00 AM"
                        style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                        type="text"
                      />
                    </div>
                  </div>
                  <div className="vir-detail-field">
                    <span className="vir-detail-label">Meeting Notes</span>
                    <textarea
                      defaultValue={typeof narrativeMetadata.openingMeetingNotes === "string" ? narrativeMetadata.openingMeetingNotes : ""}
                      disabled={!canEditInspection}
                      name="openingMeetingNotes"
                      placeholder="Opening meeting discussion notes and attendees..."
                      rows={4}
                      style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "0.65rem", padding: "0.65rem", resize: "vertical", marginTop: "0.25rem" }}
                    />
                  </div>
                </div>
              </div>

              {/* Closing Meeting */}
              <div className="vir-narrative-card">
                <div className="vir-narrative-card-header">
                  <div className="vir-narrative-card-title">Closing Meeting</div>
                </div>
                <div className="vir-narrative-card-body">
                  <div className="vir-narrative-meeting-grid">
                    <div className="vir-detail-field">
                      <span className="vir-detail-label">Date</span>
                      <input
                        className="field-input"
                        defaultValue={typeof narrativeMetadata.closingMeetingDate === "string" ? narrativeMetadata.closingMeetingDate : ""}
                        disabled={!canEditInspection}
                        name="closingMeetingDate"
                        style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                        type="date"
                      />
                    </div>
                    <div className="vir-detail-field">
                      <span className="vir-detail-label">From Time</span>
                      <input
                        className="field-input"
                        defaultValue={typeof narrativeMetadata.closingMeetingFromTime === "string" ? narrativeMetadata.closingMeetingFromTime : ""}
                        disabled={!canEditInspection}
                        name="closingMeetingFromTime"
                        placeholder="04:00 PM"
                        style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                        type="text"
                      />
                    </div>
                    <div className="vir-detail-field">
                      <span className="vir-detail-label">To Time</span>
                      <input
                        className="field-input"
                        defaultValue={typeof narrativeMetadata.closingMeetingToTime === "string" ? narrativeMetadata.closingMeetingToTime : ""}
                        disabled={!canEditInspection}
                        name="closingMeetingToTime"
                        placeholder="05:00 PM"
                        style={{ padding: "0.25rem 0.4rem", fontSize: "0.85rem" }}
                        type="text"
                      />
                    </div>
                  </div>
                  <div className="vir-detail-field">
                    <span className="vir-detail-label">Meeting Notes</span>
                    <textarea
                      defaultValue={typeof narrativeMetadata.closingMeetingNotes === "string" ? narrativeMetadata.closingMeetingNotes : ""}
                      disabled={!canEditInspection}
                      name="closingMeetingNotes"
                      placeholder="Closing meeting discussion notes and action items..."
                      rows={4}
                      style={{ width: "100%", border: "1px solid var(--color-border)", borderRadius: "0.65rem", padding: "0.65rem", resize: "vertical", marginTop: "0.25rem" }}
                    />
                  </div>
                </div>
              </div>

              {canEditInspection ? (
                <div style={{ display: "flex", justifyContent: "flex-end", paddingTop: "0.5rem" }}>
                  <SubmitButton className="btn">Save narrative</SubmitButton>
                </div>
              ) : null}
            </form>
          </div>
        </div>
      ) : null}

      {/* ── Finding details panel (slide-in) ── */}
      {findingQ && findingQ !== "__show" && (findingQuestion || findingLiveQuestion) ? (
        <>
          <Link className="finding-panel-overlay" href={closeHref} scroll={false} aria-label="Close finding panel" />
          <div className="finding-panel">
            <div className="finding-panel-header">
              <div>
                <div className="finding-panel-title">FINDING DETAILS</div>
                <div className="finding-panel-ref">
                  {findingPanelCode ? `${findingPanelCode} — ` : ""}{findingPanelPrompt.slice(0, 100)}
                </div>
              </div>
              <Link className="finding-panel-close" href={closeHref} scroll={false}>✕</Link>
            </div>
            <form action={addFinding} className="finding-panel-body">
              <input name="questionId" type="hidden" value={findingQ} />

              <div className="field">
                <label htmlFor="fp-findingType">Type of Finding *</label>
                <select id="fp-findingType" name="findingType" required>
                  <option value="">Select type...</option>
                  <option value="OBSERVATION">Observation</option>
                  <option value="NON_CONFORMITY">Non-Conformity</option>
                  <option value="RECOMMENDATION">Recommendation</option>
                  <option value="POSITIVE">Positive</option>
                </select>
              </div>

              <div className="field">
                <label htmlFor="fp-severity">Severity</label>
                <select id="fp-severity" name="severity" required>
                  <option value="LOW">Low</option>
                  <option value="MEDIUM">Medium</option>
                  <option value="HIGH">High</option>
                  <option value="CRITICAL">Critical</option>
                </select>
              </div>

              <div className="field-wide">
                <label htmlFor="fp-description">Description of Finding</label>
                <textarea id="fp-description" name="description" placeholder="Describe the defect, evidence observed, and impact." rows={5} />
              </div>

              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: "0.75rem" }}>
                <div className="checkbox-row">
                  <input id="fp-drydock" name="isDrydockRelated" type="checkbox" value="yes" />
                  <label htmlFor="fp-drydock">Is the Defect Associated to Drydock?</label>
                </div>
                <div className="checkbox-row">
                  <label htmlFor="fp-ioc">Item Of Concern</label>
                  <input id="fp-ioc" name="isItemOfConcern" type="checkbox" value="yes" />
                </div>
              </div>

              <div className="finding-panel-attach">
                <div style={{ fontWeight: 700, fontSize: "0.82rem" }}>📎 ATTACHMENTS</div>
                <div style={{ fontSize: "0.75rem", marginTop: "0.3rem", color: "var(--color-ink-soft)" }}>
                  Max 10 images. Allowed: .png .jpeg .gif .tif .webp .heic
                </div>
                <input
                  accept=".png,.jpg,.jpeg,.gif,.tif,.tiff,.webp,.heic"
                  multiple
                  name="attachments"
                  style={{ display: "block", marginTop: "0.5rem", fontSize: "0.76rem" }}
                  type="file"
                />
              </div>

              <div style={{ display: "flex", justifyContent: "flex-end", gap: "0.5rem", marginTop: "auto", paddingTop: "0.5rem" }}>
                <Link className="btn-secondary" href={closeHref} scroll={false}>Cancel</Link>
                <SubmitButton className="btn">Mark as done</SubmitButton>
              </div>
            </form>
          </div>
        </>
      ) : null}

      <FloatingActivityFeed
        items={activityItems}
        subtitle="Office and vessel actions across questionnaire, findings, evidence, and sign-off."
        title="Inspection activity"
      />
    </div>
  );
}

// ─── Small helpers ─────────────────────────────────────────────────────────

function MetricBox({ label, value, note }: { label: string; value: string; note: string }) {
  return (
    <div className="metric-tile metric-tile-static">
      <div className="metric-tile-label">{label}</div>
      <div className="metric-tile-value">{value}</div>
      <div className="metric-tile-note">{note}</div>
    </div>
  );
}

function VirField({ label, value }: { label: string; value: string }) {
  return (
    <div className="vir-detail-field">
      <span className="vir-detail-label">{label}</span>
      <span className="vir-detail-value">{value || "—"}</span>
    </div>
  );
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}

function normalizeInspectionPane(value: string | undefined): "questionnaire" | "findings" | "evidence" | "signoff" | "details" | "report" | "certificates" | "narrative" {
  if (value === "findings" || value === "evidence" || value === "signoff" || value === "details" || value === "report" || value === "certificates" || value === "narrative") {
    return value;
  }
  return "questionnaire";
}

function normalizeLookupKey(value: string | null | undefined) {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

function findBoundQuestion(question: LiveChecklistQuestion, byPrompt: Map<string, any>, byCode: Map<string, any>) {
  const promptMatch = byPrompt.get(normalizeLookupKey(question.prompt));
  if (promptMatch) return promptMatch;
  return byCode.get(normalizeLookupKey(question.code)) ?? null;
}

function isSavedAnswer(
  answer: { answerText?: string | null; answerNumber?: number | null; answerDate?: Date | null; selectedOptions?: unknown; answerBoolean?: boolean | null; surveyStatus?: string | null; score?: number | null } | undefined
) {
  if (!answer) return false;
  if (typeof answer.answerText === "string" && answer.answerText.trim().length > 0) return true;
  if (typeof answer.answerNumber === "number") return true;
  if (typeof answer.answerBoolean === "boolean") return true;
  if (answer.answerDate) return true;
  if (typeof answer.surveyStatus === "string" && answer.surveyStatus.trim().length > 0) return true;
  if (typeof answer.score === "number") return true;
  return Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0;
}

function stripInlineHtml(value?: string | null) {
  return String(value ?? "").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function parseCrewList(raw: unknown): Array<{ name: string; rank: string }> {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const comma = line.lastIndexOf(",");
      if (comma > 0) {
        return { name: line.slice(0, comma).trim(), rank: line.slice(comma + 1).trim() };
      }
      return { name: line, rank: "" };
    });
}

function buildSignoffStages(
  signOffs: Array<{ stage: string; approved: boolean; actorName: string | null; comment: string | null; signedAt: Date }>,
  workflowConfig: unknown
) {
  const defaultStages = [
    { key: "VESSEL_SUBMISSION", label: "Vessel submission", actorRole: "Inspector / Master" },
    { key: "SHORE_REVIEW", label: "Office review", actorRole: "QHSE Superintendent" },
    { key: "FINAL_ACKNOWLEDGEMENT", label: "Final acknowledgement", actorRole: "Inspector / Master" },
  ];
  const configStages =
    workflowConfig &&
    typeof workflowConfig === "object" &&
    "stages" in workflowConfig &&
    Array.isArray((workflowConfig as { stages?: unknown }).stages)
      ? (workflowConfig as { stages: Array<{ stage: string; label?: string; actorRole?: string }> }).stages
      : [];
  return defaultStages.map((def) => {
    const saved = configStages.find((s) => s.stage === def.key);
    const latest = signOffs.find((record) => record.stage === def.key) ?? null;
    return {
      key: def.key,
      label: saved?.label ?? def.label,
      actorRole: saved?.actorRole ?? def.actorRole,
      present: Boolean(latest),
      approved: Boolean(latest?.approved),
      actor: latest?.actorName ?? null,
      comment: latest?.comment ?? null,
      timeLabel: latest ? new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(latest.signedAt) : null,
    };
  });
}

function buildInspectionActivity(inspection: {
  id: string; title: string; createdAt: Date; updatedAt: Date; inspectorName: string | null; status: string;
  answers: Array<{ id: string; questionId: string; answeredBy: string | null; answeredAt: Date | null }>;
  findings: Array<{ id: string; title: string; ownerName: string | null; createdAt: Date; status: string; correctiveActions: Array<{ id: string; actionText: string; ownerName: string | null; createdAt: Date; status: string }> }>;
  signOffs: Array<{ id: string; stage: string; actorName: string | null; approved: boolean; signedAt: Date }>;
  photos: Array<{ id: string; caption: string | null; uploadedBy: string | null; createdAt: Date }>;
}) {
  const fmtLocal = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });
  const items = [
    { id: `${inspection.id}-created`, title: "Inspection created", detail: inspection.title, timeLabel: fmtLocal.format(inspection.createdAt), actor: inspection.inspectorName, tone: "success" as const },
    { id: `${inspection.id}-status`, title: "Latest status", detail: inspection.status.replaceAll("_", " "), timeLabel: fmtLocal.format(inspection.updatedAt), tone: "info" as const },
    ...inspection.answers.filter((a) => a.answeredAt).map((a) => ({ id: a.id, title: "Answer saved", detail: `Question ${a.questionId.slice(0, 8)}…`, timeLabel: fmtLocal.format(a.answeredAt!), actor: a.answeredBy, tone: "info" as const })),
    ...inspection.findings.flatMap((f) => [
      { id: f.id, title: "Finding raised", detail: `${f.title} / ${f.status.replaceAll("_", " ")}`, timeLabel: fmtLocal.format(f.createdAt), actor: f.ownerName, tone: "warning" as const },
      ...f.correctiveActions.map((a) => ({ id: a.id, title: "CAR updated", detail: `${a.actionText.slice(0, 60)} / ${a.status.replaceAll("_", " ")}`, timeLabel: fmtLocal.format(a.createdAt), actor: a.ownerName, tone: a.status === "VERIFIED" ? "success" as const : "info" as const })),
    ]),
    ...inspection.signOffs.map((s) => ({ id: s.id, title: s.approved ? "Sign-off approved" : "Sign-off returned", detail: s.stage.replaceAll("_", " "), timeLabel: fmtLocal.format(s.signedAt), actor: s.actorName, tone: s.approved ? "success" as const : "danger" as const })),
    ...inspection.photos.map((p) => ({ id: p.id, title: "Evidence synced", detail: p.caption ?? "Evidence uploaded.", timeLabel: fmtLocal.format(p.createdAt), actor: p.uploadedBy, tone: "info" as const })),
  ];
  return items.sort((a, b) => b.timeLabel.localeCompare(a.timeLabel)).slice(0, 80);
}

function collectSectionQuestionBindings(
  section: { subsections: Array<{ questions: LiveChecklistQuestion[] }> },
  byPrompt: Map<string, any>,
  byCode: Map<string, any>,
  answerMap: Map<string, any>
) {
  return section.subsections.flatMap((subsection) =>
    subsection.questions.map((question) => {
      const bindingQuestion = findBoundQuestion(question, byPrompt, byCode);
      const answer = bindingQuestion ? answerMap.get(bindingQuestion.id) : undefined;
      return { question, bindingQuestion, answer, uploads: bindingQuestion ? getQuestionUploads(question, answer) : [] };
    })
  );
}
