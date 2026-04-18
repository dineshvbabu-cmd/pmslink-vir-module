import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VIR_INSPECTION_TYPES, VIR_SAMPLE_TEMPLATE_PAYLOAD, VIR_SPEC_COUNTS } from "@/lib/vir/catalog";
import { normalizeVirTemplateImport } from "@/lib/vir/import";

const DEMO_VESSEL = {
  code: "UM-DMO-001",
  name: "MT Maritime Hope",
  imoNumber: "9812345",
  vesselType: "Oil / Chemical Tanker",
  fleet: "QHSE Demo Fleet",
  flag: "Liberia",
  manager: "Union Maritime",
};

async function runSeed(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: string[] = [];

  for (const inspectionType of VIR_INSPECTION_TYPES) {
    await prisma.virInspectionType.upsert({
      where: { code: inspectionType.code },
      update: {
        name: inspectionType.name,
        category: inspectionType.category,
        description: inspectionType.description,
        isActive: true,
      },
      create: inspectionType,
    });
  }

  results.push(`Seeded ${VIR_INSPECTION_TYPES.length} inspection types from the supplied VIR specification.`);

  const vessel = await prisma.vessel.upsert({
    where: { code: DEMO_VESSEL.code },
    update: DEMO_VESSEL,
    create: DEMO_VESSEL,
  });

  results.push(`Upserted demo vessel ${vessel.name}.`);

  const inspectionType = await prisma.virInspectionType.findUnique({
    where: { code: VIR_SAMPLE_TEMPLATE_PAYLOAD.inspectionTypeCode },
    select: { id: true },
  });

  if (inspectionType) {
    const { normalized } = normalizeVirTemplateImport(VIR_SAMPLE_TEMPLATE_PAYLOAD);
    const existingTemplate = await prisma.virTemplate.findFirst({
      where: {
        inspectionTypeId: inspectionType.id,
        version: normalized.version,
      },
      select: { id: true },
    });

    if (!existingTemplate) {
      await prisma.virTemplate.create({
        data: {
          inspectionTypeId: inspectionType.id,
          name: normalized.templateName,
          version: normalized.version,
          description: normalized.description,
          sections: {
            create: normalized.sections.map((section) => ({
              code: section.code,
              title: section.title,
              guidance: section.guidance,
              sortOrder: section.sortOrder,
              questions: {
                create: section.questions.map((question) => ({
                  code: question.code,
                  prompt: question.prompt,
                  responseType: question.responseType,
                  riskLevel: question.riskLevel,
                  isMandatory: question.isMandatory,
                  allowsObservation: question.allowsObservation,
                  allowsPhoto: question.allowsPhoto,
                  isCicCandidate: question.isCicCandidate,
                  cicTopic: question.cicTopic,
                  helpText: question.helpText,
                  referenceImageUrl: question.referenceImageUrl,
                  sortOrder: question.sortOrder,
                  options: {
                    create: question.options.map((option, optionIndex) => ({
                      value: option.value,
                      label: option.label,
                      score: option.score,
                      sortOrder: optionIndex + 1,
                    })),
                  },
                })),
              },
            })),
          },
        },
      });

      results.push("Created the PSC starter questionnaire template for management review.");
    } else {
      results.push("PSC starter questionnaire template already exists.");
    }
  }

  return NextResponse.json({
    ok: true,
    results,
    reviewNotes: {
      claimedInspectionTypes: VIR_SPEC_COUNTS.claimedInspectionTypes,
      extractedInspectionTypes: VIR_SPEC_COUNTS.extractedInspectionTypes,
      discrepancy: VIR_SPEC_COUNTS.extractedInspectionTypes - VIR_SPEC_COUNTS.claimedInspectionTypes,
    },
  });
}

export const GET = runSeed;
export const POST = runSeed;
