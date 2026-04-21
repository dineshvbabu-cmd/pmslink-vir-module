import type { Prisma, VirInspectionStatus } from "@prisma/client";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VIR_INSPECTION_TYPES } from "@/lib/vir/catalog";
import { normalizeVirTemplateImport, type VirTemplateImport } from "@/lib/vir/import";
import { syncInspectionCounters } from "@/lib/vir/workflow";

type DemoTemplateSeed = {
  key: string;
  inspectionTypeCode: string;
  payload: VirTemplateImport;
};

type DemoVesselSeed = {
  code: string;
  name: string;
  imoNumber: string;
  vesselType: string;
  fleet: string;
  flag: string;
  manager: string;
};

type TemplateRecord = Awaited<ReturnType<typeof loadTemplateRecord>>;
type DemoQuestion = TemplateRecord["sections"][number]["questions"][number];

type DemoScenario = {
  inspectionTypeCode: string;
  templateKey: string;
  title: string;
  summary: string;
  status: VirInspectionStatus;
  inspectionDate: Date;
  port: string;
  country: string;
  inspectorName: string;
  inspectorCompany: string;
  shoreReviewedBy: string | null;
  shoreReviewDate: Date | null;
  closedAt: Date | null;
};

const DEMO_VESSELS = buildDemoVessels();

const DEMO_PORTS = [
  { port: "Long Beach", country: "USA" },
  { port: "Fujairah", country: "UAE" },
  { port: "Singapore", country: "Singapore" },
  { port: "Rotterdam", country: "Netherlands" },
  { port: "Antwerp", country: "Belgium" },
  { port: "Houston", country: "USA" },
  { port: "Ulsan", country: "Korea" },
  { port: "Santos", country: "Brazil" },
  { port: "Kandla", country: "India" },
  { port: "Balboa", country: "Panama" },
];

const DEMO_INSPECTORS = [
  "Arun Mehra",
  "Nikhil Raman",
  "Sara Iqbal",
  "Daniel Mercer",
  "Asha Devi",
  "Milan D'Souza",
  "Owen Parker",
  "Ritika Sen",
];

const DEMO_REVIEWERS = [
  "Harinath Rao",
  "Elaine Carter",
  "Vivek Anand",
  "Pravin Joseph",
];

const DEMO_EVIDENCE_IMAGES = [
  "/demo-evidence/deck-condition.svg",
  "/demo-evidence/bridge-watch.svg",
  "/demo-evidence/engine-round.svg",
  "/demo-evidence/fire-station.svg",
  "/demo-evidence/lifeboat-station.svg",
  "/demo-evidence/cargo-manifold.svg",
];

const TEMPLATE_SEEDS: DemoTemplateSeed[] = [
  {
    key: "SAILING_VIR",
    inspectionTypeCode: "OWNERS_INSPECTION_INTERNAL",
    payload: {
      inspectionTypeCode: "OWNERS_INSPECTION_INTERNAL",
      inspectionTypeName: "Owner's Inspection (Internal)",
      inspectionCategory: "INTERNAL",
      templateName: "Sailing VIR - Technical Condition Review",
      version: "2026.4",
      description: "Fleet sailing-mode VIR questionnaire covering technical condition, bridge readiness, cargo systems, and safety arrangements.",
      sections: [
        buildSection("HULL", "Hull", "Confirm shell condition, coating integrity, and visible structural readiness.", [
          buildQuestion("HULL_001", "Condition of shell plating and external coating on exposed hull areas.", "YES_NO_NA", "HIGH", true, "/reference-images/deck-reference.svg"),
          buildQuestion("HULL_002", "Any visible wastage, indentation, or shell deformation requiring office attention?", "TEXT", "MEDIUM", false),
          buildQuestion("HULL_003", "Condition of draft marks, load line marks, and readability during inspection.", "SINGLE_SELECT", "MEDIUM", true, null, [
            { value: "CLEAR", label: "Clear and satisfactory", score: 100 },
            { value: "MINOR_TOUCH_UP", label: "Minor touch-up required", score: 70 },
            { value: "POOR", label: "Poor / unreadable", score: 10 },
          ]),
        ]),
        buildSection("DECK", "Deck", "Review mooring decks, walkways, freeing ports, and housekeeping standards.", [
          buildQuestion("DECK_001", "Condition and operation of mooring winches, guards, and brake markings.", "SINGLE_SELECT", "HIGH", true, "/reference-images/deck-reference.svg", [
            { value: "SATISFACTORY", label: "Satisfactory", score: 100 },
            { value: "OBSERVATION", label: "Observation noted", score: 65 },
            { value: "DEFICIENT", label: "Deficient", score: 0 },
          ]),
          buildQuestion("DECK_002", "Condition of bulwarks, hand rails, and access ladders on main deck.", "YES_NO_NA", "HIGH", true, "/reference-images/deck-reference.svg"),
          buildQuestion("DECK_003", "Enter count of deck defects requiring follow-up action.", "NUMBER", "MEDIUM", false),
        ]),
        buildSection("NAV", "Navigation", "Review bridge organization, publications, alarms, and watchkeeping readiness.", [
          buildQuestion("NAV_001", "Is the berth-to-berth passage plan current and countersigned?", "YES_NO_NA", "CRITICAL", true, "/reference-images/navigation-reference.svg"),
          buildQuestion("NAV_002", "Bridge publications update date", "DATE", "MEDIUM", false, "/reference-images/navigation-reference.svg"),
          buildQuestion("NAV_003", "Select current bridge equipment concerns affecting navigation readiness.", "MULTI_SELECT", "HIGH", false, null, [
            { value: "ECDIS", label: "ECDIS" },
            { value: "RADAR", label: "RADAR" },
            { value: "GYRO", label: "Gyro" },
            { value: "BNWAS", label: "BNWAS" },
          ]),
        ]),
        buildSection("CARGO", "Cargo System", "Assess manifolds, cargo lines, valves, and associated deck machinery.", [
          buildQuestion("CARGO_001", "Condition of cargo manifolds, drip trays, and flange management.", "SINGLE_SELECT", "HIGH", true, "/reference-images/cargo-reference.svg", [
            { value: "GOOD", label: "Good order", score: 100 },
            { value: "MINOR_DEFECT", label: "Minor defect", score: 65 },
            { value: "MAJOR_DEFECT", label: "Major defect", score: 0 },
          ]),
          buildQuestion("CARGO_002", "Any leaks, staining, or deterioration noted on exposed cargo lines?", "YES_NO_NA", "HIGH", true, "/reference-images/cargo-reference.svg"),
          buildQuestion("CARGO_003", "Record cargo system observations or temporary controls.", "TEXT", "MEDIUM", false),
        ]),
        buildSection("ENGINE", "Engine Room", "Evaluate machinery reliability, housekeeping, and maintenance control.", [
          buildQuestion("ENGINE_001", "General condition of main engine auxiliaries and surrounding housekeeping.", "SINGLE_SELECT", "HIGH", true, "/reference-images/engine-reference.svg", [
            { value: "GOOD", label: "Good order", score: 100 },
            { value: "MONITOR", label: "Monitor / observe", score: 70 },
            { value: "ATTENTION", label: "Immediate attention", score: 10 },
          ]),
          buildQuestion("ENGINE_002", "Any machinery alarm, vibration, or leakage trend requiring escalation?", "TEXT", "HIGH", false, "/reference-images/engine-reference.svg"),
          buildQuestion("ENGINE_003", "Number of overdue maintenance jobs linked to critical plant.", "NUMBER", "HIGH", true),
        ]),
        buildSection("FIRE", "Fire Fighting", "Confirm firefighting readiness, pumps, hoses, and detector impairments.", [
          buildQuestion("FIRE_001", "Fire pump performance and line pressure test status.", "SINGLE_SELECT", "CRITICAL", true, null, [
            { value: "SATISFACTORY", label: "Satisfactory", score: 100 },
            { value: "MINOR_ISSUE", label: "Minor issue", score: 60 },
            { value: "UNSATISFACTORY", label: "Unsatisfactory", score: 0 },
          ]),
          buildQuestion("FIRE_002", "Any detector isolation, fire station defect, or bypass in service?", "TEXT", "HIGH", false, "/reference-images/lifesaving-reference.svg"),
          buildQuestion("FIRE_003", "Is fire control plan, signage, and muster station readiness confirmed?", "YES_NO_NA", "HIGH", true),
        ]),
        buildSection("LSA", "Life Saving", "Review embarkation areas, davits, rescue boat readiness, and lifesaving signage.", [
          buildQuestion("LSA_001", "Condition of lifeboat embarkation area, lighting, and netting.", "YES_NO_NA", "HIGH", true, "/reference-images/lifesaving-reference.svg"),
          buildQuestion("LSA_002", "Condition of davits, hooks, and release gear observations.", "TEXT", "HIGH", false, "/reference-images/lifesaving-reference.svg"),
          buildQuestion("LSA_003", "Lifesaving appliances are available, secured, and inspection tags current.", "YES_NO_NA", "HIGH", true),
        ]),
        buildSection("QHSE", "QHSE", "Confirm permit discipline, safety culture, and shipboard QHSE control.", [
          buildQuestion("QHSE_001", "Permit to work, toolbox talk, and risk assessment discipline verified.", "YES_NO_NA", "HIGH", true),
          buildQuestion("QHSE_002", "Record any open safety observations discussed with ship staff.", "TEXT", "MEDIUM", false),
          buildQuestion("QHSE_003", "Select focus areas requiring management follow-up.", "MULTI_SELECT", "MEDIUM", false, null, [
            { value: "MANNING", label: "Manning" },
            { value: "MAINTENANCE", label: "Maintenance" },
            { value: "TRAINING", label: "Training" },
            { value: "DOCUMENTATION", label: "Documentation" },
          ]),
        ]),
      ],
    },
  },
  {
    key: "PORT_VIR",
    inspectionTypeCode: "QHSE_VISIT",
    payload: {
      inspectionTypeCode: "QHSE_VISIT",
      inspectionTypeName: "QHSE Visit",
      inspectionCategory: "INTERNAL",
      templateName: "Port VIR - Operational Readiness Review",
      version: "2026.4",
      description: "Port-mode VIR checklist covering cargo readiness, certificates, terminal interface, and moored-vessel controls.",
      sections: [
        buildSection("CERTS", "Certificates & Documentation", "Verify validity, posting, and readiness of operational documents.", [
          buildQuestion("CERTS_001", "Are statutory and trading certificates current and readily accessible?", "YES_NO_NA", "HIGH", true, "/reference-images/certificates-reference.svg"),
          buildQuestion("CERTS_002", "How many certificates or endorsements fall due within 30 days?", "NUMBER", "MEDIUM", true),
          buildQuestion("CERTS_003", "Record any documentation gaps highlighted during the port review.", "TEXT", "MEDIUM", false),
        ]),
        buildSection("TERMINAL", "Terminal Interface", "Review terminal checklist closure, communications, and moored readiness.", [
          buildQuestion("TERMINAL_001", "Terminal safety checklist completed and jointly signed.", "YES_NO_NA", "HIGH", true),
          buildQuestion("TERMINAL_002", "Any operational remarks outstanding between vessel and terminal?", "TEXT", "MEDIUM", false),
          buildQuestion("TERMINAL_003", "Current shore-side concerns impacting safe cargo operations.", "MULTI_SELECT", "HIGH", false, null, [
            { value: "WEATHER", label: "Weather" },
            { value: "STS", label: "STS / alongside traffic" },
            { value: "DELAYS", label: "Delay / berth pressure" },
            { value: "MANPOWER", label: "Manpower" },
          ]),
        ]),
        buildSection("CARGO", "Cargo Readiness", "Assess manifolds, valves, line-up, and cargo documentation before transfer.", [
          buildQuestion("PORT_CARGO_001", "Cargo manifold, drip tray, and hose connection condition.", "SINGLE_SELECT", "HIGH", true, "/reference-images/cargo-reference.svg", [
            { value: "GOOD", label: "Good order", score: 100 },
            { value: "WATCH", label: "Needs monitoring", score: 65 },
            { value: "DEFICIENT", label: "Deficient", score: 0 },
          ]),
          buildQuestion("PORT_CARGO_002", "Record any cargo line or valve defects noted at port.", "TEXT", "HIGH", false, "/reference-images/cargo-reference.svg"),
          buildQuestion("PORT_CARGO_003", "Cargo transfer readiness is confirmed by responsible officers.", "YES_NO_NA", "HIGH", true),
        ]),
        buildSection("MOORING", "Mooring & Gangway", "Check access, mooring integrity, and moored deck control.", [
          buildQuestion("MOORING_001", "Gangway, safety net, and access watch arrangement satisfactory.", "YES_NO_NA", "HIGH", true, "/reference-images/deck-reference.svg"),
          buildQuestion("MOORING_002", "Mooring winches, lines, and tension pattern remain satisfactory in port.", "SINGLE_SELECT", "HIGH", true, "/reference-images/deck-reference.svg", [
            { value: "GOOD", label: "Good order", score: 100 },
            { value: "OBSERVE", label: "Observation", score: 70 },
            { value: "DEFICIENT", label: "Deficient", score: 0 },
          ]),
          buildQuestion("MOORING_003", "Any remarks from berth watch or shore access control.", "TEXT", "MEDIUM", false),
        ]),
        buildSection("SECURITY", "Security & Watchkeeping", "Review access control, visitor management, and watchkeeping discipline in port.", [
          buildQuestion("SECURITY_001", "Visitor control, access log, and gangway watch arrangements are effective.", "YES_NO_NA", "HIGH", true),
          buildQuestion("SECURITY_002", "Any shipboard security observation requiring shore awareness?", "TEXT", "MEDIUM", false),
          buildQuestion("SECURITY_003", "Select security focus areas discussed during the visit.", "MULTI_SELECT", "MEDIUM", false, null, [
            { value: "VISITOR_LOG", label: "Visitor log" },
            { value: "LIGHTING", label: "Lighting" },
            { value: "PATROL", label: "Patrol" },
            { value: "ID_CHECK", label: "ID check" },
          ]),
        ]),
        buildSection("QHSE", "QHSE & Crew Readiness", "Review meeting quality, crew awareness, and immediate operational support needs.", [
          buildQuestion("PORT_QHSE_001", "Toolbox talk, cargo meeting, and pre-transfer discussion completed.", "YES_NO_NA", "HIGH", true),
          buildQuestion("PORT_QHSE_002", "Any crew welfare, fatigue, or work-rest concern raised during the port review?", "TEXT", "MEDIUM", false),
          buildQuestion("PORT_QHSE_003", "Immediate office support required after the port VIR.", "TEXT", "MEDIUM", false),
        ]),
      ],
    },
  },
  {
    key: "REMOTE_VIR",
    inspectionTypeCode: "REMOTE_NAVIGATIONAL_ASSESSMENT",
    payload: {
      inspectionTypeCode: "REMOTE_NAVIGATIONAL_ASSESSMENT",
      inspectionTypeName: "Remote Navigational Assessment",
      inspectionCategory: "INTERNAL",
      templateName: "Sailing (Remote) VIR - Navigation Assurance",
      version: "2026.4",
      description: "Remote sailing-mode VIR checklist focused on bridge assurance, publications, alarms, and record quality.",
      sections: [
        buildSection("REMOTE_BRIDGE", "Bridge Readiness", "Review bridge ergonomics, familiarization, and watchkeeping barriers through remote assurance.", [
          buildQuestion("REMOTE_BRIDGE_001", "Bridge watch arrangement and familiarization records are current.", "YES_NO_NA", "HIGH", true, "/reference-images/navigation-reference.svg"),
          buildQuestion("REMOTE_BRIDGE_002", "Any bridge alarm, display, or sensor issue affecting the watch.", "TEXT", "HIGH", false, "/reference-images/navigation-reference.svg"),
          buildQuestion("REMOTE_BRIDGE_003", "Remote bridge review confidence level", "SINGLE_SELECT", "MEDIUM", true, null, [
            { value: "HIGH", label: "High confidence", score: 100 },
            { value: "MEDIUM", label: "Medium confidence", score: 70 },
            { value: "LOW", label: "Low confidence", score: 35 },
          ]),
        ]),
        buildSection("PUBLICATIONS", "Publications & Passage Plan", "Confirm passage planning and publication maintenance for the voyage segment under review.", [
          buildQuestion("PUBLICATIONS_001", "Passage plan is complete, updated, and signed by the bridge team.", "YES_NO_NA", "CRITICAL", true),
          buildQuestion("PUBLICATIONS_002", "Date of latest chart and publication correction", "DATE", "MEDIUM", false),
          buildQuestion("PUBLICATIONS_003", "Any publication, chart, or route exchange deficiency noted remotely?", "TEXT", "MEDIUM", false),
        ]),
        buildSection("ALARM", "Alarms & BNWAS", "Review essential alarm health and bridge alert management.", [
          buildQuestion("ALARM_001", "BNWAS, heading monitor, and essential watch alarms operational.", "YES_NO_NA", "HIGH", true),
          buildQuestion("ALARM_002", "Select open bridge alert concerns.", "MULTI_SELECT", "HIGH", false, null, [
            { value: "BNWAS", label: "BNWAS" },
            { value: "HEADING", label: "Heading / gyro" },
            { value: "ECDIS", label: "ECDIS alert" },
            { value: "NAVTEX", label: "NAVTEX / comms" },
          ]),
          buildQuestion("ALARM_003", "Record remote assurance comment on alarm handling quality.", "TEXT", "MEDIUM", false),
        ]),
        buildSection("COMMS", "Communication & Reporting", "Confirm timely communication between vessel and office during remote review.", [
          buildQuestion("COMMS_001", "Bridge team responded to remote review requests within agreed time window.", "YES_NO_NA", "MEDIUM", true),
          buildQuestion("COMMS_002", "Any limitations in remote evidence quality or bandwidth.", "TEXT", "MEDIUM", false),
          buildQuestion("COMMS_003", "Number of open follow-up actions from the remote review.", "NUMBER", "MEDIUM", false),
        ]),
        buildSection("QHSE", "QHSE & Follow-up", "Capture follow-up requirements raised from the remote assessment.", [
          buildQuestion("REMOTE_QHSE_001", "Actions from the remote review are assigned to responsible ship staff.", "YES_NO_NA", "HIGH", true),
          buildQuestion("REMOTE_QHSE_002", "Any office intervention needed before closing the remote review?", "TEXT", "MEDIUM", false),
          buildQuestion("REMOTE_QHSE_003", "Remote review is ready for office sign-off.", "YES_NO_NA", "MEDIUM", true),
        ]),
      ],
    },
  },
  {
    key: "TAKEOVER_VIR",
    inspectionTypeCode: "MASTERS_TAKEOVER_INSPECTION",
    payload: {
      inspectionTypeCode: "MASTERS_TAKEOVER_INSPECTION",
      inspectionTypeName: "Master's Takeover Inspection",
      inspectionCategory: "INTERNAL",
      templateName: "Port VIR - Master Takeover Review",
      version: "2026.4",
      description: "Takeover VIR questionnaire for command handover, certificates, outstanding defects, and operational continuity.",
      sections: [
        buildSection("HANDOVER", "Handover File", "Confirm command handover pack and open issues are properly transferred.", [
          buildQuestion("HANDOVER_001", "Master's handover notes and standing orders reviewed in full.", "YES_NO_NA", "HIGH", true),
          buildQuestion("HANDOVER_002", "List open items requiring handover follow-up.", "TEXT", "MEDIUM", false),
          buildQuestion("HANDOVER_003", "Outstanding handover actions count", "NUMBER", "MEDIUM", false),
        ]),
        buildSection("COMMAND", "Bridge & Command", "Verify bridge administration, voyage plan, and immediate command priorities.", [
          buildQuestion("COMMAND_001", "Bridge orders, pilot card, and passage planning status reviewed by the incoming master.", "YES_NO_NA", "HIGH", true, "/reference-images/navigation-reference.svg"),
          buildQuestion("COMMAND_002", "Any bridge management issue requiring immediate office support?", "TEXT", "HIGH", false),
          buildQuestion("COMMAND_003", "Incoming master confidence in bridge readiness", "SINGLE_SELECT", "MEDIUM", true, null, [
            { value: "HIGH", label: "High", score: 100 },
            { value: "MEDIUM", label: "Medium", score: 70 },
            { value: "LOW", label: "Low", score: 35 },
          ]),
        ]),
        buildSection("CERTS", "Certificates & Compliance", "Ensure command-critical statutory and management documents are transferred correctly.", [
          buildQuestion("TAKEOVER_CERTS_001", "Certificates, endorsements, and office circulars reviewed during takeover.", "YES_NO_NA", "HIGH", true, "/reference-images/certificates-reference.svg"),
          buildQuestion("TAKEOVER_CERTS_002", "Any compliance gap identified during command handover.", "TEXT", "HIGH", false),
          buildQuestion("TAKEOVER_CERTS_003", "Next due certificate or inspection date", "DATE", "MEDIUM", false),
        ]),
        buildSection("CREW", "Crew & Welfare", "Review key manning positions, fatigue concerns, and welfare handover points.", [
          buildQuestion("CREW_001", "Crew readiness, manning gaps, and work-rest issues discussed with the incoming master.", "YES_NO_NA", "HIGH", true),
          buildQuestion("CREW_002", "Any welfare or retention issue escalated during takeover.", "TEXT", "MEDIUM", false),
          buildQuestion("CREW_003", "Crew-related focus areas for office follow-up.", "MULTI_SELECT", "MEDIUM", false, null, [
            { value: "RELIEF", label: "Relief planning" },
            { value: "FATIGUE", label: "Fatigue" },
            { value: "MEDICAL", label: "Medical" },
            { value: "TRAINING", label: "Training" },
          ]),
        ]),
        buildSection("DEFECTS", "Defects & Claims", "Confirm live defect register, class matters, and claims exposure at handover.", [
          buildQuestion("DEFECTS_001", "Open technical defects and class/statutory items were handed over with status.", "YES_NO_NA", "HIGH", true),
          buildQuestion("DEFECTS_002", "Record any critical defect still unresolved at the time of handover.", "TEXT", "HIGH", false),
          buildQuestion("DEFECTS_003", "Any insurance, claim, or off-hire exposure discussed during takeover.", "TEXT", "MEDIUM", false),
        ]),
        buildSection("SUMMARY", "Takeover Summary", "Capture the outcome of the takeover review.", [
          buildQuestion("SUMMARY_001", "Incoming master confirms readiness to assume command.", "YES_NO_NA", "HIGH", true),
          buildQuestion("SUMMARY_002", "Overall takeover narrative and follow-up expectations.", "TEXT", "MEDIUM", false),
          buildQuestion("SUMMARY_003", "Office intervention required before closing the takeover VIR.", "TEXT", "MEDIUM", false),
        ]),
      ],
    },
  },
  {
    key: "ENGINEERING_VIR",
    inspectionTypeCode: "ENGINEERING_AUDIT",
    payload: {
      inspectionTypeCode: "ENGINEERING_AUDIT",
      inspectionTypeName: "Engineering Audit",
      inspectionCategory: "INTERNAL",
      templateName: "Sailing VIR - Engineering Plant Assurance",
      version: "2026.4",
      description: "Engineering-focused VIR questionnaire for plant condition, machinery housekeeping, and critical spares assurance.",
      sections: [
        buildSection("PLANT", "Critical Plant", "Review propulsion and auxiliary plant condition with focus on reliability.", [
          buildQuestion("PLANT_001", "Main engine and critical auxiliaries are in reliable operating condition.", "YES_NO_NA", "CRITICAL", true, "/reference-images/engine-reference.svg"),
          buildQuestion("PLANT_002", "Any vibration, leakage, or thermal abnormality noted on critical machinery.", "TEXT", "HIGH", false, "/reference-images/engine-reference.svg"),
          buildQuestion("PLANT_003", "Critical plant reliability score", "SINGLE_SELECT", "HIGH", true, null, [
            { value: "HIGH", label: "High confidence", score: 100 },
            { value: "WATCH", label: "Watch item", score: 70 },
            { value: "LOW", label: "Low confidence", score: 25 },
          ]),
        ]),
        buildSection("MAINT", "Maintenance Control", "Review PMS discipline, overdue work, and defect closure quality.", [
          buildQuestion("MAINT_001", "PMS backlog and overdue maintenance are within controlled limits.", "YES_NO_NA", "HIGH", true),
          buildQuestion("MAINT_002", "Number of overdue critical jobs", "NUMBER", "HIGH", true),
          buildQuestion("MAINT_003", "Maintenance control comments and observed weaknesses.", "TEXT", "MEDIUM", false),
        ]),
        buildSection("SPARES", "Spares & Stores", "Review readiness of critical spares, consumables, and stores discipline.", [
          buildQuestion("SPARES_001", "Critical spares are onboard and traceable for essential machinery.", "YES_NO_NA", "HIGH", true),
          buildQuestion("SPARES_002", "Any urgent spare shortfall affecting reliability.", "TEXT", "MEDIUM", false),
          buildQuestion("SPARES_003", "Spares review follow-up categories", "MULTI_SELECT", "MEDIUM", false, null, [
            { value: "MAIN_ENGINE", label: "Main engine" },
            { value: "PUMPS", label: "Pumps" },
            { value: "ALARMS", label: "Alarm / automation" },
            { value: "CARGO", label: "Cargo plant" },
          ]),
        ]),
        buildSection("HOUSEKEEPING", "Housekeeping & Safety", "Review housekeeping, leak control, and engineering safety barriers.", [
          buildQuestion("HOUSEKEEPING_001", "Machinery spaces, workshops, and control stations are kept in safe order.", "YES_NO_NA", "HIGH", true),
          buildQuestion("HOUSEKEEPING_002", "Any oil leakage, lagging damage, or housekeeping observation noted.", "TEXT", "MEDIUM", false),
          buildQuestion("HOUSEKEEPING_003", "Fire and emergency access within machinery spaces are unobstructed.", "YES_NO_NA", "HIGH", true),
        ]),
        buildSection("AUX", "Auxiliaries & Utilities", "Assess performance of compressors, boilers, pumps, and utility systems.", [
          buildQuestion("AUX_001", "Auxiliary systems support safe voyage and cargo operations.", "YES_NO_NA", "HIGH", true),
          buildQuestion("AUX_002", "Open auxiliary system concerns discussed with ship staff.", "TEXT", "MEDIUM", false),
          buildQuestion("AUX_003", "Any utility system currently under temporary repair or monitoring.", "TEXT", "MEDIUM", false),
        ]),
        buildSection("ENG_QHSE", "Engineering QHSE", "Capture engineering meeting output and shore support needs.", [
          buildQuestion("ENG_QHSE_001", "Engineering safety meeting and toolbox discipline are effective.", "YES_NO_NA", "MEDIUM", true),
          buildQuestion("ENG_QHSE_002", "Immediate office engineering support required.", "TEXT", "MEDIUM", false),
          buildQuestion("ENG_QHSE_003", "Engineering audit ready for shore closure.", "YES_NO_NA", "MEDIUM", true),
        ]),
      ],
    },
  },
];

async function runSeed(request: Request) {
  const url = new URL(request.url);
  const secret = url.searchParams.get("secret");

  if (secret !== process.env.SEED_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const results: string[] = [];

  for (const inspectionType of VIR_INSPECTION_TYPES) {
    await prisma.virInspectionType.upsert({
      where: { code: inspectionType.code },
      update: {
        name: inspectionType.name,
        category: inspectionType.category,
        description: inspectionType.description,
        isActive: true,
      },
      create: inspectionType,
    });
  }

  await archiveLegacyDemoData();
  results.push(`Seeded ${VIR_INSPECTION_TYPES.length} inspection types and archived the old PSC starter demo records.`);

  const vessels = [];
  for (const vesselInput of DEMO_VESSELS) {
    const vessel = await prisma.vessel.upsert({
      where: { code: vesselInput.code },
      update: {
        ...vesselInput,
        isActive: true,
      },
      create: vesselInput,
    });

    vessels.push(vessel);
  }

  results.push(`Upserted ${vessels.length} anonymized demo vessels across multiple fleets and vessel classes.`);

  await clearSeededDemoData(vessels.map((vessel) => vessel.id));
  results.push("Cleared previously seeded VIR inspections so the demo dataset can be rebuilt cleanly.");

  const inspectionTypeRecords = await prisma.virInspectionType.findMany({
    where: {
      code: {
        in: TEMPLATE_SEEDS.map((item) => item.inspectionTypeCode),
      },
    },
    select: { id: true, code: true, name: true },
  });

  const inspectionTypeMap = new Map(inspectionTypeRecords.map((item) => [item.code, item]));
  const templateMap = new Map<string, TemplateRecord>();

  for (const templateSeed of TEMPLATE_SEEDS) {
    const inspectionType = inspectionTypeMap.get(templateSeed.inspectionTypeCode);

    if (!inspectionType) {
      continue;
    }

    const { normalized } = normalizeVirTemplateImport(templateSeed.payload);
    const template = await upsertTemplate(inspectionType.id, normalized);
    templateMap.set(templateSeed.key, template);
  }

  results.push(`Registered ${templateMap.size} VIR questionnaire templates aligned to sailing, port, remote, takeover, and engineering workflows.`);

  let inspectionCount = 0;

  for (const [index, vessel] of vessels.entries()) {
    const previousScenario = buildPreviousScenario(index);
    const currentScenario = buildCurrentScenario(index);
    const previousRef = buildReferenceNumber(vessel.name, previousScenario.inspectionDate, index + 1, "P");
    const currentRef = buildReferenceNumber(vessel.name, currentScenario.inspectionDate, index + 1, "C");

    const previousTemplate = templateMap.get(previousScenario.templateKey);
    const currentTemplate = templateMap.get(currentScenario.templateKey);
    const previousInspectionType = inspectionTypeMap.get(previousScenario.inspectionTypeCode);
    const currentInspectionType = inspectionTypeMap.get(currentScenario.inspectionTypeCode);

    if (!previousTemplate || !currentTemplate || !previousInspectionType || !currentInspectionType) {
      continue;
    }

    const previousInspection = await upsertInspection({
      externalReference: previousRef,
      vesselId: vessel.id,
      inspectionTypeId: previousInspectionType.id,
      templateId: previousTemplate.id,
      title: previousScenario.title,
      inspectionDate: previousScenario.inspectionDate,
      port: previousScenario.port,
      country: previousScenario.country,
      inspectorName: previousScenario.inspectorName,
      inspectorCompany: previousScenario.inspectorCompany,
      status: previousScenario.status,
      summary: previousScenario.summary,
      shoreReviewedBy: previousScenario.shoreReviewedBy,
      shoreReviewDate: previousScenario.shoreReviewDate,
      closedAt: previousScenario.closedAt,
      metadata: {
        seeded: true,
        lane: "history",
        inspectionMode: inferInspectionMode(previousScenario.title),
        syncLabel: "Synced",
      },
    });

    await resetInspectionArtifacts(previousInspection.id);
    await seedInspectionContent(previousInspection.id, previousTemplate, previousScenario, index, true);
    inspectionCount += 1;

    const currentInspection = await upsertInspection({
      externalReference: currentRef,
      vesselId: vessel.id,
      inspectionTypeId: currentInspectionType.id,
      templateId: currentTemplate.id,
      title: currentScenario.title,
      inspectionDate: currentScenario.inspectionDate,
      port: currentScenario.port,
      country: currentScenario.country,
      inspectorName: currentScenario.inspectorName,
      inspectorCompany: currentScenario.inspectorCompany,
      status: currentScenario.status,
      summary: currentScenario.summary,
      shoreReviewedBy: currentScenario.shoreReviewedBy,
      shoreReviewDate: currentScenario.shoreReviewDate,
      closedAt: currentScenario.closedAt,
      previousInspectionId: previousInspection.id,
      metadata: {
        seeded: true,
        lane: currentScenario.status,
        inspectionMode: inferInspectionMode(currentScenario.title),
        syncLabel: ["DRAFT", "RETURNED"].includes(currentScenario.status) ? "Not Synced" : "Synced",
      },
    });

    await resetInspectionArtifacts(currentInspection.id);
    await seedInspectionContent(currentInspection.id, currentTemplate, currentScenario, index, false);
    inspectionCount += 1;
  }

  results.push(`Prepared ${inspectionCount} realistic VIR inspection records with progress, sign-offs, findings, and evidence.`);

  const importSessionCount = await seedImportSessions(inspectionTypeMap);
  results.push(`Created ${importSessionCount} VIR questionnaire import review sessions for template governance and demo walkthroughs.`);

  return NextResponse.json({
    ok: true,
    results,
    summary: {
      vessels: vessels.length,
      templates: templateMap.size,
      inspections: inspectionCount,
      importSessions: importSessionCount,
    },
  });
}

async function archiveLegacyDemoData() {
  await prisma.virInspection.updateMany({
    where: {
      OR: [
        { externalReference: { in: ["PSC-SIN-2026-0042", "PSC-FJR-2026-0018"] } },
        { title: { contains: "PSC Self Assessment" } },
        { title: { contains: "PSC Readiness Review" } },
      ],
    },
    data: { status: "ARCHIVED" },
  });

  await prisma.vessel.updateMany({
    where: { code: { in: ["UM-DMO-001", "UM-DMO-002", "UM-DMO-003"] } },
    data: { isActive: false },
  });

  await prisma.virTemplate.updateMany({
    where: { name: "PSC Self-Assessment Starter" },
    data: { isActive: false },
  });

  await prisma.virImportSession.deleteMany({
    where: {
      createdBy: "Seed Engine",
      sourceFileName: {
        in: ["PSC_Sample_Imported_Checklist.pdf", "PSC_Self_Assessment_Starter.json"],
      },
    },
  });
}

async function upsertTemplate(inspectionTypeId: string, normalized: ReturnType<typeof normalizeVirTemplateImport>["normalized"]) {
  const existing = await prisma.virTemplate.findFirst({
    where: {
      inspectionTypeId,
      version: normalized.version,
    },
    select: { id: true },
  });

  const sectionCreateData = normalized.sections.map((section) => ({
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
  }));

  if (existing) {
    const linkedInspectionCount = await prisma.virInspection.count({
      where: { templateId: existing.id },
    });

    await prisma.virTemplate.update({
      where: { id: existing.id },
      data:
        linkedInspectionCount > 0
          ? {
              name: normalized.templateName,
              description: normalized.description,
              isActive: true,
            }
          : {
              name: normalized.templateName,
              description: normalized.description,
              isActive: true,
              sections: {
                deleteMany: {},
                create: sectionCreateData,
              },
            },
    });

    return loadTemplateRecord(existing.id);
  }

  const created = await prisma.virTemplate.create({
    data: {
      inspectionTypeId,
      name: normalized.templateName,
      version: normalized.version,
      description: normalized.description,
      sections: {
        create: sectionCreateData,
      },
    },
    select: { id: true },
  });

  return loadTemplateRecord(created.id);
}

async function loadTemplateRecord(templateId: string) {
  const template = await prisma.virTemplate.findUnique({
    where: { id: templateId },
    include: {
      sections: {
        orderBy: { sortOrder: "asc" },
        include: {
          questions: {
            orderBy: { sortOrder: "asc" },
            include: {
              options: {
                orderBy: { sortOrder: "asc" },
              },
            },
          },
        },
      },
    },
  });

  if (!template) {
    throw new Error(`Template ${templateId} was not found after creation.`);
  }

  return template;
}

async function upsertInspection(data: {
  externalReference: string;
  vesselId: string;
  inspectionTypeId: string;
  templateId: string;
  title: string;
  inspectionDate: Date;
  port: string;
  country: string;
  inspectorName: string;
  inspectorCompany: string;
  status: VirInspectionStatus;
  summary: string;
  shoreReviewedBy: string | null;
  shoreReviewDate: Date | null;
  closedAt: Date | null;
  previousInspectionId?: string;
  metadata: Prisma.InputJsonValue;
}) {
  const existing = await prisma.virInspection.findFirst({
    where: { externalReference: data.externalReference },
    select: { id: true },
  });

  if (existing) {
    return prisma.virInspection.update({
      where: { id: existing.id },
      data,
      select: { id: true },
    });
  }

  return prisma.virInspection.create({
    data,
    select: { id: true },
  });
}

async function resetInspectionArtifacts(inspectionId: string) {
  await prisma.virPhoto.deleteMany({ where: { inspectionId } });
  await prisma.virSignOff.deleteMany({ where: { inspectionId } });
  await prisma.virAnswer.deleteMany({ where: { inspectionId } });
  await prisma.virFinding.deleteMany({ where: { inspectionId } });
}

async function seedInspectionContent(
  inspectionId: string,
  template: TemplateRecord,
  scenario: DemoScenario,
  seedIndex: number,
  isPreviousInspection: boolean
) {
  const flatQuestions = template.sections.flatMap((section) =>
    section.questions.map((question) => ({
      sectionTitle: section.title,
      question,
    }))
  );
  const completeness = completionForStatus(scenario.status);

  for (const [questionIndex, entry] of flatQuestions.entries()) {
    const shouldAnswer =
      entry.question.isMandatory || questionIndex / Math.max(1, flatQuestions.length - 1) <= completeness;

    if (!shouldAnswer) {
      continue;
    }

    const answerPayload = buildAnswerPayload(entry.question, scenario, questionIndex, seedIndex);

    await prisma.virAnswer.create({
      data: {
        inspectionId,
        questionId: entry.question.id,
        ...answerPayload,
        answeredBy: scenario.inspectorName,
        answeredAt: addDays(scenario.inspectionDate, questionIndex % 3),
      },
    });
  }

  const refreshedAnswers = await prisma.virAnswer.findMany({
    where: { inspectionId },
    include: {
      question: {
        include: {
          section: true,
        },
      },
    },
    orderBy: { createdAt: "asc" },
  });

  const evidenceTargets = refreshedAnswers.filter(
    (answer) => answer.question.allowsPhoto && answer.question.referenceImageUrl
  );

  await prisma.virPhoto.create({
    data: {
      inspectionId,
      url: DEMO_EVIDENCE_IMAGES[seedIndex % DEMO_EVIDENCE_IMAGES.length],
      fileName: `inspection-cover-${seedIndex + 1}.svg`,
      contentType: "image/svg+xml",
      fileSizeKb: 24,
      caption: `${scenario.title} cover evidence`,
      uploadedBy: scenario.inspectorName,
      takenAt: scenario.inspectionDate,
    },
  });

  for (const [photoIndex, answer] of evidenceTargets.slice(0, isPreviousInspection ? 3 : 6).entries()) {
    await prisma.virPhoto.create({
      data: {
        inspectionId,
        answerId: answer.id,
        url: DEMO_EVIDENCE_IMAGES[(seedIndex + photoIndex) % DEMO_EVIDENCE_IMAGES.length],
        fileName: `${answer.question.code.toLowerCase()}-${photoIndex + 1}.svg`,
        contentType: "image/svg+xml",
        fileSizeKb: 18 + photoIndex,
        caption: `${answer.question.section.title} evidence image`,
        uploadedBy: scenario.inspectorName,
        takenAt: addDays(scenario.inspectionDate, photoIndex),
      },
    });
  }

  const findingsToCreate = buildFindingSeeds(scenario.templateKey, scenario, seedIndex, isPreviousInspection);

  for (const [findingIndex, findingSeed] of findingsToCreate.entries()) {
    const linkedQuestion = flatQuestions.find((entry) => entry.question.code === findingSeed.questionCode)?.question ?? null;
    const finding = await prisma.virFinding.create({
      data: {
        inspectionId,
        questionId: linkedQuestion?.id,
        findingType: findingSeed.findingType,
        severity: findingSeed.severity,
        status: findingSeed.status,
        title: findingSeed.title,
        description: findingSeed.description,
        ownerName: findingSeed.ownerName,
        dueDate: findingSeed.dueDate,
        vesselResponse: findingSeed.vesselResponse,
        isCarriedOver: findingSeed.isCarriedOver,
        closedAt: findingSeed.status === "CLOSED" ? addDays(scenario.inspectionDate, 5) : null,
      },
    });

    await prisma.virPhoto.create({
      data: {
        inspectionId,
        findingId: finding.id,
        url: DEMO_EVIDENCE_IMAGES[(seedIndex + findingIndex + 2) % DEMO_EVIDENCE_IMAGES.length],
        fileName: `${findingSeed.title.toLowerCase().replace(/[^a-z0-9]+/g, "-")}.svg`,
        contentType: "image/svg+xml",
        fileSizeKb: 22 + findingIndex,
        caption: `${findingSeed.title} evidence`,
        uploadedBy: scenario.inspectorName,
        takenAt: addDays(scenario.inspectionDate, findingIndex + 1),
      },
    });

    if (findingSeed.correctiveAction) {
      await prisma.virCorrectiveAction.create({
        data: {
          findingId: finding.id,
          actionText: findingSeed.correctiveAction,
          ownerName: findingSeed.ownerName,
          targetDate: addDays(scenario.inspectionDate, 14 + findingIndex * 5),
          status: findingSeed.status === "CLOSED" ? "VERIFIED" : findingSeed.status === "READY_FOR_REVIEW" ? "COMPLETED" : "IN_PROGRESS",
          completedAt: findingSeed.status === "CLOSED" ? addDays(scenario.inspectionDate, 4) : null,
          verifiedBy: findingSeed.status === "CLOSED" ? scenario.shoreReviewedBy : null,
          verifiedAt: findingSeed.status === "CLOSED" ? addDays(scenario.inspectionDate, 5) : null,
        },
      });
    }
  }

  await seedSignOffs(inspectionId, scenario);
  await syncInspectionCounters(inspectionId);
}

async function seedSignOffs(inspectionId: string, scenario: DemoScenario) {
  const timestamps = {
    submission: addDays(scenario.inspectionDate, 1),
    review: addDays(scenario.inspectionDate, 2),
    close: addDays(scenario.inspectionDate, 4),
  };

  if (scenario.status === "DRAFT") {
    return;
  }

  await prisma.virSignOff.create({
    data: {
      inspectionId,
      stage: "VESSEL_SUBMISSION",
      approved: true,
      actorName: scenario.inspectorName,
      actorRole: "Inspector",
      comment: "Inspection package submitted for shore visibility.",
      signedAt: timestamps.submission,
    },
  });

  if (scenario.status === "RETURNED") {
    await prisma.virSignOff.create({
      data: {
        inspectionId,
        stage: "SHORE_REVIEW",
        approved: false,
        actorName: scenario.shoreReviewedBy ?? "Office reviewer",
        actorRole: "QHSE Superintendent",
        comment: "Returned for evidence completion and narrative tightening before approval.",
        signedAt: timestamps.review,
      },
    });
    return;
  }

  if (["SUBMITTED", "SHORE_REVIEWED", "CLOSED"].includes(scenario.status)) {
    await prisma.virSignOff.create({
      data: {
        inspectionId,
        stage: "SHORE_REVIEW",
        approved: scenario.status !== "SUBMITTED",
        actorName: scenario.shoreReviewedBy ?? "Office reviewer",
        actorRole: "QHSE Superintendent",
        comment:
          scenario.status === "SUBMITTED"
            ? "Awaiting final office review."
            : "Office review completed and record accepted for closure flow.",
        signedAt: timestamps.review,
      },
    });
  }

  if (scenario.status === "CLOSED") {
    await prisma.virSignOff.create({
      data: {
        inspectionId,
        stage: "FINAL_ACKNOWLEDGEMENT",
        approved: true,
        actorName: scenario.inspectorName,
        actorRole: "Inspector",
        comment: "Final acknowledgement recorded after corrective flow review.",
        signedAt: timestamps.close,
      },
    });
  }
}

async function seedImportSessions(inspectionTypeMap: Map<string, { id: string; code: string; name: string }>) {
  void inspectionTypeMap;
  await prisma.virImportFieldReview.deleteMany({});
  await prisma.virImportSession.deleteMany({});
  return 0;
}

async function clearSeededDemoData(vesselIds: string[]) {
  await prisma.virInspection.updateMany({
    where: {
      vesselId: { in: vesselIds },
      inspectorCompany: "PMSLink Marine Assurance",
    },
    data: {
      previousInspectionId: null,
      importSessionId: null,
    },
  });

  await prisma.virInspection.deleteMany({
    where: {
      vesselId: { in: vesselIds },
      inspectorCompany: "PMSLink Marine Assurance",
    },
  });
}

function buildPreviousScenario(index: number): DemoScenario {
  const templateKey = pickTemplateKey(index + 2);
  const inspectionTypeCode = templateTypeForKey(templateKey);
  const date = buildScenarioDate(index, true);
  const port = DEMO_PORTS[(index + 3) % DEMO_PORTS.length];
  const inspectorName = DEMO_INSPECTORS[(index + 2) % DEMO_INSPECTORS.length];
  const reviewer = DEMO_REVIEWERS[(index + 1) % DEMO_REVIEWERS.length];

  return {
    inspectionTypeCode,
    templateKey,
    title: titleForTemplate(templateKey, true),
    summary: `Historical VIR closed after office review at ${port.port}. Record retained for planner continuity and prior inspection comparison.`,
    status: "CLOSED",
    inspectionDate: date,
    port: port.port,
    country: port.country,
    inspectorName,
    inspectorCompany: "PMSLink Marine Assurance",
    shoreReviewedBy: reviewer,
    shoreReviewDate: addDays(date, 2),
    closedAt: addDays(date, 5),
  };
}

function buildCurrentScenario(index: number): DemoScenario {
  const templateKey = pickTemplateKey(index);
  const inspectionTypeCode = templateTypeForKey(templateKey);
  const date = buildScenarioDate(index, false);
  const port = DEMO_PORTS[index % DEMO_PORTS.length];
  const inspectorName = DEMO_INSPECTORS[index % DEMO_INSPECTORS.length];
  const reviewer = DEMO_REVIEWERS[index % DEMO_REVIEWERS.length];
  const status = currentStatusForIndex(index);

  return {
    inspectionTypeCode,
    templateKey,
    title: titleForTemplate(templateKey, false),
    summary: buildSummaryForScenario(templateKey, port.port, status),
    status,
    inspectionDate: date,
    port: port.port,
    country: port.country,
    inspectorName,
    inspectorCompany: "PMSLink Marine Assurance",
    shoreReviewedBy: ["RETURNED", "SHORE_REVIEWED", "CLOSED"].includes(status) ? reviewer : null,
    shoreReviewDate: ["RETURNED", "SHORE_REVIEWED", "CLOSED"].includes(status) ? addDays(date, 2) : null,
    closedAt: status === "CLOSED" ? addDays(date, 4) : null,
  };
}

function buildScenarioDate(index: number, previous: boolean) {
  const anchor = new Date();
  anchor.setUTCHours(0, 0, 0, 0);

  if (previous) {
    return addDays(anchor, -(220 + ((index * 9) % 160)));
  }

  const offsets = [8, 14, 21, 28, 36, 44, 58, 72, 96, 124];
  return addDays(anchor, -offsets[index % offsets.length]!);
}

function currentStatusForIndex(index: number): VirInspectionStatus {
  const bucket = index % 10;

  if (bucket < 4) {
    return "CLOSED";
  }

  if (bucket < 6) {
    return "SHORE_REVIEWED";
  }

  if (bucket < 8) {
    return "SUBMITTED";
  }

  if (bucket === 8) {
    return "RETURNED";
  }

  return "DRAFT";
}

function buildSummaryForScenario(templateKey: string, port: string, status: VirInspectionStatus) {
  const statusText =
    status === "DRAFT"
      ? "Questionnaire still being compiled by the vessel team."
      : status === "RETURNED"
        ? "Office returned the VIR for evidence and narrative completion."
        : status === "SUBMITTED"
          ? "Package submitted and awaiting office review."
          : status === "SHORE_REVIEWED"
            ? "Office review completed and ready for final closure."
            : "Inspection closed after review, sign-off, and evidence alignment.";

  if (templateKey === "PORT_VIR") {
    return `Port-mode VIR conducted at ${port} to assess terminal interface, cargo readiness, mooring control, and shipboard compliance. ${statusText}`;
  }

  if (templateKey === "REMOTE_VIR") {
    return `Remote navigation assurance run against live bridge records and remote evidence. Focus remained on passage planning, bridge alarms, reporting discipline, and follow-up ownership. ${statusText}`;
  }

  if (templateKey === "TAKEOVER_VIR") {
    return `Takeover VIR used to confirm command handover, certificate transfer, open defect visibility, and continuity of vessel management. ${statusText}`;
  }

  if (templateKey === "ENGINEERING_VIR") {
    return `Engineering-focused VIR covering plant reliability, maintenance backlog, spares readiness, and machinery-space control. ${statusText}`;
  }

  return `Sailing-mode VIR used for vessel condition, bridge readiness, cargo system observations, safety equipment verification, and QHSE follow-up. ${statusText}`;
}

function buildAnswerPayload(question: DemoQuestion, scenario: DemoScenario, questionIndex: number, seedIndex: number) {
  switch (question.responseType) {
    case "YES_NO_NA": {
      const yes = (seedIndex + questionIndex) % 5 !== 0 || scenario.status === "CLOSED";
      return {
        answerText: yes ? "YES" : "NO",
        answerBoolean: yes,
        comment: yes
          ? "Verified during demo inspection walkthrough."
          : "Observation raised for follow-up within the same inspection.",
      };
    }
    case "TEXT":
      return {
        answerText: `${question.code.replaceAll("_", " ")} reviewed during ${inferInspectionMode(scenario.title).toLowerCase()} visit. Follow-up narrative captured for demo readiness.`,
        comment: "Narrative retained in the live questionnaire record.",
      };
    case "NUMBER":
      return {
        answerNumber: ((seedIndex + questionIndex) % 4) + 1,
        comment: "Numeric count captured from the inspection discussion.",
      };
    case "DATE":
      return {
        answerDate: addDays(scenario.inspectionDate, -((seedIndex + questionIndex) % 30) - 1),
        comment: "Date validated during review.",
      };
    case "MULTI_SELECT":
      return {
        selectedOptions: question.options.slice(0, Math.min(2, question.options.length)).map((option) => option.value),
        answerText: question.options.slice(0, Math.min(2, question.options.length)).map((option) => option.label).join(", "),
        comment: "Multiple focus items were selected during the inspection.",
      };
    case "SCORE":
      return {
        answerNumber: 4,
        comment: "Score recorded for management review.",
      };
    case "SINGLE_SELECT":
    default: {
      const choice =
        question.options.find((option) => option.score === 100) ??
        question.options[0] ??
        { value: "SATISFACTORY", label: "Satisfactory" };

      return {
        answerText: choice.value,
        comment: `${choice.label} recorded during the inspection.`,
      };
    }
  }
}

function buildFindingSeeds(templateKey: string, scenario: DemoScenario, seedIndex: number, isPreviousInspection: boolean) {
  if (scenario.status === "DRAFT" && !isPreviousInspection) {
    return [];
  }

  const libraries: Record<
    string,
    Array<{
      questionCode: string;
      findingType: "OBSERVATION" | "NON_CONFORMITY" | "RECOMMENDATION";
      severity: "LOW" | "MEDIUM" | "HIGH";
      title: string;
      description: string;
      ownerName: string;
      correctiveAction?: string;
      vesselResponse: string;
      isCarriedOver?: boolean;
    }>
  > = {
    SAILING_VIR: [
      {
        questionCode: "DECK_001",
        findingType: "OBSERVATION",
        severity: "LOW",
        title: "Mooring winch guard touch-up required",
        description: "Surface coating breakdown noted around the forward mooring winch guard and brake marking zone.",
        ownerName: "Chief Officer",
        correctiveAction: "Prepare surface, apply coating touch-up, and upload close-out photo.",
        vesselResponse: "Touch-up included in next deck work list.",
      },
      {
        questionCode: "ENGINE_001",
        findingType: "NON_CONFORMITY",
        severity: "HIGH",
        title: "Auxiliary plant leakage requires close monitoring",
        description: "Local leakage observed around auxiliary pump gland packing with temporary containment in place.",
        ownerName: "Chief Engineer",
        correctiveAction: "Renew packing and verify leakage trend after retest.",
        vesselResponse: "Spare arranged and rectification planned before next port.",
      },
    ],
    PORT_VIR: [
      {
        questionCode: "PORT_CARGO_001",
        findingType: "OBSERVATION",
        severity: "LOW",
        title: "Cargo manifold drip tray coating breakdown",
        description: "Coating damage observed on the drip tray edge with minor staining around fastening points.",
        ownerName: "Chief Officer",
        correctiveAction: "Clean area, restore coating, and verify manifold housekeeping before next cargo call.",
        vesselResponse: "Area cleaned and touch-up planned during idle time.",
      },
      {
        questionCode: "MOORING_002",
        findingType: "RECOMMENDATION",
        severity: "MEDIUM",
        title: "Mooring trend to be reviewed with berth watch",
        description: "Line tending pattern was acceptable but should be reviewed during heavy traffic or changing weather.",
        ownerName: "Master",
        correctiveAction: "Review mooring briefing and reinforce watch instructions.",
        vesselResponse: "Watch team briefed during the port stay.",
      },
    ],
    REMOTE_VIR: [
      {
        questionCode: "ALARM_001",
        findingType: "OBSERVATION",
        severity: "MEDIUM",
        title: "BNWAS reset timing requires verification",
        description: "Remote review highlighted that BNWAS reset timing should be reconfirmed after software adjustments.",
        ownerName: "Chief Officer",
        correctiveAction: "Verify settings and send bridge evidence back to office.",
        vesselResponse: "Bridge team scheduled settings verification on next watch.",
      },
    ],
    TAKEOVER_VIR: [
      {
        questionCode: "HANDOVER_001",
        findingType: "RECOMMENDATION",
        severity: "MEDIUM",
        title: "Handover note pack needs final countersignature",
        description: "Incoming master requested final closure note against two live handover remarks before full sign-off.",
        ownerName: "Master",
        correctiveAction: "Update handover file and upload countersigned final page.",
        vesselResponse: "Outgoing and incoming masters aligned on pending countersignature.",
        isCarriedOver: true,
      },
    ],
    ENGINEERING_VIR: [
      {
        questionCode: "MAINT_002",
        findingType: "NON_CONFORMITY",
        severity: "HIGH",
        title: "Critical maintenance backlog exceeds agreed tolerance",
        description: "Critical maintenance backlog requires targeted follow-up to avoid reliability exposure on auxiliary machinery.",
        ownerName: "Chief Engineer",
        correctiveAction: "Issue recovery plan for overdue critical jobs and submit to office.",
        vesselResponse: "Chief Engineer prepared backlog recovery actions for review.",
      },
    ],
  };

  const library = libraries[templateKey] ?? [];
  const takeCount = isPreviousInspection ? 1 : scenario.status === "CLOSED" ? 1 : 2;

  return library.slice(0, Math.min(takeCount, library.length)).map((item, index) => ({
    ...item,
    status:
      isPreviousInspection || scenario.status === "CLOSED"
        ? ("CLOSED" as const)
        : scenario.status === "SHORE_REVIEWED"
          ? ("READY_FOR_REVIEW" as const)
          : scenario.status === "RETURNED"
            ? ("IN_PROGRESS" as const)
            : ("OPEN" as const),
    dueDate: addDays(scenario.inspectionDate, 10 + ((seedIndex + index) % 14)),
  }));
}

function buildReferenceNumber(vesselName: string, inspectionDate: Date, sequence: number, suffix: string) {
  const prefix = vesselName
    .split(/\s+/)
    .map((part) => part[0] ?? "")
    .join("")
    .toUpperCase()
    .slice(0, 4)
    .padEnd(4, "X");

  return `VIR/${prefix}/${inspectionDate.getUTCFullYear()}/${String(sequence).padStart(4, "0")}${suffix}`;
}

function buildDemoVessels() {
  const prefixes = ["Aster", "Boreal", "Cobalt", "Drift", "Ember", "Falcon", "Harbor", "Indigo", "Juniper", "Keystone"];
  const suffixes = ["Meridian", "Horizon", "Voyager", "Sentinel", "Crest"];
  const vesselTypes = [
    "CHEM / PROD TANKER",
    "OIL TANKER",
    "LPG CARRIER (REFRI)",
    "LNG CARRIER",
    "ASPHALT / BITUMEN TANKER",
  ];
  const fleets = ["BU - Chennai", "BU - Dubai", "BU - Athens", "BU - Singapore", "BU - London"];
  const flags = ["PANAMA", "MARSHALL ISLANDS", "LIBERIA", "SINGAPORE", "HONG KONG"];

  const vessels: DemoVesselSeed[] = [];
  let counter = 1;

  for (const prefix of prefixes) {
    for (const suffix of suffixes) {
      vessels.push({
        code: `VIR-DEMO-${String(counter).padStart(3, "0")}`,
        name: `${prefix} ${suffix}`,
        imoNumber: `${9700000 + counter}`,
        vesselType: vesselTypes[(counter - 1) % vesselTypes.length],
        fleet: fleets[(counter - 1) % fleets.length],
        flag: flags[(counter - 1) % flags.length],
        manager: "PMSLink Fleet Operations",
      });
      counter += 1;
    }
  }

  return vessels;
}

function pickTemplateKey(index: number) {
  const keys = ["SAILING_VIR", "PORT_VIR", "ENGINEERING_VIR", "REMOTE_VIR", "TAKEOVER_VIR"];
  return keys[index % keys.length]!;
}

function templateTypeForKey(templateKey: string) {
  return TEMPLATE_SEEDS.find((item) => item.key === templateKey)?.inspectionTypeCode ?? "OWNERS_INSPECTION_INTERNAL";
}

function titleForTemplate(templateKey: string, previous: boolean) {
  const suffix = previous ? "Previous" : "Current";

  switch (templateKey) {
    case "PORT_VIR":
      return `Port VIR - Operational Readiness Review / ${suffix}`;
    case "REMOTE_VIR":
      return `Sailing (Remote) VIR - Navigation Assurance / ${suffix}`;
    case "TAKEOVER_VIR":
      return `Port VIR - Master Takeover Review / ${suffix}`;
    case "ENGINEERING_VIR":
      return `Sailing VIR - Engineering Plant Assurance / ${suffix}`;
    case "SAILING_VIR":
    default:
      return `Sailing VIR - Technical Condition Review / ${suffix}`;
  }
}

function inferInspectionMode(title: string) {
  const source = title.toUpperCase();

  if (source.includes("SAILING (REMOTE)")) {
    return "Sailing (Remote)";
  }

  if (source.includes("PORT (REMOTE)")) {
    return "Port (Remote)";
  }

  if (source.includes("PORT")) {
    return "Port";
  }

  return "Sailing";
}

function completionForStatus(status: VirInspectionStatus) {
  void status;
  return 1;
}

function addDays(date: Date, days: number) {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function buildSection(code: string, title: string, guidance: string, questions: VirTemplateImport["sections"][number]["questions"]) {
  return {
    code,
    title,
    guidance,
    questions,
  };
}

function buildQuestion(
  code: string,
  prompt: string,
  responseType: VirTemplateImport["sections"][number]["questions"][number]["responseType"],
  riskLevel: VirTemplateImport["sections"][number]["questions"][number]["riskLevel"],
  isMandatory: boolean,
  referenceImageUrl?: string | null,
  options: VirTemplateImport["sections"][number]["questions"][number]["options"] = []
) {
  return {
    code,
    prompt,
    responseType,
    riskLevel,
    isMandatory,
    allowsObservation: true,
    allowsPhoto: true,
    isCicCandidate: false,
    cicTopic: null,
    helpText: null,
    referenceImageUrl: referenceImageUrl ?? null,
    options,
  };
}

async function safeRunSeed(request: Request) {
  try {
    return await runSeed(request);
  } catch (error) {
    console.error("VIR seed failed", error);

    return NextResponse.json(
      {
        ok: false,
        error: error instanceof Error ? error.message : "Unknown seed error",
      },
      { status: 500 }
    );
  }
}

export const GET = safeRunSeed;
export const POST = safeRunSeed;
