import { createInspectionAction } from "@/app/actions";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function NewInspectionPage() {
  const [vessels, inspectionTypes, templates] = await Promise.all([
    prisma.vessel.findMany({ where: { isActive: true }, orderBy: { name: "asc" } }),
    prisma.virInspectionType.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.virTemplate.findMany({
      where: { isActive: true },
      include: { inspectionType: { select: { name: true } } },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  return (
    <div className="page-stack">
      <section className="panel">
        <div className="section-header">
          <div>
            <h2 className="panel-title">Create New VIR</h2>
            <p className="panel-subtitle">Start a vessel inspection record and attach the most suitable questionnaire template.</p>
          </div>
        </div>

        <form action={createInspectionAction} className="form-grid">
          <div className="field">
            <label htmlFor="vesselId">Vessel</label>
            <select id="vesselId" name="vesselId" required>
              <option value="">Select vessel</option>
              {vessels.map((vessel) => (
                <option key={vessel.id} value={vessel.id}>
                  {vessel.name}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="inspectionTypeId">Inspection Type</label>
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
            <label htmlFor="title">Inspection Title</label>
            <input id="title" name="title" placeholder="PSC Self Assessment - Singapore" required />
          </div>

          <div className="field">
            <label htmlFor="inspectionDate">Inspection Date</label>
            <input id="inspectionDate" name="inspectionDate" type="date" required />
          </div>

          <div className="field">
            <label htmlFor="templateId">Template</label>
            <select id="templateId" name="templateId">
              <option value="">Auto-select latest matching template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.inspectionType.name} · {template.name} · v{template.version}
                </option>
              ))}
            </select>
          </div>

          <div className="field">
            <label htmlFor="port">Port</label>
            <input id="port" name="port" placeholder="Singapore" />
          </div>

          <div className="field">
            <label htmlFor="country">Country / MoU Area</label>
            <input id="country" name="country" placeholder="Singapore / Tokyo MoU" />
          </div>

          <div className="field">
            <label htmlFor="inspectorName">Inspector</label>
            <input id="inspectorName" name="inspectorName" placeholder="Capt. John Smith" />
          </div>

          <div className="field">
            <label htmlFor="inspectorCompany">Company / Authority</label>
            <input id="inspectorCompany" name="inspectorCompany" placeholder="Union Maritime / PSC Authority" />
          </div>

          <div className="field">
            <label htmlFor="externalReference">Reference No.</label>
            <input id="externalReference" name="externalReference" placeholder="PSC-SIN-2026-0042" />
          </div>

          <div className="field-wide">
            <label htmlFor="summary">Inspection Summary</label>
            <textarea id="summary" name="summary" placeholder="Purpose, pre-arrival context, planned scope, and any special notes." />
          </div>

          <div className="field-wide">
            <SubmitButton className="btn">Create Inspection</SubmitButton>
          </div>
        </form>
      </section>
    </div>
  );
}
