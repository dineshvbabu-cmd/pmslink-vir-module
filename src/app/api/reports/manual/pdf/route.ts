import { NextRequest, NextResponse } from "next/server";
import { buildBrandedPdfDocument } from "@/lib/vir/pdf";
import { getVirSession } from "@/lib/vir/session";

const manuals = {
  web: {
    title: "VIR Web Application User Manual",
    subtitle: "Office and browser-based workflow guide",
    sections: [
      {
        title: "Chapter 1. Introduction",
        lines: [
          "This guide applies to the PMSLink VIR web application used for office review, vessel reporting, inspection workflow, and export pack generation.",
          "The browser application supports dashboard review, approved inspections, inspection history, VIR calendar, instruction, analytics boards, review queue, inspection register, template review, and report drill-down.",
        ],
      },
      {
        title: "Chapter 2. Browser and login",
        lines: [
          "Open the browser, launch the VIR web URL, and login to the office or vessel workspace.",
          "Office users land in the control tower dashboard. Vessel users land in the vessel dashboard with only their assigned scope visible.",
        ],
      },
      {
        title: "Chapter 3. Dashboard and vessel details",
        lines: [
          "Dashboard includes total vessels, completed inspection, pending task, not synced, inspection status, report status, inspection compliance, sailing compliance, chapter-wise findings, and vessel-type inspection trends.",
          "The vessel detail lane provides vessel particulars, last VIR data, inspection history, and quick report drill-down.",
        ],
      },
      {
        title: "Chapter 4. Inspection workflow",
        lines: [
          "Create inspection, select vessel, inspection type, linked checklist template, date, port, inspector, and reference number.",
          "Open the workflow page to complete questionnaire sections, upload actual images, compare reference images, raise findings, assign corrective actions, and progress through sign-off.",
        ],
      },
      {
        title: "Chapter 5. Report workflow",
        lines: [
          "Detailed Report: section-wise questionnaire detail with selected image annex.",
          "Summary Report: section-level summary for management review and outcome visibility.",
          "Finding Report: findings, corrective actions, severity, and image evidence only.",
          "Consolidate Report: combined vessel details, executive summary, chapter-wise findings, sign-off register, and photo annex.",
        ],
      },
      {
        title: "Chapter 6. Support",
        lines: [
          "Use the Instruction page for role guidance, sync discipline, export drill-down, and approval checks.",
          "Use dashboard and analytics export actions to generate PDF packs filtered by the selected vessel, fleet, and timeline range.",
        ],
      },
    ],
  },
  offline: {
    title: "VIR Offline Application User Manual",
    subtitle: "Tablet, vessel, and sync workflow guide",
    sections: [
      {
        title: "Chapter 1. Introduction",
        lines: [
          "The offline application supports vessel-side inspection execution when connectivity is limited.",
          "Queued questionnaire updates, findings, and evidence must sync back to the same shared VIR inspection once connectivity is restored.",
        ],
      },
      {
        title: "Chapter 2. Mobile / Windows offline application",
        lines: [
          "Download and install the mobile or Windows offline application, then login to the assigned vessel workspace.",
          "Open the inspection from My VIR Queue, Inspection history, or dashboard and continue the same workflow offline.",
        ],
      },
      {
        title: "Chapter 3. Checklist, sync, and evidence handling",
        lines: [
          "Reference images remain guidance-only and do not replace actual vessel evidence.",
          "Evidence should be grouped by questionnaire item or finding so office review, reports, and PDF exports remain aligned.",
          "The offline workflow supports multi-selection of images, grouped uploads, and sync-safe handling of returned inspections.",
        ],
      },
      {
        title: "Chapter 4. Salient offline features",
        lines: [
          "Switch between online and offline VIR.",
          "Multi-selection of images for question headers and findings.",
          "Drag-and-drop support for grouped evidence handling.",
          "Checklist header image grouping to simplify large inspection walkthroughs.",
        ],
      },
      {
        title: "Chapter 5. Support",
        lines: [
          "Once connected, sync the vessel inspection back to the shared office record and confirm status and evidence consistency from the web workflow.",
          "Use the Instruction page and offline manual PDF from the demo site for crew walkthrough and onboarding.",
        ],
      },
    ],
  },
} as const;

export async function GET(request: NextRequest) {
  const session = await getVirSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  const kind = request.nextUrl.searchParams.get("kind") === "offline" ? "offline" : "web";
  const manual = manuals[kind];

  const pdf = buildBrandedPdfDocument({
    brand: "Atlantas Marine / PMSLink VIR",
    title: manual.title,
    subtitleLines: [manual.subtitle, "Prepared for demo workflow guidance and onboard / shore user support."],
    sections: manual.sections.map((section) => ({
      title: section.title,
      lines: [...section.lines],
    })),
  });

  return new NextResponse(pdf, {
    headers: {
      "Content-Disposition": `attachment; filename="vir-${kind}-manual.pdf"`,
      "Content-Type": "application/pdf",
    },
  });
}
