"use client";

export function PrintButton({ className = "btn-secondary" }: { className?: string }) {
  return (
    <button
      className={className}
      onClick={() => window.print()}
      type="button"
    >
      Print / Save PDF
    </button>
  );
}
