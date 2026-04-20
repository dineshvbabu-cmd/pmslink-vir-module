import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { normalizeReportImportInput } from "@/lib/vir/report-import";
import { isOfficeSession, parseVirSession, VIR_SESSION_COOKIE } from "@/lib/vir/session";

export async function POST(request: NextRequest) {
  try {
    const session = parseVirSession(request.cookies.get(VIR_SESSION_COOKIE)?.value);

    if (!isOfficeSession(session)) {
      return NextResponse.json({ error: "Office workspace required." }, { status: 403 });
    }

    const parsed = await normalizeReportImportInput(await request.json());

    const inspectionType = await prisma.virInspectionType.upsert({
      where: { code: parsed.inspectionType.code },
      update: {
        name: parsed.inspectionType.name,
        category: parsed.inspectionType.category,
      },
      create: {
        code: parsed.inspectionType.code,
        name: parsed.inspectionType.name,
        category: parsed.inspectionType.category,
      },
    });

    const importSession = await prisma.virImportSession.create({
      data: {
        inspectionTypeId: inspectionType.id,
        sourceFileName: parsed.request.fileName,
        sourceUrl: parsed.request.sourceUrl ?? null,
        sourceSystem: parsed.summary.sourceSystem,
        sourceType: "DOCUMENT_UPLOAD",
        status: "REVIEW",
        extractedAt: new Date(),
        confidenceAvg:
          parsed.fieldReviews.reduce((sum, field) => sum + field.confidence, 0) / Math.max(parsed.fieldReviews.length, 1),
        rawTextHash: parsed.rawTextHash,
        payload: {
          request: parsed.request,
          extractedText: parsed.extractedText.normalizedText.slice(0, 10000),
          summary: parsed.summary,
          vesselName: parsed.vesselName,
          reportDate: parsed.reportDate,
          externalReference: parsed.externalReference,
          findings: parsed.findings,
          reviewNotes: parsed.reviewNotes,
        },
        createdBy: session.actorName,
      },
      select: {
        id: true,
      },
    });

    if (parsed.fieldReviews.length > 0) {
      await prisma.virImportFieldReview.createMany({
        data: parsed.fieldReviews.map((field) => ({
          importSessionId: importSession.id,
          entityType: field.entityType,
          fieldPath: field.fieldPath,
          aiValue: field.aiValue,
          finalValue: field.finalValue,
          confidence: field.confidence,
          accepted: field.accepted,
          reviewerName: session.actorName,
          reviewedAt: new Date(),
        })),
      });
    }

    return NextResponse.json({
      ok: true,
      sessionId: importSession.id,
      inspectionType: parsed.inspectionType,
      vesselName: parsed.vesselName,
      reportDate: parsed.reportDate,
      externalReference: parsed.externalReference,
      findings: parsed.findings,
      reviewNotes: parsed.reviewNotes,
      summary: parsed.summary,
      fieldReviews: parsed.fieldReviews,
    });
  } catch (error) {
    console.error("[vir/reports/import]", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to import external report.",
      },
      { status: 400 }
    );
  }
}
