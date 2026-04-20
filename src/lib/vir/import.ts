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
  referenceImageUrl: z
    .string()
    .trim()
    .refine((value) => value.startsWith("/") || /^https?:\/\//i.test(value), "Reference image must be a relative asset path or full URL.")
    .optional()
    .nullable(),
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

export const virTemplateSourceStandardSchema = z.enum([
  "GENERIC",
  "TMSA",
  "PSC",
  "RIGHTSHIP",
  "CID",
  "SIRE_2_0",
  "INTERNAL_AUDIT",
  "EXTERNAL_AUDIT",
]);

export const virTemplateInputFormatSchema = z.enum(["CANONICAL_JSON", "ROW_TABLE", "PLAIN_TEXT"]);

export const virTemplateEngineRequestSchema = z.object({
  sourceStandard: virTemplateSourceStandardSchema.default("GENERIC"),
  inputFormat: virTemplateInputFormatSchema.default("CANONICAL_JSON"),
  content: z.string().trim().min(1),
  inspectionTypeCode: stringOrNull,
  inspectionTypeName: stringOrNull,
  inspectionCategory: z.enum(["VETTING", "PSC", "CLASS", "INTERNAL", "AUDIT"]).optional().nullable(),
  templateName: stringOrNull,
  version: stringOrNull,
  description: stringOrNull,
});

export type VirTemplateImport = z.infer<typeof virTemplateImportSchema>;
export type VirTemplateEngineRequest = z.infer<typeof virTemplateEngineRequestSchema>;
export type VirTemplateSourceStandard = z.infer<typeof virTemplateSourceStandardSchema>;
export type VirTemplateInputFormat = z.infer<typeof virTemplateInputFormatSchema>;

const standardDefaults: Record<
  VirTemplateSourceStandard,
  Pick<VirTemplateImport, "inspectionCategory"> & {
    inspectionTypeCode: string;
    inspectionTypeName: string;
    templateName: string;
    description: string;
  }
> = {
  GENERIC: {
    inspectionTypeCode: "OWNERS_INSPECTION_INTERNAL",
    inspectionTypeName: "Owner's Inspection (Internal)",
    inspectionCategory: "INTERNAL",
    templateName: "Seeded VIR Checklist Import",
    description: "Standardized questionnaire imported in the seeded VIR checklist format.",
  },
  TMSA: {
    inspectionTypeCode: "TMSA_SELF_ASSESSMENT",
    inspectionTypeName: "TMSA Self Assessment",
    inspectionCategory: "AUDIT",
    templateName: "TMSA Questionnaire Import",
    description: "Normalized questionnaire imported from a TMSA source checklist.",
  },
  PSC: {
    inspectionTypeCode: "PORT_STATE_CONTROL",
    inspectionTypeName: "Port State Control",
    inspectionCategory: "PSC",
    templateName: "PSC Checklist Import",
    description: "Normalized PSC-focused checklist imported into the canonical VIR template model.",
  },
  RIGHTSHIP: {
    inspectionTypeCode: "RIGHTSHIP",
    inspectionTypeName: "RightShip",
    inspectionCategory: "VETTING",
    templateName: "RightShip Questionnaire Import",
    description: "Normalized vetting questionnaire imported from RightShip checklist content.",
  },
  CID: {
    inspectionTypeCode: "CHEMICAL_DISTRIBUTION_INSTITUTE",
    inspectionTypeName: "Chemical Distribution Institute",
    inspectionCategory: "VETTING",
    templateName: "CID Questionnaire Import",
    description: "Normalized CDI/CID style checklist imported for VIR use.",
  },
  SIRE_2_0: {
    inspectionTypeCode: "SIRE_2_0",
    inspectionTypeName: "SIRE 2.0",
    inspectionCategory: "VETTING",
    templateName: "SIRE 2.0 Questionnaire Import",
    description: "Normalized SIRE 2.0 question bank imported into the VIR questionnaire model.",
  },
  INTERNAL_AUDIT: {
    inspectionTypeCode: "OWNERS_INSPECTION_INTERNAL",
    inspectionTypeName: "Owner's Inspection (Internal)",
    inspectionCategory: "INTERNAL",
    templateName: "Internal VIR Questionnaire Import",
    description: "Normalized internal vessel inspection checklist imported into the standard VIR model.",
  },
  EXTERNAL_AUDIT: {
    inspectionTypeCode: "EXTERNAL_AUDIT",
    inspectionTypeName: "External Audit",
    inspectionCategory: "AUDIT",
    templateName: "External Audit Checklist Import",
    description: "Normalized external audit checklist imported into the standard VIR model.",
  },
};

export function normalizeVirTemplateImport(input: unknown) {
  const parsed = virTemplateImportSchema.parse(input);

  const normalized = {
    ...parsed,
    inspectionTypeCode: parsed.inspectionTypeCode.toUpperCase().replace(/\s+/g, "_"),
    sections: parsed.sections.map((section, sectionIndex) => ({
      ...section,
      code: normalizeCode(section.code),
      sortOrder: sectionIndex + 1,
      questions: section.questions.map((question, questionIndex) => ({
        ...decorateFocusQuestion(question),
        code: normalizeCode(question.code),
        sortOrder: questionIndex + 1,
        options: question.options.map((option) => ({
          ...option,
          value: normalizeCode(option.value),
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

export function normalizeVirTemplateEngineInput(input: unknown) {
  const request = virTemplateEngineRequestSchema.parse(input);
  const importedTemplate = buildTemplateFromEngineRequest(request);
  const normalizedResult = normalizeVirTemplateImport(importedTemplate);

  return {
    request,
    ...normalizedResult,
    fieldReviews: buildFieldReviews(request, normalizedResult.normalized),
  };
}

export function summarizeVirTemplate(template: VirTemplateImport) {
  const questions = template.sections.flatMap((section) => section.questions);

  return {
    sections: template.sections.length,
    questions: questions.length,
    mandatoryQuestions: questions.filter((question) => question.isMandatory).length,
    highRiskQuestions: questions.filter((question) => question.riskLevel === "HIGH" || question.riskLevel === "CRITICAL")
      .length,
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

export function getImportSample(sourceStandard: VirTemplateSourceStandard, inputFormat: VirTemplateInputFormat) {
  if (inputFormat === "CANONICAL_JSON") {
    const defaults = standardDefaults[sourceStandard];
    return JSON.stringify(
      {
        inspectionTypeCode: defaults.inspectionTypeCode,
        inspectionTypeName: defaults.inspectionTypeName,
        inspectionCategory: defaults.inspectionCategory,
        templateName: defaults.templateName,
        version: "2026.1",
        description: defaults.description,
        sections: [
          {
            code: "DECK",
            title: "Deck and Mooring",
            guidance: "Verify condition, accessibility, and operational readiness.",
            questions: [
              {
                code: "DECK_001",
                prompt: "Condition of mooring winches, guards, and brake markings.",
                responseType: "YES_NO_NA",
                riskLevel: "HIGH",
                isMandatory: true,
                referenceImageUrl: "/reference-images/deck-reference.svg",
              },
            ],
          },
        ],
      },
      null,
      2
    );
  }

  if (inputFormat === "ROW_TABLE") {
    return [
      "section|section_code|question_code|prompt|response_type|mandatory|risk|options|cic_topic|help_text|reference_image_url",
      "Deck and Mooring|DECK|DECK_001|Condition of mooring winches, guards, and brake markings.|SINGLE_SELECT|YES|HIGH|SATISFACTORY,OBSERVATION,DEFICIENT||Use latest deck walkdown note|/reference-images/deck-reference.svg",
      "Deck and Mooring|DECK|DECK_002|Condition of bulwarks, hand rails, and access ladders on main deck.|YES_NO_NA|YES|HIGH||||/reference-images/deck-reference.svg",
      "Engine Room|ENGINE|ENGINE_001|General condition of main engine auxiliaries and housekeeping.|SINGLE_SELECT|YES|HIGH|GOOD,MONITOR,ATTENTION||Record any leakage or alarm trend|/reference-images/engine-reference.svg",
    ].join("\n");
  }

  return [
    "[SECTION] Deck and Mooring",
    "DECK_001: Condition of mooring winches, guards, and brake markings. | type=SINGLE_SELECT | mandatory | risk=HIGH | options=SATISFACTORY,OBSERVATION,DEFICIENT | referenceImageUrl=/reference-images/deck-reference.svg",
    "DECK_002: Condition of bulwarks, hand rails, and access ladders on main deck. | type=YES_NO_NA | mandatory | risk=HIGH | referenceImageUrl=/reference-images/deck-reference.svg",
    "",
    "[SECTION] Engine Room",
    "ENGINE_001: General condition of main engine auxiliaries and housekeeping. | type=SINGLE_SELECT | mandatory | risk=HIGH | options=GOOD,MONITOR,ATTENTION | referenceImageUrl=/reference-images/engine-reference.svg",
    "ENGINE_002: Any machinery alarm, vibration, or leakage trend requiring escalation? | type=TEXT | risk=HIGH | referenceImageUrl=/reference-images/engine-reference.svg",
  ].join("\n");
}

function buildTemplateFromEngineRequest(request: VirTemplateEngineRequest): VirTemplateImport {
  switch (request.inputFormat) {
    case "ROW_TABLE":
      return buildTemplateFromRows(request);
    case "PLAIN_TEXT":
      return buildTemplateFromPlainText(request);
    case "CANONICAL_JSON":
    default:
      return buildTemplateFromCanonicalJson(request);
  }
}

function buildTemplateFromCanonicalJson(request: VirTemplateEngineRequest): VirTemplateImport {
  const parsedContent = JSON.parse(request.content) as Record<string, unknown>;

  return applyHeaderDefaults(request, parsedContent);
}

function buildTemplateFromRows(request: VirTemplateEngineRequest): VirTemplateImport {
  const lines = request.content
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0);

  if (lines.length < 2) {
    throw new Error("Row-table import requires a header row and at least one question row.");
  }

  const delimiter = detectDelimiter(lines[0]);
  const header = splitRow(lines[0], delimiter).map((column) => normalizeHeader(column));
  const sectionMap = new Map<string, { code: string; title: string; guidance: string | null; questions: Array<Record<string, unknown>> }>();

  lines.slice(1).forEach((line, index) => {
    const values = splitRow(line, delimiter);
    const row = Object.fromEntries(header.map((key, valueIndex) => [key, values[valueIndex] ?? ""]));
    const sectionTitle = row.section || row.sectiontitle || "General";
    const sectionCode = row.section_code || row.sectioncode || normalizeCode(sectionTitle);
    const sectionKey = `${sectionCode}::${sectionTitle}`;
    const questionCode = row.question_code || row.questioncode || `${sectionCode}_${index + 1}`;

    if (!sectionMap.has(sectionKey)) {
      sectionMap.set(sectionKey, {
        code: sectionCode,
        title: sectionTitle,
        guidance: row.guidance || null,
        questions: [],
      });
    }

    sectionMap.get(sectionKey)?.questions.push({
      code: questionCode,
      prompt: row.prompt || row.question || row.description,
      responseType: normalizeResponseType(row.response_type || row.type),
      riskLevel: normalizeRiskLevel(row.risk),
      isMandatory: parseFlag(row.mandatory),
      allowsObservation: true,
      allowsPhoto: true,
      isCicCandidate: Boolean(row.cic_topic),
      cicTopic: row.cic_topic || null,
      helpText: row.help_text || row.help || null,
      referenceImageUrl: row.reference_image_url || row.referenceimageurl || null,
      options: parseOptions(row.options),
    });
  });

  return applyHeaderDefaults(request, {
    sections: Array.from(sectionMap.values()),
  });
}

function buildTemplateFromPlainText(request: VirTemplateEngineRequest): VirTemplateImport {
  const lines = request.content.split(/\r?\n/);
  const sections: Array<{ code: string; title: string; guidance: string | null; questions: Array<Record<string, unknown>> }> = [];
  let currentSection = {
    code: "GENERAL",
    title: "General",
    guidance: null as string | null,
    questions: [] as Array<Record<string, unknown>>,
  };

  const ensureSection = () => {
    if (currentSection.questions.length > 0 && !sections.includes(currentSection)) {
      sections.push(currentSection);
    }
  };

  lines.forEach((rawLine, index) => {
    const line = rawLine.trim();

    if (!line) {
      return;
    }

    if (line.startsWith("[SECTION]") || line.startsWith("#")) {
      ensureSection();
      const title = line.replace(/^\[SECTION\]\s*/i, "").replace(/^#+\s*/, "").trim();
      currentSection = {
        code: normalizeCode(title || `SECTION_${sections.length + 1}`),
        title: title || `Section ${sections.length + 1}`,
        guidance: null,
        questions: [],
      };
      return;
    }

    const tokens = line.split("|").map((token) => token.trim());
    const [firstToken, ...modifiers] = tokens;

    const promptMatch = firstToken.match(/^([A-Za-z0-9\-_]+)\s*:\s*(.+)$/);
    const code = promptMatch ? promptMatch[1] : `${currentSection.code}_${index + 1}`;
    const prompt = promptMatch ? promptMatch[2] : firstToken.replace(/^[-*]\s*/, "");

    const modifierMap = Object.fromEntries(
      modifiers.map((token) => {
        const [key, ...valueParts] = token.split("=");
        return [normalizeHeader(key), valueParts.join("=").trim() || "true"];
      })
    );

    currentSection.questions.push({
      code,
      prompt,
      responseType: normalizeResponseType(modifierMap.type),
      riskLevel: normalizeRiskLevel(modifierMap.risk),
      isMandatory: parseFlag(modifierMap.mandatory ?? modifierMap.required),
      allowsObservation: true,
      allowsPhoto: true,
      isCicCandidate: parseFlag(modifierMap.cic) || Boolean(modifierMap.cictopic),
      cicTopic: modifierMap.cictopic ?? null,
      helpText: modifierMap.helptext ?? null,
      referenceImageUrl: modifierMap.referenceimageurl ?? modifierMap.referenceimage ?? null,
      options: parseOptions(modifierMap.options),
    });
  });

  ensureSection();

  return applyHeaderDefaults(request, {
    sections,
  });
}

function applyHeaderDefaults(
  request: VirTemplateEngineRequest,
  partialTemplate: Record<string, unknown>
): VirTemplateImport {
  const defaults = standardDefaults[request.sourceStandard];
  const object = partialTemplate as Partial<VirTemplateImport>;

  return virTemplateImportSchema.parse({
    inspectionTypeCode: request.inspectionTypeCode ?? object.inspectionTypeCode ?? defaults.inspectionTypeCode,
    inspectionTypeName: request.inspectionTypeName ?? object.inspectionTypeName ?? defaults.inspectionTypeName,
    inspectionCategory: request.inspectionCategory ?? object.inspectionCategory ?? defaults.inspectionCategory,
    templateName: request.templateName ?? object.templateName ?? defaults.templateName,
    version: request.version ?? object.version ?? "2026.1",
    description: request.description ?? object.description ?? defaults.description,
    sections: object.sections,
  });
}

function buildFieldReviews(request: VirTemplateEngineRequest, normalized: VirTemplateImport) {
  return [
    {
      entityType: "VirTemplate",
      fieldPath: "sourceStandard",
      aiValue: request.sourceStandard,
      finalValue: request.sourceStandard,
      confidence: 0.96,
      accepted: true,
    },
    {
      entityType: "VirTemplate",
      fieldPath: "inputFormat",
      aiValue: request.inputFormat,
      finalValue: request.inputFormat,
      confidence: 0.98,
      accepted: true,
    },
    {
      entityType: "VirTemplate",
      fieldPath: "inspectionTypeCode",
      aiValue: normalized.inspectionTypeCode,
      finalValue: normalized.inspectionTypeCode,
      confidence: 0.94,
      accepted: true,
    },
    {
      entityType: "VirTemplate",
      fieldPath: "templateName",
      aiValue: normalized.templateName,
      finalValue: normalized.templateName,
      confidence: 0.93,
      accepted: true,
    },
  ];
}

function normalizeCode(value: string) {
  return value.toUpperCase().replace(/[^A-Z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function normalizeHeader(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function detectDelimiter(line: string) {
  if (line.includes("\t")) {
    return "\t";
  }
  if (line.includes("|")) {
    return "|";
  }
  return ",";
}

function splitRow(line: string, delimiter: string) {
  return line.split(delimiter).map((cell) => cell.trim());
}

function normalizeResponseType(value: string | undefined) {
  const token = (value ?? "YES_NO_NA").trim().toUpperCase();

  if (["YES_NO_NA", "YESNO", "BOOLEAN"].includes(token)) {
    return "YES_NO_NA" as const;
  }
  if (["TEXT", "LONG_TEXT", "COMMENT"].includes(token)) {
    return "TEXT" as const;
  }
  if (["NUMBER", "NUMERIC", "INTEGER"].includes(token)) {
    return "NUMBER" as const;
  }
  if (["DATE", "DATETIME"].includes(token)) {
    return "DATE" as const;
  }
  if (["SINGLE_SELECT", "SELECT", "DROPDOWN"].includes(token)) {
    return "SINGLE_SELECT" as const;
  }
  if (["MULTI_SELECT", "MULTISELECT", "CHECKLIST"].includes(token)) {
    return "MULTI_SELECT" as const;
  }
  if (["SCORE", "RATING"].includes(token)) {
    return "SCORE" as const;
  }

  return "YES_NO_NA" as const;
}

function normalizeRiskLevel(value: string | undefined) {
  const token = (value ?? "LOW").trim().toUpperCase();

  if (["CRITICAL", "VERY_HIGH"].includes(token)) {
    return "CRITICAL" as const;
  }
  if (["HIGH", "MAJOR"].includes(token)) {
    return "HIGH" as const;
  }
  if (["MEDIUM", "MODERATE"].includes(token)) {
    return "MEDIUM" as const;
  }

  return "LOW" as const;
}

function parseFlag(value: string | undefined) {
  if (!value) {
    return false;
  }

  return ["YES", "Y", "TRUE", "1", "MANDATORY", "REQUIRED"].includes(value.trim().toUpperCase());
}

function parseOptions(value: string | undefined) {
  if (!value) {
    return [];
  }

  return value
    .split(",")
    .map((option) => option.trim())
    .filter(Boolean)
    .map((option) => ({
      value: option,
      label: option.replace(/_/g, " "),
    }));
}

function decorateFocusQuestion(question: z.infer<typeof virTemplateQuestionImportSchema>) {
  if (question.isCicCandidate || question.cicTopic) {
    return question;
  }

  const searchableText = `${question.prompt} ${question.helpText ?? ""}`.toUpperCase();
  const hasImportedFocusMarker =
    searchableText.includes("CIC") ||
    searchableText.includes("CIR") ||
    searchableText.includes("CONCENTRATED") ||
    searchableText.includes("FOCUS QUESTION") ||
    searchableText.includes("CAMPAIGN");

  if (!hasImportedFocusMarker) {
    return question;
  }

  return {
    ...question,
    isCicCandidate: true,
    cicTopic: question.cicTopic ?? "Imported Concentrated Inspection Topic",
  };
}
