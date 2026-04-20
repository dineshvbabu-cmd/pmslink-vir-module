"use client";

import { startTransition, useState } from "react";

type ReportImportResult =
  | {
      ok: true;
      sessionId: string;
      inspectionType: { code: string; name: string; category: string; sourceSystem: string };
      vesselName: string | null;
      reportDate: string | null;
      externalReference: string;
      findings: Array<{ index: number; title: string; severity: string }>;
      reviewNotes: string[];
      summary: Record<string, unknown>;
      fieldReviews: Array<Record<string, unknown>>;
      error?: undefined;
    }
  | {
      ok?: false;
      error: string;
    };

function fileToDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Unable to read selected file."));
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : "");
    reader.readAsDataURL(file);
  });
}

export function ExternalReportConsole() {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [sourceUrl, setSourceUrl] = useState("");
  const [result, setResult] = useState<ReportImportResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  async function runImport() {
    if (!selectedFile) {
      setResult({ error: "Choose a PDF, TXT, CSV, Markdown, or JSON report first." });
      return;
    }

    startTransition(async () => {
      setIsPending(true);

      try {
        const contentBase64 = await fileToDataUrl(selectedFile);
        const response = await fetch("/api/vir/reports/import", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: selectedFile.name,
            contentType: selectedFile.type || "application/octet-stream",
            contentBase64,
            sourceUrl: sourceUrl.trim() || null,
          }),
        });

        const data = (await response.json()) as ReportImportResult;
        setResult(data);
      } catch (error) {
        setResult({
          error: error instanceof Error ? error.message : "Failed to import external report.",
        });
      } finally {
        setIsPending(false);
      }
    });
  }

  return (
    <div className="panel panel-elevated">
      <div className="section-header">
        <div>
          <h3 className="panel-title">External Report Intake</h3>
          <p className="panel-subtitle">
            Upload a live PDF or text report to create an import-review session. When provider keys are configured,
            scanned PDFs go through OCR and the extracted text is normalized through an LLM-backed mapping pass.
          </p>
        </div>
        <div className="actions-row">
          <button className="btn" disabled={isPending} onClick={() => void runImport()} type="button">
            {isPending ? "Parsing..." : "Upload and parse"}
          </button>
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="reportFile">Source file</label>
          <input
            accept=".pdf,.txt,.csv,.md,.json,application/pdf,text/plain,text/csv,application/json"
            id="reportFile"
            onChange={(event) => setSelectedFile(event.target.files?.[0] ?? null)}
            type="file"
          />
        </div>

        <div className="field">
          <label htmlFor="sourceUrl">Source URL or note</label>
          <input
            id="sourceUrl"
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder="https://portal.example.com/report/1234"
            value={sourceUrl}
          />
        </div>
      </div>

      <div className="small-text" style={{ marginTop: "0.75rem" }}>
        The fallback path still supports text PDFs immediately. Add Azure Document Intelligence and OpenAI keys in
        Railway to switch the same intake flow into true OCR and true AI extraction.
      </div>

      {result ? (
        <div className="code-box" style={{ marginTop: "1rem" }}>
          {JSON.stringify(result, null, 2)}
        </div>
      ) : null}
    </div>
  );
}
