"use client";

import type { ReactNode } from "react";

type Props = {
  message: string;
  children?: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  title?: string;
  name?: string;
  value?: string;
};

export function ConfirmButton({ message, children, className, style, title, name, value }: Props) {
  return (
    <button
      className={className}
      name={name}
      style={style}
      title={title}
      type="submit"
      value={value}
      onClick={(e) => {
        if (!window.confirm(message)) e.preventDefault();
      }}
    >
      {children}
    </button>
  );
}
