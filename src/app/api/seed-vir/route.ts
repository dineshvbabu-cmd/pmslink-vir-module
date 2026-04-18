import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VIR_INSPECTION_TYPES, VIR_SAMPLE_TEMPLATE_PAYLOAD, VIR_SPEC_COUNTS } from "@/lib/vir/catalog";
import { normalizeVirTemplateImport } from "@/lib/vir/import";
import { syncInspectionCounters } from "@/lib/vir/workflow";

const DEMO_VESSELS = [
  {
    code: "UM-DMO-001",
    name: "MT Maritime Hope",
    imoNumber: "9812345",
    vesselType: "Oil / Chemical Tanker",
    fleet: "QHSE Demo Fleet",
    flag: "Liberia",
    manager: "Union Maritime",
  },
  {
    code: "UM-DMO-002",
    name: "MT Ocean Sentinel",
    imoNumber: "9723456",
    vesselType: "Product Tanker",
    fleet: "QHSE Demo Fleet",
    flag: "Marshall Islands",
    manager: "Union Maritime",
  },
  {
    code: "UM-DMO-003",
    name: "MV Horizon Crest",
    imoNumber: "9645678",
    vesselType: "Bulk Carrier",
    fleet: "QHSE Demo Fleet",
    flag: "Singapore",
    manager: "Union Maritime",
  },
];

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

  const vessels = [];
  for (const vesselInput of DEMO_VESSELS) {
    const vessel = await prisma.vessel.upsert({
      where: { code: vesselInput.code },
      update: vesselInput,
      create: vesselInput,
    });

    vessels.push(vessel);
  }

  results.push(`Upserted ${vessels.length} demo vessels for fleet dashboarding.`);

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

      results.push("Created the PSC starter questionnaire template for live execution and import review.");
    } else {
      results.push("PSC starter questionnaire template already exists.");
    }

    const template = await prisma.virTemplate.findFirst({
      where: {
        inspectionTypeId: inspectionType.id,
        version: normalized.version,
      },
      include: {
        sections: {
          include: {
            questions: true,
          },
          orderBy: { sortOrder: "asc" },
        },
      },
    });

    if (template) {
      const questionMap = new Map(
        template.sections.flatMap((section) => section.questions).map((question) => [question.code, question])
      );

      const demoInspections = [
        {
          title: "PSC Self Assessment - Singapore Arrival",
          vesselId: vessels[0].id,
          port: "Singapore",
          country: "Singapore / Tokyo MoU",
          inspectionDate: new Date("2026-04-15"),
          inspectorName: "Capt. Lee Arjun",
          inspectorCompany: "Union Maritime QHSE",
          externalReference: "PSC-SIN-2026-0042",
          status: "SUBMITTED" as const,
          summary: "Pre-arrival PSC self assessment performed ahead of port state boarding.",
        },
        {
          title: "PSC Readiness Review - Fujairah",
          vesselId: vessels[1].id,
          port: "Fujairah",
          country: "UAE / Riyadh MoU",
          inspectionDate: new Date("2026-04-18"),
          inspectorName: "Capt. Mara Quinn",
          inspectorCompany: "Union Maritime QHSE",
          externalReference: "PSC-FJR-2026-0018",
          status: "DRAFT" as const,
          summary: "Readiness review focused on certificates, bridge publications, and fire system readiness.",
        },
      ];

      for (const item of demoInspections) {
        let inspection = await prisma.virInspection.findFirst({
          where: { title: item.title, vesselId: item.vesselId },
        });

        if (!inspection) {
          inspection = await prisma.virInspection.create({
            data: {
              ...item,
              inspectionTypeId: inspectionType.id,
              templateId: template.id,
            },
          });
        }

        const demoAnswers =
          item.status === "SUBMITTED"
            ? {
                "CERTS-001": { answerText: "YES", answerBoolean: true, comment: "Certificates valid and available in CCR." },
                "CERTS-002": { answerNumber: 2, comment: "One cargo ship safety equipment cert and one radio cert due next month." },
                "FIRE-001": { answerText: "MINOR_ISSUE", comment: "Pressure acceptable but one hydrant cap leaking." },
                "FIRE-002": { answerText: "One detector isolated in purifier flat due replacement fault board.", comment: "Temporary controls posted." },
                "NAV-001": { answerText: "YES", answerBoolean: true, comment: "Passage plan signed by full bridge team." },
                "NAV-002": { answerDate: new Date("2026-04-10"), comment: "Latest digital publications update complete." },
                "NAV-003": { selectedOptions: ["BNWAS"], answerText: "BNWAS", comment: "Reset alarm timing under review." },
              }
            : {
                "CERTS-001": { answerText: "YES", answerBoolean: true, comment: "Certificates checked in master's office." },
                "CERTS-002": { answerNumber: 1, comment: "One document due in 21 days." },
                "FIRE-001": { answerText: "SATISFACTORY", comment: "Hydrant pressure test within expected range." },
                "NAV-001": { answerText: "NO", answerBoolean: false, comment: "Passage plan not yet countersigned by master." },
              };

        for (const [code, answer] of Object.entries(demoAnswers)) {
          const question = questionMap.get(code);

          if (!question) {
            continue;
          }

          await prisma.virAnswer.upsert({
            where: {
              inspectionId_questionId: {
                inspectionId: inspection.id,
                questionId: question.id,
              },
            },
            update: {
              ...answer,
              answeredAt: new Date(),
            },
            create: {
              inspectionId: inspection.id,
              questionId: question.id,
              ...answer,
              answeredAt: new Date(),
            },
          });
        }

        if (item.status === "SUBMITTED") {
          const existingFinding = await prisma.virFinding.findFirst({
            where: { inspectionId: inspection.id, title: "Hydrant cap leakage on fire line test point" },
          });

          if (!existingFinding) {
            const finding = await prisma.virFinding.create({
              data: {
                inspectionId: inspection.id,
                questionId: questionMap.get("FIRE-001")?.id,
                findingType: "NON_CONFORMITY",
                severity: "HIGH",
                status: "IN_PROGRESS",
                title: "Hydrant cap leakage on fire line test point",
                description: "Minor leakage observed during fire line pressure test. Requires gasket renewal and retest.",
                ownerName: "Chief Engineer",
                dueDate: new Date("2026-04-29"),
                vesselResponse: "Spare gasket arranged from store and retest planned before departure.",
              },
            });

            await prisma.virCorrectiveAction.create({
              data: {
                findingId: finding.id,
                actionText: "Renew gasket, repeat line pressure test, and upload photographic evidence.",
                ownerName: "Chief Engineer",
                targetDate: new Date("2026-04-29"),
                status: "IN_PROGRESS",
              },
            });
          }

          const observation = await prisma.virFinding.findFirst({
            where: { inspectionId: inspection.id, title: "BNWAS reset timing requires verification" },
          });

          if (!observation) {
            await prisma.virFinding.create({
              data: {
                inspectionId: inspection.id,
                questionId: questionMap.get("NAV-003")?.id,
                findingType: "OBSERVATION",
                severity: "MEDIUM",
                status: "OPEN",
                title: "BNWAS reset timing requires verification",
                description: "Bridge team requested verification of BNWAS settings after recent software adjustment.",
                ownerName: "Chief Officer",
                dueDate: new Date("2026-05-15"),
              },
            });
          }

          const existingSignOff = await prisma.virSignOff.findFirst({
            where: { inspectionId: inspection.id, stage: "VESSEL_SUBMISSION" },
          });

          if (!existingSignOff) {
            await prisma.virSignOff.create({
              data: {
                inspectionId: inspection.id,
                stage: "VESSEL_SUBMISSION",
                approved: true,
                actorName: "Capt. Lee Arjun",
                actorRole: "Master",
                comment: "Inspection package submitted to shore for review.",
              },
            });
          }
        }

        await syncInspectionCounters(inspection.id);
      }

      const reviewSession = await prisma.virImportSession.findFirst({
        where: { sourceFileName: "PSC_Sample_Imported_Checklist.pdf" },
      });

      if (!reviewSession) {
        const session = await prisma.virImportSession.create({
          data: {
            vesselId: vessels[0].id,
            inspectionTypeId: inspectionType.id,
            sourceFileName: "PSC_Sample_Imported_Checklist.pdf",
            sourceSystem: "PDF Import Review",
            sourceType: "PDF",
            status: "REVIEW",
            confidenceAvg: 0.84,
            rawTextHash: "demo-psc-import-session",
            extractedAt: new Date(),
            payload: normalized,
            createdBy: "Seed Engine",
          },
        });

        await prisma.virImportFieldReview.createMany({
          data: [
            {
              importSessionId: session.id,
              entityType: "VirTemplate",
              fieldPath: "templateName",
              aiValue: normalized.templateName,
              finalValue: normalized.templateName,
              confidence: 0.96,
              accepted: true,
              reviewerName: "Seed Engine",
              reviewedAt: new Date(),
            },
            {
              importSessionId: session.id,
              entityType: "VirTemplateQuestion",
              fieldPath: "sections[1].questions[0].prompt",
              aiValue: "Fire pump pressure and hydrant test status",
              finalValue: "Fire pump pressure and hydrant test status",
              confidence: 0.88,
              accepted: true,
              reviewerName: "Seed Engine",
              reviewedAt: new Date(),
            },
          ],
        });
      }

      const committedSession = await prisma.virImportSession.findFirst({
        where: { sourceFileName: "PSC_Self_Assessment_Starter.json" },
      });

      if (!committedSession) {
        await prisma.virImportSession.create({
          data: {
            inspectionTypeId: inspectionType.id,
            sourceFileName: "PSC_Self_Assessment_Starter.json",
            sourceSystem: "Template JSON Console",
            sourceType: "JSON_TEMPLATE",
            status: "COMMITTED",
            confidenceAvg: 1,
            extractedAt: new Date(),
            payload: normalized,
            createdBy: "Seed Engine",
          },
        });
      }

      results.push("Created live demo inspections, answers, findings, corrective actions, sign-offs, and import sessions.");
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
