"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { WorkspaceNavItem } from "@/lib/vir/session";

export function WorkspaceNav({ items }: { items: WorkspaceNavItem[] }) {
  const pathname = usePathname();

  return (
    <nav className="workspace-nav">
      {items.map((item) => {
        const targetPath = item.href.split("?")[0];
        const isActive =
          pathname === targetPath ||
          (targetPath !== "/" && pathname.startsWith(`${targetPath}/`)) ||
          (pathname === "/inspections" && targetPath === "/inspections");

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
