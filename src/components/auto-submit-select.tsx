"use client";

export function AutoSubmitSelect({
  name,
  defaultValue,
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
  return (
    <select
      name={name}
      defaultValue={defaultValue}
      className={className}
      style={style}
      onChange={(e) => {
        e.currentTarget.form?.submit();
      }}
    >
      {children}
    </select>
  );
}
