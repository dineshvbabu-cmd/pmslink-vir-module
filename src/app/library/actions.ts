"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { requireVirSession } from "@/lib/vir/session";

export async function generateLibraryAction() {
  const session = await requireVirSession();

  const inspectorName = session.actorName ?? "Inspector";

  // Check if a library already exists for this actor
  const existing = await prisma.virInspectorLibrary.findFirst({
    where: { inspectorName, isActive: true },
  });

  if (existing) {
    revalidatePath("/library");
    return;
  }

  // Gather material from existing inspections: unique defect descriptions and finding titles
  const findings = await prisma.virFinding.findMany({
    take: 200,
    orderBy: { createdAt: "desc" },
    select: {
      title: true,
      description: true,
      findingType: true,
      severity: true,
      defectClassification: true,
    },
  });

  const templates = await prisma.virTemplate.findMany({
    where: { isActive: true },
    take: 20,
    orderBy: { updatedAt: "desc" },
    select: {
      id: true,
      name: true,
      version: true,
      inspectionType: { select: { name: true } },
    },
  });

  const library = await prisma.virInspectorLibrary.create({
    data: {
      name: `${inspectorName}'s Library`,
      inspectorName,
      isDefault: true,
    },
  });

  // Seed with template references
  for (const template of templates.slice(0, 10)) {
    await prisma.virInspectorLibraryItem.create({
      data: {
        libraryId: library.id,
        itemType: "TEMPLATE",
        title: `${template.inspectionType.name} — ${template.name} v${template.version}`,
        content: `Template: ${template.name}\nInspection type: ${template.inspectionType.name}\nVersion: ${template.version}`,
        sortOrder: 0,
      },
    });
  }

  // Seed with unique defect descriptions (deduplicated by title)
  const seen = new Set<string>();
  let order = 1;
  for (const finding of findings) {
    const key = finding.title.toLowerCase().trim();
    if (seen.has(key)) continue;
    seen.add(key);
    await prisma.virInspectorLibraryItem.create({
      data: {
        libraryId: library.id,
        itemType: "DEFECT_DESC",
        title: finding.title,
        content: finding.description,
        metadata: {
          findingType: finding.findingType,
          severity: finding.severity,
          defectClassification: finding.defectClassification,
        },
        sortOrder: order++,
      },
    });
    if (order > 50) break;
  }

  revalidatePath("/library");
}

export async function toggleFavouriteAction(libraryId: string, itemId: string, newValue: boolean) {
  await requireVirSession();

  await prisma.virInspectorLibraryItem.update({
    where: { id: itemId },
    data: { isFavourite: newValue },
  });

  revalidatePath("/library");
}
