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
};

type FindingLike = {
  severity: string;
  status: string;
};

export function summarizeProgress(questions: TemplateQuestionLike[], answers: AnswerLike[]) {
  const answerIds = new Set(
    answers
      .filter(
        (answer) =>
          answer.answerText !== null ||
          answer.answerNumber !== null ||
          answer.answerBoolean !== null ||
          (Array.isArray(answer.selectedOptions) && answer.selectedOptions.length > 0)
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
