"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { startTransition, useMemo, useState } from "react";
import {
  getImportSample,
  type VirTemplateImport,
  type VirTemplateInputFormat,
  type VirTemplateSourceStandard,
} from "@/lib/vir/import";

type ImportResult =
  | {
      ok: true;
      mode: string;
      summary?: Record<string, unknown>;
      warnings?: string[];
      template?: VirTemplateImport;
      fieldReviews?: Array<Record<string, unknown>>;
      inspectionType?: { id: string; code: string; name: string };
      sessionId?: string;
      existingTemplateId?: string;
      error?: undefined;
    }
  | {
      ok?: false;
      error: string;
      existingTemplateId?: string;
    };

const sourceOptions: VirTemplateSourceStandard[] = [
  "INTERNAL_AUDIT",
  "EXTERNAL_AUDIT",
  "GENERIC",
];

const formatOptions: VirTemplateInputFormat[] = ["ROW_TABLE", "PLAIN_TEXT", "CANONICAL_JSON"];

export function TemplateImportConsole() {
  const router = useRouter();
  const [sourceStandard, setSourceStandard] = useState<VirTemplateSourceStandard>("INTERNAL_AUDIT");
  const [inputFormat, setInputFormat] = useState<VirTemplateInputFormat>("ROW_TABLE");
  const [content, setContent] = useState(getImportSample("INTERNAL_AUDIT", "ROW_TABLE"));
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [editorStatus, setEditorStatus] = useState(
    "Sample editor ready. Pick a source and format, then load the matching sample or paste your real checklist content."
  );

  const activeSample = useMemo(() => getImportSample(sourceStandard, inputFormat), [sourceStandard, inputFormat]);

  function loadSample() {
    setContent(activeSample);
    setResult(null);
    setEditorStatus("Sample loaded. Edit if needed, then click Commit template.");
  }

  function runImport(commit: boolean) {
    startTransition(async () => {
      setIsPending(true);

      try {
        const response = await fetch(`/api/vir/templates/import${commit ? "?commit=true" : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            sourceStandard,
            inputFormat,
            content,
          }),
        });

        const data = (await response.json()) as ImportResult;
        setResult(data);
        if ("ok" in data && data.ok && data.sessionId) {
          router.push(`/imports?session=${data.sessionId}`);
        }
      } catch (error) {
        setResult({
          error: error instanceof Error ? error.message : "Failed to run checklist import normalization.",
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
          <h3 className="panel-title">Questionnaire Import Engine</h3>
          <p className="panel-subtitle">
            Import checklist and questionnaire definitions in the seeded VIR format, normalize them into the standard
            inspection template model, and commit directly as a live template.
          </p>
        </div>
        <div className="actions-row">
          <button className="btn-secondary" onClick={loadSample} type="button">
            Load sample
          </button>
          <button className="btn" disabled={isPending} onClick={() => runImport(true)} type="button">
            {isPending ? "Importing..." : "Commit template"}
          </button>
        </div>
      </div>

      <div className="sync-banner">
        <strong>Editor status</strong>
        <div className="small-text" style={{ marginTop: "0.25rem" }}>
          {editorStatus}
        </div>
      </div>

      <div className="form-grid">
        <div className="field">
          <label htmlFor="sourceStandard">Source standard</label>
          <select
            id="sourceStandard"
            onChange={(event) => {
              setSourceStandard(event.target.value as VirTemplateSourceStandard);
              setResult(null);
              setEditorStatus("Source standard changed. Click Load sample to refresh the editor with the new checklist example.");
            }}
            value={sourceStandard}
          >
            {sourceOptions.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label htmlFor="inputFormat">Input format</label>
          <select
            id="inputFormat"
            onChange={(event) => {
              setInputFormat(event.target.value as VirTemplateInputFormat);
              setResult(null);
              setEditorStatus("Input format changed. Click Load sample to inject a matching template example into the editor.");
            }}
            value={inputFormat}
          >
            {formatOptions.map((option) => (
              <option key={option} value={option}>
                {option.replaceAll("_", " ")}
              </option>
            ))}
          </select>
        </div>
      </div>

      <div className="field-wide" style={{ marginTop: "0.75rem" }}>
        <label htmlFor="fileUpload">Upload checklist file (.json, .csv, .txt, .tsv)</label>
        <input
          accept=".json,.csv,.txt,.tsv"
          id="fileUpload"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (!file) return;
            const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
            if (ext === "csv" || ext === "tsv") {
              setInputFormat("ROW_TABLE");
            } else if (ext === "json") {
              setInputFormat("CANONICAL_JSON");
            } else {
              setInputFormat("PLAIN_TEXT");
            }
            const reader = new FileReader();
            reader.onload = (ev) => {
              const text = ev.target?.result as string ?? "";
              setContent(text);
              setResult(null);
              setEditorStatus(`Loaded from file: ${file.name} (${text.length} chars). Format auto-detected. Click Commit template to save.`);
            };
            reader.readAsText(file);
          }}
          style={{ marginTop: "0.35rem" }}
          type="file"
        />
      </div>

      <div className="field-wide" style={{ marginTop: "1rem" }}>
        <label htmlFor="content">Imported checklist / questionnaire content</label>
        <textarea
          id="content"
          onChange={(event) => {
            setContent(event.target.value);
            setEditorStatus("Editor updated. Click Commit template to register it.");
          }}
          style={{ minHeight: "380px", fontFamily: "Consolas, monospace" }}
          value={content}
        />
      </div>

      {result && "ok" in result && result.ok && result.template ? (
        <div className="stack-list" style={{ marginTop: "1rem" }}>
          <div className="panel review-panel">
            <div className="section-header">
              <div>
                <h4 className="panel-title">Import review output</h4>
                <p className="panel-subtitle">
                  {result.mode === "commit"
                    ? "Template committed successfully and is now available for inspection launch."
                    : "Review generated. Open the review session below for structured validation."}
                </p>
              </div>
              <div className="meta-row">
                <span className={`chip ${result.mode === "commit" ? "chip-success" : "chip-warning"}`}>{result.mode}</span>
                {result.sessionId ? <span className="chip chip-info">Session {result.sessionId.slice(0, 8)}</span> : null}
              </div>
            </div>

            <div className="erp-metrics-grid import-review-metrics">
              <Metric label="Sections" value={`${result.summary?.sections ?? result.template.sections.length}`} />
              <Metric
                label="Questions"
                value={`${result.summary?.questions ?? result.template.sections.reduce((sum, section) => sum + section.questions.length, 0)}`}
              />
              <Metric label="Mandatory" value={`${result.summary?.mandatoryQuestions ?? 0}`} />
              <Metric label="High risk" value={`${result.summary?.highRiskQuestions ?? 0}`} />
              <Metric label="CIR / CIC" value={`${result.summary?.cicQuestions ?? 0}`} />
              <Metric label="Option sets" value={`${result.summary?.optionSets ?? 0}`} />
            </div>

            {result.warnings?.length ? (
              <div className="focus-banner" style={{ marginTop: "1rem" }}>
                <div>
                  <strong>Review warnings</strong>
                  <div className="small-text" style={{ marginTop: "0.25rem" }}>
                    These items should be checked before rolling the template across live vessel inspections.
                  </div>
                </div>
                <div className="stack-list" style={{ minWidth: "min(100%, 28rem)" }}>
                  {result.warnings.map((warning) => (
                    <div className="small-text" key={warning}>
                      {warning}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}

            <div className="template-review-grid" style={{ marginTop: "1rem" }}>
              <div className="list-card">
                <div className="question-code">Inspection group</div>
                <div className="list-card-title">{result.template.inspectionTypeName}</div>
                <div className="small-text">{result.template.inspectionTypeCode}</div>
                <div className="meta-row" style={{ marginTop: "0.65rem" }}>
                  <span className="chip chip-info">{result.template.inspectionCategory}</span>
                  <span className="chip chip-warning">v{result.template.version}</span>
                </div>
              </div>

              <div className="list-card">
                <div className="question-code">Checklist template</div>
                <div className="list-card-title">{result.template.templateName}</div>
                <div className="small-text">{result.template.description ?? "No description supplied."}</div>
                {result.sessionId ? (
                  <div className="actions-row" style={{ marginTop: "0.75rem" }}>
                    <Link className="btn-secondary btn-compact" href={`/imports?session=${result.sessionId}`}>
                      Open review page
                    </Link>
                    {result.existingTemplateId ? (
                      <Link className="btn-secondary btn-compact" href={`/templates?template=${result.existingTemplateId}`}>
                        Open existing template
                      </Link>
                    ) : null}
                  </div>
                ) : null}
              </div>
            </div>

            {result.fieldReviews?.length ? (
              <div className="page-stack" style={{ marginTop: "1rem" }}>
                <div>
                  <h4 className="panel-title">Cross-reference review</h4>
                  <p className="panel-subtitle">
                    Validate how the imported source fields have been mapped into the seeded VIR template structure
                    before accepting the template into the office catalogue.
                  </p>
                </div>
                <div className="table-shell table-shell-compact">
                  <table className="table data-table vir-data-table">
                    <thead>
                      <tr>
                        <th>Mapped field</th>
                        <th>Imported value</th>
                        <th>Standardized value</th>
                        <th>Confidence</th>
                        <th>Accepted</th>
                      </tr>
                    </thead>
                    <tbody>
                      {result.fieldReviews.map((review, index) => {
                        const record = review as Record<string, unknown>;
                        const accepted = record.accepted === false ? "No" : "Yes";
                        const confidence =
                          typeof record.confidence === "number" ? `${Math.round(record.confidence * 100)}%` : "n/a";

                        return (
                          <tr key={`${String(record.fieldPath ?? "field")}-${index}`}>
                            <td>{String(record.fieldPath ?? "-")}</td>
                            <td>{String(record.aiValue ?? "-")}</td>
                            <td>{String(record.finalValue ?? "-")}</td>
                            <td>{confidence}</td>
                            <td>{accepted}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : null}

            <div className="stack-list" style={{ marginTop: "1rem" }}>
              {result.template.sections.slice(0, 4).map((section) => (
                <details className="question-section question-section-accordion" key={section.code} open>
                  <summary className="question-section-summary">
                    <div>
                      <strong>{section.title}</strong>
                      <div className="small-text">
                        {section.code} / {section.questions.length} questions
                      </div>
                    </div>
                    <span className="chip chip-info">Checklist group</span>
                  </summary>
                  <div className="stack-list" style={{ marginTop: "0.85rem" }}>
                    {section.questions.slice(0, 5).map((question) => (
                      <div className="question-card question-card-compact" key={question.code}>
                        <div>
                          <div className="question-code">{question.code}</div>
                          <p className="question-prompt">{question.prompt}</p>
                        </div>
                        <div className="meta-row">
                          <span className="chip chip-info">{question.responseType}</span>
                          {question.isMandatory ? <span className="chip chip-warning">Mandatory</span> : null}
                          {question.allowsPhoto ? <span className="chip chip-success">Actual upload enabled</span> : null}
                          {question.referenceImageUrl ? <span className="chip chip-info">Reference image</span> : null}
                          {question.isCicCandidate ? <span className="chip chip-danger">CIR focus</span> : null}
                        </div>
                      </div>
                    ))}
                  </div>
                </details>
              ))}
            </div>

            <details style={{ marginTop: "1rem" }}>
              <summary className="small-text" style={{ cursor: "pointer", fontWeight: 700 }}>
                View raw normalized JSON
              </summary>
              <div className="code-box" style={{ marginTop: "0.75rem" }}>
                {JSON.stringify(result, null, 2)}
              </div>
            </details>
          </div>
        </div>
      ) : null}

      {result && "error" in result ? (
        <div className="empty-state" style={{ marginTop: "1rem", borderColor: "rgba(208, 75, 73, 0.3)", color: "#9b3936" }}>
          {result.error}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-tile metric-tile-static">
      <div className="metric-tile-label">{label}</div>
      <div className="metric-tile-value">{value}</div>
    </div>
  );
}
