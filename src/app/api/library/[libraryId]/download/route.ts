import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireVirSession } from "@/lib/vir/session";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ libraryId: string }> }
) {
  await requireVirSession();
  const { libraryId } = await params;

  const library = await prisma.virInspectorLibrary.findUnique({
    where: { id: libraryId },
    include: {
      items: {
        orderBy: [{ itemType: "asc" }, { sortOrder: "asc" }],
      },
    },
  });

  if (!library) {
    return NextResponse.json({ error: "Library not found" }, { status: 404 });
  }

  const payload = {
    library: {
      name: library.name,
      inspectorName: library.inspectorName,
      exportedAt: new Date().toISOString(),
    },
    items: library.items.map((item) => ({
      type: item.itemType,
      title: item.title,
      content: item.content,
      favourite: item.isFavourite,
      metadata: item.metadata,
    })),
  };

  const filename = `library-${library.name.replace(/[^a-z0-9]/gi, "-").toLowerCase()}.json`;

  return new NextResponse(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
