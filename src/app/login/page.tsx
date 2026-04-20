import { loginAction } from "@/app/session-actions";
import { PasswordField } from "@/components/password-field";
import { SubmitButton } from "@/components/submit-button";
import { prisma } from "@/lib/prisma";
import { getVirSession } from "@/lib/vir/session";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getVirSession();

  if (session) {
    redirect("/");
  }

  const vessels = await prisma.vessel.findMany({
    where: { isActive: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, fleet: true, vesselType: true },
  });

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="eyebrow">PMSLink / QHSE Operations</div>
        <h1 className="login-title">VIR workspace login</h1>
        <p className="login-copy">
          Choose the role you want to operate as. Office users see fleet oversight, shore review, template
          governance, and import control. Vessel users see only their own execution lane, findings, and submission
          workflow. For the demo, `office.tsi` opens a superintendent view defaulted to the assigned vessel set.
        </p>
      </section>

      <section className="login-grid">
        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h2 className="panel-title">Office login</h2>
              <p className="panel-subtitle">Fleet-wide review, imports, templates, and close-out authority.</p>
            </div>
            <span className="chip chip-info">Office</span>
          </div>

          <form action={loginAction} className="form-grid">
            <input name="workspace" type="hidden" value="OFFICE" />

            <div className="field-wide">
              <label htmlFor="officeUsername">Username</label>
              <input defaultValue="office.qhse" id="officeUsername" name="username" placeholder="office.qhse" />
            </div>

            <div className="field-wide">
              <div className="small-text">Demo users: office.qhse, office.marine, office.tech, office.tsi</div>
            </div>

            <PasswordField defaultValue="PMSLink@2026" id="officePassword" label="Password" name="password" />

            <div className="field-wide">
              <SubmitButton className="btn">Enter Office Workspace</SubmitButton>
            </div>
          </form>
        </div>

        <div className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h2 className="panel-title">Vessel login</h2>
              <p className="panel-subtitle">Inspection execution, findings response, corrective progress, and sign-off.</p>
            </div>
            <span className="chip chip-success">Vessel</span>
          </div>

          <form action={loginAction} className="form-grid">
            <input name="workspace" type="hidden" value="VESSEL" />

            <div className="field-wide">
              <label htmlFor="vesselUsername">Username</label>
              <input defaultValue="master" id="vesselUsername" name="username" placeholder="master" />
            </div>

            <PasswordField defaultValue="Vessel@2026" id="vesselPassword" label="Password" name="password" />

            <div className="field-wide">
              <label htmlFor="vesselId">Vessel</label>
              <select id="vesselId" name="vesselId" required>
                <option value="">Select vessel</option>
                {vessels.map((vessel) => (
                  <option key={vessel.id} value={vessel.id}>
                    {vessel.name}
                    {vessel.fleet ? ` - ${vessel.fleet}` : ""}
                    {vessel.vesselType ? ` - ${vessel.vesselType}` : ""}
                  </option>
                ))}
              </select>
            </div>

            <div className="field-wide">
              <label htmlFor="vesselRoleHint">Role credential</label>
              <select defaultValue="master" disabled id="vesselRoleHint">
                <option value="master">master</option>
                <option value="chief.engineer">chief.engineer</option>
                <option value="chief.officer">chief.officer</option>
              </select>
            </div>

            <div className="field-wide">
              <SubmitButton className="btn">Enter Vessel Workspace</SubmitButton>
            </div>
          </form>
        </div>
      </section>
    </div>
  );
}
