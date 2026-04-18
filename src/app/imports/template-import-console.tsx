"use client";

import { startTransition, useEffect, useState } from "react";
import {
  getImportSample,
  type VirTemplateInputFormat,
  type VirTemplateSourceStandard,
} from "@/lib/vir/import";

type ImportResult =
  | {
      ok: true;
      mode: string;
      summary?: Record<string, unknown>;
      warnings?: string[];
      template?: unknown;
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
  const [sourceStandard, setSourceStandard] = useState<VirTemplateSourceStandard>("PSC");
  const [inputFormat, setInputFormat] = useState<VirTemplateInputFormat>("ROW_TABLE");
  const [content, setContent] = useState(getImportSample("PSC", "ROW_TABLE"));
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEffect(() => {
    setContent(getImportSample(sourceStandard, inputFormat));
  }, [sourceStandard, inputFormat]);

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
          <button className="btn-secondary" onClick={() => setContent(getImportSample(sourceStandard, inputFormat))} type="button">
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

      <div className="form-grid">
        <div className="field">
          <label htmlFor="sourceStandard">Source standard</label>
          <select
            id="sourceStandard"
            onChange={(event) => setSourceStandard(event.target.value as VirTemplateSourceStandard)}
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
            onChange={(event) => setInputFormat(event.target.value as VirTemplateInputFormat)}
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
          onChange={(event) => setContent(event.target.value)}
          style={{ minHeight: "380px", fontFamily: "Consolas, monospace" }}
          value={content}
        />
      </div>

      {result ? (
        <div className="code-box" style={{ marginTop: "1rem" }}>
          {JSON.stringify(result, null, 2)}
        </div>
      ) : null}
    </div>
  );
}
