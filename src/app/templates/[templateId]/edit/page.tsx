import { notFound, redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { isOfficeSession, requireVirSession } from "@/lib/vir/session";

export const dynamic = "force-dynamic";

export default async function TemplateEditRedirectPage({
  params,
  searchParams,
}: {
  params: Promise<{ templateId: string }>;
  searchParams: Promise<{ section?: string }>;
}) {
  const session = await requireVirSession();

  if (!isOfficeSession(session)) {
    redirect("/");
  }

  const { templateId } = await params;
  const { section } = await searchParams;

  const template = await prisma.virTemplate.findUnique({
    where: { id: templateId },
    select: {
      id: true,
      inspectionType: { select: { name: true } },
      sections: {
        orderBy: { sortOrder: "asc" },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!template) {
    notFound();
  }

  const firstSectionId = section ?? template.sections[0]?.id;
  const params2 = new URLSearchParams({
    type: template.inspectionType.name,
    template: template.id,
    ...(firstSectionId ? { section: firstSectionId } : {}),
  });

  redirect(`/templates?${params2.toString()}`);
}
