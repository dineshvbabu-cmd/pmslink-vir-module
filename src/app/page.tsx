import { prisma } from "@/lib/prisma";
import { summarizeVirTemplate } from "@/lib/vir/import";
import { VIR_IMPLEMENTATION_PHASES, VIR_INSPECTION_TYPES, VIR_SAMPLE_TEMPLATE_PAYLOAD, VIR_SPEC_COUNTS } from "@/lib/vir/catalog";
import {
  virArchitectureRequirements,
  virBackendTechnologyTable,
  virCoreDataModelRequirements,
  virDashboardRequirements,
  virDemoRequirements,
  virDesignPrinciples,
  virFindingWorkflowRequirements,
  virFrontendTechnologyTable,
  virImportRequirements,
  virMobileRequirements,
  virPdfRequirements,
  virPhotoRequirements,
  virQuestionnaireRequirements,
  virSignOffRequirements,
  virSprintSummary,
} from "@/lib/vir/spec";
import { ClipboardCheck, Database, FileText, Layers3, Rocket, ScanSearch, ShieldCheck, TabletSmartphone, Waypoints } from "lucide-react";

const sampleSummary = summarizeVirTemplate(VIR_SAMPLE_TEMPLATE_PAYLOAD);

const categoryLabels: Record<string, string> = {
  VETTING: "Vetting",
  PSC: "PSC / Regulatory",
  CLASS: "Class / Survey",
  INTERNAL: "Internal",
  AUDIT: "Audit / ISO",
};

export default async function HomePage() {
  const [inspectionTypeCount, templateCount, vesselCount, inspectionCount] = await Promise.all([
    prisma.virInspectionType.count().catch(() => 0),
    prisma.virTemplate.count().catch(() => 0),
    prisma.vessel.count().catch(() => 0),
    prisma.virInspection.count().catch(() => 0),
  ]);

  const categoryCards = Object.entries(
    VIR_INSPECTION_TYPES.reduce<Record<string, number>>((acc, item) => {
      acc[item.category] = (acc[item.category] ?? 0) + 1;
      return acc;
    }, {})
  );

  return (
    <main className="min-h-screen">
      <div className="max-w-7xl mx-auto px-4 py-6 sm:px-6 lg:px-8">
        <section className="panel overflow-hidden">
          <div className="bg-navy text-white px-6 py-8 sm:px-8">
            <div className="section-chip bg-white/10 text-white/80 border border-white/10">Standalone Product</div>
            <div className="mt-4 flex flex-wrap items-start justify-between gap-6">
              <div className="max-w-4xl">
                <h1 className="text-4xl sm:text-5xl font-black tracking-tight">VIR Module</h1>
                <p className="mt-3 text-base sm:text-lg text-white/78 leading-7">
                  Dedicated Vessel Inspection Report platform for questionnaire-driven inspections, findings management,
                  dual sign-off, AI-assisted PDF import, mobile workflow, and fleet dashboarding.
                </p>
                <p className="mt-4 text-sm text-white/65 leading-6">
                  This standalone app is intentionally branded and structured as a separate product so your GitHub
                  repository, Railway service, and management review materials can all use the VIR identity instead of
                  inheriting the SeaLearn name.
                </p>
              </div>
              <div className="grid gap-3 min-w-64">
                <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-white/55">Spec Source</div>
                  <a
                    href="/PMSLink_VIR_Module_Spec_v1.html"
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block text-sm font-semibold underline underline-offset-4"
                  >
                    PMSLink VIR Module Specification v1.0
                  </a>
                </div>
                <div className="rounded-2xl border border-white/12 bg-white/8 px-4 py-3">
                  <div className="text-[11px] uppercase tracking-[0.25em] text-white/55">Repo Identity</div>
                  <div className="mt-2 text-sm font-semibold">pmslink-vir-module</div>
                </div>
              </div>
            </div>
          </div>

          <div className="grid md:grid-cols-4 gap-4 p-6 bg-sand/70">
            {[
              { label: "Spec inspection types", value: VIR_SPEC_COUNTS.extractedInspectionTypes, icon: Layers3, color: "text-cyan bg-cyan/10" },
              { label: "Seeded inspection types", value: inspectionTypeCount, icon: Database, color: "text-teal bg-teal/10" },
              { label: "Templates loaded", value: templateCount, icon: ClipboardCheck, color: "text-success bg-success/10" },
              { label: "VIR records", value: inspectionCount, icon: FileText, color: "text-amber bg-amber/10" },
            ].map((item) => (
              <div key={item.label} className="rounded-2xl border border-border bg-white px-4 py-4">
                <div className={`w-11 h-11 rounded-2xl flex items-center justify-center ${item.color}`}>
                  <item.icon size={18} />
                </div>
                <div className="mt-4 text-3xl font-black text-navy">{item.value}</div>
                <div className="mt-1 text-sm text-slate-500">{item.label}</div>
              </div>
            ))}
          </div>
        </section>

        <section className="grid xl:grid-cols-[1.1fr_0.9fr] gap-6 mt-6">
          <div className="panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <ShieldCheck size={18} className="text-teal" />
              <h2 className="text-xl font-bold text-navy">Scope and Design Principles</h2>
            </div>
            <div className="space-y-3 text-sm leading-7 text-slate-700">
              {virDesignPrinciples.map((item) => (
                <p key={item}>{item}</p>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-amber/30 bg-amber/10 px-4 py-4 text-sm leading-7 text-slate-700">
              The source HTML says there are <strong>{VIR_SPEC_COUNTS.claimedInspectionTypes}</strong> inspection types,
              but the extracted list contains <strong>{VIR_SPEC_COUNTS.extractedInspectionTypes}</strong>. This discrepancy
              is preserved here for management review so the final catalogue can be confirmed before sign-off.
            </div>
          </div>

          <div className="panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <Database size={18} className="text-cyan" />
              <h2 className="text-xl font-bold text-navy">Inspection Catalogue</h2>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {categoryCards.map(([category, count]) => (
                <div key={category} className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">{categoryLabels[category] ?? category}</div>
                  <div className="mt-1 text-2xl font-black text-navy">{count}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm text-slate-600">
              Demo vessel records loaded: <strong className="text-navy">{vesselCount}</strong>
            </div>
          </div>
        </section>

        <section className="panel p-6 mt-6">
          <div className="flex items-center gap-3 mb-5">
            <Rocket size={18} className="text-success" />
            <h2 className="text-xl font-bold text-navy">Delivery Phases</h2>
          </div>
          <div className="grid lg:grid-cols-4 gap-4">
            {VIR_IMPLEMENTATION_PHASES.map((phase) => (
              <div key={phase.phase} className="rounded-2xl border border-border bg-slate-50 px-4 py-4">
                <div className="text-[11px] uppercase tracking-[0.2em] text-cyan font-bold">{phase.phase}</div>
                <div className="mt-2 text-lg font-bold text-navy">{phase.title}</div>
                <p className="mt-2 text-sm text-slate-600 leading-6">{phase.outcome}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="grid lg:grid-cols-2 gap-6 mt-6">
          <RequirementPanel
            title="Technical Architecture"
            icon={<Waypoints size={18} className="text-cyan" />}
            items={virArchitectureRequirements.map((item) => `${item.area}: ${item.stack}. ${item.note}`)}
          />
          <RequirementPanel
            title="Frontend and Backend Technologies"
            icon={<Waypoints size={18} className="text-cyan" />}
            items={[...virFrontendTechnologyTable, ...virBackendTechnologyTable]}
          />
          <RequirementPanel
            title="Core Data Model"
            icon={<Database size={18} className="text-teal" />}
            items={virCoreDataModelRequirements}
          />
          <RequirementPanel
            title="Questionnaire Engine"
            icon={<ClipboardCheck size={18} className="text-amber" />}
            items={virQuestionnaireRequirements}
          />
          <RequirementPanel
            title="Findings and Carryover"
            icon={<FileText size={18} className="text-danger" />}
            items={virFindingWorkflowRequirements}
          />
          <RequirementPanel
            title="Dual Sign-Off Workflow"
            icon={<ShieldCheck size={18} className="text-success" />}
            items={virSignOffRequirements}
          />
          <RequirementPanel
            title="AI Import Engine"
            icon={<ScanSearch size={18} className="text-cyan" />}
            items={virImportRequirements}
          />
          <RequirementPanel
            title="Photo and Evidence Handling"
            icon={<FileText size={18} className="text-danger" />}
            items={virPhotoRequirements}
          />
          <RequirementPanel
            title="Mobile and Tablet Support"
            icon={<TabletSmartphone size={18} className="text-teal" />}
            items={virMobileRequirements}
          />
          <RequirementPanel
            title="Dashboard and PDF Export"
            icon={<Layers3 size={18} className="text-amber" />}
            items={[...virDashboardRequirements, ...virPdfRequirements]}
          />
        </section>

        <section className="grid xl:grid-cols-[1fr_0.95fr] gap-6 mt-6">
          <div className="panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <ClipboardCheck size={18} className="text-teal" />
              <h2 className="text-xl font-bold text-navy">Starter Questionnaire Import</h2>
            </div>
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { label: "Sections", value: sampleSummary.sections },
                { label: "Questions", value: sampleSummary.questions },
                { label: "CIC tagged", value: sampleSummary.cicQuestions },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-border bg-slate-50 px-4 py-3">
                  <div className="text-xs text-slate-500">{item.label}</div>
                  <div className="mt-1 text-2xl font-black text-navy">{item.value}</div>
                </div>
              ))}
            </div>
            <div className="mt-4 rounded-2xl border border-border bg-slate-50 p-4 text-sm text-slate-700 leading-7">
              <p><strong>Dry run:</strong> <code>POST /api/vir/templates/import</code></p>
              <p><strong>Commit:</strong> <code>POST /api/vir/templates/import?commit=true</code></p>
              <p><strong>Seed demo data:</strong> <code>/api/seed-vir?secret=YOUR_SEED_SECRET</code></p>
            </div>
            <pre className="mt-4 rounded-2xl bg-navy text-white text-xs leading-6 overflow-x-auto p-4">
              {JSON.stringify(VIR_SAMPLE_TEMPLATE_PAYLOAD, null, 2)}
            </pre>
          </div>

          <div className="panel p-6">
            <div className="flex items-center gap-3 mb-4">
              <FileText size={18} className="text-cyan" />
              <h2 className="text-xl font-bold text-navy">Sprint and Demo Requirements</h2>
            </div>
            <div className="space-y-3">
              {virSprintSummary.map((item) => (
                <div key={item} className="rounded-2xl border border-border bg-slate-50 px-4 py-3 text-sm text-slate-700 leading-6">
                  {item}
                </div>
              ))}
            </div>
            <div className="mt-5 rounded-2xl border border-border bg-slate-50 px-4 py-4">
              <h3 className="font-bold text-navy">Demo Build Guide Requirements</h3>
              <div className="mt-3 space-y-2 text-sm text-slate-700 leading-6">
                {virDemoRequirements.map((item) => (
                  <p key={item}>{item}</p>
                ))}
              </div>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}

function RequirementPanel({
  title,
  icon,
  items,
}: {
  title: string;
  icon: React.ReactNode;
  items: string[];
}) {
  return (
    <div className="panel p-6">
      <div className="flex items-center gap-3 mb-4">
        {icon}
        <h2 className="text-xl font-bold text-navy">{title}</h2>
      </div>
      <div className="space-y-3 text-sm text-slate-700 leading-7">
        {items.map((item) => (
          <p key={item}>{item}</p>
        ))}
      </div>
    </div>
  );
}
