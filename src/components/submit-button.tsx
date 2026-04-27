"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className,
  confirmMessage,
  style,
}: {
  children: React.ReactNode;
  className?: string;
  confirmMessage?: string;
  style?: React.CSSProperties;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      disabled={pending}
      style={style}
      onClick={
        confirmMessage
          ? (event) => {
              if (!window.confirm(confirmMessage)) {
                event.preventDefault();
              }
            }
          : undefined
      }
      type="submit"
    >
      {pending ? "Working..." : children}
    </button>
  );
}
