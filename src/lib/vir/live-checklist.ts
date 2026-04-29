
export type LiveQuestionFile = {
  id: string;
  url: string;
  caption: string;
  label: string;
};

export type LiveChecklistQuestion = {
  id: string;
  code: string;
  prompt: string;
  surveyStatus: string;
  tested: boolean;
  inspected: boolean;
  notSighted: boolean;
  notApplicable: boolean;
  score: number | null;
  finding: boolean;
  comments: string;
  guidanceNotes: string;
  areaOfConcern: string;
  subAreaOfConcern: string;
  typeOfFinding: string;
  severity: string;
  files: LiveQuestionFile[];
  isMandatory?: boolean;
  allowsPhoto?: boolean;
  isCicCandidate?: boolean;
  referenceImageUrl?: string | null;
};

export type LiveChecklistSubsection = {
  id: string;
  title: string;
  location: string;
  checklistId: number;
  areaId: number;
  totalCount: number;
  doneCount: number;
  summary: {
    answered: number;
    tested: number;
    inspected: number;
    notSighted: number;
    notApplicable: number;
    totalFindings: number;
    evidenceCount: number;
    questionCount: number;
  };
  condition: { score: number | null; scoredResponses: number };
  rating: { band: string; mandatoryQuestions: number; mandatoryQuestionsWithFindings: number };
  comments: string;
  questions: LiveChecklistQuestion[];
};

export type LiveChecklistSection = {
  id: string;
  title: string;
  comments: string;
  summary: {
    answered: number;
    tested: number;
    inspected: number;
    notSighted: number;
    notApplicable: number;
    totalFindings: number;
    evidenceCount: number;
    questionCount: number;
  };
  condition: { score: number | null; scoredResponses: number };
  rating: { band: string; mandatoryQuestions: number; mandatoryQuestionsWithFindings: number };
  subsections: LiveChecklistSubsection[];
};

export type LiveChecklistBlueprint = {
  id: string;
  sourceInspectionId: number;
  sourceLabel: string;
  summary: {
    tested: number;
    inspected: number;
    notSighted: number;
    notApplicable: number;
    totalFindings: number;
    questionCount: number;
    evidenceCount: number;
    ratingBand: string;
    conditionScore: number;
  };
  sections: LiveChecklistSection[];
};

export function buildLiveChecklist(inspection: { metadata: unknown }) {
  const metadata = (inspection.metadata ?? {}) as Record<string, unknown>;
  const candidate = metadata.liveChecklist;
  if (candidate && typeof candidate === "object") {
    return candidate as unknown as LiveChecklistBlueprint;
  }
  return null;
}

export function buildLiveVesselRating(liveChecklist: LiveChecklistBlueprint, inspectionMode: string) {
  const mandatoryQuestions = liveChecklist.sections.reduce(
    (total, section) =>
      total +
      section.subsections.reduce(
        (subTotal, subsection) => subTotal + (subsection.rating?.mandatoryQuestions ?? 0),
        0
      ),
    0
  );
  const mandatoryQuestionsWithFindings = liveChecklist.sections.reduce(
    (total, section) =>
      total +
      section.subsections.reduce(
        (subTotal, subsection) => subTotal + (subsection.rating?.mandatoryQuestionsWithFindings ?? 0),
        0
      ),
    0
  );
  const band = formatBandLabel(liveChecklist.summary.ratingBand);
  return {
    band,
    label: band === "HIGH" ? "High" : band === "MEDIUM" ? "Medium" : "Low",
    ratio: band === "HIGH" ? 85 : band === "MEDIUM" ? 65 : 35,
    mandatoryQuestions,
    mandatoryQuestionsWithFindings,
    mode: inspectionMode,
  };
}

export function buildLiveVesselCondition(liveChecklist: LiveChecklistBlueprint) {
  const score = liveChecklist.summary.conditionScore;
  return {
    label: score >= 3.75 ? "High" : score >= 3 ? "Medium" : "Low",
    score,
    scoredResponses: liveChecklist.sections.reduce(
      (total, section) => total + (section.condition?.scoredResponses ?? 0),
      0
    ),
  };
}

export function buildLiveSectionRows(liveChecklist: LiveChecklistBlueprint, inspectionMode: string) {
  return liveChecklist.sections.map((section) => {
    const questions = section.subsections.flatMap((subsection) => subsection.questions);
    const findings = questions
      .filter((question) => question.finding)
      .map((question) => ({
        id: `${question.id}-finding`,
        title: question.prompt,
        description: question.comments || stripHtml(question.guidanceNotes) || question.prompt,
        severity: question.severity || "LOW",
        areaOfConcern: question.areaOfConcern,
        subAreaOfConcern: question.subAreaOfConcern,
        typeOfFinding: question.typeOfFinding,
        photos: question.files ?? [],
      }));
    const mandatoryQuestions = section.subsections.reduce(
      (total, subsection) => total + (subsection.rating?.mandatoryQuestions ?? 0),
      0
    );
    const mandatoryQuestionsWithFindings = section.subsections.reduce(
      (total, subsection) => total + (subsection.rating?.mandatoryQuestionsWithFindings ?? 0),
      0
    );
    const band = formatBandLabel(section.rating?.band);

    return {
      id: section.id,
      title: section.title,
      comments: section.comments,
      questions,
      findings,
      evidenceCount: section.summary?.evidenceCount ?? 0,
      findingImageCount: findings.reduce((total, finding) => total + (finding.photos?.length ?? 0), 0),
      answeredCount: section.summary?.answered ?? 0,
      condition: section.condition?.score ?? null,
      rating: {
        band,
        label: band === "HIGH" ? "High" : band === "MEDIUM" ? "Medium" : "Low",
        ratio: band === "HIGH" ? 85 : band === "MEDIUM" ? 65 : 35,
        mode: inspectionMode,
        mandatoryQuestions,
        mandatoryQuestionsWithFindings,
      },
      subsections: section.subsections,
    };
  });
}

export function describeLiveQuestionOutcome(question: LiveChecklistQuestion) {
  if (question.tested) {
    return "tested" as const;
  }
  if (question.inspected) {
    return "inspected" as const;
  }
  if (question.notApplicable) {
    return "notApplicable" as const;
  }
  return "notSighted" as const;
}

export function formatBandLabel(band: string | undefined | null) {
  const normalized = String(band ?? "HIGH").trim().toUpperCase();
  if (normalized === "MEDIUM" || normalized === "LOW") {
    return normalized;
  }
  return "HIGH";
}

export function stripHtml(value?: string | null) {
  return String(value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeRemoteAssetUrl(value?: string | null) {
  const raw = String(value ?? "").trim();
  if (!raw) {
    return "";
  }
  if (/^data:/i.test(raw)) {
    return raw;
  }
  if (/^\/api\/vir\/assets\?url=/i.test(raw)) {
    return raw;
  }
  if (/^\/?Uploads\//i.test(raw)) {
    const absoluteUrl = `https://vir.synergymarinegroup.com/${raw.replace(/^\/+/, "")}`;
    return `/api/vir/assets?url=${encodeURIComponent(absoluteUrl)}`;
  }
  if (/^\/?vir\/Uploads\//i.test(raw)) {
    const absoluteUrl = `https://vir.synergymarinegroup.com/${raw.replace(/^\/?vir\/?/i, "")}`;
    return `/api/vir/assets?url=${encodeURIComponent(absoluteUrl)}`;
  }
  if (/^\/?ia\/Uploads\//i.test(raw)) {
    const absoluteUrl = `https://ia.synergymarinegroup.com/${raw.replace(/^\/?ia\/?/i, "")}`;
    return `/api/vir/assets?url=${encodeURIComponent(absoluteUrl)}`;
  }
  if (/^https?:\/\//i.test(raw)) {
    return `/api/vir/assets?url=${encodeURIComponent(raw)}`;
  }
  return raw;
}

export function getQuestionUploads(question: any, answer: any) {
  if (Array.isArray(question?.files) && question.files.length) {
    return question.files.map((file: any) => ({
      ...file,
      url: normalizeRemoteAssetUrl(file.url),
    }));
  }
  if (Array.isArray(answer?.photos) && answer.photos.length) {
    return answer.photos.map((photo: any) => ({
      ...photo,
      url: normalizeRemoteAssetUrl(photo.url),
    }));
  }
  return [];
}
