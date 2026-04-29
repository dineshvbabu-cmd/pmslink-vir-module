"use client";

import { useEffect, useRef, useState } from "react";

export function LiveSectionProgress({
  formId,
  questionCount,
  savedAnsweredCount,
}: {
  formId: string;
  questionCount: number;
  savedAnsweredCount: number;
}) {
  const [liveCount, setLiveCount] = useState(savedAnsweredCount);
  const formRef = useRef<HTMLFormElement | null>(null);

  useEffect(() => {
    const form = document.getElementById(formId) as HTMLFormElement | null;
    if (!form) return;
    formRef.current = form;

    function recount() {
      if (!formRef.current) return;
      // Collect all question input names (q: prefix for answer, status: for T/I/NS/NA)
      const answered = new Set<string>();
      const inputs = formRef.current.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
        "input[name], select[name], textarea[name]"
      );
      for (const el of inputs) {
        const name = el.getAttribute("name") ?? "";
        if (!name.startsWith("q:") && !name.startsWith("status:")) continue;
        const questionId = name.replace(/^(q:|status:)/, "");
        if (el instanceof HTMLInputElement && el.type === "radio") {
          if (el.checked) answered.add(questionId);
        } else if (el instanceof HTMLInputElement && el.type === "text") {
          if (el.value.trim()) answered.add(questionId);
        } else if (el instanceof HTMLInputElement && el.type === "checkbox") {
          if (el.checked) answered.add(questionId);
        } else if (el instanceof HTMLInputElement && el.type === "number") {
          if (el.value.trim()) answered.add(questionId);
        } else if (el instanceof HTMLSelectElement) {
          if (el.value && el.value !== "") answered.add(questionId);
        } else if (el instanceof HTMLTextAreaElement) {
          if (el.value.trim()) answered.add(questionId);
        }
      }
      setLiveCount(answered.size);
    }

    recount();
    form.addEventListener("change", recount);
    form.addEventListener("input", recount);
    return () => {
      form.removeEventListener("change", recount);
      form.removeEventListener("input", recount);
    };
  }, [formId]);

  const pct = questionCount > 0 ? Math.round((liveCount / questionCount) * 100) : 0;
  const allDone = liveCount >= questionCount && questionCount > 0;

  return (
    <div style={{ display: "flex", alignItems: "center", gap: "0.6rem", fontSize: "0.76rem", color: allDone ? "var(--color-success, #2e7d32)" : "var(--color-ink-soft)" }}>
      <span style={{ fontWeight: 700 }}>{liveCount}/{questionCount}</span>
      <span>answered in this section</span>
      <span style={{ fontWeight: 600, opacity: 0.8 }}>({pct}%)</span>
    </div>
  );
}
