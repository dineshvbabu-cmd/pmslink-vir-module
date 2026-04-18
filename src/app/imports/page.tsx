import { TemplateImportConsole } from "@/app/imports/template-import-console";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

export default async function ImportsPage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string }>;
}) {
  const currentSession = await requireVirSession();

  if (!isOfficeSession(currentSession)) {
    return (
      <div className="page-stack">
        <section className="panel panel-elevated">
          <div className="section-header">
            <div>
              <h2 className="panel-title">Import engine</h2>
              <p className="panel-subtitle">This workspace is reserved for office review and governance.</p>
            </div>
          </div>
          <div className="empty-state">
            Vessel users can consume imported templates through live inspections, but they cannot run template imports
            or approve external report mapping sessions.
          </div>
        </section>
      </div>
    );
  }

  const { session } = await searchParams;

  const sessions = await prisma.virImportSession.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      inspectionType: { select: { name: true, code: true } },
      fieldReviews: {
        take: 5,
        orderBy: { createdAt: "desc" },
      },
    },
  });

  return (
    <div className="page-stack">
      <TemplateImportConsole />

      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">Office governance</div>
            <h2 className="panel-title">Import session history</h2>
            <p className="panel-subtitle">
              Review and commit trail for questionnaire imports, with confidence and payload capture.
            </p>
          </div>
        </div>

        <div className="stack-list">
          {sessions.map((record) => (
            <div className="list-card" key={record.id}>
              <div className="section-header">
                <div>
                  <div className="meta-row">
                    <span className={`chip ${record.id === session ? "chip-success" : "chip-info"}`}>{record.status}</span>
                    {record.inspectionType ? <span className="chip chip-warning">{record.inspectionType.name}</span> : null}
                  </div>
                  <div className="list-card-title">{record.sourceFileName}</div>
                  <div className="small-text">
                    {record.sourceSystem ?? "Unknown source"} / {fmt.format(record.createdAt)}
                    {record.confidenceAvg ? ` / ${Math.round(record.confidenceAvg * 100)}% confidence` : ""}
                  </div>
                </div>
              </div>

              <div className="small-text">
                Payload fields reviewed: {record.fieldReviews.length} / Session ID: {record.id}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
