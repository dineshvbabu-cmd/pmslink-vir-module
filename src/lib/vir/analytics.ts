type TemplateQuestionLike = {
  id: string;
  responseType: string;
  riskLevel: string;
  isMandatory: boolean;
  options?: Array<{ value: string; score: number | null }>;
};

type AnswerLike = {
  questionId: string;
  answerText: string | null;
  answerNumber: number | null;
  answerBoolean: boolean | null;
  selectedOptions: unknown;
  surveyStatus?: string | null;
  score?: number | null;
};

type FindingLike = {
  questionId?: string | null;
  severity: string;
  status: string;
};

export type ChecklistOutcome = {
  tested: number;
  inspected: number;
  notSighted: number;
  notApplicable: number;
  totalFindings: number;
  answered: number;
  totalQuestions: number;
};

export type VesselRatingResult = {
  band: "HIGH" | "MEDIUM" | "LOW";
  label: string;
  ratio: number;
  mandatoryQuestions: number;
  mandatoryQuestionsWithFindings: number;
  inspectionMode: "SAILING" | "PORT";
};

export type VesselConditionResult = {
  score: number | null;
  label: string;
  scoredResponses: number;
};

export function summarizeProgress(questions: TemplateQuestionLike[], answers: AnswerLike[]) {
  const answerIds = new Set(
    answers
      .filter(
        (answer) =>
          answer.answerText !== null ||
          answer.answerNumber !== null ||
          answer.answerBoolean !== null ||
          (Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0) ||
          Boolean(answer.surveyStatus) ||
          typeof answer.score === "number"
      )
      .map((answer) => answer.questionId)
  );

  const mandatoryQuestions = questions.filter((question) => question.isMandatory);
  const answeredMandatory = mandatoryQuestions.filter((question) => answerIds.has(question.id));

  return {
    totalQuestions: questions.length,
    answeredQuestions: answerIds.size,
    mandatoryQuestions: mandatoryQuestions.length,
    answeredMandatory: answeredMandatory.length,
    completionPct: questions.length > 0 ? Math.round((answerIds.size / questions.length) * 100) : 0,
    mandatoryPct:
      mandatoryQuestions.length > 0 ? Math.round((answeredMandatory.length / mandatoryQuestions.length) * 100) : 0,
  };
}

export function calculateInspectionScore(questions: TemplateQuestionLike[], answers: AnswerLike[], findings: FindingLike[]) {
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const scoredAnswers: number[] = [];

  for (const answer of answers) {
    const question = questionMap.get(answer.questionId);
    if (!question) {
      continue;
    }

    if (typeof answer.score === "number") {
      scoredAnswers.push(answer.score);
      continue;
    }

    if (question.responseType === "YES_NO_NA") {
      if (answer.answerText === "YES") {
        scoredAnswers.push(100);
      } else if (answer.answerText === "NO") {
        scoredAnswers.push(0);
      }
      continue;
    }

    if (question.responseType === "SINGLE_SELECT") {
      const matchedOption = question.options?.find((option) => option.value === answer.answerText);
      if (typeof matchedOption?.score === "number") {
        scoredAnswers.push(matchedOption.score);
      }
      continue;
    }

    if (question.responseType === "SCORE" && typeof answer.answerNumber === "number") {
      scoredAnswers.push(answer.answerNumber);
    }
  }

  if (scoredAnswers.length === 0) {
    return {
      rawAverage: null,
      penaltyPoints: 0,
      finalScore: null,
    };
  }

  const rawAverage = scoredAnswers.reduce((sum, value) => sum + value, 0) / scoredAnswers.length;
  const penaltyPoints = findings.reduce((sum, finding) => {
    if (finding.status === "CLOSED") {
      return sum;
    }

    if (finding.severity === "CRITICAL") {
      return sum + 5;
    }

    if (finding.severity === "HIGH") {
      return sum + 2;
    }

    return sum;
  }, 0);

  return {
    rawAverage: Math.round(rawAverage),
    penaltyPoints,
    finalScore: Math.max(0, Math.round(rawAverage - penaltyPoints)),
  };
}

export function calculateChecklistOutcome(
  questions: TemplateQuestionLike[],
  answers: AnswerLike[],
  findings: FindingLike[]
): ChecklistOutcome {
  let tested = 0;
  let inspected = 0;
  let notSighted = 0;
  let notApplicable = 0;

  const answerMap = new Map(answers.map((answer) => [answer.questionId, answer]));

  for (const question of questions) {
    const answer = answerMap.get(question.id);

    if (!hasRecordedAnswer(answer)) {
      notSighted += 1;
      continue;
    }

    if (isNotApplicable(answer)) {
      notApplicable += 1;
      continue;
    }

    if (answer?.surveyStatus === "T") {
      tested += 1;
      continue;
    }

    if (answer?.surveyStatus === "NS") {
      notSighted += 1;
      continue;
    }

    if (answer?.surveyStatus === "NA") {
      notApplicable += 1;
      continue;
    }

    if (answer?.surveyStatus === "I") {
      inspected += 1;
      continue;
    }

    if (usesTestedBucket(question)) {
      tested += 1;
      continue;
    }

    inspected += 1;
  }

  return {
    tested,
    inspected,
    notSighted,
    notApplicable,
    totalFindings: findings.length,
    answered: tested + inspected + notApplicable,
    totalQuestions: questions.length,
  };
}

export function calculateVesselRating(
  questions: TemplateQuestionLike[],
  _answers: AnswerLike[],
  findings: FindingLike[],
  inspectionModeLabel?: string
): VesselRatingResult {
  const mandatoryQuestions = questions.filter((question) => question.isMandatory);
  const mandatoryQuestionIds = new Set(mandatoryQuestions.map((question) => question.id));
  const mandatoryQuestionsWithFindings = new Set(
    findings.filter((finding) => finding.questionId && mandatoryQuestionIds.has(finding.questionId)).map((finding) => finding.questionId as string)
  );
  const ratio =
    mandatoryQuestions.length > 0 ? (mandatoryQuestionsWithFindings.size / mandatoryQuestions.length) * 100 : 0;
  const inspectionMode = inspectionModeLabel?.toUpperCase().includes("SAILING") ? "SAILING" : "PORT";

  if (ratio <= 10) {
    return {
      band: "HIGH",
      label: "HIGH (Good Vessel)",
      ratio,
      mandatoryQuestions: mandatoryQuestions.length,
      mandatoryQuestionsWithFindings: mandatoryQuestionsWithFindings.size,
      inspectionMode,
    };
  }

  if (ratio <= 20) {
    return {
      band: "MEDIUM",
      label: 'MEDIUM (Vessel can be improved to "HIGH" rating)',
      ratio,
      mandatoryQuestions: mandatoryQuestions.length,
      mandatoryQuestionsWithFindings: mandatoryQuestionsWithFindings.size,
      inspectionMode,
    };
  }

  return {
    band: "LOW",
    label: "LOW (Concern Vessel)",
    ratio,
    mandatoryQuestions: mandatoryQuestions.length,
    mandatoryQuestionsWithFindings: mandatoryQuestionsWithFindings.size,
    inspectionMode,
  };
}

export function calculateVesselCondition(questions: TemplateQuestionLike[], answers: AnswerLike[]): VesselConditionResult {
  const questionMap = new Map(questions.map((question) => [question.id, question]));
  const scores = answers
    .map((answer) => {
      const question = questionMap.get(answer.questionId);
      return question ? deriveAnswerScore(question, answer) : null;
    })
    .filter((value): value is number => typeof value === "number");

  if (!scores.length) {
    return {
      score: null,
      label: "Not Rated",
      scoredResponses: 0,
    };
  }

  const score = Number((scores.reduce((sum, value) => sum + value, 0) / scores.length).toFixed(1));

  return {
    score,
    label: score >= 4 ? "High" : score >= 3 ? "Medium" : "Low",
    scoredResponses: scores.length,
  };
}

function hasRecordedAnswer(answer: AnswerLike | undefined) {
  if (!answer) {
    return false;
  }

  return (
    answer.answerText !== null ||
    answer.answerNumber !== null ||
    answer.answerBoolean !== null ||
    (Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0) ||
    Boolean(answer.surveyStatus) ||
    typeof answer.score === "number"
  );
}

function isNotApplicable(answer: AnswerLike | undefined) {
  if (!answer) {
    return false;
  }

  if (typeof answer.answerText === "string") {
    const normalized = answer.answerText.trim().toUpperCase();
    if (normalized === "NA" || normalized === "N/A" || normalized === "NOT APPLICABLE") {
      return true;
    }
  }

  if (Array.isArray(answer.selectedOptions)) {
    return answer.selectedOptions.some((option) => {
      if (typeof option !== "string") {
        return false;
      }

      const normalized = option.trim().toUpperCase();
      return normalized === "NA" || normalized === "N/A" || normalized === "NOT APPLICABLE";
    });
  }

  return false;
}

function usesTestedBucket(question: TemplateQuestionLike) {
  const prompt = `${"prompt" in question && typeof question.prompt === "string" ? question.prompt : ""}`.toUpperCase();

  return [
    "TEST",
    "TRIAL",
    "DRILL",
    "ALARM",
    "START",
    "STOP",
    "RELEASE",
    "OPERATION",
    "OPERATING",
    "READINESS",
    "FUNCTION",
    "WORKING",
    "WATCHKEEPING",
    "EXERCISE",
  ].some((keyword) => prompt.includes(keyword));
}

function deriveAnswerScore(question: TemplateQuestionLike, answer: AnswerLike) {
  if (isNotApplicable(answer)) {
    return null;
  }

  if (typeof answer.score === "number") {
    return normalizeFivePointScore(answer.score);
  }

  if (question.responseType === "YES_NO_NA" && typeof answer.answerText === "string") {
    const normalized = answer.answerText.trim().toUpperCase();
    if (normalized === "YES") {
      return 4.2;
    }
    if (normalized === "NO") {
      return 2;
    }
    return null;
  }

  if (question.responseType === "SINGLE_SELECT" && typeof answer.answerText === "string") {
    const optionScore = question.options?.find((option) => option.value === answer.answerText)?.score;
    return typeof optionScore === "number" ? normalizeFivePointScore(optionScore) : null;
  }

  if (question.responseType === "MULTI_SELECT" && Array.isArray(answer.selectedOptions)) {
    const optionScores = answer.selectedOptions
      .map((selected) => {
        if (typeof selected !== "string") {
          return null;
        }

        return question.options?.find((option) => option.value === selected)?.score ?? null;
      })
      .filter((value): value is number => typeof value === "number");

    if (!optionScores.length) {
      return null;
    }

    return normalizeFivePointScore(optionScores.reduce((sum, value) => sum + value, 0) / optionScores.length);
  }

  if (question.responseType === "SCORE" && typeof answer.answerNumber === "number") {
    return normalizeFivePointScore(answer.answerNumber);
  }

  return null;
}

function normalizeFivePointScore(value: number) {
  if (value <= 5) {
    return Number(value.toFixed(1));
  }

  if (value <= 100) {
    return Number((value / 20).toFixed(1));
  }

  return 5;
}
