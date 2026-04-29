import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus, Eye, Mail, Pencil, Phone, UserPlus } from "lucide-react";
import { ActionIconLink } from "@/components/action-icon-link";
import { prisma } from "@/lib/prisma";
import { buildVesselProfile } from "@/lib/vir/vessel-profile";
import { updateVesselAction } from "@/app/actions";
import { requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

type VesselSearchParams = Promise<{
  q?: string;
  dialog?: string;
  vesselId?: string;
  createdUserFor?: string;
}>;

export default async function VesselListPage({
  searchParams,
}: {
  searchParams: VesselSearchParams;
}) {
  const session = await requireVirSession();
  const params = await searchParams;
  const query = params.q?.trim() ?? "";
  const activeDialog = params.dialog ?? "";
  const dialogVesselId = params.vesselId ?? "";
  const createdUserFor = params.createdUserFor ?? "";

  const vessels = await prisma.vessel.findMany({
    where: {
      isActive: true,
      ...(session.workspace === "VESSEL" && session.vesselId ? { id: session.vesselId } : {}),
      ...(query
        ? {
            OR: [
              { name: { contains: query, mode: "insensitive" } },
              { code: { contains: query, mode: "insensitive" } },
              { imoNumber: { contains: query, mode: "insensitive" } },
              { fleet: { contains: query, mode: "insensitive" } },
              { vesselType: { contains: query, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    orderBy: [{ fleet: "asc" }, { name: "asc" }],
    include: {
      inspections: {
        orderBy: [{ inspectionDate: "desc" }, { createdAt: "desc" }],
        take: 1,
        include: {
          inspectionType: { select: { name: true } },
          photos: {
            orderBy: { createdAt: "desc" },
            take: 1,
          },
        },
      },
      _count: {
        select: {
          inspections: true,
        },
      },
    },
  });

  const dialogVessel = vessels.find((vessel) => vessel.id === dialogVesselId) ?? null;

  return (
    <div className="page-stack">
      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Vessel list</div>
            <h2 className="hero-title">Fleet vessel directory</h2>
            <p className="hero-copy">
              Search vessels, open details, launch a VIR, and prepare vessel-user access from one compact workflow board.
            </p>
          </div>
          <div className="actions-row">
            <form action="/vessels" className="inline-form inline-form-wide" method="get">
              <input defaultValue={query} name="q" placeholder="Search vessel / IMO / fleet / type" />
              <button className="btn-secondary btn-compact" type="submit">
                Search
              </button>
            </form>
          </div>
        </div>

        {createdUserFor ? (
          <div className="sync-banner">
            Demo user workflow prepared for{" "}
            <strong>{vessels.find((vessel) => vessel.id === createdUserFor)?.name ?? "the selected vessel"}</strong>.
          </div>
        ) : null}

        <div className="vessel-card-grid">
          {vessels.length ? (
            vessels.map((vessel) => {
              const latestInspection = vessel.inspections[0] ?? null;
              const latestPhoto =
                vessel.imageUrl ??
                latestInspection?.photos[0]?.url ??
                fallbackVesselImage(vessel.vesselType);
              const profile = buildVesselProfile(vessel);
              const contact = buildVesselContact(vessel);

              return (
                <article className="vessel-card" key={vessel.id}>
                  <div className="vessel-card-header">
                    <img alt={vessel.name} className="vessel-card-image" src={latestPhoto} />

                    <div className="vessel-card-copy">
                      <div className="vessel-card-title-row">
                        <Link className="table-link" href={`/vessels/${vessel.id}`} scroll={false}>
                          {vessel.name}
                        </Link>
                        <span className="small-text">{vessel.vesselType ?? "Vessel type not set"}</span>
                      </div>

                      <div className="vessel-card-meta-grid">
                        <DetailLine label="IMO No" value={vessel.imoNumber ?? "Not recorded"} />
                        <DetailLine label="Class" value={profile.principalParticulars.find((row) => row.label === "Classification")?.value ?? "Not recorded"} />
                        <DetailLine label="Flag" value={vessel.flag ?? "Not recorded"} />
                        <DetailLine label="Owner" value={profile.principalParticulars.find((row) => row.label === "Manager / Owner")?.value ?? "Not recorded"} />
                      </div>
                    </div>
                  </div>

                  <div className="vessel-card-footer">
                    <div className="vessel-card-contact">
                      <a className="small-text" href={`mailto:${contact.email}`}>
                        <Mail size={13} />
                        <span>{contact.email}</span>
                      </a>
                      <a className="small-text" href={`tel:${contact.phone}`}>
                        <Phone size={13} />
                        <span>{contact.phone}</span>
                      </a>
                    </div>

                    <div className="vessel-card-stats">
                      <span className="chip chip-muted">{vessel.fleet ?? "Unassigned fleet"}</span>
                      <span className="chip chip-info">{vessel._count.inspections} Inspection{vessel._count.inspections !== 1 ? "s" : ""}</span>
                      {latestInspection ? (
                        <span className="chip chip-success">
                          Latest {fmt.format(latestInspection.inspectionDate)}
                        </span>
                      ) : null}
                    </div>

                    <div className="table-actions table-actions-icons">
                      <ActionIconLink href={`/vessels/${vessel.id}`} icon={Eye} label="Open vessel details" tone="primary" />
                      <ActionIconLink
                        href={`/inspections/new?vesselId=${vessel.id}`}
                        icon={CalendarPlus}
                        label="Create inspection"
                        tone="success"
                      />
                      {session.workspace === "OFFICE" ? (
                        <>
                          <ActionIconLink
                            href={buildEditVesselHref(query, vessel.id)}
                            icon={Pencil}
                            label="Edit vessel details"
                            tone="neutral"
                          />
                          <ActionIconLink
                            href={buildDialogHref(query, vessel.id)}
                            icon={UserPlus}
                            label="Create vessel user"
                            tone="warning"
                          />
                        </>
                      ) : null}
                    </div>
                  </div>
                </article>
              );
            })
          ) : (
            <div className="empty-state">No vessels matched the current search.</div>
          )}
        </div>
      </section>

      {/* ── Edit Vessel Dialog ── */}
      {activeDialog === "edit-vessel" && dialogVessel ? (
        <div className="dialog-backdrop">
          <section className="dialog-shell" style={{ maxWidth: "600px" }}>
            <div className="section-header">
              <div>
                <h3 className="panel-title">Edit Vessel</h3>
                <p className="panel-subtitle">Update details and vessel image for {dialogVessel.name}.</p>
              </div>
              <Link className="btn-secondary btn-compact" href={closeDialogHref(query)}>
                Close
              </Link>
            </div>

            <form
              action={updateVesselAction.bind(null, dialogVessel.id)}
              className="form-grid"
              encType="multipart/form-data"
            >
              <input name="returnTo" type="hidden" value={query ? `/vessels?q=${encodeURIComponent(query)}` : "/vessels"} />

              <div className="field">
                <label htmlFor="ev-name">Vessel name</label>
                <input defaultValue={dialogVessel.name} id="ev-name" name="name" required />
              </div>
              <div className="field">
                <label htmlFor="ev-imo">IMO number</label>
                <input defaultValue={dialogVessel.imoNumber ?? ""} id="ev-imo" name="imoNumber" placeholder="e.g. 9876543" />
              </div>
              <div className="field">
                <label htmlFor="ev-type">Vessel type</label>
                <input defaultValue={dialogVessel.vesselType ?? ""} id="ev-type" name="vesselType" placeholder="e.g. Chemical Tanker" />
              </div>
              <div className="field">
                <label htmlFor="ev-fleet">Fleet</label>
                <input defaultValue={dialogVessel.fleet ?? ""} id="ev-fleet" name="fleet" placeholder="e.g. Atlantic Fleet" />
              </div>
              <div className="field">
                <label htmlFor="ev-flag">Flag state</label>
                <input defaultValue={dialogVessel.flag ?? ""} id="ev-flag" name="flag" placeholder="e.g. Marshall Islands" />
              </div>
              <div className="field">
                <label htmlFor="ev-manager">Manager / Owner</label>
                <input defaultValue={dialogVessel.manager ?? ""} id="ev-manager" name="manager" placeholder="e.g. Union Maritime Limited" />
              </div>

              <div className="field field-wide" style={{ borderTop: "1px solid var(--color-border)", paddingTop: "1rem", marginTop: "0.5rem" }}>
                <label style={{ fontWeight: 600, fontSize: "0.85rem", marginBottom: "0.5rem", display: "block" }}>
                  Vessel image
                </label>
                {dialogVessel.imageUrl ? (
                  <div style={{ marginBottom: "0.75rem" }}>
                    <img
                      alt="Current vessel image"
                      src={dialogVessel.imageUrl}
                      style={{ width: "100%", maxHeight: "160px", objectFit: "cover", borderRadius: "6px", border: "1px solid var(--color-border)" }}
                    />
                  </div>
                ) : null}
                <div className="field">
                  <label htmlFor="ev-image-file" style={{ fontSize: "0.8rem" }}>Upload new image (JPG, PNG, WEBP)</label>
                  <input accept="image/*" id="ev-image-file" name="imageFile" type="file" />
                </div>
                <div className="field">
                  <label htmlFor="ev-image-url" style={{ fontSize: "0.8rem" }}>Or paste image URL</label>
                  <input
                    defaultValue={dialogVessel.imageUrl ?? ""}
                    id="ev-image-url"
                    name="imageUrl"
                    placeholder="https://..."
                    type="url"
                  />
                </div>
              </div>

              <div className="field-wide actions-row">
                <button className="btn" type="submit">
                  Save changes
                </button>
                <Link className="btn-secondary" href={closeDialogHref(query)}>
                  Cancel
                </Link>
              </div>
            </form>
          </section>
        </div>
      ) : null}

      {/* ── Create User Dialog ── */}
      {activeDialog === "create-user" && dialogVessel ? (
        <div className="dialog-backdrop">
          <section className="dialog-shell">
            <div className="section-header">
              <div>
                <h3 className="panel-title">Create User</h3>
                <p className="panel-subtitle">Prepare vessel-user access for {dialogVessel.name}.</p>
              </div>
              <Link className="btn-secondary btn-compact" href={closeDialogHref(query)}>
                Close
              </Link>
            </div>

            <form action={createVesselUserAction} className="form-grid">
              <input name="returnTo" type="hidden" value={query ? `/vessels?q=${encodeURIComponent(query)}` : "/vessels"} />
              <input name="vesselId" type="hidden" value={dialogVessel.id} />

              <div className="field">
                <label htmlFor="name">Name</label>
                <input defaultValue={`${dialogVessel.name} Operator`} id="name" name="name" required />
              </div>
              <div className="field">
                <label htmlFor="username">Username</label>
                <input defaultValue={buildUsername(dialogVessel.name)} id="username" name="username" required />
              </div>
              <div className="field">
                <label htmlFor="email">Email</label>
                <input defaultValue={buildVesselContact(dialogVessel).email} id="email" name="email" required type="email" />
              </div>
              <div className="field">
                <label htmlFor="fromDate">From date</label>
                <input id="fromDate" name="fromDate" type="date" />
              </div>
              <div className="field">
                <label htmlFor="toDate">To date</label>
                <input id="toDate" name="toDate" type="date" />
              </div>

              <div className="field-wide actions-row">
                <button className="btn" type="submit">
                  Create user
                </button>
                <Link className="btn-secondary" href={closeDialogHref(query)}>
                  Cancel
                </Link>
              </div>
            </form>
          </section>
        </div>
      ) : null}
    </div>
  );
}

async function createVesselUserAction(formData: FormData) {
  "use server";

  const vesselId = String(formData.get("vesselId") ?? "");
  const returnTo = String(formData.get("returnTo") ?? "/vessels");
  const separator = returnTo.includes("?") ? "&" : "?";

  redirect(`${returnTo}${separator}createdUserFor=${encodeURIComponent(vesselId)}`);
}

function buildEditVesselHref(query: string, vesselId: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("dialog", "edit-vessel");
  params.set("vesselId", vesselId);
  return `/vessels?${params.toString()}`;
}

function buildDialogHref(query: string, vesselId: string) {
  const params = new URLSearchParams();
  if (query) params.set("q", query);
  params.set("dialog", "create-user");
  params.set("vesselId", vesselId);
  return `/vessels?${params.toString()}`;
}

function closeDialogHref(query: string) {
  if (!query) return "/vessels";
  return `/vessels?q=${encodeURIComponent(query)}`;
}

function fallbackVesselImage(vesselType: string | null | undefined) {
  const normalized = (vesselType ?? "").toUpperCase();

  if (normalized.includes("LNG") || normalized.includes("LPG")) {
    return "/demo-evidence/cargo-manifold.svg";
  }

  if (normalized.includes("CHEM") || normalized.includes("OIL") || normalized.includes("ASPHALT")) {
    return "/demo-evidence/deck-condition.svg";
  }

  return "/demo-evidence/bridge-watch.svg";
}

function buildVesselContact(vessel: {
  code: string;
  name: string;
}) {
  const slug = vessel.name.toLowerCase().replace(/[^a-z0-9]+/g, "");
  const hash = Math.abs(
    `${vessel.code}-${vessel.name}`.split("").reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) | 0, 0)
  );

  return {
    email: `${slug || vessel.code.toLowerCase()}@pmslink.demo`,
    phone: `+${91 + (hash % 8)}-${String(3000000000 + (hash % 699999999)).slice(0, 10)}`,
  };
}

function buildUsername(name: string) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
}

function DetailLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="vessel-card-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
