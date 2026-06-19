import { promises as fs } from "node:fs";
import path from "node:path";
import { NextRequest, NextResponse } from "next/server";

function getAllowedHosts() {
  return new Set(
    (process.env.VIR_ASSET_ALLOWED_HOSTS ?? "")
      .split(",")
      .map((value) => value.trim().toLowerCase())
      .filter(Boolean)
  );
}

export async function GET(request: NextRequest) {
  const rawUrl = request.nextUrl.searchParams.get("url")?.trim();

  if (!rawUrl) {
    return NextResponse.json({ ok: false, error: "Missing asset URL" }, { status: 400 });
  }

  let target: URL;
  try {
    target = new URL(rawUrl);
  } catch {
    return NextResponse.json({ ok: false, error: "Invalid asset URL" }, { status: 400 });
  }

  const allowedHosts = getAllowedHosts();

  if (allowedHosts.size > 0 && !allowedHosts.has(target.hostname.toLowerCase())) {
    return NextResponse.json({ ok: false, error: "Asset host not allowed" }, { status: 403 });
  }

  const liveAuth = await resolveLiveAssetAuth(target.hostname);

  const assetOrigin = `${target.protocol}//${target.host}`;
  const upstream = await fetch(target.toString(), {
    headers: {
      Accept: "image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8",
      ...(liveAuth.cookieHeader ? { Cookie: liveAuth.cookieHeader } : {}),
      ...(liveAuth.bearerToken ? { Authorization: `Bearer ${liveAuth.bearerToken}` } : {}),
      Referer: `${assetOrigin}/`,
      Origin: assetOrigin,
      "User-Agent": "PMSLink-VIR-Module/1.0",
    },
    cache: "no-store",
    redirect: "follow",
  });

  if (!upstream.ok) {
    return NextResponse.json(
      { ok: false, error: `Upstream asset request failed with ${upstream.status}` },
      { status: upstream.status }
    );
  }

  const contentType = upstream.headers.get("content-type") ?? "application/octet-stream";

  // Some protected endpoints return an HTML login page instead of the image.
  if (contentType.includes("text/html")) {
    return NextResponse.json(
      {
        ok: false,
        error: "Protected asset returned HTML instead of the requested image",
      },
      { status: 424 }
    );
  }

  const fileName =
    decodeURIComponent(target.pathname.split("/").filter(Boolean).at(-1) ?? "inspection-asset");

  return new NextResponse(upstream.body, {
    headers: {
      "Cache-Control": "public, max-age=3600, stale-while-revalidate=86400",
      "Content-Disposition": `inline; filename="${fileName.replace(/"/g, "")}"`,
      "Content-Type": contentType,
    },
  });
}

async function resolveLiveAssetAuth(hostname: string) {
  const secondaryHost = (process.env.VIR_SECONDARY_ASSET_HOST ?? "").trim().toLowerCase();
  const isSecondaryHost = secondaryHost.length > 0 && hostname.toLowerCase() === secondaryHost;
  const cookieHeader =
    isSecondaryHost
      ? process.env.LIVE_IA_COOKIE ?? process.env.LIVE_ASSET_COOKIE ?? process.env.LIVE_VIR_COOKIE ?? ""
      : process.env.LIVE_VIR_COOKIE ?? process.env.LIVE_ASSET_COOKIE ?? process.env.LIVE_IA_COOKIE ?? "";

  const explicitToken =
    isSecondaryHost
      ? process.env.LIVE_IA_TOKEN ?? process.env.LIVE_VIR_TOKEN ?? ""
      : process.env.LIVE_VIR_TOKEN ?? process.env.LIVE_IA_TOKEN ?? "";

  if (cookieHeader || explicitToken) {
    return {
      cookieHeader,
      bearerToken: explicitToken,
    };
  }

  const fallbackToken = await readCapturedToken();
  return {
    cookieHeader,
    bearerToken: fallbackToken,
  };
}

async function readCapturedToken() {
  try {
    const loginCapturePath = path.join(process.cwd(), "tmp-live", "live-login.json");
    const contents = await fs.readFile(loginCapturePath, "utf8");
    const parsed = JSON.parse(contents) as { token?: string | null };
    return typeof parsed.token === "string" ? parsed.token : "";
  } catch {
    return "";
  }
}
