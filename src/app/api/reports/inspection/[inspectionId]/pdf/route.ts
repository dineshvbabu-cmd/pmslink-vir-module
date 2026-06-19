import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { buildBrandedPdfDocument, PdfEmbeddedPhoto } from "@/lib/vir/pdf";
import { prisma } from "@/lib/prisma";
import { canAccessVessel, getVirSession } from "@/lib/vir/session";
import { getR2Object } from "@/lib/r2";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

type ReportVariant = "detailed" | "summary" | "findings" | "consolidate";
type ReportPhoto = { id?: string; label: string; caption: string; url: string };
type SectionRow = {
  title: string;
  answeredCount: number;
  questionCount: number;
  findingCount: number;
  concentratedCount: number;
  mandatoryCount: number;
  evidenceCount: number;
};

export async function GET(request: NextRequest, context: { params: Promise<{ inspectionId: string }> }) {
  const session = await getVirSession();
  const { inspectionId } = await context.params;
  const variant = normalizeVariant(request.nextUrl.searchParams.get("variant"));
  const imageMode = request.nextUrl.searchParams.get("imageMode") === "selected" ? "selected" : "all";
  const selectedImageIds = new Set(request.nextUrl.searchParams.getAll("image"));

  if (!session) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

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
                select: {
                  id: true,
                  code: true,
                  prompt: true,
                  isCicCandidate: true,
                  isMandatory: true,
                  section: {
                    select: {
                      id: true,
                      title: true,
                    },
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
            select: {
              id: true,
              code: true,
              prompt: true,
              section: {
                select: {
                  id: true,
                  title: true,
                },
              },
            },
          },
          photos: {
            orderBy: { createdAt: "asc" },
          },
        },
      },
      findings: {
        include: {
          question: {
            select: {
              prompt: true,
              code: true,
              section: {
                select: {
                  title: true,
                },
              },
            },
          },
          correctiveActions: true,
          photos: {
            orderBy: { createdAt: "asc" },
          },
        },
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      },
      signOffs: {
        orderBy: { signedAt: "asc" },
      },
      photos: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!inspection || !canAccessVessel(session, inspection.vesselId)) {
    return NextResponse.json({ error: "Inspection was not found." }, { status: 404 });
  }

  const sectionRows =
    inspection.template?.sections.map((section) => {
      const sectionAnswers = inspection.answers.filter((answer) => answer.question.section.id === section.id);
      const sectionFindings = inspection.findings.filter((finding) => finding.question?.section.title === section.title);

      return {
        title: section.title,
        answeredCount: sectionAnswers.length,
        questionCount: section.questions.length,
        findingCount: sectionFindings.length,
        concentratedCount: section.questions.filter((question) => question.isCicCandidate).length,
        mandatoryCount: section.questions.filter((question) => question.isMandatory).length,
        evidenceCount: sectionAnswers.reduce((sum, answer) => sum + answer.photos.length, 0),
      };
    }) ?? [];

  type QwfEntry = { surveyStatus?: string | null; score?: number | null; comment?: string | null };
  const qwf: Record<string, QwfEntry | undefined> =
    inspection.metadata && typeof inspection.metadata === "object" && !Array.isArray(inspection.metadata)
      ? ((inspection.metadata as Record<string, unknown>).questionWorkflow as Record<string, QwfEntry | undefined> | undefined) ?? {}
      : {};
  const answerMap = new Map<string, any>(
    inspection.answers.map((answer: any) => [
      answer.questionId,
      {
        ...answer,
        surveyStatus: qwf[answer.questionId]?.surveyStatus ?? null,
        score: qwf[answer.questionId]?.score ?? null,
        comment: answer.comment ?? qwf[answer.questionId]?.comment ?? null,
      },
    ])
  );
  for (const [questionId, wf] of Object.entries(qwf)) {
    if (!answerMap.has(questionId) && wf && (wf.surveyStatus || typeof wf.score === "number")) {
      answerMap.set(questionId, {
        questionId,
        answerText: null,
        answerNumber: null,
        answerBoolean: null,
        answerDate: null,
        selectedOptions: null,
        comment: wf.comment ?? null,
        surveyStatus: wf.surveyStatus ?? null,
        score: wf.score ?? null,
        photos: [],
      });
    }
  }

  const reportPhotos = collectReportPhotos(inspection);
  const selectedPhotos =
    imageMode === "selected" ? reportPhotos.filter((photo) => selectedImageIds.has(photo.id)) : reportPhotos;
  const effectivePhotos = selectedPhotos.length > 0 ? selectedPhotos : reportPhotos;
  const embeddedPhotos = await fetchPhotosForPdf(effectivePhotos, 40);

  const pdf = buildBrandedPdfDocument({
    brand: "ASM / UML / PMSLink VIR",
    title: `${variantLabel(variant)} - ${inspection.title}`,
    subtitleLines: [
      `${inspection.vessel.name} / ${inspection.inspectionType.name}`,
      `${fmt.format(inspection.inspectionDate)} / ${inspection.port ?? "Port not recorded"} / ${inspection.country ?? "Country not recorded"}`,
      `Image annex: ${embeddedPhotos.length} of ${effectivePhotos.length} image(s) embedded`,
    ],
    sections: buildVariantSections(inspection, sectionRows, effectivePhotos, variant, answerMap, embeddedPhotos),
  });

  return new NextResponse(pdf, {
    headers: {
      "Content-Disposition": `attachment; filename="inspection-${variant}-${inspection.id}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}

function normalizeVariant(variant: string | null): ReportVariant {
  if (variant === "summary" || variant === "findings" || variant === "consolidate") {
    return variant;
  }

  return "detailed";
}

function variantLabel(variant: ReportVariant) {
  switch (variant) {
    case "summary":
      return "Summary Report";
    case "findings":
      return "Finding Report";
    case "consolidate":
      return "Consolidate Report";
    default:
      return "Detailed Report";
  }
}

function resolveAnswerText(answer: any): string {
  if (!answer) return "Not recorded";
  if (Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0) return answer.selectedOptions.join(", ");
  if (answer.answerBoolean !== null && answer.answerBoolean !== undefined) return answer.answerBoolean ? "Yes" : "No";
  if (answer.answerNumber !== null && answer.answerNumber !== undefined) return String(answer.answerNumber);
  if (answer.answerDate) return fmt.format(new Date(answer.answerDate));
  return answer.answerText ?? "Not recorded";
}

function imageAnnexSection(
  title: string,
  photos: ReportPhoto[],
  embeddedPhotos: PdfEmbeddedPhoto[]
) {
  if (embeddedPhotos.length > 0) {
    return {
      title,
      lines: [`${embeddedPhotos.length} of ${photos.length} image(s) embedded below.`],
      photos: embeddedPhotos,
    };
  }
  return {
    title,
    lines: photos.length
      ? photos.map((photo, index) => `Image ${index + 1}: ${photo.label} / ${photo.caption}`)
      : ["No photos were selected for this report."],
  };
}

const R2_URL_PREFIX = "/api/files/r2/";

async function fetchPhotosForPdf(photos: ReportPhoto[], maxCount: number): Promise<PdfEmbeddedPhoto[]> {
  const toFetch = photos.slice(0, maxCount);
  const results = await Promise.allSettled(
    toFetch.map(async (photo): Promise<PdfEmbeddedPhoto | null> => {
      try {
        if (!photo.url.startsWith(R2_URL_PREFIX)) return null;
        const storageKey = photo.url.slice(R2_URL_PREFIX.length).split("/").map(decodeURIComponent).join("/");
        const obj = await getR2Object(storageKey);
        if (!obj) return null;
        const { data: jpegBuffer, info } = await sharp(Buffer.from(obj.body))
          .jpeg({ quality: 85 })
          .toBuffer({ resolveWithObject: true });
        return { data: jpegBuffer, width: info.width, height: info.height, components: info.channels, label: photo.label, caption: photo.caption };
      } catch {
        return null;
      }
    })
  );
  const embedded: PdfEmbeddedPhoto[] = [];
  for (const result of results) {
    if (result.status === "fulfilled" && result.value !== null) {
      embedded.push(result.value);
    }
  }
  return embedded;
}

function buildVariantSections(
  inspection: any,
  sectionRows: SectionRow[],
  photos: ReportPhoto[],
  variant: ReportVariant,
  answerMap: Map<string, any>,
  embeddedPhotos: PdfEmbeddedPhoto[]
) {
  const baseSections = [
    {
      title: "Vessel and inspection details",
      lines: [
        `Vessel: ${inspection.vessel.name}`,
        `Reference no: ${inspection.externalReference ?? inspection.title}`,
        `Report type: ${inspection.inspectionType.name}`,
        `Inspection status: ${inspection.status}`,
        `Inspection mode: ${inferInspectionMode(inspection.title, inspection.inspectionType.name)}`,
        `Inspection from date: ${fmt.format(inspection.inspectionDate)}`,
        `Inspection to date: ${fmt.format(inspection.closedAt ?? inspection.inspectionDate)}`,
        `Place of inspection from: ${inspection.port ?? "Not recorded"}`,
        `Place of inspection to: ${inspection.country ?? "Not recorded"}`,
        `Inspector: ${inspection.inspectorName ?? "Not recorded"}`,
        `Inspecting company: ${inspection.inspectorCompany ?? "Not recorded"}`,
      ],
    },
    {
      title: "Executive summary",
      lines: [inspection.summary ?? "No summary recorded for this inspection."],
    },
  ];

  if (variant === "summary") {
    return [
      ...baseSections,
      {
        title: "Inspection outcome",
        lines: buildInspectionOutcomeLines(inspection, sectionRows),
      },
      {
        title: "Chapter-wise findings",
        lines: buildChapterWiseFindingLines(inspection, sectionRows),
      },
      {
        title: "Section summary",
        lines: sectionRows.length
          ? sectionRows.flatMap((section: SectionRow, index: number) => [
              `${index + 1}. ${section.title}`,
              `Answered ${section.answeredCount}/${section.questionCount} / mandatory ${section.mandatoryCount} / findings ${section.findingCount} / evidence ${section.evidenceCount} / concentrated ${section.concentratedCount}`,
              " ",
            ])
          : ["No section summary is available."],
      },
    ];
  }

  if (variant === "findings") {
    return [
      ...baseSections,
      {
        title: "Findings",
        lines:
          inspection.findings.length > 0
            ? inspection.findings.flatMap((finding: any, index: number) => [
                `${index + 1}. ${finding.title}`,
                `Chapter: ${finding.question?.section.title ?? "General"}`,
                `Checklist: ${finding.question?.prompt ?? "General finding"}`,
                `Type of finding: ${finding.findingType}`,
                `Severity: ${finding.severity}`,
                `Status: ${finding.status}`,
                `Desc of finding: ${finding.description}`,
                ...finding.correctiveActions.map(
                  (action: any, actionIndex: number) =>
                    `Corrective Action ${index + 1}.${actionIndex + 1}: ${action.actionText} / ${action.status} / ${action.ownerName ?? "Owner not set"} / target ${action.targetDate ? fmt.format(action.targetDate) : "Not set"}`
                ),
                " ",
              ])
            : ["No findings recorded."],
      },
      imageAnnexSection("Finding image annex", photos, embeddedPhotos),
    ];
  }

  if (variant === "consolidate") {
    return [
      ...baseSections,
      {
        title: "Inspection outcome",
        lines: buildInspectionOutcomeLines(inspection, sectionRows),
      },
      {
        title: "Chapter-wise findings",
        lines: buildChapterWiseFindingLines(inspection, sectionRows),
      },
      {
        title: "Consolidated chapter matrix",
        lines: sectionRows.length
          ? sectionRows.map(
              (section: SectionRow) =>
                `${section.title}: answered ${section.answeredCount}/${section.questionCount} / findings ${section.findingCount} / evidence ${section.evidenceCount}`
            )
          : ["No chapter summary is available."],
      },
      {
        title: "Workflow sign-off register",
        lines:
          inspection.signOffs.length > 0
            ? inspection.signOffs.map(
                (signOff: any) =>
                  `${signOff.stage.replaceAll("_", " ")} / ${signOff.approved ? "approved" : "returned"} / ${signOff.actorName ?? "Unknown"} / ${fmt.format(signOff.signedAt)}`
              )
            : ["No sign-offs recorded."],
      },
      {
        title: "Consolidated finding list",
        lines:
          inspection.findings.length > 0
            ? inspection.findings.map(
                (finding: any, index: number) =>
                  `${index + 1}. ${finding.question?.section.title ?? "General"} / ${finding.title} / ${finding.severity} / ${finding.status}`
              )
            : ["No findings recorded."],
      },
      imageAnnexSection("Photo annex", photos, embeddedPhotos),
    ];
  }

  return [
    ...baseSections,
    {
      title: "Inspection outcome",
      lines: buildInspectionOutcomeLines(inspection, sectionRows),
    },
    {
      title: "Chapter-wise findings",
      lines: buildChapterWiseFindingLines(inspection, sectionRows),
    },
    {
      title: "Detailed section report",
      lines: inspection.template?.sections?.length
        ? (inspection.template.sections as any[]).flatMap((section: any, sIndex: number) => {
            const sectionFindings = (inspection.findings as any[]).filter(
              (f) => f.question?.section?.title === section.title
            );
            const lines: string[] = [
              `${sIndex + 1}. ${section.title}`,
              `Questions: ${section.questions.length} / Findings: ${sectionFindings.length}`,
              " ",
            ];
            (section.questions as any[]).forEach((question: any, qIndex: number) => {
              const answer = answerMap.get(question.id);
              const surveyStatus = answer?.surveyStatus ?? "";
              const score = answer?.score != null ? String(answer.score) : "";
              const comment = answer?.comment || resolveAnswerText(answer);
              const qFindings = (inspection.findings as any[]).filter((f) => f.questionId === question.id);
              lines.push(
                `${sIndex + 1}.${qIndex + 1} [${question.code}] ${question.prompt}`,
                `  Status: ${surveyStatus || "—"} / Score: ${score || "—"} / Response: ${comment}`,
                ...qFindings.map(
                  (f) => `  Finding: ${f.title} | ${f.findingType} | ${f.severity} | ${f.status}`
                ),
                " "
              );
            });
            return lines;
          })
        : ["No section data is available."],
    },
    {
      title: "Detailed finding register",
      lines:
        inspection.findings.length > 0
          ? inspection.findings.flatMap((finding: any, index: number) => [
              `${index + 1}. ${finding.title}`,
              `Chapter: ${finding.question?.section.title ?? "General"} / Checklist: ${finding.question?.prompt ?? "General finding"}`,
              `Type ${finding.findingType} / severity ${finding.severity} / status ${finding.status}`,
              finding.description,
              " ",
            ])
          : ["No findings recorded."],
    },
    imageAnnexSection("Selected image annex", photos, embeddedPhotos),
  ];
}

function buildInspectionOutcomeLines(inspection: any, sectionRows: SectionRow[]) {
  const answerCount = inspection.answers.filter((answer: any) =>
    answer.answerText ||
    answer.answerBoolean !== null ||
    answer.answerNumber !== null ||
    (Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0)
  ).length;
  const totalEvidence =
    inspection.photos.length +
    inspection.answers.reduce((sum: number, answer: any) => sum + answer.photos.length, 0) +
    inspection.findings.reduce((sum: number, finding: any) => sum + finding.photos.length, 0);

  return [
    `Answered questionnaire items: ${answerCount}`,
    `Sections in pack: ${sectionRows.length}`,
    `Open findings: ${inspection.findings.filter((finding: any) => finding.status !== "CLOSED").length}`,
    `Workflow sign-offs: ${inspection.signOffs.length}`,
    `Image / evidence items: ${totalEvidence}`,
  ];
}

function buildChapterWiseFindingLines(inspection: any, sectionRows: SectionRow[]) {
  const rows = sectionRows
    .map((section: SectionRow) => {
      const findings = inspection.findings.filter((finding: any) => finding.question?.section.title === section.title);
      return {
        title: section.title,
        high: findings.filter((finding: any) => ["HIGH", "CRITICAL"].includes(finding.severity)).length,
        medium: findings.filter((finding: any) => finding.severity === "MEDIUM").length,
        low: findings.filter((finding: any) => finding.severity === "LOW").length,
        total: findings.length,
      };
    })
    .filter((row) => row.total > 0);

  return rows.length
    ? rows.map(
        (row, index) =>
          `${index + 1}. ${row.title} / high ${row.high} / medium ${row.medium} / low ${row.low} / total ${row.total}`
      )
    : ["No chapter-level findings recorded."];
}

function inferInspectionMode(title: string, inspectionTypeName: string) {
  const source = `${title} ${inspectionTypeName}`.toUpperCase();

  if (source.includes("SAILING (REMOTE)")) {
    return "Sailing (Remote)";
  }

  if (source.includes("PORT (REMOTE)")) {
    return "Port (Remote)";
  }

  if (source.includes("PORT")) {
    return "Port";
  }

  return "Sailing";
}

function collectReportPhotos(inspection: any) {
  return [
    ...inspection.photos.map((photo: any) => ({
      id: photo.id,
      label: "Inspection photo",
      caption: photo.caption ?? photo.fileName ?? "Inspection evidence",
      url: photo.url,
    })),
    ...inspection.answers.flatMap((answer: any) =>
      answer.photos.map((photo: any) => ({
        id: photo.id,
        label: `${answer.question.section.title} / ${answer.question.code}`,
        caption: photo.caption ?? photo.fileName ?? `${answer.question.code} evidence`,
        url: photo.url,
      }))
    ),
    ...inspection.findings.flatMap((finding: any) =>
      finding.photos.map((photo: any) => ({
        id: photo.id,
        label: `${finding.question?.section.title ?? "General"} / Finding`,
        caption: photo.caption ?? photo.fileName ?? finding.title,
        url: photo.url,
      }))
    ),
  ];
}
