import { z } from "zod";

const stringOrNull = z.string().trim().min(1).optional().nullable();

export const virTemplateOptionImportSchema = z.object({
  value: z.string().trim().min(1),
  label: z.string().trim().min(1),
  score: z.number().int().optional(),
});

export const virTemplateQuestionImportSchema = z.object({
  code: z.string().trim().min(1),
  prompt: z.string().trim().min(5),
  responseType: z.enum([
    "YES_NO_NA",
    "TEXT",
    "NUMBER",
    "DATE",
    "SINGLE_SELECT",
    "MULTI_SELECT",
    "SCORE",
  ]),
  riskLevel: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("LOW"),
  isMandatory: z.boolean().default(false),
  allowsObservation: z.boolean().default(true),
  allowsPhoto: z.boolean().default(true),
  isCicCandidate: z.boolean().default(false),
  cicTopic: stringOrNull,
  helpText: stringOrNull,
  referenceImageUrl: z.string().trim().url().optional().nullable(),
  options: z.array(virTemplateOptionImportSchema).optional().default([]),
});

export const virTemplateSectionImportSchema = z.object({
  code: z.string().trim().min(1),
  title: z.string().trim().min(2),
  guidance: stringOrNull,
  questions: z.array(virTemplateQuestionImportSchema).min(1),
});

export const virTemplateImportSchema = z.object({
  inspectionTypeCode: z.string().trim().min(1),
  inspectionTypeName: z.string().trim().min(2),
  inspectionCategory: z.enum(["VETTING", "PSC", "CLASS", "INTERNAL", "AUDIT"]).default("INTERNAL"),
  templateName: z.string().trim().min(2),
  version: z.string().trim().min(1),
  description: stringOrNull,
  sections: z.array(virTemplateSectionImportSchema).min(1),
});

export type VirTemplateImport = z.infer<typeof virTemplateImportSchema>;

export function normalizeVirTemplateImport(input: unknown) {
  const parsed = virTemplateImportSchema.parse(input);

  const normalized = {
    ...parsed,
    inspectionTypeCode: parsed.inspectionTypeCode.toUpperCase().replace(/\s+/g, "_"),
    sections: parsed.sections.map((section, sectionIndex) => ({
      ...section,
      code: section.code.toUpperCase().replace(/\s+/g, "_"),
      sortOrder: sectionIndex + 1,
      questions: section.questions.map((question, questionIndex) => ({
        ...question,
        code: question.code.toUpperCase().replace(/\s+/g, "_"),
        sortOrder: questionIndex + 1,
        options: question.options.map((option) => ({
          ...option,
          value: option.value.toUpperCase().replace(/\s+/g, "_"),
        })),
      })),
    })),
  };

  return {
    normalized,
    summary: summarizeVirTemplate(normalized),
    warnings: collectVirTemplateWarnings(normalized),
  };
}

export function summarizeVirTemplate(template: VirTemplateImport) {
  const questions = template.sections.flatMap((section) => section.questions);

  return {
    sections: template.sections.length,
    questions: questions.length,
    mandatoryQuestions: questions.filter((question) => question.isMandatory).length,
    highRiskQuestions: questions.filter((question) => question.riskLevel === "HIGH" || question.riskLevel === "CRITICAL").length,
    cicQuestions: questions.filter((question) => question.isCicCandidate).length,
    optionSets: questions.filter((question) => question.options.length > 0).length,
  };
}

export function collectVirTemplateWarnings(template: VirTemplateImport) {
  const warnings: string[] = [];
  const sectionCodes = new Set<string>();
  const questionCodes = new Set<string>();

  for (const section of template.sections) {
    if (sectionCodes.has(section.code)) {
      warnings.push(`Duplicate section code detected: ${section.code}`);
    }
    sectionCodes.add(section.code);

    for (const question of section.questions) {
      const compositeCode = `${section.code}.${question.code}`;
      if (questionCodes.has(compositeCode)) {
        warnings.push(`Duplicate question code detected: ${compositeCode}`);
      }
      questionCodes.add(compositeCode);

      if ((question.responseType === "SINGLE_SELECT" || question.responseType === "MULTI_SELECT") && question.options.length === 0) {
        warnings.push(`Question ${compositeCode} uses ${question.responseType} but has no options.`);
      }
    }
  }

  const hasMandatoryHighRisk = template.sections.some((section) =>
    section.questions.some((question) => question.isMandatory && (question.riskLevel === "HIGH" || question.riskLevel === "CRITICAL"))
  );

  if (!hasMandatoryHighRisk) {
    warnings.push("Template has no mandatory HIGH or CRITICAL questions. Review escalation coverage.");
  }

  if (template.inspectionCategory === "PSC") {
    const cicCount = template.sections.reduce(
      (count, section) => count + section.questions.filter((question) => question.isCicCandidate).length,
      0
    );

    if (cicCount === 0) {
      warnings.push("PSC template has no CIC candidate questions. Review annual PSC concentration topics.");
    }
  }

  return warnings;
}
