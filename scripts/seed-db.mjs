/**
 * Startup seed script — runs after prisma migrate deploy on every startup.
 * Seeds the minimum required reference data (inspection types + QHSE libraries).
 * All operations are upserts so running this multiple times is safe.
 *
 * Full demo data (vessels, inspections, findings) is seeded via /api/seed-vir?secret=...
 */

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const INSPECTION_TYPES = [
  { code: "OWNERS_INSPECTION_INTERNAL", name: "Owner's Inspection (Internal)", category: "INTERNAL", description: "Scheduled internal VIR conducted by the owner's technical or QHSE team." },
  { code: "QHSE_VISIT", name: "QHSE Visit", category: "INTERNAL", description: "QHSE superintendent or manager shipboard visit." },
  { code: "REMOTE_NAVIGATIONAL_ASSESSMENT", name: "Remote Navigational Assessment", category: "INTERNAL", description: "Remote navigational assurance review conducted from shore." },
  { code: "MASTERS_TAKEOVER_INSPECTION", name: "Master's Takeover Inspection", category: "INTERNAL", description: "Inspection conducted at command handover." },
  { code: "ENGINEERING_AUDIT", name: "Engineering Audit", category: "INTERNAL", description: "Engineering plant condition and maintenance audit." },
  { code: "PORT_STATE_CONTROL", name: "Port State Control", category: "PSC", description: "Port State Control inspection." },
  { code: "CLASS_SURVEY", name: "Class Survey", category: "CLASS", description: "Classification society survey." },
  { code: "SIRE_2_0", name: "SIRE 2.0", category: "VETTING", description: "SIRE 2.0 vetting inspection." },
  { code: "RIGHTSHIP", name: "RightShip", category: "VETTING", description: "RightShip vetting inspection." },
  { code: "TMSA_SELF_ASSESSMENT", name: "TMSA Self Assessment", category: "AUDIT", description: "Tanker Management and Self Assessment." },
  { code: "EXTERNAL_AUDIT", name: "External Audit", category: "AUDIT", description: "External third-party audit." },
  { code: "CHEMICAL_DISTRIBUTION_INSTITUTE", name: "Chemical Distribution Institute", category: "VETTING", description: "CDI/CID inspection." },
];

const QHSE_LIBRARIES = [
  {
    code: "GFPUNN",
    name: "Grading: Good / Fair / Poor / Unsatisfactory / Not Seen / Not Applicable",
    description: "Six-point condition grading scale used in Synergy VIR and OCIMF-aligned inspections.",
    valueKind: "TEXT",
    sortOrder: 1,
    items: [
      { code: "G", label: "Good", sortOrder: 1, metadata: { score: 100 } },
      { code: "F", label: "Fair", sortOrder: 2, metadata: { score: 75 } },
      { code: "P", label: "Poor", sortOrder: 3, metadata: { score: 40 } },
      { code: "U", label: "Unsatisfactory", sortOrder: 4, metadata: { score: 0 } },
      { code: "NS", label: "Not Seen", sortOrder: 5, metadata: { score: null } },
      { code: "NA", label: "Not Applicable", sortOrder: 6, metadata: { score: null } },
    ],
  },
  {
    code: "YNN",
    name: "Yes / No / Not Applicable",
    description: "Standard tri-state compliance answer set.",
    valueKind: "TEXT",
    sortOrder: 2,
    items: [
      { code: "Y", label: "Yes", sortOrder: 1, metadata: { score: 100 } },
      { code: "N", label: "No", sortOrder: 2, metadata: { score: 0 } },
      { code: "NA", label: "Not Applicable", sortOrder: 3, metadata: { score: null } },
    ],
  },
  {
    code: "YN",
    name: "Yes / No",
    description: "Binary yes/no answer set.",
    valueKind: "TEXT",
    sortOrder: 3,
    items: [
      { code: "Y", label: "Yes", sortOrder: 1, metadata: { score: 100 } },
      { code: "N", label: "No", sortOrder: 2, metadata: { score: 0 } },
    ],
  },
  {
    code: "CNN",
    name: "Compliant / Non-Compliant / Not Applicable",
    description: "Compliance-oriented answer set for audit and vetting questionnaires.",
    valueKind: "TEXT",
    sortOrder: 4,
    items: [
      { code: "C", label: "Compliant", sortOrder: 1, metadata: { score: 100 } },
      { code: "NC", label: "Non-Compliant", sortOrder: 2, metadata: { score: 0 } },
      { code: "NA", label: "Not Applicable", sortOrder: 3, metadata: { score: null } },
    ],
  },
  {
    code: "QTY",
    name: "Quantity / Count",
    description: "Numeric quantity or count input.",
    valueKind: "NUMBER",
    sortOrder: 5,
    items: [],
  },
  {
    code: "DT",
    name: "Date / Time",
    description: "Date or date-time input.",
    valueKind: "TEXT",
    sortOrder: 6,
    items: [],
  },
];

async function seedInspectionTypes() {
  let count = 0;
  for (const type of INSPECTION_TYPES) {
    await prisma.virInspectionType.upsert({
      where: { code: type.code },
      update: { name: type.name, description: type.description, isActive: true },
      create: { code: type.code, name: type.name, category: type.category, description: type.description, isActive: true },
    });
    count++;
  }
  return count;
}

async function seedQhseLibraries() {
  let count = 0;
  for (const lib of QHSE_LIBRARIES) {
    const libraryType = await prisma.virLibraryType.upsert({
      where: { code: lib.code },
      update: { name: lib.name, description: lib.description, valueKind: lib.valueKind, sortOrder: lib.sortOrder, isActive: true },
      create: { code: lib.code, name: lib.name, description: lib.description, valueKind: lib.valueKind, sortOrder: lib.sortOrder, isActive: true },
      select: { id: true },
    });

    for (const item of lib.items) {
      const existing = await prisma.virLibraryItem.findFirst({
        where: { libraryTypeId: libraryType.id, code: item.code },
        select: { id: true },
      });
      if (existing) {
        await prisma.virLibraryItem.update({
          where: { id: existing.id },
          data: { label: item.label, sortOrder: item.sortOrder, metadata: item.metadata, isActive: true },
        });
      } else {
        await prisma.virLibraryItem.create({
          data: { libraryTypeId: libraryType.id, code: item.code, label: item.label, sortOrder: item.sortOrder, metadata: item.metadata, isActive: true },
        });
      }
    }
    count++;
  }
  return count;
}

async function main() {
  try {
    const typeCount = await seedInspectionTypes();
    console.log(`[seed] Upserted ${typeCount} inspection types.`);
    const libCount = await seedQhseLibraries();
    console.log(`[seed] Upserted ${libCount} QHSE library types (GFPUNN, YNN, YN, CNN, QTY, DT).`);
    console.log("[seed] Reference data ready.");
  } catch (err) {
    console.error("[seed] Seed failed:", err.message);
    // Do not exit with error — the app should still start
  } finally {
    await prisma.$disconnect();
  }
}

main();
