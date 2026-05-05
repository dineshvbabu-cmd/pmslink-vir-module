"use client";

import { useState } from "react";

const APPROVERS = [
  { name: "Gaurav Chaturvedi", email: "gaurav.chaturvedi@unionmaritime.demo" },
  { name: "Tejinder Pal Singh", email: "tejinder.singh@unionmaritime.demo" },
  { name: "Bhuvanesh Dhogra", email: "bhuvanesh.dhogra@unionmaritime.demo" },
  { name: "Pankaj Kumar", email: "pankaj.kumar@unionmaritime.demo" },
  { name: "Sumit Kapoor", email: "sumit.kapoor@unionmaritime.demo" },
  { name: "Capt. Mukhtar", email: "capt.mukhtar@unionmaritime.demo" },
  { name: "Capt. Kulbir Singh", email: "capt.kulbirsingh@unionmaritime.demo" },
];

function buildMailtoHref(email: string, vesselName: string, inspectionRef: string) {
  const subject = `Deviation approval request | ${vesselName} | ${inspectionRef}`;
  const body =
    `Please review the pending deviation register for ${vesselName}.%0D%0A%0D%0A` +
    `Inspection reference: ${inspectionRef}%0D%0A` +
    `Workflow link: https://pmslink-vir-module-production.up.railway.app`;
  return `mailto:${encodeURIComponent(email)}?subject=${encodeURIComponent(subject)}&body=${body}`;
}

export function DeviationApprovalPanel({
  vesselName,
  inspectionRef,
  statusChip,
}: {
  vesselName: string;
  inspectionRef: string;
  statusChip: React.ReactNode;
}) {
  const [selectedEmail, setSelectedEmail] = useState(APPROVERS[0].email);

  function handleSend() {
    window.location.href = buildMailtoHref(selectedEmail, vesselName, inspectionRef);
  }

  return (
    <>
      {/* Header row — vessel title + actions */}
      <div className="section-header" style={{ alignItems: "flex-start" }}>
        <div>
          <div className="eyebrow">Deviation approval flow</div>
          <h2 className="hero-title">{vesselName} | {inspectionRef}</h2>
          <p className="hero-copy">
            Select an approver below and send the deviation pack for formal office review.
          </p>
        </div>
        <div className="actions-row" style={{ flexShrink: 0 }}>
          {statusChip}
          <button className="btn btn-compact" onClick={handleSend}>
            Send for approval
          </button>
        </div>
      </div>

      {/* Submission & Approval details */}
      <div
        className="panel panel-inset"
        style={{ marginTop: "1.25rem", padding: "1rem 1.25rem", background: "var(--surface-2, #f8f9fa)", borderRadius: "6px" }}
      >
        <div style={{ marginBottom: "0.5rem" }}>
          <span className="panel-title" style={{ fontSize: "0.8rem", fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
            Submission &amp; Approval details
          </span>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
          <label htmlFor="approver-select" className="inline-form-label" style={{ whiteSpace: "nowrap" }}>
            Select approver
          </label>
          <select
            id="approver-select"
            value={selectedEmail}
            onChange={(e) => setSelectedEmail(e.target.value)}
            style={{ minWidth: "220px" }}
          >
            {APPROVERS.map((approver) => (
              <option key={approver.email} value={approver.email}>
                {approver.name}
              </option>
            ))}
          </select>
          <button className="btn btn-compact" onClick={handleSend}>
            Send for approval
          </button>
        </div>
      </div>
    </>
  );
}
