"use client";

import Link from "next/link";
import { Award, Briefcase, Calendar, CheckCircle, Circle, MapPin, Ship, X } from "lucide-react";

export type InspectionPreviewData = {
  id: string;
  title: string;
  refNo: string;
  vessel: { id: string; name: string; vesselType: string | null; fleet: string | null };
  inspectionTypeName: string;
  status: string;
  statusLabel: string;
  statusTone: string;
  inspectionDate: string;
  auditEndDate: string | null;
  placeOfInspection: string;
  inspectorName: string | null;
  inspectorCompany: string | null;
  inspectorQualification: string | null;
  inspectorExperience: string | null;
  commandExperience: string | null;
  certificate: {
    type: string | null;
    number: string | null;
    issueDate: string | null;
    expiryDate: string | null;
    notes: string | null;
  } | null;
  openFindings: number;
  completionPct: number;
  mandatoryAnswered: number;
  mandatoryTotal: number;
  signOffs: Array<{ stage: string; actorName: string | null; approved: boolean; signedAt: string }>;
  closeHref: string;
};

const signOffLabels: Record<string, string> = {
  SHORE_REVIEW: "Office Review",
  FINAL_ACKNOWLEDGEMENT: "Final Acknowledgement",
};

export function InspectionQuickView({ data }: { data: InspectionPreviewData }) {
  const initials = data.inspectorName
    ? data.inspectorName
        .split(" ")
        .filter(Boolean)
        .slice(0, 2)
        .map((w) => w[0].toUpperCase())
        .join("")
    : "?";

  const hasProfile = Boolean(data.inspectorQualification || data.inspectorExperience || data.commandExperience);

  return (
    <div className="insp-qv-overlay">
      <div className="insp-qv-shell">
        {/* Top bar */}
        <div className="insp-qv-topbar">
          <span className="insp-qv-eyebrow">Quick Preview · {data.inspectionTypeName}</span>
          <Link className="insp-qv-close" href={data.closeHref} replace>
            <X size={14} />
            Close
          </Link>
        </div>

        {/* Body */}
        <div className="insp-qv-body">
          {/* ── Left: Inspector profile ─────────────────── */}
          <div className="insp-qv-left">
            <div className="insp-qv-section-eyebrow">Inspector Profile</div>

            <div className="insp-qv-avatar">{initials}</div>
            <div className="insp-qv-name">{data.inspectorName ?? "Inspector not recorded"}</div>
            {data.inspectorCompany && (
              <div className="insp-qv-company">
                <Briefcase size={12} />
                {data.inspectorCompany}
              </div>
            )}

            <div className="insp-qv-hr" />

            <div className="insp-qv-profile-grid">
              {data.inspectorQualification && (
                <div className="insp-qv-profile-row">
                  <span className="insp-qv-plabel">Qualification</span>
                  <span className="insp-qv-pvalue">{data.inspectorQualification}</span>
                </div>
              )}
              {data.inspectorExperience && (
                <div className="insp-qv-profile-row">
                  <span className="insp-qv-plabel">Audit experience</span>
                  <span className="insp-qv-pvalue">{data.inspectorExperience}</span>
                </div>
              )}
              {data.commandExperience && (
                <div className="insp-qv-profile-row">
                  <span className="insp-qv-plabel">Command experience</span>
                  <span className="insp-qv-pvalue">{data.commandExperience}</span>
                </div>
              )}
              {!hasProfile && (
                <p className="insp-qv-empty-note">No profile details recorded for this inspection.</p>
              )}
            </div>

            {data.certificate && (
              <>
                <div className="insp-qv-hr" />
                <div className="insp-qv-cert-title">
                  <Award size={13} />
                  Certificate
                </div>
                <div className="insp-qv-profile-grid">
                  {data.certificate.type && (
                    <div className="insp-qv-profile-row">
                      <span className="insp-qv-plabel">Type</span>
                      <span className="insp-qv-pvalue">{data.certificate.type}</span>
                    </div>
                  )}
                  {data.certificate.number && (
                    <div className="insp-qv-profile-row">
                      <span className="insp-qv-plabel">Number</span>
                      <span className="insp-qv-pvalue">{data.certificate.number}</span>
                    </div>
                  )}
                  {data.certificate.issueDate && (
                    <div className="insp-qv-profile-row">
                      <span className="insp-qv-plabel">Issued</span>
                      <span className="insp-qv-pvalue">{data.certificate.issueDate}</span>
                    </div>
                  )}
                  {data.certificate.expiryDate && (
                    <div className="insp-qv-profile-row">
                      <span className="insp-qv-plabel">Expires</span>
                      <span className="insp-qv-pvalue">{data.certificate.expiryDate}</span>
                    </div>
                  )}
                  {data.certificate.notes && (
                    <div className="insp-qv-profile-row insp-qv-profile-row-stacked">
                      <span className="insp-qv-plabel">Notes</span>
                      <span className="insp-qv-pvalue">{data.certificate.notes}</span>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>

          {/* ── Right: Inspection overview ──────────────── */}
          <div className="insp-qv-right">
            <div className="insp-qv-right-header">
              <div>
                <div className="insp-qv-ref">{data.refNo}</div>
                {data.title !== data.refNo && (
                  <div className="insp-qv-title-secondary">{data.title}</div>
                )}
              </div>
              <span className={`chip ${data.statusTone}`}>{data.statusLabel}</span>
            </div>

            <div className="insp-qv-detail-list">
              <div className="insp-qv-detail-item">
                <Ship size={14} className="insp-qv-detail-icon" />
                <div>
                  <div className="insp-qv-dlabel">Vessel</div>
                  <div className="insp-qv-dvalue">
                    {data.vessel.name}
                    {data.vessel.fleet ? <span className="insp-qv-dsub"> · {data.vessel.fleet}</span> : null}
                    {data.vessel.vesselType ? <span className="insp-qv-dsub"> · {data.vessel.vesselType}</span> : null}
                  </div>
                </div>
              </div>
              <div className="insp-qv-detail-item">
                <Calendar size={14} className="insp-qv-detail-icon" />
                <div>
                  <div className="insp-qv-dlabel">Inspection period</div>
                  <div className="insp-qv-dvalue">
                    {data.inspectionDate}
                    {data.auditEndDate ? <> → {data.auditEndDate}</> : null}
                  </div>
                </div>
              </div>
              <div className="insp-qv-detail-item">
                <MapPin size={14} className="insp-qv-detail-icon" />
                <div>
                  <div className="insp-qv-dlabel">Place of inspection</div>
                  <div className="insp-qv-dvalue">{data.placeOfInspection}</div>
                </div>
              </div>
            </div>

            <div className="insp-qv-hr" />

            {/* Stats */}
            <div className="insp-qv-stats">
              <div className="insp-qv-stat">
                <div className="insp-qv-stat-val">{data.completionPct}%</div>
                <div className="insp-qv-stat-lbl">Completion</div>
              </div>
              <div className="insp-qv-stat">
                <div className="insp-qv-stat-val">{data.mandatoryAnswered}/{data.mandatoryTotal}</div>
                <div className="insp-qv-stat-lbl">Mandatory</div>
              </div>
              <div className="insp-qv-stat">
                <div className={`insp-qv-stat-val${data.openFindings > 0 ? " insp-qv-stat-val-danger" : " insp-qv-stat-val-ok"}`}>
                  {data.openFindings}
                </div>
                <div className="insp-qv-stat-lbl">Open findings</div>
              </div>
              <div className="insp-qv-stat">
                <div className="insp-qv-stat-val">{data.signOffs.filter((s) => s.approved).length}</div>
                <div className="insp-qv-stat-lbl">Sign-offs done</div>
              </div>
            </div>

            {data.signOffs.length > 0 && (
              <>
                <div className="insp-qv-hr" />
                <div className="insp-qv-section-eyebrow" style={{ marginBottom: "0.6rem" }}>Sign-off trail</div>
                <div className="insp-qv-signoffs">
                  {data.signOffs.map((so, idx) => (
                    <div className="insp-qv-signoff-row" key={idx}>
                      {so.approved ? (
                        <CheckCircle size={14} className="insp-qv-so-ok" />
                      ) : (
                        <Circle size={14} className="insp-qv-so-pending" />
                      )}
                      <div>
                        <div className="insp-qv-so-stage">{signOffLabels[so.stage] ?? so.stage}</div>
                        {so.actorName && (
                          <div className="insp-qv-so-actor">{so.actorName} · {so.signedAt}</div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}

            <div className="insp-qv-actions">
              <Link className="btn btn-compact" href={`/inspections/${data.id}`}>
                Open Workflow
              </Link>
              <Link className="btn-secondary btn-compact" href={`/reports/inspection/${data.id}?variant=detailed`}>
                View Report
              </Link>
              <Link className="btn-ghost btn-compact" href={data.closeHref} replace>
                Close Preview
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
