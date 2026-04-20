type OcrExtractionResult = {
  text: string | null;
  provider: string | null;
  notes: string[];
};

type LlmFinding = {
  index: number;
  title: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
};

type LlmExtractionResult = {
  inspectionTypeCode: string | null;
  inspectionTypeName: string | null;
  vesselName: string | null;
  reportDate: string | null;
  externalReference: string | null;
  findings: LlmFinding[];
  notes: string[];
  provider: string | null;
};

function hasAzureDocumentIntelligenceConfig() {
  return Boolean(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT && process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY);
}

function hasOpenAiConfig() {
  return Boolean(process.env.OPENAI_API_KEY);
}

function normalizeEndpoint(endpoint: string) {
  return endpoint.endsWith("/") ? endpoint.slice(0, -1) : endpoint;
}

async function delay(ms: number) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

export async function extractTextWithOcr({
  binaryBuffer,
  contentType,
  fileName,
}: {
  binaryBuffer: Buffer;
  contentType: string;
  fileName: string;
}): Promise<OcrExtractionResult> {
  const isPdf = contentType.includes("pdf") || fileName.toLowerCase().endsWith(".pdf");

  if (!isPdf || !hasAzureDocumentIntelligenceConfig()) {
    return {
      text: null,
      provider: null,
      notes: [],
    };
  }

  const endpoint = normalizeEndpoint(process.env.AZURE_DOCUMENT_INTELLIGENCE_ENDPOINT!);
  const model = process.env.AZURE_DOCUMENT_INTELLIGENCE_MODEL ?? "prebuilt-layout";
  const apiVersion = process.env.AZURE_DOCUMENT_INTELLIGENCE_API_VERSION ?? "2024-11-30";
  const submitResponse = await fetch(
    `${endpoint}/documentintelligence/documentModels/${model}:analyze?api-version=${apiVersion}`,
    {
      method: "POST",
      headers: {
        "Content-Type": contentType || "application/pdf",
        "Ocp-Apim-Subscription-Key": process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY!,
      },
      body: new Uint8Array(binaryBuffer),
    }
  );

  if (!submitResponse.ok) {
    const errorText = await submitResponse.text();
    throw new Error(`Azure Document Intelligence submission failed: ${errorText}`);
  }

  const operationLocation = submitResponse.headers.get("operation-location");

  if (!operationLocation) {
    throw new Error("Azure Document Intelligence did not return an operation location.");
  }

  for (let attempt = 0; attempt < 12; attempt += 1) {
    await delay(1500);
    const resultResponse = await fetch(operationLocation, {
      headers: {
        "Ocp-Apim-Subscription-Key": process.env.AZURE_DOCUMENT_INTELLIGENCE_KEY!,
      },
    });

    if (!resultResponse.ok) {
      const errorText = await resultResponse.text();
      throw new Error(`Azure Document Intelligence polling failed: ${errorText}`);
    }

    const result = (await resultResponse.json()) as {
      status?: string;
      analyzeResult?: { content?: string };
    };

    if (result.status === "succeeded") {
      return {
        text: result.analyzeResult?.content?.trim() ?? null,
        provider: "Azure Document Intelligence",
        notes: ["OCR extracted using Azure Document Intelligence."],
      };
    }

    if (result.status === "failed") {
      throw new Error("Azure Document Intelligence OCR job failed.");
    }
  }

  throw new Error("Azure Document Intelligence OCR timed out.");
}

export async function extractStructuredReportWithLlm({
  fileName,
  normalizedText,
}: {
  fileName: string;
  normalizedText: string;
}): Promise<LlmExtractionResult | null> {
  if (!hasOpenAiConfig() || normalizedText.trim().length === 0) {
    return null;
  }

  const prompt = [
    "You extract vessel inspection reports into structured JSON for a maritime QHSE VIR system.",
    "Focus on questionnaire / inspection family classification, vessel name, report date, external reference, and findings.",
    "Return only schema-compliant JSON.",
    `Source file: ${fileName}`,
    "",
    normalizedText.slice(0, 24000),
  ].join("\n");

  const response = await fetch(`${normalizeEndpoint(process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1")}/responses`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: process.env.OPENAI_IMPORT_MODEL ?? "gpt-4o-mini",
      input: [
        {
          role: "user",
          content: [{ type: "input_text", text: prompt }],
        },
      ],
      text: {
        format: {
          type: "json_schema",
          name: "vir_import_extraction",
          strict: true,
          schema: {
            type: "object",
            additionalProperties: false,
            properties: {
              inspectionTypeCode: { type: ["string", "null"] },
              inspectionTypeName: { type: ["string", "null"] },
              vesselName: { type: ["string", "null"] },
              reportDate: { type: ["string", "null"] },
              externalReference: { type: ["string", "null"] },
              notes: {
                type: "array",
                items: { type: "string" },
              },
              findings: {
                type: "array",
                items: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    index: { type: "integer" },
                    title: { type: "string" },
                    severity: {
                      type: "string",
                      enum: ["LOW", "MEDIUM", "HIGH", "CRITICAL"],
                    },
                  },
                  required: ["index", "title", "severity"],
                },
              },
            },
            required: [
              "inspectionTypeCode",
              "inspectionTypeName",
              "vesselName",
              "reportDate",
              "externalReference",
              "notes",
              "findings",
            ],
          },
        },
      },
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenAI extraction failed: ${errorText}`);
  }

  const payload = (await response.json()) as {
    output_text?: string;
    output?: Array<{
      content?: Array<{
        type?: string;
        text?: string;
      }>;
    }>;
  };
  const outputText =
    payload.output_text ??
    payload.output?.flatMap((item) => item.content ?? []).find((item) => typeof item.text === "string")?.text ??
    "";

  if (!outputText) {
    return null;
  }

  const parsed = JSON.parse(outputText) as Omit<LlmExtractionResult, "provider">;
  return {
    ...parsed,
    provider: "OpenAI Responses API",
  };
}
