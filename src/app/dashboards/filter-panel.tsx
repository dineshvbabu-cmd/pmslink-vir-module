"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

export type BoardKey = "tmsa" | "class" | "psc-sire";
export type RangeKey = "90" | "180" | "365" | "ytd";
export type ViewKey = "boards" | "register";

interface Vessel {
  id: string;
  name: string;
  fleet: string | null;
}

interface FilterPanelProps {
  vessels: Vessel[];
  uniqueFleets: string[];
  isTsi: boolean;
  isVessel: boolean;
  visibleScopeLabel: string;
  initialBoard: BoardKey;
  initialRange: RangeKey;
  initialVesselIds: string[];
  initialFleets: string[];
  initialDateFrom: string;
  initialDateTo: string;
  initialScope: string;
  currentView: ViewKey;
}

export function DashboardFilterPanel({
  vessels,
  uniqueFleets,
  isTsi,
  isVessel,
  visibleScopeLabel,
  initialBoard,
  initialRange,
  initialVesselIds,
  initialFleets,
  initialDateFrom,
  initialDateTo,
  initialScope,
  currentView,
}: FilterPanelProps) {
  const router = useRouter();
  const [board, setBoard] = useState(initialBoard);
  const [range, setRange] = useState(initialRange);
  const [vesselIds, setVesselIds] = useState<string[]>(initialVesselIds);
  const [fleets, setFleets] = useState<string[]>(initialFleets);
  const [dateFrom, setDateFrom] = useState(initialDateFrom);
  const [dateTo, setDateTo] = useState(initialDateTo);
  const [scope, setScope] = useState(initialScope);
  const dateDebounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Re-sync state when URL-derived props change (e.g. browser back/forward navigation)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setFleets(initialFleets); }, [initialFleets.join(",")]);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { setVesselIds(initialVesselIds); }, [initialVesselIds.join(",")]);

  function buildUrl(overrides: {
    board?: BoardKey;
    range?: RangeKey;
    vesselIds?: string[];
    fleets?: string[];
    dateFrom?: string;
    dateTo?: string;
    scope?: string;
    view?: ViewKey;
  }) {
    const b = overrides.board ?? board;
    const r = overrides.range ?? range;
    const v = overrides.vesselIds ?? vesselIds;
    const f = overrides.fleets ?? fleets;
    const df = overrides.dateFrom !== undefined ? overrides.dateFrom : dateFrom;
    const dt = overrides.dateTo !== undefined ? overrides.dateTo : dateTo;
    const s = overrides.scope !== undefined ? overrides.scope : scope;
    const vw = overrides.view ?? currentView;

    const p = new URLSearchParams();
    p.set("view", vw);
    if (vw === "boards") p.set("board", b);
    if (df || dt) {
      if (df) p.set("dateFrom", df);
      if (dt) p.set("dateTo", dt);
    } else {
      p.set("range", r);
    }
    v.forEach((id) => p.append("vesselIds", id));
    f.forEach((fleet) => p.append("fleets", fleet));
    if (s) p.set("scope", s);
    return `/dashboards?${p.toString()}`;
  }

  function go(overrides: Parameters<typeof buildUrl>[0]) {
    router.replace(buildUrl(overrides));
  }

  function handleBoardChip(newBoard: BoardKey) {
    setBoard(newBoard);
    go({ board: newBoard });
  }

  function handleRangeChip(newRange: RangeKey) {
    setRange(newRange);
    setDateFrom("");
    setDateTo("");
    go({ range: newRange, dateFrom: "", dateTo: "" });
  }

  function handleDateFrom(val: string) {
    setDateFrom(val);
    if (dateDebounce.current) clearTimeout(dateDebounce.current);
    dateDebounce.current = setTimeout(() => go({ dateFrom: val }), 500);
  }

  function handleDateTo(val: string) {
    setDateTo(val);
    if (dateDebounce.current) clearTimeout(dateDebounce.current);
    dateDebounce.current = setTimeout(() => go({ dateTo: val }), 500);
  }

  function clearDates() {
    setDateFrom("");
    setDateTo("");
    go({ dateFrom: "", dateTo: "" });
  }

  function handleFleetToggle(fleet: string) {
    const next = fleets.includes(fleet) ? fleets.filter((f) => f !== fleet) : [...fleets, fleet];
    setFleets(next);
    setVesselIds([]);
    go({ fleets: next, vesselIds: [] });
  }

  function clearFleets() {
    setFleets([]);
    setVesselIds([]);
    go({ fleets: [], vesselIds: [] });
  }

  function handleVesselChange(e: React.ChangeEvent<HTMLSelectElement>) {
    const val = e.target.value;
    const newIds = val ? [val] : [];
    setVesselIds(newIds);
    setFleets([]);
    go({ vesselIds: newIds, fleets: [] });
  }

  function handleScopeToggle(newScope: string) {
    setScope(newScope);
    go({ scope: newScope });
  }

  const hasDateFilter = Boolean(dateFrom || dateTo);

  return (
    <div>
      {/* View tabs */}
      <div style={{ display: "flex", gap: "0.5rem", marginBottom: "1.1rem" }}>
        <button
          className={`filter-chip${currentView === "boards" ? " filter-chip-active" : ""}`}
          onClick={() => go({ view: "boards" })}
          type="button"
        >
          Analytics Boards
        </button>
        <button
          className={`filter-chip${currentView === "register" ? " filter-chip-active" : ""}`}
          onClick={() => go({ view: "register" })}
          type="button"
        >
          Fleet Compliance Register
        </button>
      </div>

      <div className="section-header" style={{ marginBottom: "0.75rem" }}>
        <div>
          <h3 className="panel-title">
            {currentView === "boards" ? "Board & filter selector" : "Filter selector"}
          </h3>
          <p className="panel-subtitle">
            Scope: {visibleScopeLabel}
            {isTsi ? " · TSI defaults to assigned vessels." : ""}
          </p>
        </div>
      </div>

      {/* Board chips — boards view only */}
      {currentView === "boards" && (
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.85rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className="inline-form-label">Board</span>
          {(
            [
              { key: "tmsa" as BoardKey, label: "TMSA compliance" },
              { key: "class" as BoardKey, label: "Class and statutory" },
              { key: "psc-sire" as BoardKey, label: "PSC and SIRE / vetting" },
            ] as const
          ).map((b) => (
            <button
              key={b.key}
              className={`filter-chip${board === b.key ? " filter-chip-active" : ""}`}
              onClick={() => handleBoardChip(b.key)}
              type="button"
            >
              {b.label}
            </button>
          ))}
        </div>
      )}

      {/* Period presets + custom date range */}
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.85rem", flexWrap: "wrap", alignItems: "center" }}>
        <span className="inline-form-label">Period</span>
        {(
          [
            { key: "90" as RangeKey, label: "3 Months" },
            { key: "180" as RangeKey, label: "6 Months" },
            { key: "365" as RangeKey, label: "1 Year" },
            { key: "ytd" as RangeKey, label: "YTD" },
          ] as const
        ).map((preset) => (
          <button
            key={preset.key}
            className={`filter-chip${range === preset.key && !hasDateFilter ? " filter-chip-active" : ""}`}
            onClick={() => handleRangeChip(preset.key)}
            type="button"
          >
            {preset.label}
          </button>
        ))}
        <span className="inline-form-label" style={{ marginLeft: "0.35rem" }}>From</span>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => handleDateFrom(e.target.value)}
          style={{ height: "26px", fontSize: "0.8rem", padding: "0 0.4rem" }}
        />
        <span className="inline-form-label">To</span>
        <input
          type="date"
          value={dateTo}
          onChange={(e) => handleDateTo(e.target.value)}
          style={{ height: "26px", fontSize: "0.8rem", padding: "0 0.4rem" }}
        />
        {hasDateFilter && (
          <button className="btn-secondary btn-compact" onClick={clearDates} type="button">
            Clear dates
          </button>
        )}
      </div>

      {/* Fleet toggle chips */}
      {uniqueFleets.length > 0 && (
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.85rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className="inline-form-label">Fleet</span>
          <button
            className={`filter-chip${fleets.length === 0 ? " filter-chip-active" : ""}`}
            onClick={clearFleets}
            type="button"
          >
            All fleets
          </button>
          {uniqueFleets.map((fleet) => (
            <button
              key={fleet}
              className={`filter-chip${fleets.includes(fleet) ? " filter-chip-active" : ""}`}
              onClick={() => handleFleetToggle(fleet)}
              type="button"
            >
              {fleet}
            </button>
          ))}
        </div>
      )}

      {/* Vessel select — single dropdown, consistent with other pages */}
      {!isVessel && vessels.length > 1 && (
        <div style={{ display: "flex", gap: "0.4rem", marginBottom: "0.85rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className="inline-form-label">Vessel</span>
          <select
            value={vesselIds[0] ?? ""}
            onChange={handleVesselChange}
            style={{ height: "26px", fontSize: "0.82rem", padding: "0 0.4rem" }}
          >
            <option value="">All vessels</option>
            {vessels.map((v) => (
              <option key={v.id} value={v.id}>
                {v.name}
              </option>
            ))}
          </select>
        </div>
      )}

      {/* TSI scope toggle */}
      {isTsi && (
        <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap", alignItems: "center" }}>
          <span className="inline-form-label">Scope</span>
          <button
            className={`filter-chip${scope !== "all" ? " filter-chip-active" : ""}`}
            onClick={() => handleScopeToggle("")}
            type="button"
          >
            Assigned scope
          </button>
          <button
            className={`filter-chip${scope === "all" ? " filter-chip-active" : ""}`}
            onClick={() => handleScopeToggle("all")}
            type="button"
          >
            Expand to fleet
          </button>
        </div>
      )}
    </div>
  );
}
