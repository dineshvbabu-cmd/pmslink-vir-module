import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeVirTemplateImport } from "@/lib/vir/import";
import { isOfficeSession, parseVirSession, VIR_SESSION_COOKIE } from "@/lib/vir/session";

export async function POST(request: NextRequest) {
  try {
    const session = parseVirSession(request.cookies.get(VIR_SESSION_COOKIE)?.value);

    if (!isOfficeSession(session)) {
      return NextResponse.json({ error: "Office workspace required." }, { status: 403 });
    }

    const { normalized, summary, warnings } = normalizeVirTemplateImport(await request.json());
    const commit = request.nextUrl.searchParams.get("commit") === "true";

    if (!commit) {
      return NextResponse.json({
        ok: true,
        mode: "dry-run",
        summary,
        warnings,
        template: normalized,
      });
    }

    const inspectionType = await prisma.virInspectionType.upsert({
      where: { code: normalized.inspectionTypeCode },
      update: {
        name: normalized.inspectionTypeName,
        category: normalized.inspectionCategory,
      },
      create: {
        code: normalized.inspectionTypeCode,
        name: normalized.inspectionTypeName,
        category: normalized.inspectionCategory,
      },
    });

    const existingTemplate = await prisma.virTemplate.findFirst({
      where: {
        inspectionTypeId: inspectionType.id,
        version: normalized.version,
      },
      select: { id: true },
    });

    if (existingTemplate) {
      return NextResponse.json(
        {
          error: "A VIR template with this inspection type and version already exists.",
          existingTemplateId: existingTemplate.id,
        },
        { status: 409 }
      );
    }

    const template = await prisma.virTemplate.create({
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
      select: {
        id: true,
        name: true,
        version: true,
      },
    });

    return NextResponse.json({
      ok: true,
      mode: "commit",
      summary,
      warnings,
      inspectionType: {
        id: inspectionType.id,
        code: inspectionType.code,
        name: inspectionType.name,
      },
      template,
    });
  } catch (error) {
    console.error("[vir/templates/import]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to import VIR template.",
      },
      { status: 400 }
    );
  }
}
