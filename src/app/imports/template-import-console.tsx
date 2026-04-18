"use client";

import { startTransition, useState } from "react";
import { VIR_SAMPLE_TEMPLATE_PAYLOAD } from "@/lib/vir/catalog";

type ImportResult =
  | {
      ok: true;
      mode: string;
      summary?: Record<string, unknown>;
      warnings?: string[];
      template?: unknown;
      inspectionType?: { id: string; code: string; name: string };
      existingTemplateId?: string;
      error?: undefined;
    }
  | {
      ok?: false;
      error: string;
      existingTemplateId?: string;
    };

export function TemplateImportConsole() {
  const [payload, setPayload] = useState(JSON.stringify(VIR_SAMPLE_TEMPLATE_PAYLOAD, null, 2));
  const [result, setResult] = useState<ImportResult | null>(null);
  const [isPending, setIsPending] = useState(false);

  function runImport(commit: boolean) {
    startTransition(async () => {
      setIsPending(true);

      try {
        const response = await fetch(`/api/vir/templates/import${commit ? "?commit=true" : ""}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: payload,
        });

        const data = (await response.json()) as ImportResult;
        setResult(data);
      } catch (error) {
        setResult({
          error: error instanceof Error ? error.message : "Failed to run template import.",
        });
      } finally {
        setIsPending(false);
      }
    });
  }

  return (
    <div className="panel">
      <div className="section-header">
        <div>
          <h3 className="panel-title">Template Import Console</h3>
          <p className="panel-subtitle">
            Dry-run or commit a questionnaire template payload into the VIR template library. This uses the live import API already in the module.
          </p>
        </div>
        <div className="actions-row">
          <button className="btn-secondary" onClick={() => setPayload(JSON.stringify(VIR_SAMPLE_TEMPLATE_PAYLOAD, null, 2))} type="button">
            Load Sample
          </button>
          <button className="btn-secondary" disabled={isPending} onClick={() => runImport(false)} type="button">
            {isPending ? "Running..." : "Dry Run"}
          </button>
          <button className="btn" disabled={isPending} onClick={() => runImport(true)} type="button">
            {isPending ? "Running..." : "Commit Template"}
          </button>
        </div>
      </div>

      <div className="field-wide">
        <label htmlFor="payload">Template Payload</label>
        <textarea
          id="payload"
          onChange={(event) => setPayload(event.target.value)}
          style={{ minHeight: "380px", fontFamily: "Consolas, monospace" }}
          value={payload}
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

