"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const VIR_FILTER_COOKIE = "vir_workspace_filter";
type VirWorkspace = "OFFICE" | "VESSEL";

type WorkspaceFilterPayload = {
  vesselId?: string;
  range?: string;
  fleet?: string;
  updatedAt?: number;
};

function readExistingFilter(): WorkspaceFilterPayload {
  const cookieValue = document.cookie
    .split("; ")
    .find((entry) => entry.startsWith(`${VIR_FILTER_COOKIE}=`))
    ?.slice(VIR_FILTER_COOKIE.length + 1);

  if (!cookieValue) {
    return {};
  }

  try {
    return JSON.parse(decodeURIComponent(cookieValue)) as WorkspaceFilterPayload;
  } catch {
    return {};
  }
}

function writeFilter(nextFilter: WorkspaceFilterPayload) {
  const encoded = encodeURIComponent(JSON.stringify(nextFilter));
  document.cookie = `${VIR_FILTER_COOKIE}=${encoded}; path=/; max-age=${60 * 60 * 12}; samesite=lax`;
}

export function WorkspaceFilterSync({ workspace }: { workspace: VirWorkspace }) {
  const pathname = usePathname();
  const searchParams = useSearchParams();

  useEffect(() => {
    if (workspace !== "OFFICE") {
      return;
    }

    const nextFilter = readExistingFilter();
    let touched = false;

    if (searchParams.has("vesselId")) {
      const value = searchParams.get("vesselId")?.trim() ?? "";
      if (value) {
        nextFilter.vesselId = value;
      } else {
        delete nextFilter.vesselId;
      }
      touched = true;
    }

    if ((pathname === "/" || pathname.startsWith("/dashboards")) && searchParams.has("range")) {
      const value = searchParams.get("range")?.trim() ?? "";
      if (value) {
        nextFilter.range = value;
      } else {
        delete nextFilter.range;
      }
      touched = true;
    }

    if (pathname === "/" && searchParams.has("fleet")) {
      const value = searchParams.get("fleet")?.trim() ?? "";
      if (value) {
        nextFilter.fleet = value;
      } else {
        delete nextFilter.fleet;
      }
      touched = true;
    }

    if (touched) {
      nextFilter.updatedAt = Date.now();
      writeFilter(nextFilter);
    }
  }, [pathname, searchParams, workspace]);

  return null;
}
