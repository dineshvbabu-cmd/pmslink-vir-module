"use client";

import type { LucideIcon } from "lucide-react";

type ActionIconTone = "neutral" | "primary" | "success" | "warning" | "danger";

export function ActionIconButton({
  icon: Icon,
  label,
  tone = "neutral",
  type = "button",
  confirmMessage,
}: {
  icon: LucideIcon;
  label: string;
  tone?: ActionIconTone;
  type?: "button" | "submit";
  confirmMessage?: string;
}) {
  return (
    <button
      aria-label={label}
      className={`action-icon-link action-icon-link-${tone}`}
      onClick={
        confirmMessage
          ? (event) => {
              if (!window.confirm(confirmMessage)) {
                event.preventDefault();
              }
            }
          : undefined
      }
      title={label}
      type={type}
    >
      <Icon size={15} />
      <span className="sr-only">{label}</span>
    </button>
  );
}
