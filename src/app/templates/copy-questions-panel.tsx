"use client";

import { useRef, useState } from "react";
import { Copy } from "lucide-react";
import { copyQuestionsFromSectionAction } from "@/app/actions";

type SectionQuestion = { id: string; code: string; prompt: string };

type SectionOption = {
  id: string;
  title: string;
  questionCount: number;
  templateName: string;
  groupName: string;
  questions: SectionQuestion[];
};

type Props = {
  sections: SectionOption[];
  targetSectionId: string;
  returnTo: string;
};

export function CopyQuestionsPanel({ sections, targetSectionId, returnTo }: Props) {
  const [sourceSectionId, setSourceSectionId] = useState("");
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const selectAllRef = useRef<HTMLInputElement>(null);

  const sourceSection = sections.find((s) => s.id === sourceSectionId) ?? null;
  const totalQ = sourceSection?.questions.length ?? 0;
  const selectedCount = selectedIds.size;
  const allSelected = totalQ > 0 && selectedCount === totalQ;
  const someSelected = selectedCount > 0;

  const handleSectionChange = (id: string) => {
    setSourceSectionId(id);
    setSelectedIds(new Set());
  };

  const toggleQuestion = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (!sourceSection) return;
    setSelectedIds(allSelected ? new Set() : new Set(sourceSection.questions.map((q) => q.id)));
  };

  // Keep indeterminate in sync
  if (selectAllRef.current) {
    selectAllRef.current.indeterminate = someSelected && !allSelected;
  }

  return (
    <details className="panel list-card">
      <summary style={{ cursor: "pointer", fontWeight: 600, padding: "0.25rem 0" }}>
        <Copy size={13} style={{ display: "inline", marginRight: "0.4rem" }} />
        Copy questions from another section
      </summary>

      <p className="panel-subtitle" style={{ margin: "0.5rem 0 0.75rem" }}>
        Select a source section, then pick which questions to copy. Duplicate codes are renamed automatically.
      </p>

      {/* Section dropdown */}
      <label style={{ display: "flex", flexDirection: "column", gap: "0.3rem", fontSize: "0.85rem", fontWeight: 600, marginBottom: "0.75rem" }}>
        Source section
        <select
          value={sourceSectionId}
          onChange={(e) => handleSectionChange(e.target.value)}
          style={{ fontSize: "0.85rem", fontWeight: 400 }}
        >
          <option value="">— Select a section —</option>
          {sections.map((s) => (
            <option key={s.id} value={s.id}>
              {s.groupName} / {s.templateName} / {s.title} ({s.questionCount} questions)
            </option>
          ))}
        </select>
      </label>

      {/* Question checklist */}
      {sourceSection && (
        <div style={{ marginBottom: "0.75rem" }}>
          {/* Select-all header */}
          <label
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.6rem",
              padding: "0.4rem 0.65rem",
              background: "var(--color-surface-alt, #f3f5f8)",
              borderRadius: "4px 4px 0 0",
              border: "1px solid var(--color-border)",
              borderBottom: "1px solid var(--color-border)",
              fontSize: "0.82rem",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            <input
              type="checkbox"
              ref={selectAllRef}
              checked={allSelected}
              onChange={toggleAll}
            />
            {someSelected
              ? `${selectedCount} of ${totalQ} question${totalQ !== 1 ? "s" : ""} selected`
              : `Select all ${totalQ} questions`}
          </label>

          {/* Scrollable question rows */}
          <div
            style={{
              maxHeight: "17rem",
              overflowY: "auto",
              border: "1px solid var(--color-border)",
              borderTop: "none",
              borderRadius: "0 0 4px 4px",
            }}
          >
            {sourceSection.questions.map((q) => (
              <label
                key={q.id}
                style={{
                  display: "flex",
                  alignItems: "flex-start",
                  gap: "0.6rem",
                  padding: "0.45rem 0.65rem",
                  cursor: "pointer",
                  borderBottom: "1px solid var(--color-border-subtle, #eee)",
                  fontSize: "0.82rem",
                  lineHeight: 1.4,
                  background: selectedIds.has(q.id) ? "var(--color-surface-highlight, #f0f6ff)" : undefined,
                }}
              >
                <input
                  type="checkbox"
                  checked={selectedIds.has(q.id)}
                  onChange={() => toggleQuestion(q.id)}
                  style={{ marginTop: "0.15rem", flexShrink: 0 }}
                />
                <span style={{ color: "var(--color-ink-soft)", fontWeight: 600, minWidth: "4.5rem", flexShrink: 0 }}>
                  {q.code || "—"}
                </span>
                <span style={{ color: "var(--color-ink)", flex: 1 }}>{q.prompt}</span>
              </label>
            ))}
          </div>
        </div>
      )}

      {/* Hidden form to submit */}
      <form action={copyQuestionsFromSectionAction}>
        <input name="targetSectionId" type="hidden" value={targetSectionId} />
        <input name="sourceSectionId" type="hidden" value={sourceSectionId} />
        <input name="returnTo" type="hidden" value={returnTo} />
        {Array.from(selectedIds).map((id) => (
          <input key={id} name="questionId" type="hidden" value={id} />
        ))}
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.25rem" }}>
          <button
            className="btn btn-compact"
            type="submit"
            disabled={!sourceSectionId || !someSelected}
          >
            <Copy size={13} />
            {someSelected
              ? `Copy ${selectedCount} question${selectedCount !== 1 ? "s" : ""}`
              : "Copy questions"}
          </button>
          {sourceSection && !someSelected && (
            <span style={{ fontSize: "0.8rem", color: "var(--color-ink-soft)" }}>
              Select at least one question to copy
            </span>
          )}
        </div>
      </form>
    </details>
  );
}
