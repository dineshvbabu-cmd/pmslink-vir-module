"use client";

import { useEffect, useState } from "react";

export function AutoSubmitSelect({
  name,
  defaultValue = "",
  className,
  style,
  children,
}: {
  name: string;
  defaultValue?: string;
  className?: string;
  style?: React.CSSProperties;
  children: React.ReactNode;
}) {
  const [value, setValue] = useState(defaultValue);

  useEffect(() => {
    setValue(defaultValue);
  }, [defaultValue]);

  return (
    <select
      name={name}
      value={value}
      className={className}
      style={style}
      onChange={(e) => {
        setValue(e.target.value);
        e.currentTarget.form?.submit();
      }}
    >
      {children}
    </select>
  );
}
