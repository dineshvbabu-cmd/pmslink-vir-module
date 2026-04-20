import { NextRequest, NextResponse } from "next/server";
import { buildBrandedPdfDocument } from "@/lib/vir/pdf";
import { prisma } from "@/lib/prisma";
import { canAccessVessel, getVirSession } from "@/lib/vir/session";

export async function GET(request: NextRequest, context: { params: Promise<{ inspectionId: string }> }) {
  const session = await getVirSession();
  const { inspectionId } = await context.params;
  const variant = request.nextUrl.searchParams.get("variant") ?? "detailed";

  if (!session) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const inspection = await prisma.virInspection.findUnique({
    where: { id: inspectionId },
    include: {
      vessel: true,
      inspectionType: true,
      findings: {
        include: {
          correctiveActions: true,
        },
        orderBy: [{ severity: "desc" }, { createdAt: "asc" }],
      },
      signOffs: {
        orderBy: { signedAt: "asc" },
      },
      photos: {
        orderBy: { createdAt: "asc" },
      },
    },
  });

  if (!inspection || !canAccessVessel(session, inspection.vesselId)) {
    return NextResponse.json({ error: "Inspection was not found." }, { status: 404 });
  }

  const pdf = buildBrandedPdfDocument({
    brand: "Atlantas Marine / PMSLink QHSE",
    title: `${variantLabel(variant)} - ${inspection.title}`,
    subtitleLines: [
      `${inspection.vessel.name} / ${inspection.inspectionType.name}`,
      `${inspection.inspectionDate.toISOString().slice(0, 10)} / ${inspection.port ?? "Port not recorded"} / ${inspection.country ?? "Country not recorded"}`,
    ],
    sections: [
      {
        title: "Inspection particulars",
        lines: [
          `Inspection status: ${inspection.status}`,
          `External reference: ${inspection.externalReference ?? "Not recorded"}`,
          `Inspector: ${inspection.inspectorName ?? "Not recorded"}`,
          `Inspecting company: ${inspection.inspectorCompany ?? "Not recorded"}`,
          `Port / Country: ${inspection.port ?? "-"} / ${inspection.country ?? "-"}`,
        ],
      },
      {
        title: "Executive summary",
        lines: [inspection.summary ?? "No summary recorded for this inspection."],
      },
      {
        title: "Condition assessment and findings",
        lines:
          inspection.findings.length > 0
            ? inspection.findings.flatMap((finding, index) => [
                `${index + 1}. ${finding.title}`,
                `Classification: ${finding.findingType} / severity ${finding.severity} / status ${finding.status}`,
                finding.description,
                ...finding.correctiveActions.map(
                  (action, actionIndex) =>
                    `CAR ${index + 1}.${actionIndex + 1}: ${action.actionText} / ${action.status} / target ${action.targetDate ? action.targetDate.toISOString().slice(0, 10) : "Not set"}`
                ),
                " ",
              ])
            : ["No findings recorded."],
      },
      {
        title: "Workflow sign-off register",
        lines:
          inspection.signOffs.length > 0
            ? inspection.signOffs.map(
                (signOff) =>
                  `${signOff.stage.replaceAll("_", " ")} / ${signOff.approved ? "approved" : "returned"} / ${signOff.actorName ?? "Unknown"} / ${signOff.signedAt.toISOString().slice(0, 10)}`
              )
            : ["No sign-offs recorded."],
      },
      {
        title: "Photo annex",
        lines:
          inspection.photos.length > 0
            ? inspection.photos.map(
                (photo, index) =>
                  `Photo ${index + 1}: ${photo.caption ?? photo.fileName ?? "Inspection evidence"} / uploaded by ${photo.uploadedBy ?? "Unknown"} / ${photo.url}`
              )
            : ["No photo evidence was attached to this inspection."],
      },
    ],
  });

  return new NextResponse(pdf, {
    headers: {
      "Content-Disposition": `attachment; filename="inspection-${variant}-${inspection.id}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}

function variantLabel(variant: string) {
  switch (variant) {
    case "summary":
      return "Summary Report";
    case "findings":
      return "Finding Report";
    case "consolidate":
      return "Consolidate Report";
    default:
      return "Detailed Report";
  }
}
