"use client";

import { useEffect, useRef, useState } from "react";

interface GuidancePanelProps {
  helpText: string | null;
  smsReference?: string | null;
  sireReference?: string | null;
  risqReference?: string | null;
  questionCode?: string | null;
}

export function GuidancePanel({
  helpText,
  smsReference,
  sireReference,
  risqReference,
  questionCode,
}: GuidancePanelProps) {
  const [open, setOpen] = useState(false);
  const panelRef = useRef<HTMLDivElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        panelRef.current &&
        !panelRef.current.contains(e.target as Node) &&
        btnRef.current &&
        !btnRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const hasRefs = smsReference || sireReference || risqReference;

  return (
    <span style={{ position: "relative", display: "inline-block" }}>
      <button
        ref={btnRef}
        className="guidance-btn"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        type="button"
        title="View guidance"
        aria-label="View guidance"
      >
        ?
      </button>

      {open && (
        <div
          ref={panelRef}
          className="guidance-panel-popup"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="guidance-panel-header">
            <span>Guidance{questionCode ? ` · ${questionCode}` : ""}</span>
            <button
              className="guidance-panel-close"
              onClick={() => setOpen(false)}
              type="button"
              aria-label="Close guidance"
            >
              ×
            </button>
          </div>

          {helpText && (
            <div className="guidance-panel-body">
              {helpText.split(/\n+/).map((line, i) => (
                <p key={i} style={{ margin: "0 0 0.4rem 0" }}>{line}</p>
              ))}
            </div>
          )}

          {hasRefs && (
            <div className="guidance-panel-refs">
              <span className="guidance-panel-refs-label">References</span>
              {smsReference && (
                <div className="guidance-panel-ref-row">
                  <span className="guidance-ref-tag">SMS</span>
                  <span>{smsReference}</span>
                </div>
              )}
              {sireReference && (
                <div className="guidance-panel-ref-row">
                  <span className="guidance-ref-tag">SIRE VIQ</span>
                  <span>{sireReference}</span>
                </div>
              )}
              {risqReference && (
                <div className="guidance-panel-ref-row">
                  <span className="guidance-ref-tag">RISQ</span>
                  <span>{risqReference}</span>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </span>
  );
}
