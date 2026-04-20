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
  "PSC",
  "TMSA",
  "RIGHTSHIP",
  "CID",
  "SIRE_2_0",
  "INTERNAL_AUDIT",
  "EXTERNAL_AUDIT",
  "GENERIC",
];

const formatOptions: VirTemplateInputFormat[] = ["ROW_TABLE", "PLAIN_TEXT", "CANONICAL_JSON"];

export function TemplateImportConsole() {
  const router = useRouter();
  const [sourceStandard, setSourceStandard] = useState<VirTemplateSourceStandard>("PSC");
  const [inputFormat, setInputFormat] = useState<VirTemplateInputFormat>("ROW_TABLE");
  const [content, setContent] = useState(getImportSample("PSC", "ROW_TABLE"));
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, setIsPending] = useState(false);
  const [editorStatus, setEditorStatus] = useState(
    "Sample editor ready. Pick a source and format, then load the matching sample or paste your real checklist content."
  );

  const activeSample = useMemo(() => getImportSample(sourceStandard, inputFormat), [sourceStandard, inputFormat]);

  function loadSample() {
    setContent(activeSample);
    setResult(null);
    setEditorStatus(`Loaded ${sourceStandard.replaceAll("_", " ")} / ${inputFormat.replaceAll("_", " ")} sample content.`);
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
            Import checklist and questionnaire definitions from TMSA, PSC, RightShip, CID, SIRE 2.0, and audit sources,
            then normalize them into one VIR template structure for operational use.
          </p>
        </div>
        <div className="actions-row">
          <button className="btn-secondary" onClick={loadSample} type="button">
            Load sample
          </button>
          <button className="btn-secondary" disabled={isPending} onClick={() => runImport(false)} type="button">
            {isPending ? "Running..." : "Dry run"}
          </button>
          <button className="btn" disabled={isPending} onClick={() => runImport(true)} type="button">
            {isPending ? "Running..." : "Commit template"}
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

      <div className="field-wide" style={{ marginTop: "1rem" }}>
        <label htmlFor="content">Imported checklist / questionnaire content</label>
        <textarea
          id="content"
          onChange={(event) => {
            setContent(event.target.value);
            setEditorStatus("Editor updated. Run Dry run to generate the review workspace or Commit template to register it.");
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
                    ? "Template committed successfully and available for inspection launch."
                    : "Dry-run review generated. Open the review session below for structured validation."}
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
