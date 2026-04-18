"use client";

import { useMemo, useState } from "react";
import { SubmitButton } from "@/components/submit-button";

type VesselOption = {
  id: string;
  name: string;
};

type InspectionTypeOption = {
  id: string;
  name: string;
  category: string;
};

type TemplateOption = {
  id: string;
  name: string;
  version: string;
  inspectionTypeId: string;
  inspectionTypeName: string;
  focusCount: number;
  questionCount: number;
};

export function InspectionLaunchForm({
  action,
  inspectionTypes,
  isOffice,
  sessionActorName,
  templates,
  vessels,
  defaultVesselId,
}: {
  action: (formData: FormData) => void;
  vessels: VesselOption[];
  inspectionTypes: InspectionTypeOption[];
  templates: TemplateOption[];
  isOffice: boolean;
  defaultVesselId?: string;
  sessionActorName: string;
}) {
  const [inspectionTypeId, setInspectionTypeId] = useState("");

  const selectedTemplates = useMemo(
    () => templates.filter((template) => template.inspectionTypeId === inspectionTypeId),
    [inspectionTypeId, templates]
  );

  const autoTemplate = selectedTemplates[0] ?? null;

  return (
    <form action={action} className="form-grid">
      <div className="field">
        <label htmlFor="vesselId">Vessel</label>
        <select defaultValue={defaultVesselId ?? ""} id="vesselId" name="vesselId" required>
          <option value="">Select vessel</option>
          {vessels.map((vessel) => (
            <option key={vessel.id} value={vessel.id}>
              {vessel.name}
            </option>
          ))}
        </select>
      </div>

      <div className="field">
        <label htmlFor="inspectionTypeId">Inspection type</label>
        <select
          id="inspectionTypeId"
          name="inspectionTypeId"
          onChange={(event) => setInspectionTypeId(event.target.value)}
          required
          value={inspectionTypeId}
        >
          <option value="">Select type</option>
          {inspectionTypes.map((type) => (
            <option key={type.id} value={type.id}>
              {type.name} / {type.category}
            </option>
          ))}
        </select>
      </div>

      <input name="templateId" type="hidden" value={autoTemplate?.id ?? ""} />

      <div className="field-wide">
        <div className="list-card" style={{ background: "rgba(26, 116, 216, 0.04)" }}>
          <strong>Auto template binding</strong>
          {inspectionTypeId ? (
            autoTemplate ? (
              <>
                <div className="small-text" style={{ marginTop: "0.35rem" }}>
                  Template `{autoTemplate.name}` v{autoTemplate.version} will be attached automatically when this
                  inspection is created.
                </div>
                <div className="meta-row" style={{ marginTop: "0.6rem" }}>
                  <span className="chip chip-info">{autoTemplate.questionCount} questions</span>
                  <span className={autoTemplate.focusCount > 0 ? "chip chip-warning" : "chip chip-success"}>
                    {autoTemplate.focusCount} concentrated questions
                  </span>
                </div>
              </>
            ) : (
              <div className="small-text" style={{ marginTop: "0.35rem" }}>
                No matching template exists yet for this inspection type. Import one first from the Import Engine.
              </div>
            )
          ) : (
            <div className="small-text" style={{ marginTop: "0.35rem" }}>
              Select the inspection type and the system will bind the latest matching questionnaire template.
            </div>
          )}
        </div>
      </div>

      <div className="field-wide">
        <div className="list-card" style={{ background: "rgba(15, 156, 106, 0.06)" }}>
          <strong>Carry-forward control</strong>
          <div className="small-text" style={{ marginTop: "0.35rem" }}>
            When a new VIR is created, unresolved findings and pending corrective actions from the most recent matching
            inspection for the same vessel are carried into this inspection automatically.
          </div>
        </div>
      </div>

      <div className="field-wide">
        <label htmlFor="title">Inspection title</label>
        <input id="title" name="title" placeholder="PSC Self Assessment - Singapore" required />
      </div>

      <div className="field">
        <label htmlFor="inspectionDate">Inspection date</label>
        <input id="inspectionDate" name="inspectionDate" type="date" required />
      </div>

      <div className="field">
        <label htmlFor="port">Port</label>
        <input id="port" name="port" placeholder="Singapore" />
      </div>

      <div className="field">
        <label htmlFor="country">Country / MoU area</label>
        <input id="country" name="country" placeholder="Singapore / Tokyo MoU" />
      </div>

      <div className="field">
        <label htmlFor="inspectorName">Inspector / operator</label>
        <input defaultValue={sessionActorName} id="inspectorName" name="inspectorName" placeholder="Operator name" />
      </div>

      <div className="field">
        <label htmlFor="inspectorCompany">Company / authority</label>
        <input
          id="inspectorCompany"
          name="inspectorCompany"
          placeholder={isOffice ? "Union Maritime QHSE" : "Onboard inspection team"}
        />
      </div>

      <div className="field">
        <label htmlFor="externalReference">Reference number</label>
        <input id="externalReference" name="externalReference" placeholder="PSC-SIN-2026-0042" />
      </div>

      <div className="field-wide">
        <label htmlFor="summary">Inspection summary</label>
        <textarea id="summary" name="summary" placeholder="Purpose, pre-arrival context, planned scope, and notes." />
      </div>

      <div className="field-wide">
        <SubmitButton className="btn">Create inspection</SubmitButton>
      </div>
    </form>
  );
}
