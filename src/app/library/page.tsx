import Link from "next/link";
import { BookOpen, Download, Star, FileText, HelpCircle, AlignJustify, BookMarked } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { requireVirSession } from "@/lib/vir/session";
import { generateLibraryAction, toggleFavouriteAction } from "./actions";

export const dynamic = "force-dynamic";

const fmt = new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" });

const itemTypeLabel: Record<string, string> = {
  TEMPLATE: "Template",
  QUESTION_SET: "Question Set",
  REFERENCE: "Reference",
  DEFECT_DESC: "Defect Description",
  FAVOURITE: "Favourite",
};

const itemTypeIcon: Record<string, React.ReactNode> = {
  TEMPLATE: <FileText size={14} />,
  QUESTION_SET: <AlignJustify size={14} />,
  REFERENCE: <HelpCircle size={14} />,
  DEFECT_DESC: <BookMarked size={14} />,
  FAVOURITE: <Star size={14} />,
};

export default async function InspectorLibraryPage({
  searchParams,
}: {
  searchParams: Promise<{ libraryId?: string; type?: string; favourites?: string }>;
}) {
  const session = await requireVirSession();
  const { libraryId, type, favourites } = await searchParams;

  const libraries = await prisma.virInspectorLibrary.findMany({
    where: { isActive: true },
    orderBy: [{ isDefault: "desc" }, { name: "asc" }],
    select: {
      id: true,
      name: true,
      inspectorName: true,
      isDefault: true,
      _count: { select: { items: true } },
    },
  });

  const activeLibraryId = libraryId ?? libraries[0]?.id ?? null;
  const activeLibrary = activeLibraryId
    ? await prisma.virInspectorLibrary.findUnique({
        where: { id: activeLibraryId },
        include: {
          items: {
            where: {
              ...(type ? { itemType: type as "TEMPLATE" | "QUESTION_SET" | "REFERENCE" | "DEFECT_DESC" | "FAVOURITE" } : {}),
              ...(favourites === "1" ? { isFavourite: true } : {}),
            },
            orderBy: [{ isFavourite: "desc" }, { itemType: "asc" }, { sortOrder: "asc" }, { createdAt: "desc" }],
          },
        },
      })
    : null;

  const downloadHref = activeLibraryId ? `/api/library/${activeLibraryId}/download` : null;

  return (
    <div className="page-stack">
      <div className="panel panel-elevated">
        <div className="section-header">
          <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
            <BookOpen size={20} style={{ color: "var(--color-blue)" }} />
            <div>
              <h2 className="panel-title" style={{ marginBottom: 0 }}>Inspector Library</h2>
              <p className="panel-subtitle">Templates, question sets, and reference materials for inspectors.</p>
            </div>
          </div>
          <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
            <form action={generateLibraryAction}>
              <button className="btn-secondary btn-compact" style={{ fontSize: "0.8rem" }} type="submit">
                Auto-generate for me
              </button>
            </form>
            {downloadHref ? (
              <a className="btn btn-compact" download href={downloadHref} style={{ fontSize: "0.8rem" }}>
                <Download size={13} style={{ marginRight: "0.3rem" }} />
                Download Library
              </a>
            ) : null}
          </div>
        </div>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "220px 1fr", gap: "1rem", alignItems: "start" }}>
        {/* Sidebar: library list */}
        <div className="panel panel-elevated" style={{ padding: 0, overflow: "hidden" }}>
          <div style={{ padding: "0.75rem 1rem", borderBottom: "1px solid var(--color-border)", fontWeight: 700, fontSize: "0.78rem", color: "var(--color-ink-soft)", textTransform: "uppercase", letterSpacing: "0.05em" }}>
            My Libraries
          </div>
          <div>
            {libraries.length === 0 ? (
              <div className="empty-state" style={{ padding: "1rem", fontSize: "0.82rem" }}>
                No libraries yet. Use &quot;Auto-generate&quot; to create one.
              </div>
            ) : (
              libraries.map((lib) => (
                <Link
                  className={`lib-sidebar-item${lib.id === activeLibraryId ? " lib-sidebar-item-active" : ""}`}
                  href={`/library?libraryId=${lib.id}`}
                  key={lib.id}
                >
                  <div className="lib-sidebar-name">{lib.name}</div>
                  {lib.inspectorName ? (
                    <div className="lib-sidebar-sub">{lib.inspectorName}</div>
                  ) : null}
                  <div className="lib-sidebar-count">{lib._count.items} items</div>
                </Link>
              ))
            )}
          </div>
        </div>

        {/* Main: items */}
        <div className="panel panel-elevated">
          {!activeLibrary ? (
            <div className="empty-state">Select a library or auto-generate one to begin.</div>
          ) : (
            <>
              <div className="section-header" style={{ marginBottom: "1rem" }}>
                <div>
                  <div style={{ fontWeight: 700, fontSize: "1rem" }}>{activeLibrary.name}</div>
                  {activeLibrary.inspectorName ? (
                    <div className="small-text">{activeLibrary.inspectorName}</div>
                  ) : null}
                  {activeLibrary.description ? (
                    <p className="panel-subtitle">{activeLibrary.description}</p>
                  ) : null}
                </div>
                <div style={{ display: "flex", gap: "0.4rem", flexWrap: "wrap" }}>
                  {([
                    { label: "All", value: "" },
                    { label: "Templates", value: "TEMPLATE" },
                    { label: "Question Sets", value: "QUESTION_SET" },
                    { label: "References", value: "REFERENCE" },
                    { label: "Defect Descriptions", value: "DEFECT_DESC" },
                  ] as const).map((tab) => (
                    <Link
                      className={`btn-ghost btn-compact${type === tab.value || (!type && tab.value === "") ? " lib-tab-active" : ""}`}
                      href={`/library?libraryId=${activeLibraryId}&type=${tab.value}`}
                      key={tab.value}
                      style={{ fontSize: "0.78rem", padding: "0.2rem 0.6rem" }}
                    >
                      {tab.label}
                    </Link>
                  ))}
                  <Link
                    className={`btn-ghost btn-compact${favourites === "1" ? " lib-tab-active" : ""}`}
                    href={`/library?libraryId=${activeLibraryId}&favourites=1`}
                    style={{ fontSize: "0.78rem", padding: "0.2rem 0.6rem" }}
                  >
                    <Star size={12} style={{ marginRight: "0.2rem" }} />
                    Starred
                  </Link>
                </div>
              </div>

              {activeLibrary.items.length === 0 ? (
                <div className="empty-state">No items in this view. Try adding items or changing filters.</div>
              ) : (
                <div className="stack-list">
                  {activeLibrary.items.map((item) => (
                    <div className="list-card" key={item.id} style={{ padding: "0.75rem 1rem" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: "0.75rem" }}>
                        <div style={{ flex: 1 }}>
                          <div className="meta-row" style={{ marginBottom: "0.3rem" }}>
                            <span className="chip chip-info" style={{ fontSize: "0.62rem", display: "inline-flex", alignItems: "center", gap: "0.2rem" }}>
                              {itemTypeIcon[item.itemType]}
                              {itemTypeLabel[item.itemType] ?? item.itemType}
                            </span>
                            {item.isFavourite ? <span className="chip chip-warning" style={{ fontSize: "0.62rem" }}>★ Starred</span> : null}
                          </div>
                          <div style={{ fontWeight: 700, fontSize: "0.9rem", marginBottom: "0.3rem" }}>{item.title}</div>
                          <p className="small-text" style={{ whiteSpace: "pre-wrap", maxHeight: "4em", overflow: "hidden" }}>{item.content}</p>
                          <div style={{ fontSize: "0.72rem", color: "var(--color-ink-soft)", marginTop: "0.3rem" }}>
                            Added {fmt.format(item.createdAt)}
                          </div>
                        </div>
                        <form action={toggleFavouriteAction.bind(null, activeLibrary.id, item.id, !item.isFavourite)}>
                          <button
                            className={`btn-ghost btn-compact${item.isFavourite ? " lib-star-active" : ""}`}
                            style={{ fontSize: "0.75rem", padding: "0.2rem 0.5rem" }}
                            title={item.isFavourite ? "Remove from starred" : "Add to starred"}
                            type="submit"
                          >
                            {item.isFavourite ? "★" : "☆"}
                          </button>
                        </form>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
