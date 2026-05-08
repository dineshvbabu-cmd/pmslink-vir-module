"use client";

import { useEffect } from "react";

export function ScoreHintObserver() {
  useEffect(() => {
    function applyHint(scoreEl: HTMLSelectElement) {
      const row = scoreEl.closest("tr");
      if (!row) return;

      const commentInput = row.querySelector<HTMLInputElement>("input[name^='comment:']");
      row.querySelectorAll(".score-hint-badge").forEach((el) => el.remove());
      if (commentInput) {
        commentInput.classList.remove("score-comment-required", "score-best-practice");
      }

      const score = Number(scoreEl.value);
      if (!score) return;

      const badge = document.createElement("span");
      badge.className = "score-hint-badge";

      if (score <= 2) {
        badge.classList.add("score-hint-warn");
        badge.textContent = score === 1 ? "Unsatisfactory — comment required" : "Fair — comment required";
        if (commentInput) {
          commentInput.classList.add("score-comment-required");
          commentInput.placeholder = "Comment required…";
        }
      } else if (score === 5) {
        badge.classList.add("score-hint-bp");
        badge.textContent = "Excellent — note best practice";
        if (commentInput) {
          commentInput.classList.add("score-best-practice");
          commentInput.placeholder = "Best practice noted…";
        }
      } else {
        return;
      }

      const scoreTd = scoreEl.closest("td");
      if (scoreTd) scoreTd.appendChild(badge);
    }

    function handleChange(e: Event) {
      const target = e.target as HTMLElement;
      if (target instanceof HTMLSelectElement && target.name.startsWith("score:")) {
        applyHint(target);
      }
    }

    // Apply hints to any pre-filled scores on mount
    document.querySelectorAll<HTMLSelectElement>("select[name^='score:']").forEach((el) => {
      if (el.value) applyHint(el);
    });

    document.addEventListener("change", handleChange);
    return () => document.removeEventListener("change", handleChange);
  }, []);

  return null;
}
