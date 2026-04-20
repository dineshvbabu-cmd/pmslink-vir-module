"use client";

import Link from "next/link";
import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { VirInspectionStatus } from "@prisma/client";
import { inspectionStatusLabel, toneForInspectionStatus } from "@/lib/vir/workflow";

type ScheduleInspection = {
  id: string;
  title: string;
  vesselId: string;
  vesselName: string;
  inspectionTypeName: string;
  inspectionDate: string;
  status: VirInspectionStatus;
};

type ScheduleRow = {
  id: string;
  name: string;
  inspections: ScheduleInspection[];
};

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + days);
  return next;
}

function startOfDay(date: Date) {
  const next = new Date(date);
  next.setHours(0, 0, 0, 0);
  return next;
}

function isoDay(value: Date | string) {
  const date = typeof value === "string" ? new Date(value) : value;
  return startOfDay(date).toISOString();
}

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short" });
const timelineViews = [
  { id: "week", label: "Week", horizonDays: 7, segmentDays: 1 },
  { id: "month", label: "Month", horizonDays: 31, segmentDays: 7 },
  { id: "quarter", label: "Quarter", horizonDays: 92, segmentDays: 14 },
  { id: "half", label: "Bi-Year", horizonDays: 183, segmentDays: 30 },
  { id: "year", label: "Year", horizonDays: 365, segmentDays: 30 },
] as const;

type TimelineViewId = (typeof timelineViews)[number]["id"];

export function ScheduleBoard({
  horizonDays = 56,
  isOffice,
  rows,
  windowStart,
}: {
  isOffice: boolean;
  rows: ScheduleRow[];
  windowStart: string;
  horizonDays?: number;
}) {
  const router = useRouter();
  const initialView = horizonDays <= 7 ? "week" : horizonDays <= 31 ? "month" : horizonDays <= 92 ? "quarter" : "half";
  const [view, setView] = useState<TimelineViewId>(initialView);
  const [selectedInspectionId, setSelectedInspectionId] = useState<string | null>(null);
  const [statusMessage, setStatusMessage] = useState(
    isOffice
      ? "Select an inspection pill, then click a day slot in the gantt row to reschedule it."
      : "Vessel workspace can review the live gantt but rescheduling remains under office control."
  );
  const [optimisticDates, setOptimisticDates] = useState<Record<string, string>>({});
  const [isPending, startTransition] = useTransition();

  const activeView = timelineViews.find((option) => option.id === view) ?? timelineViews[1];
  const startDate = useMemo(() => startOfDay(new Date(windowStart)), [windowStart]);
  const axisDates = useMemo(
    () =>
      Array.from({ length: Math.ceil(activeView.horizonDays / activeView.segmentDays) }, (_, index) =>
        addDays(startDate, index * activeView.segmentDays)
      ),
    [activeView.horizonDays, activeView.segmentDays, startDate]
  );
  const daySlots = useMemo(
    () => Array.from({ length: activeView.horizonDays }, (_, index) => addDays(startDate, index)),
    [activeView.horizonDays, startDate]
  );

  const inspectionLookup = useMemo(
    () => new Map(rows.flatMap((row) => row.inspections.map((inspection) => [inspection.id, inspection]))),
    [rows]
  );

  const selectedInspection = selectedInspectionId ? inspectionLookup.get(selectedInspectionId) ?? null : null;

  async function moveInspection(inspectionId: string, targetDate: Date) {
    const priorDate = optimisticDates[inspectionId] ?? inspectionLookup.get(inspectionId)?.inspectionDate ?? null;
    const nextIso = isoDay(targetDate);
    setOptimisticDates((current) => ({ ...current, [inspectionId]: nextIso }));
    setStatusMessage(`Rescheduling ${inspectionLookup.get(inspectionId)?.title ?? "inspection"} to ${fmt.format(targetDate)}...`);

    try {
      const response = await fetch("/api/vir/schedule/reschedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          inspectionId,
          inspectionDate: nextIso,
        }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error ?? "Reschedule request failed.");
      }

      setStatusMessage(`Scheduled ${inspectionLookup.get(inspectionId)?.title ?? "inspection"} for ${fmt.format(targetDate)}.`);
      router.refresh();
    } catch (error) {
      setOptimisticDates((current) => {
        const next = { ...current };

        if (priorDate) {
          next[inspectionId] = priorDate;
        } else {
          delete next[inspectionId];
        }

        return next;
      });
      setStatusMessage(error instanceof Error ? error.message : "Reschedule failed.");
    }
  }

  return (
    <div className="timeline-board">
      <div className="timeline-status-banner">
        <div>
          <strong>{selectedInspection ? selectedInspection.title : "Dynamic scheduler ready"}</strong>
          <div className="small-text" style={{ marginTop: "0.2rem" }}>
            {selectedInspection
              ? `${selectedInspection.vesselName} / ${selectedInspection.inspectionTypeName} / ${inspectionStatusLabel[selectedInspection.status as keyof typeof inspectionStatusLabel] ?? selectedInspection.status}`
              : statusMessage}
          </div>
        </div>
        <div className="actions-row">
          <div className="board-switcher">
            {timelineViews.map((option) => (
              <button
                className={`board-tab board-tab-compact ${option.id === view ? "board-tab-active" : ""}`}
                key={option.id}
                onClick={() => setView(option.id)}
                type="button"
              >
                {option.label}
              </button>
            ))}
          </div>
          {selectedInspection ? (
            <>
              <Link className="btn-secondary btn-compact" href={`/inspections/${selectedInspection.id}`}>
                Open selected
              </Link>
              <button
                className="btn-secondary btn-compact"
                onClick={() => setSelectedInspectionId(null)}
                type="button"
              >
                Clear move mode
              </button>
            </>
          ) : null}
        </div>
      </div>

      <div className="timeline-axis" style={{ gridTemplateColumns: `220px repeat(${axisDates.length}, minmax(0, 1fr))` }}>
        {axisDates.map((date) => (
          <div className="timeline-axis-cell" key={date.toISOString()}>
            {fmt.format(date)}
          </div>
        ))}
      </div>

      <div className="stack-list">
        {rows.map((row) => {
          const rowSelectionActive = selectedInspection?.vesselId === row.id;
          const trackHeight = Math.max(4.1, 3.1 + Math.min(row.inspections.length, 3) * 1.15);

          return (
            <div className="timeline-row" key={row.id}>
              <div className="timeline-row-label">
                <strong>{row.name}</strong>
                <div className="small-text">{row.inspections.length} inspections in horizon</div>
                {rowSelectionActive ? (
                  <div className="small-text timeline-row-instruction">Click a day slot below to move the selected inspection.</div>
                ) : null}
              </div>

              <div
                className={`timeline-track-surface ${rowSelectionActive ? "timeline-track-surface-active" : ""}`}
                style={{
                  minHeight: `${trackHeight}rem`,
                  backgroundSize: `calc(100% / ${axisDates.length}) 100%`,
                }}
              >
                {isOffice && rowSelectionActive ? (
                  <div
                    className="timeline-drop-grid"
                    aria-hidden="true"
                    style={{ gridTemplateColumns: `repeat(${activeView.horizonDays}, minmax(0, 1fr))` }}
                  >
                    {daySlots.map((date) => {
                      const dayIso = isoDay(date);
                      const isCurrent = dayIso === isoDay(optimisticDates[selectedInspection.id] ?? selectedInspection.inspectionDate);

                      return (
                        <button
                          className={`timeline-drop-cell ${isCurrent ? "timeline-drop-cell-active" : ""}`}
                          disabled={isPending}
                          key={dayIso}
                          onClick={() => {
                            startTransition(() => {
                              void moveInspection(selectedInspection.id, date);
                            });
                          }}
                          title={`Move to ${fmt.format(date)}`}
                          type="button"
                        />
                      );
                    })}
                  </div>
                ) : null}

                {row.inspections.map((inspection, index) => {
                  const effectiveDate = optimisticDates[inspection.id] ?? inspection.inspectionDate;
                  const effective = startOfDay(new Date(effectiveDate));
                  const offsetMs = effective.getTime() - startDate.getTime();
                  const left = Math.max(
                    0,
                    Math.min(98, (offsetMs / (activeView.horizonDays * 24 * 60 * 60 * 1000)) * 100)
                  );
                  const lane = index % 3;

                  return (
                    <div
                      className={`timeline-pill ${toneForInspectionStatus(inspection.status)} ${selectedInspectionId === inspection.id ? "timeline-pill-selected" : ""}`}
                      key={inspection.id}
                      style={{ left: `${left}%`, top: `${0.55 + lane * 1.25}rem` }}
                    >
                      <button
                        className="timeline-pill-select"
                        onClick={() => {
                          setSelectedInspectionId((current) => (current === inspection.id ? null : inspection.id));
                          setStatusMessage(`Selected ${inspection.title}. Click a gantt day slot to reschedule.`);
                        }}
                        type="button"
                      >
                        <span>{inspection.inspectionTypeName}</span>
                        <small>{fmt.format(new Date(effectiveDate))}</small>
                      </button>
                      <Link className="timeline-pill-open" href={`/inspections/${inspection.id}`}>
                        Open
                      </Link>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
