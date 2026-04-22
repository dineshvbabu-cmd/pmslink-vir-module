import Link from "next/link";
import { redirect } from "next/navigation";
import { CalendarPlus, Eye, Mail, Phone, UserPlus } from "lucide-react";
import { ActionIconLink } from "@/components/action-icon-link";
import { prisma } from "@/lib/prisma";
import { buildVesselProfile } from "@/lib/vir/vessel-profile";
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
              const latestPhoto = latestInspection?.photos[0]?.url ?? fallbackVesselImage(vessel.vesselType);
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
                      <span className="chip chip-info">{vessel._count.inspections} VIR</span>
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
                        <ActionIconLink
                          href={buildDialogHref(query, vessel.id)}
                          icon={UserPlus}
                          label="Create vessel user"
                          tone="warning"
                        />
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

function buildDialogHref(query: string, vesselId: string) {
  const params = new URLSearchParams();

  if (query) {
    params.set("q", query);
  }

  params.set("dialog", "create-user");
  params.set("vesselId", vesselId);

  return `/vessels?${params.toString()}`;
}

function closeDialogHref(query: string) {
  if (!query) {
    return "/vessels";
  }

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
