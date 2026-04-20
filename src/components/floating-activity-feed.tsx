"use client";

import { useEffect, useState } from "react";
import { Clock3, X } from "lucide-react";
import { ActivityFeed, type ActivityFeedItem } from "@/components/activity-feed";

export function FloatingActivityFeed({
  items,
  subtitle,
  title = "Activity feed",
}: {
  title?: string;
  subtitle?: string;
  items: ActivityFeedItem[];
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open]);

  return (
    <>
      {open ? <button aria-label="Close activity drawer" className="activity-drawer-backdrop" onClick={() => setOpen(false)} type="button" /> : null}

      <aside aria-hidden={!open} className={`activity-drawer ${open ? "activity-drawer-open" : ""}`}>
        <div className="activity-drawer-header">
          <div className="eyebrow">Workflow timeline</div>
          <button aria-label="Close activity drawer" className="activity-drawer-close" onClick={() => setOpen(false)} type="button">
            <X size={18} />
          </button>
        </div>

        <ActivityFeed items={items} subtitle={subtitle} title={title} />
      </aside>

      <button
        aria-expanded={open}
        aria-label="Open activity feed"
        className={`activity-fab ${open ? "activity-fab-open" : ""}`}
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <Clock3 size={18} />
        <span className="activity-fab-count">{items.length}</span>
      </button>
    </>
  );
}
