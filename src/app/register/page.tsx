import { redirect } from "next/navigation";
import {
  deleteVirLibraryItemAction,
  upsertVirLibraryItemAction,
  upsertVirLibraryTypeAction,
} from "@/app/actions";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

const valueKinds = ["TEXT", "NUMBER", "BOOLEAN", "REFERENCE"] as const;

export default async function VirLibraryRegisterPage() {
  const session = await requireVirSession();

  if (!isOfficeSession(session)) {
    redirect("/");
  }

  const libraryTypes = await prisma.virLibraryType.findMany({
    include: {
      items: {
        include: {
          values: {
            orderBy: { sortOrder: "asc" },
          },
        },
        orderBy: [{ sortOrder: "asc" }, { label: "asc" }],
      },
    },
    orderBy: [{ sortOrder: "asc" }, { name: "asc" }],
  });

  return (
    <div className="page-stack">
      <section className="hero-card">
        <div className="hero-copy">
          <p className="eyebrow">Office Template Governance</p>
          <h1>Library Register</h1>
          <p>
            Maintain answer types, inspection groups, section masters, and other reusable template controls without
            changing already created inspections.
          </p>
        </div>
      </section>

      <section className="register-grid">
        <article className="bar-card">
          <div className="bar-card-header">
            <div>
              <strong>Add Library Type</strong>
              <div className="small-text">Create a reusable library bucket for template authors.</div>
            </div>
          </div>
          <form action={upsertVirLibraryTypeAction} className="register-form">
            <label>
              Code
              <input name="code" placeholder="ANSWER_TYPE" type="text" />
            </label>
            <label>
              Name
              <input name="name" placeholder="Answer Type" required type="text" />
            </label>
            <label>
              Value kind
              <select defaultValue="TEXT" name="valueKind">
                {valueKinds.map((valueKind) => (
                  <option key={valueKind} value={valueKind}>
                    {valueKind}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Sort order
              <input defaultValue="0" name="sortOrder" type="number" />
            </label>
            <label className="register-form-span">
              Description
              <textarea name="description" placeholder="What this library controls in VIR templates." rows={3} />
            </label>
            <label className="checkbox-row">
              <input defaultChecked name="isActive" type="checkbox" />
              Active
            </label>
            <div className="register-form-actions">
              <button className="button button-primary" type="submit">
                Save library type
              </button>
            </div>
          </form>
        </article>
      </section>

      {libraryTypes.map((libraryType) => (
        <section className="register-type-card" key={libraryType.id}>
          <article className="bar-card">
            <div className="bar-card-header">
              <div>
                <strong>{libraryType.name}</strong>
                <div className="small-text">
                  {libraryType.code} / {libraryType.valueKind} / {libraryType.isActive ? "Active" : "Inactive"}
                </div>
              </div>
            </div>

            <form action={upsertVirLibraryTypeAction} className="register-form">
              <input name="id" type="hidden" value={libraryType.id} />
              <label>
                Code
                <input defaultValue={libraryType.code} name="code" type="text" />
              </label>
              <label>
                Name
                <input defaultValue={libraryType.name} name="name" required type="text" />
              </label>
              <label>
                Value kind
                <select defaultValue={libraryType.valueKind} name="valueKind">
                  {valueKinds.map((valueKind) => (
                    <option key={valueKind} value={valueKind}>
                      {valueKind}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Sort order
                <input defaultValue={libraryType.sortOrder} name="sortOrder" type="number" />
              </label>
              <label className="register-form-span">
                Description
                <textarea defaultValue={libraryType.description ?? ""} name="description" rows={2} />
              </label>
              <label className="checkbox-row">
                <input defaultChecked={libraryType.isActive} name="isActive" type="checkbox" />
                Active
              </label>
              <div className="register-form-actions">
                <button className="button button-secondary" type="submit">
                  Update library type
                </button>
              </div>
            </form>

            <div className="table-shell">
              <table className="table data-table vir-data-table">
                <thead>
                  <tr>
                    <th>Label</th>
                    <th>Code</th>
                    <th>Values</th>
                    <th>Sort</th>
                    <th>State</th>
                    <th>Action</th>
                  </tr>
                </thead>
                <tbody>
                  {libraryType.items.map((item) => (
                    <tr key={item.id}>
                      <td colSpan={6}>
                        <form action={upsertVirLibraryItemAction} className="register-item-row">
                          <input name="id" type="hidden" value={item.id} />
                          <input name="libraryTypeId" type="hidden" value={libraryType.id} />
                          <input defaultValue={item.label} name="label" placeholder="Label" required type="text" />
                          <input defaultValue={item.code ?? ""} name="code" placeholder="Code" type="text" />
                          <input
                            defaultValue={item.values.map((value) => value.value).join(", ")}
                            name="values"
                            placeholder="YES, NO, NA"
                            type="text"
                          />
                          <input defaultValue={item.sortOrder} name="sortOrder" type="number" />
                          <label className="checkbox-row">
                            <input defaultChecked={item.isActive} name="isActive" type="checkbox" />
                            Active
                          </label>
                          <input defaultValue={item.description ?? ""} name="description" placeholder="Description" type="text" />
                          <div className="table-actions">
                            <button className="button button-secondary" type="submit">
                              Save
                            </button>
                          </div>
                        </form>
                        <form action={deleteVirLibraryItemAction.bind(null, item.id)} className="register-delete-form">
                          <button className="button button-ghost-danger" type="submit">
                            Delete
                          </button>
                        </form>
                      </td>
                    </tr>
                  ))}
                  <tr>
                    <td colSpan={6}>
                      <form action={upsertVirLibraryItemAction} className="register-item-row register-item-row-new">
                        <input name="libraryTypeId" type="hidden" value={libraryType.id} />
                        <input name="label" placeholder="New item label" required type="text" />
                        <input name="code" placeholder="Code" type="text" />
                        <input name="values" placeholder="Comma-separated values" type="text" />
                        <input defaultValue={libraryType.items.length} name="sortOrder" type="number" />
                        <label className="checkbox-row">
                          <input defaultChecked name="isActive" type="checkbox" />
                          Active
                        </label>
                        <input name="description" placeholder="Description" type="text" />
                        <div className="table-actions">
                          <button className="button button-primary" type="submit">
                            Add item
                          </button>
                        </div>
                      </form>
                    </td>
                  </tr>
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ))}
    </div>
  );
}
