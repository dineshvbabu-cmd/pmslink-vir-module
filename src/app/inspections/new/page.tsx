import { createInspectionAction } from "@/app/actions";
import { InspectionLaunchForm } from "@/components/inspection-launch-form";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

export default async function NewInspectionPage({
  searchParams,
}: {
  searchParams?: Promise<{ vesselId?: string }>;
}) {
  const session = await requireVirSession();
  const params = searchParams ? await searchParams : undefined;
  const requestedVesselId = typeof params?.vesselId === "string" ? params.vesselId : undefined;

  const [vessels, inspectionTypes, templates] = await Promise.all([
    isOfficeSession(session)
      ? prisma.vessel.findMany({ where: { isActive: true }, orderBy: { name: "asc" } })
      : prisma.vessel.findMany({ where: { id: session.vesselId ?? "" }, orderBy: { name: "asc" } }),
    prisma.virInspectionType.findMany({ where: { isActive: true }, orderBy: [{ category: "asc" }, { name: "asc" }] }),
    prisma.virTemplate.findMany({
      where: { isActive: true },
      include: {
        inspectionType: { select: { name: true } },
        sections: {
          include: {
            questions: {
              select: {
                id: true,
                isCicCandidate: true,
              },
            },
          },
        },
      },
      orderBy: [{ createdAt: "desc" }],
    }),
  ]);

  return (
    <div className="page-stack">
      <section className="panel panel-elevated">
        <div className="section-header">
          <div>
            <div className="eyebrow">{isOfficeSession(session) ? "Office launch" : "Vessel launch"}</div>
            <h2 className="panel-title">Create new VIR</h2>
            <p className="panel-subtitle">
              {isOfficeSession(session)
                ? "Schedule or launch a VIR for any active vessel and attach the right questionnaire."
                : "Start a new inspection for your logged-in vessel workspace."}
            </p>
          </div>
        </div>

        <InspectionLaunchForm
          action={createInspectionAction}
          defaultVesselId={isOfficeSession(session) ? requestedVesselId : session.vesselId ?? undefined}
          inspectionTypes={inspectionTypes.map((type) => ({
            id: type.id,
            name: type.name,
            category: type.category,
          }))}
          isOffice={isOfficeSession(session)}
          sessionActorName={session.actorName}
          templates={templates.map((template) => ({
            id: template.id,
            name: template.name,
            version: template.version,
            inspectionTypeId: template.inspectionTypeId,
            inspectionTypeName: template.inspectionType.name,
            focusCount: template.sections.reduce(
              (sum, section) => sum + section.questions.filter((question) => question.isCicCandidate).length,
              0
            ),
            questionCount: template.sections.reduce((sum, section) => sum + section.questions.length, 0),
          }))}
          vessels={vessels.map((vessel) => ({
            id: vessel.id,
            name: vessel.name,
          }))}
        />
      </section>
    </div>
  );
}
