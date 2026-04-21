import Link from "next/link";
import type { LucideIcon } from "lucide-react";

type ActionIconTone = "neutral" | "primary" | "success" | "warning" | "danger";

export function ActionIconLink({
  href,
  icon: Icon,
  label,
  tone = "neutral",
}: {
  href: string;
  icon: LucideIcon;
  label: string;
  tone?: ActionIconTone;
}) {
  return (
    <Link aria-label={label} className={`action-icon-link action-icon-link-${tone}`} href={href} title={label}>
      <Icon size={15} />
      <span className="sr-only">{label}</span>
    </Link>
  );
}
