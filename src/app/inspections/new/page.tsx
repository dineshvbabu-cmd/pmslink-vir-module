import { createInspectionAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

export default async function NewInspectionPage() {
  const session = await requireVirSession();

  const [vessels, inspectionTypes, templates] = await Promise.all([
    isOfficeSession(session)
      ? prisma.vessel.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
      : prisma.vessel.findMany({ where: { id: session.vesselId ?? "" }, orderBy: { name: "asc" } }),
    prisma.virInspectionType.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.virTemplate.findMany({
      where: { isActive: true },
      include: { inspectionType: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  return (
    <div className="page-stack">
      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">{isOfficeSession(session) ? "Office launch" : "Vessel launch"}</div>
            <h2 className="panel-title">Create new VIR</h2>
            <p className="panel-subtitle">
              {isOfficeSession(session)
                ? "Schedule or launch a VIR for any active vessel and attach the right questionnaire."
                : "Start a new inspection for your logged-in vessel workspace."}
            </p>
          </div>
        </div>

        <form action={createInspectionAction} className="form-grid">
          <div className="field">
            <label htmlFor="vesselId">Vessel</label>
            <select defaultValue={isOfficeSession(session) ? "" : session.vesselId ?? ""} id="vesselId" name="vesselId" required>
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
            <select id="inspectionTypeId" name="inspectionTypeId" required>
              <option value="">Select type</option>
              {inspectionTypes.map((type) => (
                <option key={type.id} value={type.id}>
                  {type.name}
                </option>
              ))}
            </select>
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
            <label htmlFor="templateId">Template</label>
            <select id="templateId" name="templateId">
              <option value="">Auto-select latest matching template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.inspectionType.name} / {template.name} / v{template.version}
                </option>
              ))}
            </select>
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
            <input defaultValue={session.actorName} id="inspectorName" name="inspectorName" placeholder="Operator name" />
          </div>

          <div className="field">
            <label htmlFor="inspectorCompany">Company / authority</label>
            <input
              id="inspectorCompany"
              name="inspectorCompany"
              placeholder={isOfficeSession(session) ? "Union Maritime QHSE" : "Onboard inspection team"}
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
      </section>
    </div>
  );
}
