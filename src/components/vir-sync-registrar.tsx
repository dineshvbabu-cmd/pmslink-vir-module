"use client";

import { useEffect } from "react";

export function VirSyncRegistrar() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) {
      return;
    }

    void navigator.serviceWorker.register("/vir-sync-sw.js");
  }, []);

  return null;
}
