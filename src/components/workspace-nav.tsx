"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import type { WorkspaceNavItem } from "@/lib/vir/session";

export function WorkspaceNav({ items }: { items: WorkspaceNavItem[] }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const current = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;

  return (
    <nav className="workspace-nav">
      {items.map((item) => {
        const targetPath = item.href.split("?")[0];
        const itemQuery = item.href.includes("?") ? item.href.slice(item.href.indexOf("?")) : "";
        const currentQuery = current.includes("?") ? current.slice(current.indexOf("?")) : "";
        const isExactQueryMatch = pathname === targetPath && itemQuery.length > 0 && itemQuery === currentQuery;
        const isBaseMatch =
          itemQuery.length === 0 &&
          (pathname === targetPath ||
            (targetPath !== "/" && pathname.startsWith(`${targetPath}/`)) ||
            (pathname === "/inspections" && targetPath === "/inspections"));
        const isActive = isExactQueryMatch || isBaseMatch;

        return (
          <Link
            key={item.href}
            className={`workspace-nav-link ${isActive ? "workspace-nav-link-active" : ""}`}
            href={item.href}
          >
            <span className="workspace-nav-label">{item.label}</span>
            <span className="workspace-nav-note">{item.note}</span>
          </Link>
        );
      })}
    </nav>
  );
}
