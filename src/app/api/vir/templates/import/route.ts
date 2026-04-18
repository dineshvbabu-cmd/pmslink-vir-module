import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeVirTemplateEngineInput } from "@/lib/vir/import";
import { isOfficeSession, parseVirSession, VIR_SESSION_COOKIE } from "@/lib/vir/session";

export async function POST(request: NextRequest) {
  try {
    const session = parseVirSession(request.cookies.get(VIR_SESSION_COOKIE)?.value);

    if (!isOfficeSession(session)) {
      return NextResponse.json({ error: "Office workspace required." }, { status: 403 });
    }

    const { request: importRequest, normalized, summary, warnings, fieldReviews } = normalizeVirTemplateEngineInput(
      await request.json()
    );
    const commit = request.nextUrl.searchParams.get("commit") === "true";
    const rawTextHash = createHash("sha256").update(importRequest.content).digest("hex");

    if (!commit) {
      const reviewSession = await prisma.virImportSession.create({
        data: {
          sourceFileName: `${normalized.templateName}.${importRequest.inputFormat.toLowerCase()}`,
          sourceSystem: `${importRequest.sourceStandard} template import`,
          sourceType: importRequest.inputFormat,
          status: "REVIEW",
          payload: {
            request: importRequest,
            normalized,
            summary,
            warnings,
          },
          rawTextHash,
          confidenceAvg: 0.89,
          extractedAt: new Date(),
          createdBy: session.actorName,
        },
        select: { id: true },
      });

      if (fieldReviews.length > 0) {
        await prisma.virImportFieldReview.createMany({
          data: fieldReviews.map((review) => ({
            importSessionId: reviewSession.id,
            entityType: review.entityType,
            fieldPath: review.fieldPath,
            aiValue: review.aiValue,
            finalValue: review.finalValue,
            confidence: review.confidence,
            accepted: review.accepted,
            reviewerName: session.actorName,
            reviewedAt: new Date(),
          })),
        });
      }

      return NextResponse.json({
        ok: true,
        mode: "dry-run",
        summary,
        warnings,
        template: normalized,
        sessionId: reviewSession.id,
        fieldReviews,
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

    const importSession = await prisma.virImportSession.create({
      data: {
        inspectionTypeId: inspectionType.id,
        sourceFileName: `${normalized.templateName}.${importRequest.inputFormat.toLowerCase()}`,
        sourceSystem: `${importRequest.sourceStandard} template import`,
        sourceType: importRequest.inputFormat,
        status: "COMMITTED",
        payload: {
          request: importRequest,
          normalized,
          summary,
          warnings,
        },
        rawTextHash,
        confidenceAvg: 0.93,
        extractedAt: new Date(),
        createdBy: session.actorName,
      },
      select: { id: true },
    });

    if (fieldReviews.length > 0) {
      await prisma.virImportFieldReview.createMany({
        data: fieldReviews.map((review) => ({
          importSessionId: importSession.id,
          entityType: review.entityType,
          fieldPath: review.fieldPath,
          aiValue: review.aiValue,
          finalValue: review.finalValue,
          confidence: review.confidence,
          accepted: review.accepted,
          reviewerName: session.actorName,
          reviewedAt: new Date(),
        })),
      });
    }

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
      sessionId: importSession.id,
      fieldReviews,
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
