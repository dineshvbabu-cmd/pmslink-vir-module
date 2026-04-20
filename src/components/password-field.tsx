"use client";

import { useId, useState } from "react";

export function PasswordField({
  defaultValue,
  id,
  label,
  name,
  placeholder,
}: {
  id?: string;
  name: string;
  label: string;
  defaultValue?: string;
  placeholder?: string;
}) {
  const fallbackId = useId();
  const inputId = id ?? fallbackId;
  const [visible, setVisible] = useState(false);

  return (
    <div className="field-wide">
      <label htmlFor={inputId}>{label}</label>
      <div className="password-field">
        <input
          defaultValue={defaultValue}
          id={inputId}
          name={name}
          placeholder={placeholder}
          type={visible ? "text" : "password"}
        />
        <button
          aria-label={visible ? "Hide password" : "Show password"}
          className="password-toggle"
          onClick={() => setVisible((current) => !current)}
          type="button"
        >
          {visible ? "Hide" : "Show"}
        </button>
      </div>
    </div>
  );
}
