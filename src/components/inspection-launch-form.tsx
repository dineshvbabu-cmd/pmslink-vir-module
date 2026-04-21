"use client";

import { useMemo, useState } from "react";
import {
  alongsideByOptions,
  inspectionAuthorityOptions,
  inspectionModeOptions,
  inspectionOperationsOptions,
  inspectionReportTypeOptions,
  reviewTargetOptions,
} from "@/lib/vir/launch-options";
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
  defaultVesselId,
  inspectionTypes,
  isOffice,
  sessionActorName,
  templates,
  vessels,
}: {
  action: (formData: FormData) => void | Promise<void>;
  defaultVesselId?: string;
  inspectionTypes: InspectionTypeOption[];
  isOffice: boolean;
  sessionActorName: string;
  templates: TemplateOption[];
  vessels: VesselOption[];
}) {
  const [selectedInspectionTypeId, setSelectedInspectionTypeId] = useState(inspectionTypes[0]?.id ?? "");
  const [selectedTemplateId, setSelectedTemplateId] = useState("");

  const visibleTemplates = useMemo(
    () => templates.filter((template) => template.inspectionTypeId === selectedInspectionTypeId),
    [selectedInspectionTypeId, templates]
  );

  return (
    <form action={action} className="inspection-launch-shell">
      <input name="inspectorName" type="hidden" value={sessionActorName} />

      {!isOffice && defaultVesselId ? <input name="vesselId" type="hidden" value={defaultVesselId} /> : null}

      <section className="inspection-launch-section">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Inspection Location</h3>
            <p className="panel-subtitle">
              Mandatory dropdown selections are aligned to the live workflow. Remaining fields stay as free-text entry for demo flexibility.
            </p>
          </div>
          <SubmitButton className="btn">Save & Continue</SubmitButton>
        </div>

        <div className="inspection-launch-grid">
          {isOffice ? (
            <div className="field">
              <label htmlFor="vesselId">Vessel *</label>
              <select defaultValue={defaultVesselId ?? ""} id="vesselId" name="vesselId" required>
                <option value="">Select vessel</option>
                {vessels.map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>
                    {vessel.name}
                  </option>
                ))}
              </select>
            </div>
          ) : (
            <div className="field">
              <label>Vessel</label>
              <input disabled value={vessels[0]?.name ?? "Assigned vessel"} />
            </div>
          )}

          <div className="field">
            <label htmlFor="inspectionTypeId">Inspection Type *</label>
            <select
              id="inspectionTypeId"
              name="inspectionTypeId"
              onChange={(event) => {
                setSelectedInspectionTypeId(event.target.value);
                setSelectedTemplateId("");
              }}
              required
              value={selectedInspectionTypeId}
            >
              <option value="">Select inspection type</option>
              {inspectionTypes.map((inspectionType) => (
                <option key={inspectionType.id} value={inspectionType.id}>
                  {inspectionType.name} / {inspectionType.category}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="reportType">Report Type *</label>
            <select defaultValue="VIR" id="reportType" name="reportType" required>
              {inspectionReportTypeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="inspectionMode">Inspection Mode *</label>
            <select defaultValue="" id="inspectionMode" name="inspectionMode" required>
              <option value="">Select mode</option>
              {inspectionModeOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="inspectionFromDate">Inspection From Date</label>
            <input id="inspectionFromDate" name="inspectionFromDate" type="date" />
          </div>

          <div className="field">
            <label htmlFor="inspectionToDate">Inspection To Date</label>
            <input id="inspectionToDate" name="inspectionToDate" type="date" />
          </div>

          <div className="field">
            <label htmlFor="dateLastInspected">Date Last Inspected</label>
            <input id="dateLastInspected" name="dateLastInspected" type="date" />
          </div>

          <div className="field">
            <label htmlFor="placeLastInspected">Place Last Inspected</label>
            <input id="placeLastInspected" name="placeLastInspected" placeholder="Dubai" />
          </div>

          <div className="field">
            <label htmlFor="placeOfInspectionFrom">Place of Inspection From</label>
            <input id="placeOfInspectionFrom" name="placeOfInspectionFrom" placeholder="Long Beach, Los Angeles" />
          </div>

          <div className="field">
            <label htmlFor="durationOnBoard">Duration of this inspection O/B</label>
            <input id="durationOnBoard" name="durationOnBoard" placeholder="4 days / 2 ports" />
          </div>

          <div className="field">
            <label htmlFor="location">Location</label>
            <input id="location" name="location" placeholder="Anchorage / alongside / terminal" />
          </div>

          <div className="field">
            <label htmlFor="alongsideBy">Alongside by</label>
            <select defaultValue="" id="alongsideBy" name="alongsideBy">
              <option value="">Select</option>
              {alongsideByOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="operationsAtInspection">Operations at the time of inspection</label>
            <select defaultValue="" id="operationsAtInspection" name="operationsAtInspection">
              <option value="">Select operation</option>
              {inspectionOperationsOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="otherPartiesInspected">Any other parties inspected</label>
            <input id="otherPartiesInspected" name="otherPartiesInspected" placeholder="Terminal / office / riding gang / class" />
          </div>

          <div className="field">
            <label htmlFor="draftAft">Draft AFT</label>
            <input id="draftAft" name="draftAft" placeholder="Draft AFT" />
          </div>

          <div className="field">
            <label htmlFor="lastPortOfCall">Last Port of Call</label>
            <input id="lastPortOfCall" name="lastPortOfCall" placeholder="Fujairah" />
          </div>

          <div className="field">
            <label htmlFor="inspectionAuthority">Inspection Authority *</label>
            <select defaultValue="" id="inspectionAuthority" name="inspectionAuthority" required>
              <option value="">Select authority</option>
              {inspectionAuthorityOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </div>

          <div className="inspection-launch-radio-row">
            <span className="inspection-launch-radio-label">Inspection based on incidents?</span>
            <label>
              <input defaultChecked={false} name="inspectionBasedOnIncidents" type="radio" value="YES" />
              <span>Yes</span>
            </label>
            <label>
              <input defaultChecked name="inspectionBasedOnIncidents" type="radio" value="NO" />
              <span>No</span>
            </label>
          </div>

          <div className="inspection-launch-radio-row">
            <span className="inspection-launch-radio-label">Inspection based on external?</span>
            <label>
              <input defaultChecked={false} name="inspectionBasedOnExternal" type="radio" value="YES" />
              <span>Yes</span>
            </label>
            <label>
              <input defaultChecked name="inspectionBasedOnExternal" type="radio" value="NO" />
              <span>No</span>
            </label>
          </div>
        </div>
      </section>

      <section className="inspection-launch-section">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Crew Particulars</h3>
            <p className="panel-subtitle">Crew and officer details stay as free-text entry to keep the launch flow quick for demo walkthroughs.</p>
          </div>
        </div>

        <div className="inspection-launch-grid">
          <div className="field">
            <label htmlFor="nationalityOfMasterAndChiefEngineer">Nationality of Master &amp; Ch/Engr</label>
            <input id="nationalityOfMasterAndChiefEngineer" name="nationalityOfMasterAndChiefEngineer" placeholder="18 / INDIA" />
          </div>
          <div className="field">
            <label htmlFor="numberAndNationalityOfOfficers">Number &amp; Nationality of Officers</label>
            <input id="numberAndNationalityOfOfficers" name="numberAndNationalityOfOfficers" placeholder="18 / INDIA" />
          </div>
          <div className="field">
            <label htmlFor="numberAndNationalityOfCrew">Number &amp; Nationality of Crew</label>
            <input id="numberAndNationalityOfCrew" name="numberAndNationalityOfCrew" placeholder="9 / INDIA" />
          </div>
          <div className="field">
            <label htmlFor="minimumSafeManningCrew">Minimum safe manning Crew</label>
            <input id="minimumSafeManningCrew" name="minimumSafeManningCrew" placeholder="33" />
          </div>
          <div className="field">
            <label htmlFor="mastersName">Master&apos;s name</label>
            <input id="mastersName" name="mastersName" placeholder="Master name" />
          </div>
          <div className="field">
            <label htmlFor="chiefEngineersName">Ch/Engineer&apos;s name</label>
            <input id="chiefEngineersName" name="chiefEngineersName" placeholder="Chief engineer name" />
          </div>
        </div>
      </section>

      <section className="inspection-launch-section">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Select The Pages / Screen To Update The Below Details</h3>
            <p className="panel-subtitle">Cause analysis and corrective action targets are mandatory selection points in the Create VIR flow.</p>
          </div>
        </div>

        <div className="inspection-launch-target-grid">
          <div className="inspection-launch-target-row">
            <div className="inspection-launch-target-label">Cause Analysis *</div>
            <div className="inspection-launch-target-options">
              {reviewTargetOptions.map((option, index) => (
                <label key={`cause-${option}`}>
                  <input defaultChecked={index === 0} name="causeAnalysisTarget" required type="radio" value={option} />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>
          <div className="inspection-launch-target-row">
            <div className="inspection-launch-target-label">Corrective Action Plan *</div>
            <div className="inspection-launch-target-options">
              {reviewTargetOptions.map((option, index) => (
                <label key={`corrective-${option}`}>
                  <input
                    defaultChecked={index === 0}
                    name="correctiveActionPlanTarget"
                    required
                    type="radio"
                    value={option}
                  />
                  <span>{option}</span>
                </label>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section className="inspection-launch-section">
        <div className="section-header">
          <div>
            <h3 className="panel-title">Questionnaire binding</h3>
            <p className="panel-subtitle">Attach the right questionnaire template before the inspection opens so the report page and checklist stay aligned.</p>
          </div>
        </div>

        <div className="template-selector-grid">
          <div className="small-text">
            The selected inspection type controls which questionnaire templates are shown here. If you skip this step, the latest matching template will be attached automatically.
          </div>
          <div className="template-selection-strip">
            {visibleTemplates.length ? (
              visibleTemplates.map((template) => {
                const active = selectedTemplateId === template.id;
                return (
                  <label
                    className={`template-choice-card${active ? " template-choice-card-active" : ""}`}
                    key={template.id}
                  >
                    <input
                      checked={active}
                      hidden
                      name="templateId"
                      onChange={() => setSelectedTemplateId(template.id)}
                      type="radio"
                      value={template.id}
                    />
                    <div className="meta-row">
                      <span className="chip chip-info">{template.inspectionTypeName}</span>
                      <span className="chip chip-muted">v{template.version}</span>
                    </div>
                    <div className="list-card-title" style={{ marginTop: "0.65rem" }}>
                      {template.name}
                    </div>
                    <div className="small-text" style={{ marginTop: "0.45rem" }}>
                      {template.questionCount} questions / {template.focusCount} concentrated questions
                    </div>
                  </label>
                );
              })
            ) : (
              <div className="empty-state">No active questionnaire template is available yet for this inspection type.</div>
            )}
          </div>
        </div>
      </section>
    </form>
  );
}
