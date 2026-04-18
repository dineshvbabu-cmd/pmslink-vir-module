import { NextResponse } from "next/server";
import { buildSimplePdfDocument } from "@/lib/vir/pdf";
import { prisma } from "@/lib/prisma";
import { canAccessVessel, getVirSession } from "@/lib/vir/session";

export async function GET(_: Request, context: { params: Promise<{ inspectionId: string }> }) {
  const session = await getVirSession();
  const { inspectionId } = await context.params;

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
    },
  });

  if (!inspection || !canAccessVessel(session, inspection.vesselId)) {
    return NextResponse.json({ error: "Inspection was not found." }, { status: 404 });
  }

  const lines = [
    `Inspection: ${inspection.title}`,
    `Vessel: ${inspection.vessel.name}`,
    `Type: ${inspection.inspectionType.name}`,
    `Date: ${inspection.inspectionDate.toISOString().slice(0, 10)}`,
    `Status: ${inspection.status}`,
    `Port / Country: ${inspection.port ?? "-"} / ${inspection.country ?? "-"}`,
    `Inspector: ${inspection.inspectorName ?? "-"}`,
    `Company: ${inspection.inspectorCompany ?? "-"}`,
    "",
    "Summary",
    inspection.summary ?? "No summary recorded.",
    "",
    "Findings",
    ...(inspection.findings.length > 0
      ? inspection.findings.flatMap((finding, index) => [
          `${index + 1}. ${finding.title} / ${finding.findingType} / ${finding.severity} / ${finding.status}`,
          finding.description,
          ...finding.correctiveActions.map(
            (action, actionIndex) =>
              `   ${index + 1}.${actionIndex + 1} CAR: ${action.actionText} / ${action.status} / target ${action.targetDate ? action.targetDate.toISOString().slice(0, 10) : "-"}`
          ),
          "",
        ])
      : ["No findings recorded.", ""]),
    "Sign-offs",
    ...(inspection.signOffs.length > 0
      ? inspection.signOffs.map(
          (signOff) =>
            `${signOff.stage} / ${signOff.approved ? "approved" : "returned"} / ${signOff.actorName ?? "Unknown"} / ${signOff.signedAt.toISOString().slice(0, 10)}`
        )
      : ["No sign-offs recorded."]),
  ];

  const pdf = buildSimplePdfDocument(`Inspection Report - ${inspection.title}`, lines);

  return new NextResponse(pdf, {
    headers: {
      "Content-Disposition": `attachment; filename="inspection-${inspection.id}.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
