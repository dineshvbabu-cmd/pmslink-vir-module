"use client";

import { useFormStatus } from "react-dom";

export function SubmitButton({
  children,
  className,
  confirmMessage,
}: {
  children: React.ReactNode;
  className?: string;
  confirmMessage?: string;
}) {
  const { pending } = useFormStatus();

  return (
    <button
      className={className}
      disabled={pending}
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
