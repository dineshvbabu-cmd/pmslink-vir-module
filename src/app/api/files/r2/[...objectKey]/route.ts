import { NextResponse } from "next/server";
import { getR2Object } from "@/lib/r2";
import { canAccessVessel, getVirSession, isOfficeSession } from "@/lib/vir/session";
import { prisma } from "@/lib/prisma";

export async function GET(_: Request, context: { params: Promise<{ objectKey: string[] }> }) {
  const session = await getVirSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const { objectKey } = await context.params;
  const storageKey = objectKey.join("/");

  if (storageKey.startsWith("evidence/")) {
    const [, inspectionId] = storageKey.split("/");

    const inspection = inspectionId
      ? await prisma.virInspection.findUnique({
          where: { id: inspectionId },
          select: { vesselId: true },
        })
      : null;

    if (!inspection || !canAccessVessel(session, inspection.vesselId)) {
      return NextResponse.json({ error: "Evidence file is not available in this workspace." }, { status: 403 });
    }
  } else if (storageKey.startsWith("imports/")) {
    if (!isOfficeSession(session)) {
      return NextResponse.json({ error: "Office workspace required for imported files." }, { status: 403 });
    }
  } else if (!isOfficeSession(session)) {
    return NextResponse.json({ error: "Office workspace required." }, { status: 403 });
  }

  const object = await getR2Object(storageKey);

  if (!object) {
    return NextResponse.json({ error: "Stored object was not found." }, { status: 404 });
  }

  return new NextResponse(Buffer.from(object.body), {
    headers: {
      "Cache-Control": object.cacheControl,
      "Content-Length": String(object.contentLength),
      "Content-Type": object.contentType,
      "Content-Disposition": `inline; filename="${object.fileName}"`,
    },
  });
}
