import { createHash } from "node:crypto";
import { z } from "zod";

const reportImportRequestSchema = z.object({
  fileName: z.string().trim().min(1),
  contentType: z.string().trim().min(1),
  contentBase64: z.string().trim().min(1),
  sourceUrl: z.string().trim().optional().nullable(),
});

type ParsedInspectionType = {
  code: string;
  name: string;
  category: "VETTING" | "PSC" | "CLASS" | "INTERNAL" | "AUDIT";
};

const sourcePatterns: Array<{ inspectionType: ParsedInspectionType; keywords: string[]; sourceSystem: string }> = [
  {
    inspectionType: { code: "PORT_STATE_CONTROL", name: "Port State Control", category: "PSC" },
    keywords: ["psc", "port state", "detention", "deficiency"],
    sourceSystem: "PSC external report",
  },
  {
    inspectionType: { code: "RIGHTSHIP", name: "RightShip", category: "VETTING" },
    keywords: ["rightship", "ghia", "qiq"],
    sourceSystem: "RightShip report",
  },
  {
    inspectionType: { code: "SIRE_2_0", name: "SIRE 2.0", category: "VETTING" },
    keywords: ["sire 2.0", "ocimf", "sire"],
    sourceSystem: "SIRE report",
  },
  {
    inspectionType: { code: "CID", name: "Chemical Distribution Institute", category: "VETTING" },
    keywords: ["cdi", "cid"],
    sourceSystem: "CDI/CID report",
  },
  {
    inspectionType: { code: "TMSA_SELF_ASSESSMENT", name: "TMSA Self Assessment", category: "AUDIT" },
    keywords: ["tmsa", "element score", "self assessment"],
    sourceSystem: "TMSA questionnaire",
  },
];

export function normalizeReportImportInput(input: unknown) {
  const request = reportImportRequestSchema.parse(input);
  const { base64Payload, binaryBuffer } = decodeBase64Payload(request.contentBase64);
  const extractedText = extractReportText({
    binaryBuffer,
    contentType: request.contentType,
    fileName: request.fileName,
  });
  const inspectionType = classifyInspectionType(extractedText.normalizedText);
  const findings = extractFindings(extractedText.lines);
  const vesselName = extractSingleValue(extractedText.lines, ["vessel", "ship name", "name of ship"]);
  const reportDate = extractDate(extractedText.normalizedText);
  const externalReference =
    extractSingleValue(extractedText.lines, ["report no", "report number", "reference", "inspection no"]) ??
    createHash("sha256").update(base64Payload).digest("hex").slice(0, 12).toUpperCase();
  const reviewNotes: string[] = [];

  if (extractedText.requiresOcrReview) {
    reviewNotes.push("Document appears to be scanned or image-heavy. OCR review is recommended for higher-confidence extraction.");
  }

  if (findings.length === 0) {
    reviewNotes.push("No structured findings were detected automatically. Review extracted text and map findings manually if required.");
  }

  const fieldReviews = [
    buildFieldReview("VirReport", "vesselName", vesselName, vesselName, vesselName ? 0.82 : 0.28),
    buildFieldReview("VirReport", "inspectionType", inspectionType.name, inspectionType.name, 0.86),
    buildFieldReview("VirReport", "externalReference", externalReference, externalReference, 0.77),
    buildFieldReview("VirReport", "reportDate", reportDate ?? null, reportDate ?? null, reportDate ? 0.72 : 0.31),
    buildFieldReview(
      "VirReport",
      "findingCount",
      String(findings.length),
      String(findings.length),
      findings.length > 0 ? 0.83 : 0.22
    ),
  ];

  return {
    request,
    extractedText,
    inspectionType,
    vesselName,
    reportDate,
    externalReference,
    findings,
    reviewNotes,
    rawTextHash: createHash("sha256").update(extractedText.normalizedText).digest("hex"),
    summary: {
      contentType: request.contentType,
      fileName: request.fileName,
      extractedCharacters: extractedText.normalizedText.length,
      extractedLines: extractedText.lines.length,
      findingsDetected: findings.length,
      requiresOcrReview: extractedText.requiresOcrReview,
      sourceSystem: inspectionType.sourceSystem,
    },
    fieldReviews,
  };
}

function buildFieldReview(
  entityType: string,
  fieldPath: string,
  aiValue: string | null,
  finalValue: string | null,
  confidence: number
) {
  return {
    entityType,
    fieldPath,
    aiValue,
    finalValue,
    confidence,
    accepted: confidence >= 0.5,
  };
}

function decodeBase64Payload(contentBase64: string) {
  const base64Payload = contentBase64.includes(",") ? contentBase64.split(",").pop() ?? "" : contentBase64;
  const binaryBuffer = Buffer.from(base64Payload, "base64");
  return { base64Payload, binaryBuffer };
}

function extractReportText({
  binaryBuffer,
  contentType,
  fileName,
}: {
  binaryBuffer: Buffer;
  contentType: string;
  fileName: string;
}) {
  const lowerFileName = fileName.toLowerCase();

  if (
    contentType.startsWith("text/") ||
    lowerFileName.endsWith(".txt") ||
    lowerFileName.endsWith(".csv") ||
    lowerFileName.endsWith(".md")
  ) {
    return buildExtractedText(binaryBuffer.toString("utf8"));
  }

  if (contentType.includes("json") || lowerFileName.endsWith(".json")) {
    return buildExtractedText(binaryBuffer.toString("utf8"));
  }

  if (contentType.includes("pdf") || lowerFileName.endsWith(".pdf")) {
    const latin1 = binaryBuffer.toString("latin1");
    const pdfStrings = Array.from(latin1.matchAll(/\(([\s\S]*?)(?<!\\)\)/g))
      .map((match) => match[1].replace(/\\[nrt]/g, " ").replace(/\\\(/g, "(").replace(/\\\)/g, ")"))
      .filter((value) => /[A-Za-z]{3,}/.test(value));

    const joined = pdfStrings.join("\n");

    if (joined.length > 220) {
      return buildExtractedText(joined);
    }

    const printableTokens = latin1.match(/[A-Za-z][A-Za-z0-9,./()\-:& ]{2,}/g) ?? [];
    return buildExtractedText(printableTokens.join("\n"));
  }

  return buildExtractedText(binaryBuffer.toString("utf8"));
}

function buildExtractedText(text: string) {
  const normalizedText = text
    .replace(/\u0000/g, " ")
    .replace(/[^\S\r\n]+/g, " ")
    .replace(/\r/g, "")
    .trim();
  const lines = normalizedText
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0);
  const letterCount = (normalizedText.match(/[A-Za-z]/g) ?? []).length;
  const requiresOcrReview = normalizedText.length < 320 || letterCount / Math.max(normalizedText.length, 1) < 0.35;

  return {
    normalizedText,
    lines,
    requiresOcrReview,
  };
}

function classifyInspectionType(text: string) {
  const normalized = text.toLowerCase();

  for (const candidate of sourcePatterns) {
    if (candidate.keywords.some((keyword) => normalized.includes(keyword))) {
      return {
        ...candidate.inspectionType,
        sourceSystem: candidate.sourceSystem,
      };
    }
  }

  return {
    code: "EXTERNAL_AUDIT",
    name: "External Audit",
    category: "AUDIT" as const,
    sourceSystem: "Generic external report",
  };
}

function extractFindings(lines: string[]) {
  const findingLines = lines.filter((line) =>
    /(finding|observation|deficiency|non.?conform|issue|recommendation|action required)/i.test(line)
  );

  return findingLines.slice(0, 12).map((line, index) => ({
    index: index + 1,
    title: line.slice(0, 140),
    severity: /critical|detention|major/i.test(line)
      ? "CRITICAL"
      : /high|significant/i.test(line)
        ? "HIGH"
        : /medium|moderate/i.test(line)
          ? "MEDIUM"
          : "LOW",
  }));
}

function extractSingleValue(lines: string[], labels: string[]) {
  for (const line of lines) {
    const normalized = line.toLowerCase();

    for (const label of labels) {
      if (normalized.startsWith(label.toLowerCase())) {
        const [, value] = line.split(/[:\-]/, 2);
        if (value?.trim()) {
          return value.trim();
        }
      }
    }
  }

  return null;
}

function extractDate(text: string) {
  const match =
    text.match(/\b(\d{2}[/-]\d{2}[/-]\d{4})\b/) ??
    text.match(/\b(\d{4}[/-]\d{2}[/-]\d{2})\b/) ??
    text.match(/\b(\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})\b/);

  return match?.[1] ?? null;
}
