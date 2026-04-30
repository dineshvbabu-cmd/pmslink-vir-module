/**
 * Template seed script — creates 8 SAF-35A through SAF-35H audit templates.
 * Safe to re-run: uses upsert on inspection types and template records.
 * Run: node scripts/seed-templates.mjs
 */

import { PrismaClient } from "@prisma/client";
import { config } from "dotenv";
import { resolve } from "path";
import { fileURLToPath } from "url";

const __dirname = fileURLToPath(new URL(".", import.meta.url));
config({ path: resolve(__dirname, "../.env.local") });
config({ path: resolve(__dirname, "../.env") });

const _prisma = new PrismaClient();

// ─── Shared helpers ──────────────────────────────────────────────────────────

const DYNAMIC_HELP = "Score 1–5. Score ≤ 2 requires written explanation in Remarks. (5 = Excellent / Best Practice, 4 = Good, 3 = Satisfactory, 2 = Poor / Improvement Required, 1 = Unacceptable)";

function q(code, prompt, opts = {}) {
  return {
    code,
    prompt,
    responseType: opts.dynamic ? "SCORE" : "YES_NO_NA",
    isMandatory: opts.mandatory !== false,
    riskLevel: opts.risk ?? "MEDIUM",
    isCicCandidate: opts.cic ?? false,
    helpText: opts.dynamic ? DYNAMIC_HELP : (opts.help ?? null),
    sortOrder: 0, // assigned during insert
  };
}

function sec(code, title, questions) {
  return { code, title, questions };
}

// ─── Template definitions ─────────────────────────────────────────────────────

const TEMPLATES = [

  // ══════════════════════════════════════════════════════════════════════════
  // SAF-35A  ISM Internal Audit
  // ══════════════════════════════════════════════════════════════════════════
  {
    inspectionType: {
      code: "SAF35A_ISM_AUDIT",
      name: "ISM Internal Audit (SAF-35A)",
      category: "INTERNAL",
      description: "Internal ISM Safety Management audit covering SMS documentation, drills, PTW, certificates, environmental records, and ship security. SAF-35A Rev 1 / April 2025.",
    },
    template: {
      name: "SAF-35A ISM Internal Audit",
      version: "Rev1-Apr2025",
      description: "ISM audit checklist — 19 sections covering certificates, documentation, safety, environment, maintenance and ISPS.",
      workflowConfig: { showCertificatesTab: true },
    },
    sections: [
      sec("S01", "1. Opening Meeting & Audit Management", [
        q("1.1", "Was an opening meeting held with the Master and senior officers? Were previous NCs/OBSs from last audit reviewed?", { cic: true }),
        q("1.2", "Have all PSC findings since the last audit been reviewed and closed?", { cic: true, risk: "HIGH" }),
        q("1.3", "Has the last external ISM audit report been reviewed with the ship's officers?"),
        q("1.4", "Is the audit plan/scope communicated to the Master prior to commencement?"),
      ]),
      sec("S02", "2. Statutory & Class Certificates", [
        q("2.1", "Are all statutory certificates valid and onboard? (SMC, DOC, ISSC, Load Line, Safety Construction, Safety Equipment, Safety Radio, IOPP, IAPP, ISPP, NLS, Tonnage, CLC, MLC, Class, CSR, Garbage Management Plan)", { cic: true, risk: "HIGH" }),
        q("2.2", "Are all ancillary/operational certificates current and onboard?", { cic: true }),
        q("2.3", "Is the Class survey status satisfactory with no overdue items?", { risk: "HIGH" }),
        q("2.4", "If an ESP vessel, are Enhanced Survey Programme records up to date?"),
        q("2.5", "Have any vessel modifications been approved by Class? Are drawings updated?"),
      ]),
      sec("S03", "3. Flag State & Crew Certification", [
        q("3.1", "Are all current Flag State notices, directives, and circulars maintained onboard?"),
        q("3.2", "Is the official deck log book maintained correctly with no erasures?"),
        q("3.3", "Are crew articles/employment agreements signed and onboard?"),
        q("3.4", "Are any crew dispensations from Flag State current and appropriately filed?"),
        q("3.5", "Are all crew documents (CoC, medical, STCW endorsements, yellow fever) current and onboard?", { cic: true, risk: "HIGH" }),
        q("3.6", "Is there evidence of BRM/BTM training for navigating officers?"),
        q("3.7", "Is there evidence of ship-handling training for deck officers?"),
        q("3.8", "Do tanker safety certificates and familiarisation records meet STCW requirements?", { risk: "HIGH" }),
        q("3.9", "Is ECDIS type-specific training evidence available for all navigating officers?"),
        q("3.10", "Is a designated Safety Officer appointed and records maintained?"),
      ]),
      sec("S04", "4. SMS Documentation & Manuals", [
        q("4.1", "Are the SMS manuals (SMS, Operations, Environmental) current and accessible?", { cic: true }),
        q("4.2", "Is document control maintained with proper revision records?"),
        q("4.3", "Are company circulars and technical bulletins received, read, and filed?"),
        q("4.4", "Is the Master aware of the latest company policy updates and DPA contact details?"),
        q("4.5", "Are DPA contact details posted at an accessible location on the bridge?"),
        q("4.6", "Are all required plans/manuals onboard? (SOPEP, VRP, GMP, BCM, CSP, CMP, Anchoring, Fire Control Plans, Muster List, Emergency Response, MAS Contact, Damage Control)", { cic: true }),
        q("4.7", "Is the SOPEP kit fully stocked and location marked?", { risk: "HIGH" }),
        q("4.8", "Is the Marine Fuel Sulphur Record Book maintained as required?"),
        q("4.9", "Are VGP records maintained for US trading? (N/A if no US calls)"),
        q("4.10", "Are EU MRV monitoring and reporting records maintained? (N/A if no EU calls)"),
      ]),
      sec("S05", "5. Safety Management — Records & Reporting", [
        q("5.1", "Has an internal audit been conducted within the required interval and findings addressed?", { cic: true }),
        q("5.2", "Are near-miss/hazardous occurrence reports submitted and lessons shared?", { cic: true }),
        q("5.3", "Are Safety Committee meeting minutes maintained and actions closed?"),
        q("5.4", "Are VIR (Vessel Inspection Report) records maintained from previous inspections?"),
        q("5.5", "Has the Master's Review been conducted within the required period?"),
        q("5.6", "Are fleet lessons/safety flashes received, read, acknowledged, and filed?"),
        q("5.7", "Are housekeeping inspection records maintained monthly?"),
        q("5.8", "Is the emergency notification tree tested and contacts current?"),
        q("5.9", "Is the vessel enrolled in AMVER and reports submitted regularly?"),
      ]),
      sec("S06", "6. Drug & Alcohol Policy", [
        q("6.1", "Is an alcohol sales record maintained (nil or quantities sold)?"),
        q("6.2", "Are monthly random drug and alcohol tests conducted with records maintained?", { cic: true, risk: "HIGH" }),
        q("6.3", "Have annual shore-side D&A tests been conducted with results filed?"),
        q("6.4", "Are procedures in place for positive test results and MRO referrals?"),
        q("6.5", "Is an emergency D&A test kit onboard and accessible?"),
        q("6.6", "Are baggage search records maintained per company policy?"),
      ]),
      sec("S07", "7. Rest Hours & Fatigue Management", [
        q("7.1", "Is approved rest hour software (ISF Watchkeeper or equivalent) installed and in use?", { cic: true }),
        q("7.2", "Are rest hour records reviewed monthly by Master and no violations identified? (Spot-check 3 crew)", { cic: true, risk: "HIGH" }),
        q("7.3", "Are watch schedules configured to minimise fatigue in port and at sea?"),
        q("7.4", "Are rest hours compliant with MLC A2.3 minimum requirements (10 hrs rest/24 hrs; 77 hrs rest/7 days)?", { risk: "HIGH" }),
      ]),
      sec("S08", "8. Crew Training & Familiarisation", [
        q("8.1", "Are new joiner familiarisation records completed within 24 hours of joining?", { cic: true }),
        q("8.2", "Are officer familiarisation records (critical tasks) completed within required timeframe?"),
        q("8.3", "Is the TMS (Training Management System) up to date with no overdue items?"),
        q("8.4", "Are cadet training records and assessments maintained as required?"),
        q("8.5", "Are command/departmental handover checklists completed for all rank changes?"),
        q("8.6", "Are crew appraisals conducted and filed within required intervals?"),
      ]),
      sec("S09", "9. Contingency Management & Drills", [
        q("9.1", "Were drills witnessed during the audit (fire, abandon ship, or other emergency)?", { cic: true }),
        q("9.2", "Are drill minutes maintained with dates, participants, and deficiencies noted?"),
        q("9.3", "Are LSA/FFA training elements included in relevant drills?"),
        q("9.4", "Are muster lists current, posted, and crew familiar with their duties?"),
        q("9.5", "Are all required drills conducted at correct intervals? (Abandon ship, Fire, GMDSS, Oil spill, Man Overboard, Enclosed Space, Rescue Boat, Emergency Steering, Pilot boarding)", { cic: true }),
        q("9.6", "Are emergency notification drills (DPA/office) conducted and recorded?"),
        q("9.7", "Is emergency steering exercised and records maintained monthly?"),
        q("9.8", "Is an Enclosed Space Entry drill conducted and signed off within the required period?"),
        q("9.9", "Is rescue equipment (stretcher, immersion suits, SART) accessible and serviceable?"),
        q("9.10", "Is a port watch established in accordance with company requirements?"),
      ]),
      sec("S10", "10. Permit to Work System", [
        q("10.1", "Is the PTW system in use for all required activities? (Hot work, Enclosed Space, Working at Height, Work on Electrical, Lockout/Tagout, Diving, Cold Work, Override/Bypass, Night Work)", { cic: true, risk: "HIGH" }),
        q("10.2", "Are toolbox meeting records and JHA (Job Hazard Analysis) completed before high-risk tasks?", { cic: true }),
        q("10.3", "Are ESE (Enclosed Space Entry) permits verified with gas tests prior to entry? (Spot-check recent permits)", { risk: "HIGH" }),
        q("10.4", "Are personal gas detectors onboard, calibrated, and issued for enclosed space work?", { risk: "HIGH" }),
        q("10.5", "Are gas detector calibration records maintained with shore calibration evidence?"),
      ]),
      sec("S11", "11. External Areas — Access, Structure & Deck", [
        q("11.1", "Is the gangway rigged safely with net, man-ropes, and lighting as required?", { cic: true }),
        q("11.2", "Is the accommodation ladder in good condition with safety net rigged?"),
        q("11.3", "Is the pilot ladder in good condition, correctly rigged, and within service life?", { cic: true }),
        q("11.4", "Are hull markings (load line, draught, IMO number) visible and correct?"),
        q("11.5", "Is watertight integrity maintained? (Hatches, vents, doors, portholes, cofferdam drainage, manholes, chain lockers, scuppers)", { risk: "HIGH" }),
        q("11.6", "Are cargo and vapour pipelines/manifolds in good condition with no drips or leaks?", { cic: true }),
        q("11.7", "Is oxy-acetylene equipment stored, secured, and segregated correctly?"),
        q("11.8", "Are chemical products stored in approved locations with MSDS/SDS available?"),
        q("11.9", "Are IMO hazard symbols and placards correctly posted throughout the vessel?"),
        q("11.10", "Is appropriate PPE available and worn by crew in designated areas?", { cic: true }),
        q("11.11", "Are mooring lines in good condition and snap-back zones clearly marked?", { cic: true }),
        q("11.12", "Are deck areas, alleyways, and walkways clean, non-slip, and free of obstructions?"),
      ]),
      sec("S12", "12. Life Saving Appliances (LSA)", [
        q("12.1", "Are donning instructions posted at all lifejacket stowage locations?"),
        q("12.2", "Are lifeboats and rescue boats in good condition with all equipment onboard? (Weekly inspection, annual servicing, hydrostatic releases in date, painter lines, skates/rails greased, fuel quantity, engine start)", { cic: true, risk: "HIGH" }),
        q("12.3", "Are lifeboat/rescue boat launching appliances (LTAs) serviced within annual period?", { risk: "HIGH" }),
        q("12.4", "Are liferafts in date with hydrostatic releases current? (Painter lines, stowage, SOLAS pack)", { risk: "HIGH" }),
        q("12.5", "Are lifebuoys positioned correctly with self-igniting lights and smoke signals in date?"),
        q("12.6", "Are lifejackets in good condition, correctly stowed, and serviceable including lights?", { cic: true }),
      ]),
      sec("S13", "13. Fire Fighting Appliances (FFA)", [
        q("13.1", "Are fire control plans posted and the portable set current?", { cic: true }),
        q("13.2", "Are fire dampers in working order and records of testing maintained?"),
        q("13.3", "Are fireman's outfits complete and properly stowed with EEBD?", { cic: true }),
        q("13.4", "Are EEBDs within service life and correctly mounted in designated locations?", { risk: "HIGH" }),
        q("13.5", "Is the main fire line pressurised and all outlets/hoses in good condition? (Pump tests, international shore connection)", { cic: true }),
        q("13.6", "Is the emergency fire pump operable and tested monthly? (Suction, fuel, starting procedures)", { risk: "HIGH" }),
        q("13.7", "Are portable fire extinguishers within annual service period and no damage noted?", { cic: true }),
        q("13.8", "Are quick-closing valves for oil tanks operational and fire detection systems functional?"),
        q("13.9", "Are fire doors self-closing and escape routes clearly marked and free of obstruction?"),
        q("13.10", "Is the CO2 fixed system in good condition with correct charge levels? (Pilot/main cylinders, alarms, signage)", { risk: "HIGH" }),
        q("13.11", "Is the emergency generator tested weekly and records maintained?"),
        q("13.12", "Are decontamination showers operable and clearly marked?"),
      ]),
      sec("S14", "14. Accommodation — Galley, Hospital & Welfare", [
        q("14.1", "Is the galley maintained in a hygienic condition with no pest signs or improper food storage?", { cic: true }),
        q("14.2", "Is garbage management conducted per the Garbage Management Plan with GRB maintained?", { risk: "HIGH" }),
        q("14.3", "Is the hospital equipped as required? (Medicines, medical equipment, stretcher, resuscitator, oxygen, expiry dates, medical log, signed prescriptions)", { cic: true }),
        q("14.4", "Are MSDS/SDS available for all hazardous products onboard?"),
        q("14.5", "Are SOLAS Training Manuals available in working language for all crew?"),
        q("14.6", "Are accommodation ventilation fans and intakes operational and filters clean?"),
      ]),
      sec("S15", "15. Oil Record Books & Environmental Records", [
        q("15.1", "Is ORB Part I (Machinery Space) maintained correctly with no blank spaces? (OWS operations, bilge transfers, sludge disposal, incinerator use, shore reception)", { cic: true, risk: "HIGH" }),
        q("15.2", "Is ORB Part II (Cargo/Ballast) maintained correctly? (N/A non-tankers) (Loading, internal transfers, discharge, COW, ballast operations, tank cleaning, slops)", { cic: true, risk: "HIGH" }),
        q("15.3", "Is the Cargo Record Book (CRB) maintained correctly? (N/A non-chemical tankers)", { risk: "HIGH" }),
        q("15.4", "Is the Garbage Record Book (GRB) maintained with all entries signed?", { risk: "HIGH" }),
        q("15.5", "Are SEEMP, CII rating, and related energy efficiency records maintained? (Parts 1, 2, 3 of SEEMP; EU MRV if applicable; IMO DCS/DOC)", { cic: true }),
      ]),
      sec("S16", "16. Maintenance, PMS & Purchasing", [
        q("16.1", "Is the PMS (Planned Maintenance System) up to date with no overdue critical items?", { cic: true }),
        q("16.2", "Are all postponed maintenance items approved and tracked with target dates?"),
        q("16.3", "Is critical equipment identified and subject to enhanced maintenance tracking?", { risk: "HIGH" }),
        q("16.4", "Are mooring and lifting equipment records (SWL certificates, inspections) maintained? (Winches, wires, shackles, chains, cranes, davits, hooks)", { cic: true }),
        q("16.5", "Is the purchasing/requisition system functioning with proper approval processes?"),
        q("16.6", "Is a defect register maintained and reported to office with root cause analysis?"),
      ]),
      sec("S17", "17. Crew Awareness & Safe Practices", [
        q("17.1", "Is the working language established and can crew communicate effectively in an emergency?"),
        q("17.2", "Are crew aware of company's key policies? (D&A, Fatigue, Bullying/Harassment, No-Smoking, Environmental, Security, Cyber) — Spot-check 25% of crew", { cic: true }),
        q("17.3", "Are crew observed wearing correct PPE in relevant areas during the inspection?", { cic: true }),
        q("17.4", "Can crew demonstrate operation of emergency equipment assigned to them?"),
        q("17.5", "Can crew explain ESE rescue procedures and the rescue equipment location?"),
      ]),
      sec("S18", "18. Bunkering Safety", [
        q("18.1", "Are line diagrams and valve checklists for bunkering available and current?", { cic: true }),
        q("18.2", "Have all bunker lines been pressure-tested within the required period?"),
        q("18.3", "Is a pre-bunkering safety meeting conducted and recorded before each bunkering?", { cic: true }),
        q("18.4", "Is the bunker checklist (ship/shore safety checklist) completed before transfer commences?", { cic: true }),
        q("18.5", "Are high-level alarms and overflow systems tested and functional?", { risk: "HIGH" }),
        q("18.6", "Are bunker samples taken, sealed, and retained per MARPOL requirements?", { cic: true, risk: "HIGH" }),
        q("18.7", "Is H2S/Benzene monitoring carried out during bunkering of relevant fuel types?"),
        q("18.8", "Are lube oil analysis samples submitted on schedule with results reviewed?"),
        q("18.9", "Has a SIMOPS Risk Assessment been conducted where concurrent operations occur?"),
      ]),
      sec("S19", "19. ISPS / Ship Security", [
        q("19.1", "Is the ISSC valid and onboard?", { risk: "HIGH" }),
        q("19.2", "Is the SSP onboard, restricted access, and reviewed within the 5-year period?", { cic: true, risk: "HIGH" }),
        q("19.3", "Has the SSO completed required training and is aware of security responsibilities?"),
        q("19.4", "Is the current security level posted and crew informed?"),
        q("19.5", "Are security drills conducted quarterly and records maintained?"),
        q("19.6", "Is access control enforced — visitor log, crew ID checks, restricted area compliance?", { cic: true }),
        q("19.7", "Is AIS operating correctly and SSAS tested within the required period?"),
        q("19.8", "Are Declaration of Security (DoS) records maintained when required?"),
      ]),
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SAF-35B  Navigation Audit
  // ══════════════════════════════════════════════════════════════════════════
  {
    inspectionType: {
      code: "SAF35B_NAV_AUDIT",
      name: "Navigation Audit (SAF-35B)",
      category: "INTERNAL",
      description: "Internal navigation audit — static documentary checks plus dynamic scored assessment of navigational watchkeeping, ECDIS, passage planning, pilotage and anchoring. SAF-35B Rev 0 / April 2025.",
    },
    template: {
      name: "SAF-35B Navigation Audit",
      version: "Rev0-Apr2025",
      description: "Navigation audit checklist — static (35 items) and dynamic scored (45 items) across bridge procedures, passage planning, charts, equipment, and watchkeeping performance.",
    },
    sections: [
      // ── Static ──
      sec("S01", "1. Policy, Procedures & Standing Orders [Static]", [
        q("1.1", "Is the Navigation Manual / Bridge Procedures Guide available and current?", { cic: true }),
        q("1.2", "Are Master's Standing Orders posted and signed by all navigating officers?", { cic: true }),
        q("1.3", "Are Night Orders written and signed by OOW at commencement of each watch?"),
        q("1.4", "Is the Primary Duty / No-Distraction Policy posted on the bridge?"),
        q("1.5", "Is the UKC and Air Draft policy documented and understood by officers? (Coastal, harbour, restricted visibility, bad weather limits)", { cic: true }),
        q("1.6", "Is a Restricted Visibility Policy in place covering speed, lookout, and whistle?"),
        q("1.7", "Are pre-departure/pre-arrival equipment test checklists completed?"),
        q("1.8", "Are anchoring procedures documented (owner's approval, anchor plan, chain scope tables)?", { cic: true }),
        q("1.9", "Are bridge manning levels documented and complied with?"),
        q("1.10", "Is the Deck Log Book maintained correctly with no blanks or erasures?"),
        q("1.11", "Are bridge familiarisation records completed for all navigating officers?"),
        q("1.12", "Are handover notes between OOWs maintained at watch changeover?"),
      ]),
      sec("S02", "2. Passage Planning [Static]", [
        q("2.1", "Are passage plans prepared berth-to-berth and on file for current voyage?", { cic: true }),
        q("2.2", "Are ECDIS safety settings appropriate? (Safety contour, safety depth, shallow water, anti-grounding alarms, route monitoring, sector alarms, display settings)", { cic: true, risk: "HIGH" }),
        q("2.3", "Does the passage plan include all required elements? (Course, waypoints, UKC, abort points, tidal data, reporting points, hazards, weather contingencies, alternative ports, pre-arrival checks, pilot boarding, NAVTEX reception areas)", { cic: true }),
        q("2.4", "Are NAVTEX and navigational warnings checked and acknowledged on the passage plan?"),
        q("2.5", "Is a Master-Pilot Exchange (MPX) form completed before pilot embarkation?", { cic: true }),
        q("2.6", "Is a passage debrief conducted at voyage end with lessons recorded?"),
      ]),
      sec("S03", "3. Charts & Publications [Static]", [
        q("3.1", "Are largest-scale charts in use for all areas of intended navigation?", { cic: true, risk: "HIGH" }),
        q("3.2", "Are paper charts corrected with NTM to the latest available edition?"),
        q("3.3", "Are ECDIS ENCs/RNCs updated within the required frequency?", { cic: true }),
        q("3.4", "Are T&P (Temporary and Preliminary) notices applied to relevant charts?"),
        q("3.5", "Are required publications onboard and current? (ALRS, Sailing Directions, List of Lights, Tidal Atlas, IMO Collision Regs, IAMSAR, MCA/FLAG MSN, Meteorological, etc.)", { cic: true }),
        q("3.6", "Is the publications list maintained and checked against onboard inventory?"),
        q("3.7", "Is a backup available for all digital publications?"),
      ]),
      sec("S04", "4. Navigational Equipment [Static]", [
        q("4.1", "Is a Bridge Equipment Status Book maintained with all deficiencies recorded?"),
        q("4.2", "Is the BNWAS operational with correct settings and records maintained?", { cic: true }),
        q("4.3", "Is the gyro compass operational and deviation records maintained?"),
        q("4.4", "Is the magnetic compass adjusted and deviation cards current?"),
        q("4.5", "Are autopilot, radars, GPS, and GNSS operational with functional testing records?"),
        q("4.6", "Are echo sounder, course recorder, and celestial navigation capability available?"),
        q("4.7", "Are navigation lights and sound signals functional with records of testing?"),
        q("4.8", "Is AIS operational with correct vessel data and VDR/SVDR in good working order?", { cic: true }),
        q("4.9", "Are rudder angle indicators and engine RPM indicators operational?"),
        q("4.10", "Are weather fax and LRIT system operational with position records maintained?"),
        q("4.11", "Is ECDIS operational and meets requirements? (Back-up ECDIS, power supply, sensor inputs, chart updating procedure, audit trail, alarm settings, training records for each officer)", { cic: true, risk: "HIGH" }),
        q("4.12", "Is GMDSS radio log maintained daily and test results recorded?", { cic: true }),
        q("4.13", "Are GMDSS batteries and battery chargers tested and within service life?"),
        q("4.14", "Are EPIRB and SART registered and within hydrostatic release/battery dates?", { risk: "HIGH" }),
        q("4.15", "Are familiarisation records for navigational equipment available for all officers?"),
      ]),
      sec("S05", "5. Verification of Navigational Standards [Static]", [
        q("5.1", "Is the Monthly Navigation Verification Checklist completed and filed?"),
        q("5.2", "Is owner/charterer anchor permission obtained before anchoring in new ports?"),
        q("5.3", "Are cadets not used as sole lookout — are they always under direct OOW supervision?"),
        q("5.4", "Is a helmsman relieved and safe handover confirmed before each watch change?"),
        q("5.5", "Are pre-arrival and pre-departure bridge equipment tests completed and recorded?"),
        q("5.6", "Is navigational equipment included in the PMS with maintenance records current?"),
      ]),
      // ── Dynamic ──
      sec("D01", "1. Professional Knowledge & Company Procedure Familiarity [Dynamic]", [
        q("D1.1", "Officer's knowledge of the Navigation Manual, Master's Standing Orders, and company navigation policies", { dynamic: true, cic: true }),
        q("D1.2", "Familiarity with UKC policy, abort points, and contingency plans for the current voyage", { dynamic: true, cic: true }),
        q("D1.3", "Knowledge of Flag State requirements for watchkeeping, lookout, and reporting", { dynamic: true }),
        q("D1.4", "Familiarity with emergency procedures: Man Overboard, grounding, collision response", { dynamic: true, risk: "HIGH" }),
        q("D1.5", "Understanding of COLREGS — give-way/stand-on vessels, restricted visibility signals, narrow channels", { dynamic: true, cic: true }),
        q("D1.6", "Knowledge of the voyage passage plan including abort points and alteration positions", { dynamic: true, cic: true }),
        q("D1.7", "Understanding of TRS (Tropical Revolving Storm) indicators and avoidance procedures", { dynamic: true }),
        q("D1.8", "Awareness of environmental protection requirements: MARPOL, garbage management, sewage", { dynamic: true }),
        q("D1.9", "Knowledge of AIS transponder requirements, data accuracy checks, and MOU requirements", { dynamic: true }),
        q("D1.10", "Ability to conduct celestial observation and use publications as backup to electronic aids", { dynamic: true }),
        q("D1.11", "Familiarity with VDR/SVDR purpose, data retention, and incident reporting procedure", { dynamic: true }),
        q("D1.12", "Understanding of ISPS security requirements at the bridge (access control, security level)", { dynamic: true }),
      ]),
      sec("D02", "2. Bridge Team Organisation & BTM [Dynamic]", [
        q("D2.1", "Is the bridge team clearly organised with defined roles during critical operations?", { dynamic: true, cic: true }),
        q("D2.2", "Is communication between bridge team members clear, assertive, and closed-loop?", { dynamic: true, cic: true }),
        q("D2.3", "Is the workload distributed effectively among team members during manoeuvring?", { dynamic: true }),
        q("D2.4", "Is a two-person bridge watch maintained in high-traffic or restricted areas?", { dynamic: true }),
        q("D2.5", "Is situational awareness maintained — are all team members tracking vessel position?", { dynamic: true, cic: true, risk: "HIGH" }),
        q("D2.6", "Is the Master's authority respected while officers actively contribute to decisions?", { dynamic: true }),
        q("D2.7", "Is cross-checking between ECDIS, radar, and visual observation routinely practised?", { dynamic: true }),
        q("D2.8", "Are potential conflicts or concerns raised by junior officers in a timely manner?", { dynamic: true }),
        q("D2.9", "Overall BTM standard and team effectiveness", { dynamic: true, cic: true }),
      ]),
      sec("D03", "3. Duties of the OOW [Dynamic]", [
        q("D3.1", "Does the OOW maintain an effective lookout by sight, hearing, and all available means?", { dynamic: true, cic: true }),
        q("D3.2", "Does the OOW correctly use radar and ARPA to assess collision risk at appropriate range?", { dynamic: true, cic: true }),
        q("D3.3", "Does the OOW know when to call the Master as per company requirements?", { dynamic: true }),
        q("D3.4", "Does the OOW monitor vessel position at regular intervals using multiple methods?", { dynamic: true, cic: true }),
        q("D3.5", "Does the OOW take timely action and avoid close-quarter situations?", { dynamic: true, risk: "HIGH" }),
        q("D3.6", "Does the OOW record all events, alterations, and contacts in the deck log?"),
        q("D3.7", "Does the OOW brief relief thoroughly at watch changeover (course, speed, traffic, weather)?", { dynamic: true }),
      ]),
      sec("D04", "4. General Navigation Practices & Passage Plan Execution [Dynamic]", [
        q("D4.1", "Is the vessel tracking the approved passage plan with no unauthorised deviations?", { dynamic: true, cic: true }),
        q("D4.2", "Are chart corrections and NAVTEX/NavArea warnings reviewed before each watch?", { dynamic: true }),
        q("D4.3", "Are position fixes taken at appropriate frequency for the area of navigation?", { dynamic: true, cic: true }),
        q("D4.4", "Is the passage debriefed and lessons fed forward to the next voyage?", { dynamic: true }),
        q("D4.5", "Are speed and course adjustments made within the approved passage plan limits?", { dynamic: true }),
        q("D4.6", "Is voyage data recorded fully and accurately in logs (deck, bell, speed)?", { dynamic: true }),
        q("D4.7", "Are anchor watch procedures followed including regular position check intervals?", { dynamic: true }),
        q("D4.8", "Is UKC monitored and action taken when approaching minimum limit?", { dynamic: true, risk: "HIGH" }),
        q("D4.9", "Are weather forecasts used effectively in voyage planning and execution?", { dynamic: true }),
        q("D4.10", "Are manoeuvring characteristics known and used in conning the vessel?", { dynamic: true }),
        q("D4.11", "Is the autopilot engagement/disengagement managed correctly in different areas?", { dynamic: true }),
        q("D4.12", "Overall quality of navigation practices during the audit period", { dynamic: true, cic: true }),
      ]),
      sec("D05", "5. ECDIS & Bridge Equipment Operational Use [Dynamic]", [
        q("D5.1", "Is the ECDIS primary display used correctly with proper safety settings active?", { dynamic: true, cic: true }),
        q("D5.2", "Is the backup ECDIS or paper chart system ready for immediate use?", { dynamic: true }),
        q("D5.3", "Is radar set to appropriate range and mode for prevailing conditions?", { dynamic: true }),
        q("D5.4", "Are ARPA/AIS targets being tracked and CPA/TCPA assessed correctly?", { dynamic: true, cic: true }),
        q("D5.5", "Is VHF communications maintained on required channels?", { dynamic: true }),
        q("D5.6", "Is ECDIS route monitoring alarm acknowledged appropriately — not silenced indefinitely?", { dynamic: true, risk: "HIGH" }),
        q("D5.7", "Officer ability to demonstrate use of ECDIS backup and contingency procedure", { dynamic: true }),
      ]),
      sec("D06", "6. Coastal Waters Navigation [Dynamic]", [
        q("D6.1", "Is the vessel navigating within the planned track with appropriate margins?", { dynamic: true, cic: true }),
        q("D6.2", "Is the bridge fully manned during coastal transit as per company policy?", { dynamic: true }),
        q("D6.3", "Is VTS communication maintained where required?", { dynamic: true }),
        q("D6.4", "Are traffic separation scheme rules followed correctly?", { dynamic: true }),
        q("D6.5", "Is speed reduced in sensitive areas (TSS, ICW, restricted visibility) as required?", { dynamic: true }),
      ]),
      sec("D07", "7. Pilotage [Dynamic]", [
        q("D7.1", "Is a Pilot Card prepared and provided to the Pilot upon embarkation?", { dynamic: true, cic: true }),
        q("D7.2", "Is the Master-Pilot Exchange conducted formally before the pilot takes the con?", { dynamic: true, cic: true }),
        q("D7.3", "Does the Master maintain conning responsibilities and monitor the pilot's actions?", { dynamic: true, cic: true }),
        q("D7.4", "Is the bridge team fully alert and positions maintained during pilotage?", { dynamic: true }),
        q("D7.5", "Are mooring stations manned in advance with communication tested?", { dynamic: true }),
        q("D7.6", "Is the company's pilot challenge/check procedure applied during the voyage?", { dynamic: true }),
      ]),
      sec("D08", "8. Anchoring & Anchor Watch [Dynamic]", [
        q("D8.1", "Is the anchoring position selected with appropriate UKC, swinging room, and holding ground?", { dynamic: true, cic: true }),
        q("D8.2", "Is anchor watch maintained with regular position checks and bearings taken?", { dynamic: true, cic: true }),
        q("D8.3", "Is the anchor dragging checklist completed and actions defined for dragging?", { dynamic: true }),
        q("D8.4", "Is engine readiness maintained at anchor as per company requirements?", { dynamic: true }),
        q("D8.5", "Are anchor lights, shapes, and sound signals displayed correctly?", { dynamic: true }),
      ]),
      sec("D09", "9. Berthing/Unberthing & Mooring Station Safety Culture [Dynamic]", [
        q("D9.1", "Is the mooring team briefed before operations with snap-back zones communicated?", { dynamic: true, cic: true }),
        q("D9.2", "Is PPE correctly worn by all personnel at mooring stations?", { dynamic: true }),
        q("D9.3", "Is the mooring operation supervised by a qualified officer on the forecastle and poop?", { dynamic: true }),
        q("D9.4", "Is communication between bridge and mooring stations effective during berthing?", { dynamic: true, cic: true }),
      ]),
      sec("D10", "10. Night Navigation & Soft Skills / BTM Assessment [Dynamic]", [
        q("D10.1", "Is night order compliance verified — are bridge lights dimmed and red-light adaptation maintained?", { dynamic: true }),
        q("D10.2", "Is the officer alert and proactive, not passive or over-relying on alarms?", { dynamic: true, cic: true }),
        q("D10.3", "Is commercial/schedule pressure resisted — does the officer prioritise safety?", { dynamic: true, cic: true }),
        q("D10.4", "Is watchkeeping quality consistent across all officers observed?", { dynamic: true }),
        q("D10.5", "Overall bridge management and navigational standard for the vessel", { dynamic: true, cic: true }),
      ]),
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SAF-35C  ISPS Security Audit
  // ══════════════════════════════════════════════════════════════════════════
  {
    inspectionType: {
      code: "SAF35C_ISPS_AUDIT",
      name: "ISPS Security Audit (SAF-35C)",
      category: "INTERNAL",
      description: "Internal ISPS Code audit covering certificates, SSP, access control, drills, cybersecurity, and HRA procedures. SAF-35C Rev 0 / April 2025.",
    },
    template: {
      name: "SAF-35C ISPS Security Audit",
      version: "Rev0-Apr2025",
      description: "ISPS security audit — 7 sections, 26 items covering ISPS Part A/B, SOLAS XI-2, and cyber risk management.",
    },
    sections: [
      sec("S01", "1. ISPS Certificates & Documentation", [
        q("1.1", "Is the ISSC valid and onboard with no expiry within 3 months?", { cic: true, risk: "HIGH" }),
        q("1.2", "Is the Ship Security Plan (SSP) onboard in restricted access location and reviewed within 5-year cycle?", { cic: true, risk: "HIGH" }),
        q("1.3", "Have SSP amendments been approved by Flag State and recorded?"),
        q("1.4", "Are the required security records maintained? (Access control logs, threat reports, drill records, DoS, security surveys, Security Officer training, shore leave)", { cic: true }),
        q("1.5", "Has the internal security audit been completed within the required period?"),
      ]),
      sec("S02", "2. Ship Security Officer (SSO)", [
        q("2.1", "Is the SSO designated in writing with an approved security training certificate?", { cic: true }),
        q("2.2", "Is the SSO aware of SSP responsibilities? (Threat monitoring, restricted area management, SSAS, reporting, crew training, shore liaison, emergency procedures)", { cic: true }),
        q("2.3", "Are CSO (Company Security Officer) contact details posted and current?"),
      ]),
      sec("S03", "3. Security Levels & Operations", [
        q("3.1", "Is the current security level posted, crew informed, and measures implemented?", { cic: true }),
        q("3.2", "Are Security Level 2 and 3 procedures documented and crew trained on escalation actions?"),
        q("3.3", "Is the SSAS tested annually with Flag State notification? Records maintained?", { cic: true }),
        q("3.4", "Is the Master's overriding authority for security decisions clearly documented?"),
        q("3.5", "Are Declaration of Security (DoS) records maintained when required and correctly completed?"),
      ]),
      sec("S04", "4. Access Control & Monitoring", [
        q("4.1", "Is access to the vessel controlled at all access points with a gangway watch posted?", { cic: true }),
        q("4.2", "Are visitor/shore personnel identities checked and logged?"),
        q("4.3", "Are ship's stores and provisions verified before embarkation?"),
        q("4.4", "Are restricted areas clearly marked and access controlled?"),
        q("4.5", "Is AIS operating correctly with accurate position data transmitted?"),
      ]),
      sec("S05", "5. Security Drills, Exercises & Training", [
        q("5.1", "Are security drills conducted at least quarterly and records maintained?", { cic: true }),
        q("5.2", "Have all crew completed basic security training (STCW A-VI/6-1)?", { risk: "HIGH" }),
        q("5.3", "Has an annual security exercise involving CSO been conducted?"),
        q("5.4", "Are baggage searches conducted in line with company policy and records maintained?"),
      ]),
      sec("S06", "6. Security Threats & Reporting", [
        q("6.1", "Are procedures for responding to and reporting security threats documented and tested?"),
        q("6.2", "Are HRA/BMP5 procedures in place and crew briefed prior to HRA transits? (N/A if not HRA trading)"),
        q("6.3", "Is a Citadel/Safe Muster Point plan in place and practised? (N/A if not HRA trading)"),
        q("6.4", "Are security incident reporting channels (SSAS, Flag, MSCHOA) understood and accessible?"),
      ]),
      sec("S07", "7. Cybersecurity (IMO MSC.428(98))", [
        q("7.1", "Is cyber risk management incorporated in the SMS/ISM system?", { cic: true }),
        q("7.2", "Have shipboard systems and potential cyber vulnerabilities been identified and documented?"),
        q("7.3", "Are protective measures in place and crew trained on cybersecurity awareness?", { cic: true }),
        q("7.4", "Are cyber incident response procedures documented with backup/recovery procedures?"),
      ]),
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SAF-35D  MLC Compliance Audit
  // ══════════════════════════════════════════════════════════════════════════
  {
    inspectionType: {
      code: "SAF35D_MLC_AUDIT",
      name: "MLC Compliance Audit (SAF-35D)",
      category: "INTERNAL",
      description: "Internal MLC 2006 compliance audit covering seafarer employment, accommodation, health, and enforcement. SAF-35D Rev 0 / April 2025.",
    },
    template: {
      name: "SAF-35D MLC Compliance Audit",
      version: "Rev0-Apr2025",
      description: "MLC audit — 5 Titles, 26 items. References MLC 2006 Regulations and Standards.",
    },
    sections: [
      sec("S01", "Title 1 — Minimum Requirements for Seafarers", [
        q("1.1", "Are all seafarers aged 16 or above? No seafarers under 16 onboard?", { cic: true, risk: "HIGH" }),
        q("1.2", "Do all seafarers hold current medical fitness certificates (ENG1 or equivalent)?", { cic: true, risk: "HIGH" }),
        q("1.3", "Do all seafarers hold required qualifications and Certificates of Competency?", { cic: true, risk: "HIGH" }),
        q("1.4", "Have all seafarers completed basic safety training as required by STCW?"),
        q("1.5", "Is a copy of the MLC 2006 available onboard in the working language?"),
      ]),
      sec("S02", "Title 2 — Conditions of Employment", [
        q("2.1", "Does each seafarer have a signed Seafarer Employment Agreement (SEA/crew contract)?", { cic: true }),
        q("2.2", "Is the applicable Collective Bargaining Agreement (CBA) available onboard?"),
        q("2.3", "Can the seafarers demonstrate understanding of their SEA terms and conditions?"),
        q("2.4", "Are wage records and pay slips maintained and provided to seafarers monthly?", { cic: true }),
        q("2.5", "Are allotment arrangements documented and authorised by each seafarer?"),
        q("2.6", "Are work and rest hour records maintained and compliant with MLC A2.3 limits? (Max 14 hrs work per 24 hrs; max 72 hrs work per 7 days; min 10 hrs rest per 24 hrs; min 77 hrs rest per 7 days)", { cic: true, risk: "HIGH" }),
        q("2.7", "Are paid leave records maintained and minimum annual leave entitlement honoured?"),
        q("2.8", "Are repatriation arrangements in place and financial security for repatriation documented?"),
        q("2.9", "Is the safe manning certificate complied with and all ranks filled as required?", { risk: "HIGH" }),
        q("2.10", "Is financial security for seafarer compensation in case of death/disability in place?"),
      ]),
      sec("S03", "Title 3 — Accommodation, Recreational Facilities, Food & Catering", [
        q("3.1", "Does the Master conduct monthly accommodation inspections with records maintained?", { cic: true }),
        q("3.2", "Is ventilation/air-conditioning operational and accommodation temperatures acceptable?"),
        q("3.3", "Are sanitary spaces (toilets, showers) clean and in good working order?"),
        q("3.4", "Is laundry equipment functional and available to all crew?"),
        q("3.5", "Are recreational facilities available including internet access, library, and leisure area?"),
        q("3.6", "Are catering inspections conducted monthly with records maintained?"),
        q("3.7", "Is food of adequate quality, variety, and quantity including cultural provisions?", { cic: true }),
        q("3.8", "Are galley surfaces, equipment, and utensils clean and in good repair?"),
        q("3.9", "Are cold stores at the correct temperature with high-temperature alarms functional?"),
        q("3.10", "Is drinking water of potable quality? Are tank cleaning records maintained?"),
        q("3.11", "Are catering staff trained in food hygiene and using appropriate PPE?"),
        q("3.12", "Is galley temperature acceptable and lighting adequate for food preparation?"),
      ]),
      sec("S04", "Title 4 — Health Protection, Medical Care, Welfare", [
        q("4.1", "Is a medical log maintained with all treatments and consultations recorded?", { cic: true }),
        q("4.2", "Is the medicine chest stocked per national requirements with no expired medications?", { cic: true }),
        q("4.3", "Are controlled drugs (if carried) properly secured and accounted for?"),
        q("4.4", "Is the hospital equipped with stretcher, resuscitator, oxygen, and defibrillator?"),
        q("4.5", "Is a resuscitator available and functional?"),
        q("4.6", "Is the MLC certificate/Declaration of Maritime Labour Compliance (DMLC) current and onboard?", { cic: true, risk: "HIGH" }),
        q("4.7", "Are occupational health and safety protections in place and communicated to crew?"),
        q("4.8", "Are deck openings and machinery guards in place to prevent accidents?", { risk: "HIGH" }),
        q("4.9", "Are crew aware of enclosed space hazards and the company's ESE procedures?"),
      ]),
      sec("S05", "Title 5 — Compliance & Enforcement", [
        q("5.1", "Are onboard complaint procedures documented and a complaint register maintained?", { cic: true }),
        q("5.2", "Are there any unresolved seafarer grievances? Review last 6 months' complaints.", { risk: "HIGH" }),
        q("5.3", "Is there a zero-tolerance policy for harassment and bullying — is it communicated?", { cic: true }),
        q("5.4", "Are OHS (Occupational Health and Safety) records maintained and reviewed?"),
        q("5.5", "Have the Master and senior officers received training on MLC compliance requirements?"),
      ]),
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SAF-35E  Engineering Audit
  // ══════════════════════════════════════════════════════════════════════════
  {
    inspectionType: {
      code: "SAF35E_ENG_AUDIT",
      name: "Engineering Audit (SAF-35E)",
      category: "INTERNAL",
      description: "Internal engineering audit — in-port static checks plus sailing dynamic scored assessments of E/R team knowledge, maintenance, MARPOL compliance, and cargo machinery. SAF-35E Rev 0 / April 2025.",
    },
    template: {
      name: "SAF-35E Engineering Audit",
      version: "Rev0-Apr2025",
      description: "Engineering audit checklist — static in-port (40 items) and dynamic sailing (scored assessments by engineer rank).",
    },
    sections: [
      // ── Static ──
      sec("S01", "1. E/R Policies, Procedures & Documentation [Static]", [
        q("1.1", "Is the C/E aware of the company QHSE Policy and its implications for engineering operations?", { cic: true }),
        q("1.2", "Are C/E's Standing Orders posted in the engine control room and signed by all engineering officers?"),
        q("1.3", "Is manning for manoeuvring periods documented and complied with?"),
        q("1.4", "Are all required engineering plans and manuals onboard and current? (Emergency Response, Damage Control, ORB, Engine Manual, MARPOL Annex I/II/VI, OWS manual, incinerator, BWTS, EGCS)", { cic: true }),
        q("1.5", "Is the engine room log book maintained correctly with no blank spaces?"),
        q("1.6", "Are emergency steering records and UMS watch records maintained as required?"),
        q("1.7", "Are fire and safety rounds conducted in the E/R at required intervals with records?"),
        q("1.8", "Is the C/E aware of SECA/ECA entry requirements and the fuel changeover procedure?", { cic: true }),
        q("1.9", "Is the EGCS operational and records maintained? (N/A if no EGCS installed)"),
      ]),
      sec("S02", "2. General Housekeeping & E/R Condition [Static]", [
        q("2.1", "Is the E/R in a clean, tidy condition with escape routes clear of obstructions?", { cic: true }),
        q("2.2", "Are all openings, floor plates, gratings, and guardrails in place?", { risk: "HIGH" }),
        q("2.3", "Is electrical equipment protected from oil/water ingress?"),
        q("2.4", "Are only OWS-compatible cleaning chemicals used in bilge cleaning operations?", { cic: true, risk: "HIGH" }),
        q("2.5", "Are foam applicator testing procedures and emergency steering bay conditions acceptable?"),
        q("2.6", "Is there a documented procedure for restarting essential equipment after blackout?"),
        q("2.7", "Are HP fuel injection lines shielded with drip trays or return line covers?", { risk: "HIGH" }),
        q("2.8", "Are bilge high-level alarms functional and tested with records maintained?"),
      ]),
      sec("S03", "3. PMS & Maintenance Records [Static]", [
        q("3.1", "Is the PMS up to date with no overdue maintenance items beyond approved limits?", { cic: true }),
        q("3.2", "Are all critical equipment items identified and subject to priority maintenance?", { cic: true, risk: "HIGH" }),
        q("3.3", "Are running hours recorded for all machinery subject to hour-based maintenance?"),
        q("3.4", "Are boiler/water treatment testing records maintained monthly?"),
        q("3.5", "Are critical spare parts available for essential machinery?"),
        q("3.6", "Is a defect register maintained with root cause analysis and office notification?"),
        q("3.7", "Is the Class survey status satisfactory with no outstanding items beyond due date?"),
      ]),
      sec("S04", "4. Electrical Systems [Static]", [
        q("4.1", "Are insulation alarms for 440V, 220V, and 24V systems monitored and functional?"),
        q("4.2", "Are electrical safety gloves available with current test certificates?", { risk: "HIGH" }),
        q("4.3", "Are HP fuel lines in areas of electrical equipment shielded, and earth fault alarms functional?", { risk: "HIGH" }),
      ]),
      sec("S05", "5. MARPOL Equipment & Environmental Compliance [Static]", [
        q("5.1", "Is the OWS in good condition with no bypasses? Are 15 ppm alarms, locks, and calibration records current?", { cic: true, risk: "HIGH" }),
        q("5.2", "Are OCM/3-way valve seals intact and valve position documented in ORB?", { cic: true, risk: "HIGH" }),
        q("5.3", "Is the direct overboard connection removed or blanked with evidence in ORB?", { risk: "HIGH" }),
        q("5.4", "Are emergency bilge suction signs/seals in place and valve positions documented?"),
        q("5.5", "Is the STP (Sewage Treatment Plant) operational and within type-approval requirements?"),
        q("5.6", "Is sludge oil disposed of correctly — only to shore reception or incinerator? No overboard discharge?", { risk: "HIGH" }),
        q("5.7", "Is the incinerator operational with records of use? (Temperature alarms, prohibited materials not incinerated, ash disposal, maintenance)", { cic: true }),
        q("5.8", "Are ECA fuel changeover records maintained? Is the changeover procedure posted at ECR?", { cic: true }),
        q("5.9", "Are ODS (Ozone Depleting Substances) records maintained?"),
      ]),
      sec("S06", "6. Bunkering (Engineering Aspect) [Static]", [
        q("6.1", "Are bunker line diagrams current and pressure-tested within the required period?", { cic: true }),
        q("6.2", "Are manifold pressure gauges calibrated and in good working order?"),
        q("6.3", "Are bunker valves in good condition — no leaking valves or save-all deficiencies?"),
        q("6.4", "Is the bunker davit operable and save-alls clean and operational?"),
        q("6.5", "Are vent and sounding pipe markings correct for all bunker tanks?"),
        q("6.6", "Is a pre-bunkering meeting conducted with MSDS, BDN check, and line-up verification?", { cic: true }),
        q("6.7", "Are high-level alarms tested and cross-checks with independent gauges verified before bunkering?", { risk: "HIGH" }),
        q("6.8", "Are settling/service tank samples retained and BDN dispatched to office?", { cic: true }),
      ]),
      sec("S07", "7. Safety & Emergency Preparedness (E/R) [Static]", [
        q("7.1", "Are LOTO, PTW, and hot work permit systems functioning correctly in E/R operations?", { cic: true, risk: "HIGH" }),
        q("7.2", "Are fire alarm locations and quick-closing valve positions known to E/R staff?"),
        q("7.3", "Are all emergency systems familiar to E/R officers — shutdown, F/F system activation, emergency bilge?", { risk: "HIGH" }),
        q("7.4", "Are ESE (Enclosed Space Entry) permits required for E/R enclosed spaces and correctly used?", { cic: true, risk: "HIGH" }),
        q("7.5", "Are machinery guards in place and welding/grinding safety equipment available?"),
        q("7.6", "Are emergency generator start procedures posted and generator tested weekly?"),
      ]),
      // ── Dynamic ──
      sec("D01", "1. Chief Engineer Assessment [Dynamic]", [
        q("CE-1", "Knowledge of SMS, ISM Code, and environmental protection requirements", { dynamic: true, cic: true }),
        q("CE-2", "MARPOL compliance — ORB entries, OWS, sludge management, EGCS records", { dynamic: true, cic: true }),
        q("CE-3", "LSA/FFA system knowledge — fixed CO2, emergency fire pump, portable extinguishers", { dynamic: true }),
        q("CE-4", "Spare parts inventory management and critical spares availability", { dynamic: true }),
        q("CE-5", "PMS compliance — overdue items, prioritisation, reporting to office", { dynamic: true, cic: true }),
        q("CE-6", "Maintenance of engine log books, running hours, and testing records", { dynamic: true }),
        q("CE-7", "Class survey status awareness — due dates, outstanding items, correspondence", { dynamic: true }),
        q("CE-8", "Bunker calculation ability — ROB, consumption, settling, HSFO/VLSFO/MGO management", { dynamic: true }),
        q("CE-9", "Toolbox meeting leadership and JHA quality for high-risk E/R tasks", { dynamic: true }),
        q("CE-10", "Defect reporting discipline — root cause, office notification, registry", { dynamic: true }),
        q("CE-11", "Personal and team gas detector use — calibration, confined space, familiarity", { dynamic: true }),
      ]),
      sec("D02", "2. Second Engineer Assessment [Dynamic]", [
        q("2E-1", "Knowledge of SMS and MARPOL requirements relevant to 2nd Engineer's responsibilities", { dynamic: true }),
        q("2E-2", "PMS compliance for machinery under 2nd Engineer's ownership", { dynamic: true, cic: true }),
        q("2E-3", "Spare parts awareness and procurement knowledge", { dynamic: true }),
        q("2E-4", "Toolbox meeting conduct and JHA quality", { dynamic: true }),
        q("2E-5", "Maintenance history book accuracy and completeness", { dynamic: true }),
        q("2E-6", "Power calculation ability and load management knowledge", { dynamic: true }),
        q("2E-7", "Gas detector use and enclosed space familiarity", { dynamic: true }),
        q("2E-8", "Overall engineering watchkeeping standard and E/R management", { dynamic: true, cic: true }),
      ]),
      sec("D03", "3. Third & Fourth Engineer Assessment [Dynamic]", [
        q("3E-1", "Knowledge of SMS and MARPOL relevant to junior engineer roles", { dynamic: true }),
        q("3E-2", "Competency with auxiliary machinery (pumps, purifiers, compressors, generators)", { dynamic: true }),
        q("3E-3", "Boiler/water treatment testing procedure knowledge", { dynamic: true }),
        q("3E-4", "LSA/FFA equipment knowledge and emergency readiness", { dynamic: true }),
        q("4E-1", "Purifier and air compressor maintenance and troubleshooting knowledge", { dynamic: true }),
        q("4E-2", "Bunkering procedures and safe bunkering practices awareness", { dynamic: true }),
      ]),
      sec("D04", "4. Electrical Officer Assessment [Dynamic]", [
        q("EO-1", "Knowledge of SMS and MARPOL requirements for electrical systems", { dynamic: true }),
        q("EO-2", "PMS compliance for electrical equipment and spare parts management", { dynamic: true }),
        q("EO-3", "EGCS and BWTS electrical maintenance competency (N/A if systems not fitted)", { dynamic: true }),
        q("EO-4", "Lockout/Tagout (LOTO) checklist compliance and electrical isolation procedures", { dynamic: true, risk: "HIGH" }),
      ]),
      sec("D05", "5. Watch Team Performance & UMS [Dynamic]", [
        q("W-1", "Log book completion quality — clarity, completeness, and accuracy of entries", { dynamic: true }),
        q("W-2", "UMS operation competency — alarm response, remote monitoring, bridge alarms (N/A if not UMS)", { dynamic: true }),
        q("W-3", "Manoeuvring competency — engine order telegraph response, telegraph log, standby procedures, ahead/astern readiness, communication with bridge", { dynamic: true, cic: true }),
      ]),
      sec("D06", "6. Cargo Operations (Engineering) [Dynamic]", [
        q("CO-1", "Framo/cargo pump purging procedures — correct sequence and record keeping", { dynamic: true }),
        q("CO-2", "Tank cleaning machine handling and PV valve inspection knowledge", { dynamic: true }),
        q("CO-3", "Portable cargo pump operation and purge pipe management", { dynamic: true }),
        q("CO-4", "Hydraulic local operation knowledge and emergency cargo pump procedures", { dynamic: true }),
      ]),
      sec("D07", "7. Key Engineering Practices & Training [Dynamic]", [
        q("KP-1", "Best practices observed — energy efficiency, resource management, clean E/R culture, proactive reporting, tool management", { dynamic: true, cic: true }),
        q("KP-2", "PMS system accuracy and CMS (Computerised Maintenance System) use", { dynamic: true }),
        q("KP-3", "Mentoring and knowledge transfer to junior engineers and cadets", { dynamic: true }),
        q("KP-4", "Engine log entry quality — readability, completeness, consistency with PMS/defect records", { dynamic: true }),
      ]),
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SAF-35F  Environmental & Energy Audit
  // ══════════════════════════════════════════════════════════════════════════
  {
    inspectionType: {
      code: "SAF35F_ENV_AUDIT",
      name: "Environmental & Energy Audit (SAF-35F)",
      category: "INTERNAL",
      description: "Internal environmental and energy audit covering MARPOL Annexes I–VI, BWM Convention, SEEMP, CII, EU ETS. SAF-35F Rev 0 / April 2025.",
    },
    template: {
      name: "SAF-35F Environmental & Energy Audit",
      version: "Rev0-Apr2025",
      description: "Environmental audit — Part A: MARPOL/BWM compliance (55 items across 8 sections); Part B: energy efficiency audit (10 items).",
    },
    sections: [
      sec("SA1", "Part A — Section 1: Environmental Certificates & Statutory Documents", [
        q("A1.1", "Is the IOPP Certificate valid and onboard?", { cic: true, risk: "HIGH" }),
        q("A1.2", "Is the ISPPC (International Sewage Pollution Prevention Certificate) valid?"),
        q("A1.3", "Are the IAPP Certificate and NOx Technical File(s) onboard and current?", { cic: true }),
        q("A1.4", "Is the EIAPP Certificate for main and auxiliary engines onboard?"),
        q("A1.5", "Is the IEEC (International Energy Efficiency Certificate) onboard?", { cic: true }),
        q("A1.6", "Is the IAFS (International Anti-Fouling System Certificate) onboard?"),
        q("A1.7", "Are CLC/BCLC certificates current and onboard?"),
        q("A1.8", "Are SOPEP/SMPEP documents current and approved? Is the SOPEP kit stocked?", { cic: true, risk: "HIGH" }),
        q("A1.9", "Is the BWM Certificate and BWMP onboard and current?", { cic: true }),
        q("A1.10", "Are VRP/ICP documents current for US trading? (N/A if no US calls)"),
        q("A1.11", "Are VGP NOI and records maintained for US trading? (N/A if no US calls)"),
        q("A1.12", "Is a Statement of Fact available for LSFO bunkering operations?"),
      ]),
      sec("SA2", "Part A — Section 2: MARPOL Annex I — Oil Pollution Prevention", [
        q("A2.1", "Is the OWS operational with type-approval certificate, last service records, and PPM alarm functional?", { cic: true, risk: "HIGH" }),
        q("A2.2", "Is the 3-way valve position documented in ORB and OCM operational?", { cic: true, risk: "HIGH" }),
        q("A2.3", "Are critical OWS spares available (piping, electrodes, membranes)?"),
        q("A2.4", "Are direct overboard connections removed or permanently blanked?", { risk: "HIGH" }),
        q("A2.5", "Are emergency bilge suction valve seals/locks in place?", { risk: "HIGH" }),
        q("A2.6", "Is the bilge holding tank cleaned with solids removed to shore regularly?"),
        q("A2.7", "Are there no evidence of bypass piping or unmarked bilge connections?", { cic: true, risk: "HIGH" }),
        q("A2.8", "Are sludge calculations correct and consistent with ORB entries?", { cic: true }),
        q("A2.9", "Is ORB Part I maintained correctly with no alterations? (OWS discharge, bilge pump operations, sludge, incinerator, slop tank, overboard discharge records)", { cic: true, risk: "HIGH" }),
        q("A2.10", "Is ORB Part II maintained correctly? (N/A non-tankers)", { cic: true, risk: "HIGH" }),
        q("A2.11", "Is the ODME operational and calibrated? (N/A non-tankers)"),
      ]),
      sec("SA3", "Part A — Section 3: MARPOL Annex II — NLS & Chemical Tankers", [
        q("A3.1", "Is the CRB (Cargo Record Book) maintained correctly with all operations recorded? (N/A non-chemical tankers)", { cic: true }),
        q("A3.2", "Is the SMPEP (Ship Marine Pollution Emergency Plan) current and approved?"),
        q("A3.3", "Are tank cleaning chemicals listed in MEPC.2 Circular only? Are correct pre-wash requirements applied?", { risk: "HIGH" }),
      ]),
      sec("SA4", "Part A — Section 4: MARPOL Annex IV — Sewage Pollution", [
        q("A4.1", "Is the STP (Sewage Treatment Plant) operational and type-approved? Are spare parts available?"),
        q("A4.2", "Are effluent testing results and log entries maintained?"),
        q("A4.3", "Is the overboard sewage valve locked in the closed position outside permitted zones?", { risk: "HIGH" }),
        q("A4.4", "Is the holding tank within capacity criteria? (N/A if no holding tank fitted)"),
      ]),
      sec("SA5", "Part A — Section 5: MARPOL Annex V — Garbage", [
        q("A5.1", "Is the GRB (Garbage Record Book) maintained correctly with all operations entered?", { cic: true }),
        q("A5.2", "Are MARPOL Annex V garbage management posters displayed in crew common areas?"),
        q("A5.3", "Are garbage bins clearly labelled per the GMP and segregation practised?", { cic: true }),
        q("A5.4", "Are expired pyrotechnics disposed of through shore reception with records?", { risk: "HIGH" }),
        q("A5.5", "Is incinerator ash volume consistent with GRB entries? Is comminuter operational?"),
        q("A5.6", "Are bulk carrier hold washings documented and conducted only in permitted areas? (N/A non-bulk)"),
      ]),
      sec("SA6", "Part A — Section 6: MARPOL Annex VI — Air Pollution", [
        q("A6.1", "Are fuel changeover records maintained? Is the Marine Fuel Sulphur Record Book current?", { cic: true, risk: "HIGH" }),
        q("A6.2", "Are BDNs and bunker samples retained for 36 months (VLSFO) and 12 months (others)?", { cic: true, risk: "HIGH" }),
        q("A6.3", "Are ODS records maintained and confirmed that prohibited ODS is not used?"),
        q("A6.4", "Is a VOC Management Plan onboard and VOC monitoring conducted? (N/A non-crude tankers)"),
        q("A6.5", "Is the EGCS (scrubber) operational with all required records maintained? (N/A if no EGCS) (Wash water, pH, PAH, PAH monitoring, MARPOL VI compliance, port restrictions log)", { cic: true }),
      ]),
      sec("SA7", "Part A — Section 7: Ballast Water Management", [
        q("A7.1", "Is the BWMP implemented with correct exchange/treatment procedures documented?", { cic: true, risk: "HIGH" }),
        q("A7.2", "Is the Ballast Water Record Book (BWRB) maintained correctly with all operations?", { cic: true }),
        q("A7.3", "Is the BWTS operational with training records and laboratory analyses maintained? (N/A if no BWTS)", { cic: true }),
        q("A7.4", "Are US VGP California ballast water reporting records maintained? (N/A non-US)"),
      ]),
      sec("SA8", "Part A — Section 8: Energy Efficiency, SEEMP, CII & EU Regulatory Compliance", [
        q("A8.1", "Are all three SEEMP parts available and current? (Part 1: Operational, Part 2: Data collection, Part 3: CII improvement plan)", { cic: true }),
        q("A8.2", "Is the vessel's CII rating known and an improvement plan in place if rated C, D, or E?", { cic: true }),
        q("A8.3", "Is IMO DCS (Data Collection System) implemented and DOC submitted for last year?", { cic: true }),
        q("A8.4", "Is EU MRV monitoring plan implemented and annual report submitted? (N/A if no EU calls)"),
        q("A8.5", "Is the vessel enrolled in EU ETS and allowances accounted for from 2024? (N/A if no EU calls)"),
        q("A8.6", "Is an IHM (Inventory of Hazardous Materials) Certificate onboard?"),
      ]),
      sec("SB1", "Part B — Energy Audit Checklist", [
        q("B1.1", "Are weather routing recommendations followed and trim optimisation records maintained?", { cic: true }),
        q("B1.2", "Are bridge energy efficiency instructions posted and OOW trained on speed/power management?"),
        q("B1.3", "Is aux engine load optimised with unnecessary generators shut down at sea and in port?", { cic: true }),
        q("B1.4", "Is bunker fuel heating within optimal temperature bands to minimise energy waste?"),
        q("B1.5", "Are crew trained on energy efficiency measures relevant to their department?"),
        q("B1.6", "Physical energy efficiency inspection: Oil leaks from fuel/lube systems; heat exchanger condition; boiler chemical dosing; steam leakages; insulation condition; steam trap condition; unnecessary running machinery; centrifugal pump valve openings; compressed air leaks; tank cleaning temperature control", { cic: true }),
        q("B1.7", "Are Energy Management System (EMS) deficiencies from last audit addressed?"),
        q("B1.8", "Are EMS circulars and energy efficiency training records maintained?"),
        q("B1.9", "Is the E/R bilge physical condition acceptable with no fuel/oil contamination?"),
        q("B1.10", "Are sea valves inspected and maintained to prevent biofouling? (N/A if not applicable)"),
      ]),
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SAF-35G  Cargo Audit
  // ══════════════════════════════════════════════════════════════════════════
  {
    inspectionType: {
      code: "SAF35G_CARGO_AUDIT",
      name: "Cargo Audit (SAF-35G)",
      category: "INTERNAL",
      description: "Internal cargo operations audit — static documentation/equipment checks and dynamic scored assessment of cargo planning, transfer, MARPOL, and crew knowledge. SAF-35G Rev 0 / April 2025.",
    },
    template: {
      name: "SAF-35G Cargo Audit",
      version: "Rev0-Apr2025",
      description: "Cargo audit — static (27 items) and dynamic scored (scored assessment) across cargo equipment, atmosphere testing, tank cleaning, BWM, and transfer operations.",
    },
    sections: [
      // ── Static ──
      sec("S01", "1. Cargo Handling & Monitoring Equipment [Static]", [
        q("1.1", "Are cargo calibration tables, trim/list correction tables, and loadicator current and calibrated?", { cic: true }),
        q("1.2", "Are remote cargo gauges operational? (Temperature gauges, radar/float gauges, ULLAGE, pressure gauges, high-level/high-high-level alarms, cargo vapour detectors, O2 analysers, cargo density meters, void space detectors)", { cic: true }),
        q("1.3", "Are ESD (Emergency Shutdown) records available from last port — confirmation of remote ESD test?"),
        q("1.4", "Are cargo lines and cargo hoses pressure-tested within required interval?", { cic: true, risk: "HIGH" }),
        q("1.5", "Are CCR (Cargo Control Room) documents current? (Trim/stability, cargo systems, P&ID diagrams, Emergency Response Guides, USCG NOI/VGP, Port Risk Assessment, COF, Pre-transfer checklists, loading/discharging sequences, MSDS)", { cic: true }),
        q("1.6", "Are Framo purging records, tank inspection records, and CCR filing maintained?"),
        q("1.7", "Is cargo sampling conducted correctly and a Sample Log maintained?"),
        q("1.8", "Is the sample locker contents correct? (Cargo samples, compatibility samples, bunker samples, Annex II samples, water standard)"),
        q("1.9", "Are cargo heating records and emergency cargo pump test records available?"),
        q("1.10", "Are cargo derricks and cranes certificated within SWL? (N/A if none fitted)"),
        q("1.11", "Are bulk carrier hold monitoring instruments functional? (N/A non-bulk) (O2/H2S/CO detectors, hold ventilation, CO2 flooding, hatch covers, bilge pumping)"),
      ]),
      sec("S02", "2. Atmosphere Testing Equipment [Static]", [
        q("2.1", "Are the required atmosphere testing instruments onboard and operational? (Explosimeter/LEL, O2 analyser, toxic gas detector, portable HC gas detector, CO2 detector)", { cic: true, risk: "HIGH" }),
        q("2.2", "Are calibration kits/gas standards onboard and within date for all instruments?", { cic: true }),
        q("2.3", "Are calibration records maintained for all atmosphere testing instruments?"),
        q("2.4", "Is void space monitoring conducted during loading and results recorded?"),
      ]),
      sec("S03", "3. Tank Cleaning & Disposal of Cargo Residues [Static]", [
        q("3.1", "Is a tank cleaning plan approved by the Master for each tank cleaning operation?", { cic: true }),
        q("3.2", "Is the office notified before tank cleaning operations with unfamiliar cargoes?"),
        q("3.3", "Is the tank cleaning checklist used and appropriate for the cargo category?"),
        q("3.4", "Are atmospheric checks conducted before and during water washing of inerted tanks? (<8% O2 maintained)", { risk: "HIGH" }),
        q("3.5", "Are atmospheric checks conducted before and during undefined atmosphere washing? (<10% LEL maintained)", { cic: true, risk: "HIGH" }),
        q("3.6", "Are only MEPC.2 Circular approved chemicals used for tank cleaning?", { risk: "HIGH" }),
        q("3.7", "Are tank cleaning machine deployment and recovery procedures followed with locking pins used?"),
        q("3.8", "Is ODMCS operation correct and quantities accurately recorded?"),
      ]),
      sec("S04", "4. Ballast Water Management [Static]", [
        q("4.1", "Is the BWMP implemented with current method of compliance (exchange or treatment)?", { cic: true }),
        q("4.2", "Is the BWRB maintained correctly with all ballast operations recorded?", { cic: true }),
        q("4.3", "Is the BWTS operational and laboratory analyses current? (N/A if no BWTS)"),
      ]),
      sec("S05", "5. Mooring Equipment & Lifting Appliances (Cargo Context) [Static]", [
        q("5.1", "Are ETA (Emergency Towing Arrangement) markings and equipment in place? (N/A for vessels <20K DWT)"),
        q("5.2", "Are mooring appliances (winches, wires, tails) in satisfactory condition?", { cic: true }),
        q("5.3", "Is mooring line stowage correct — drum condition, bitts, and cleats serviceable?"),
        q("5.4", "Are lifting appliances within SWL with current certificates and inspection records?"),
      ]),
      // ── Dynamic ──
      sec("D01", "1. Cargo Planning & Voyage Instructions [Dynamic]", [
        q("D1.1", "Are voyage orders and cargo instructions received, acknowledged, and distributed to relevant officers?", { dynamic: true, cic: true }),
        q("D1.2", "Is the COF/cargo listing current and consistent with the loadicator/stability calculation?", { dynamic: true, cic: true }),
        q("D1.3", "Is the stowage plan compliant with IMDG, compatibility requirements, and charterer instructions?", { dynamic: true }),
        q("D1.4", "Is a cargo operation plan prepared and distributed before each loading/discharging?", { dynamic: true, cic: true }),
        q("D1.5", "Are crew familiar with the hazards of the current cargo and emergency response actions?", { dynamic: true, cic: true, risk: "HIGH" }),
      ]),
      sec("D02", "2. Pre-Arrival & Pre-Transfer Checks [Dynamic]", [
        q("D2.1", "Is the Pre-Transfer Checklist completed before commencement? (Ship-shore safety checklist, manifold connections, scuppers/save-alls, ullage/temperature pre-check, communications, cargo pumps, ESD, valve line-up, alarms)", { dynamic: true, cic: true }),
        q("D2.2", "Are all tanks on correct pressure/on Repose setting before arrival?", { dynamic: true }),
        q("D2.3", "Are cargo valves blanked and locked when not in service?", { dynamic: true }),
        q("D2.4", "Is a pre-cargo safety meeting conducted with PPE level for the operation defined?", { dynamic: true, cic: true }),
        q("D2.5", "Are pump room entry procedures (ESE permit, gas check, buddy system) followed? (N/A if no pump room)", { dynamic: true, risk: "HIGH" }),
        q("D2.6", "Are cargo drip trays clean, in good condition, and plugged/unplugged as required?", { dynamic: true }),
      ]),
      sec("D03", "3. Checks During Cargo Transfer [Dynamic]", [
        q("D3.1", "Is the Ship-Shore Safety Checklist signed by both parties and displayed at manifold?", { dynamic: true, cic: true }),
        q("D3.2", "Is communication with shore maintained with a backup communication system agreed?", { dynamic: true }),
        q("D3.3", "Are scuppers plugged, SMPEP equipment ready, and cargo placards displayed?", { dynamic: true }),
        q("D3.4", "Are MSDS/Safety Data Sheets displayed at cargo manifold during transfer?"),
        q("D3.5", "Is cargo line-up cross-checked against the cargo plan before commencement?", { dynamic: true, cic: true }),
        q("D3.6", "Is deck watch maintained with sufficient personnel during cargo transfer?", { dynamic: true }),
        q("D3.7", "Is appropriate PPE worn during transfer operations? (Chemical tankers, crude, products — specific to cargo type)", { dynamic: true, cic: true }),
        q("D3.8", "Are gas detectors in use and readings recorded at correct intervals?", { dynamic: true }),
        q("D3.9", "Does the OOW monitor cargo rate and check gauges at required intervals?", { dynamic: true, cic: true }),
        q("D3.10", "Is stability monitored throughout loading and trim/stress within limits?", { dynamic: true, cic: true, risk: "HIGH" }),
        q("D3.11", "Is closed-loading procedure applied where required and documented?", { dynamic: true }),
        q("D3.12", "Is inhibitor dosage and certificate checked for inhibited cargo? (N/A if not applicable)"),
        q("D3.13", "Are night orders and cargo deck rounds conducted correctly?", { dynamic: true }),
        q("D3.14", "Is the deck round checklist completed at required intervals? (Tank ullages, pressure, temperature, manifold, scuppers, atmosphere, alarms, vapour return, valve positions, fire detection, safety equipment)", { dynamic: true, cic: true }),
        q("D3.15", "Is the BWTS in use during ballasting/deballasting? (N/A if no BWTS fitted)", { dynamic: true }),
        q("D3.16", "Are squeezing/final stripping operations documented and all valves closed/blanked after stripping?", { dynamic: true }),
      ]),
      sec("D04", "4. After Cargo Transfer [Dynamic]", [
        q("D4.1", "Are cargo lines drained and documented before vessel departure?", { dynamic: true }),
        q("D4.2", "Are manifold blanks fitted and secured correctly before vessel proceeds to sea?", { dynamic: true }),
        q("D4.3", "Are all cargo tank openings (manholes, ullage plugs, PV valves) secured for sea?", { dynamic: true }),
        q("D4.4", "Are tank cleaning machine locking pins in place after cleaning operations?", { dynamic: true }),
        q("D4.5", "Are N2/IGS records updated with current tank conditions? (N/A if no N2/IGS fitted)"),
        q("D4.6", "Is the BWRB updated after all ballast operations?", { dynamic: true }),
      ]),
      sec("D05", "5. Soft Skills & Crew Knowledge [Dynamic]", [
        q("D5.1", "Are crew aware of the hazards of the current cargo including SDS key data points?", { dynamic: true, cic: true }),
        q("D5.2", "Is the OOW familiar with the load/discharge plan and emergency shutdown criteria?", { dynamic: true, cic: true }),
        q("D5.3", "Can crew demonstrate knowledge of cargo operations? (Gauge types, overflow protection, valve manifold, emergency stops, fixed gas detection, portable gas detection, cargo heating, tank cleaning, foam applicator, MSDS)", { dynamic: true }),
        q("D5.4", "Are MARPOL and IBC/ICS requirements understood? (N/A categories, pre-wash, special requirements, prohibited chemicals, ORB Part II, CRB)", { dynamic: true }),
        q("D5.5", "Are N2/IG system hazards understood? (N2 asphyxiation risk, IG oxygen limits, pressurised tank entry hazards)", { dynamic: true, risk: "HIGH" }),
        q("D5.6", "Do crew resist commercial pressure to rush or compromise cargo safety operations?", { dynamic: true, cic: true }),
        q("D5.7", "Are nitrogen hazard warning notices posted at relevant access points?", { dynamic: true }),
        q("D5.8", "Is full PPE worn during tank cleaning (chemical splash suit, SCBA, buddy system)?", { dynamic: true, risk: "HIGH" }),
      ]),
    ],
  },

  // ══════════════════════════════════════════════════════════════════════════
  // SAF-35H  Mooring Audit
  // ══════════════════════════════════════════════════════════════════════════
  {
    inspectionType: {
      code: "SAF35H_MOORING_AUDIT",
      name: "Mooring Audit (SAF-35H)",
      category: "INTERNAL",
      description: "Internal mooring audit covering rope/wire condition, equipment records, winch maintenance, anchoring, and dynamic scored mooring operations assessment. SAF-35H Rev 0 / April 2025.",
    },
    template: {
      name: "SAF-35H Mooring Audit",
      version: "Rev0-Apr2025",
      description: "Mooring audit — static (38 items) and dynamic scored (scored assessment) covering MEG4 compliance, ropes/wires, winches, anchoring, and mooring team performance.",
    },
    sections: [
      // ── Static ──
      sec("S01", "1. Documentation & Records [Static]", [
        q("1.1", "Is the SDMBL (Ship Design Minimum Breaking Load) document and MSMP (Mooring System Management Plan) onboard and current? (DECK 20B)", { cic: true }),
        q("1.2", "Is the Mooring Rope Certificate log (DECK 19) maintained with all ropes listed?", { cic: true }),
        q("1.3", "Are wire rope/tail certificates onboard for all mooring wires and tails?"),
        q("1.4", "Do rope records match MEG4 requirements — rope details correct (material, construction, MBL)?"),
        q("1.5", "Is the Mooring Equipment Log current with all changes, renewals, and inspections recorded?"),
        q("1.6", "Are inspection records for mooring ropes and wires conducted at required intervals?"),
        q("1.7", "Are maintenance and renewal records complete for all mooring equipment?"),
        q("1.8", "Are mooring rope failures/incidents reported to the company and recorded?"),
        q("1.9", "Are toolbox meeting records and pre-mooring discussions maintained?"),
        q("1.10", "Are mooring risk assessments and familiarisation records available for officers?"),
        q("1.11", "Are bow chain stopper certificates available? (SWL, date of last test, proof load certificate)", { cic: true }),
        q("1.12", "Is a winch brake testing kit onboard and calibration records current?", { cic: true }),
        q("1.13", "Are ETA (Emergency Towing Arrangement) markings and equipment records available? (3 copies of ETA arrangement)"),
        q("1.14", "Is a mixed mooring check conducted before departure to confirm no mixed rope/wire arrangements?", { cic: true, risk: "HIGH" }),
        q("1.15", "Are retirement criteria for mooring ropes documented and applied?", { cic: true }),
      ]),
      sec("S02", "2. Mooring Ropes, Wires & Shackles [Static]", [
        q("2.1", "Are there no repairs or splices on any mooring rope? (NC if found — ropes with repairs must be removed)", { cic: true, risk: "HIGH" }),
        q("2.2", "Is the physical condition of all mooring ropes/wires consistent with Mooring Equipment Log entries?", { cic: true }),
        q("2.3", "Does LDBF (Load Data Break Force) equal 100–105% of SDMBL for all ropes?"),
        q("2.4", "Are rope eyes in good condition — no distortion, damage, heat fusion, or thimble issues?"),
        q("2.5", "Are sufficient ropes available? (Minimum 14 operational + 2 spare forward + 2 spare aft; no rope >5 years old in service)", { cic: true }),
        q("2.6", "Are running hours and end-to-end renewal records current for all working ropes?"),
        q("2.7", "Are chafe guards fitted at all chafe points including fairleads and cleats?"),
        q("2.8", "Are mooring ropes numbered, marked, and stored correctly (off deck, covered)?"),
        q("2.9", "Are mooring tails within service limits? (Maximum 18 months or 3000 hours in service)", { cic: true }),
        q("2.10", "Are PMS records current for mooring rope inspection and maintenance?"),
      ]),
      sec("S03", "3. Mooring Equipment Condition [Static]", [
        q("3.1", "Are all winch foundations in good condition with no cracking or corrosion?"),
        q("3.2", "Is the brake lining thickness within acceptable limits? (Replace if <50% remaining)", { cic: true }),
        q("3.3", "Is the brake band clearance/adjustment correct and maintenance records current?"),
        q("3.4", "Are permanent mooring fittings (bitts, fairleads, bollards, cleats) in good condition?"),
        q("3.5", "Is the Brake Rendering Mark (BRM) visible and readable on each winch drum?"),
        q("3.6", "Are stencil marks for design holding capacity painted on all bitts and bollards?", { cic: true }),
        q("3.7", "Are drum rotation direction markings clearly indicated on each mooring winch?"),
        q("3.8", "Are fire wires (if required) within service life, correctly rigged, and ready for use? (N/A non-tankers)"),
      ]),
      sec("S04", "4. Anchoring Equipment [Static]", [
        q("4.1", "Are windlass, anchors, and anchor cables in good condition with no cracks or excessive wear?"),
        q("4.2", "Are anchor locking bars in place when anchors are stowed?"),
        q("4.3", "Is the bitter-end securing arrangement tested and operational?"),
        q("4.4", "Are chain locker doors secured, shapes/anchor ball available, and anchor wash pipe operational?"),
        q("4.5", "Are anchor cable markings visible? Record current range if anchor lowered during audit."),
      ]),
      sec("S05", "5. Mooring Procedures & Snap-Back Zone Markings [Static]", [
        q("5.1", "Are ropes deployed correctly — same rope, same service position?"),
        q("5.2", "Are there no mixed mooring arrangements? Are snap-back zones clearly marked?", { cic: true, risk: "HIGH" }),
        q("5.3", "Is the bitt securing procedure (figure-of-eight plus locking turn) followed and crew trained?"),
        q("5.4", "Is the drum reeling procedure correct — rope leads over the top of the drum?"),
        q("5.5", "Is the drum disconnection from power drive procedure posted and known by crew?"),
        q("5.6", "Are mooring ropes stowed correctly — on racks/chocks with anti-skid on stations?"),
        q("5.7", "Is the minimum crew requirement met for mooring operations? (Minimum 1 officer + 3 crew forward and aft)", { cic: true }),
        q("5.8", "Is there no evidence of full round turns on mooring rollers during operations?", { cic: true, risk: "HIGH" }),
      ]),
      sec("S06", "6. ETA — Emergency Towing Arrangement [Static]", [
        q("6.1", "Is the SPM/BCS (Bow Chain Stopper) SWL marking visible and matching certificate? (N/A if no SPM fitted)"),
        q("6.2", "Are BCS wear limits within acceptable range and documented?"),
        q("6.3", "Are forward ETA markings, pennant wire, and stopper chain in good condition?"),
        q("6.4", "Are aft ETA brake test records current with markings, inventory, and maintenance up to date?"),
      ]),
      // ── Dynamic ──
      sec("D01", "1. Planning & Preparation [Dynamic]", [
        q("D1.1", "Is a Master-Pilot discussion held covering tug plan, mooring sequence, and pilot's experience?", { dynamic: true, cic: true }),
        q("D1.2", "Is a ship-specific mooring risk assessment conducted for the berth/terminal?", { dynamic: true, cic: true }),
        q("D1.3", "Are pre-mooring meetings held with all stations before operations?", { dynamic: true }),
        q("D1.4", "Are toolbox meetings conducted and hazards discussed with mooring team?", { dynamic: true, cic: true }),
        q("D1.5", "Are crew familiar with the MSMP and snap-back zone locations?", { dynamic: true }),
        q("D1.6", "Are weather forecasts checked and mooring line plan adjusted for swell/tidal predictions?", { dynamic: true }),
        q("D1.7", "Is the crew aware of the ETA procedure and when to deploy?", { dynamic: true }),
      ]),
      sec("D02", "2. Organisation & Team Management [Dynamic]", [
        q("D2.1", "Is each mooring station manned sufficiently with rested crew?", { dynamic: true }),
        q("D2.2", "Are walkie-talkie communications tested and clear between bridge and stations?", { dynamic: true, cic: true }),
        q("D2.3", "Is situational awareness maintained at all stations during operations?", { dynamic: true }),
        q("D2.4", "Is stop-work authority exercised? Do crew stop operations for unsafe conditions?", { dynamic: true, cic: true }),
      ]),
      sec("D03", "3. Mooring Operations [Dynamic]", [
        q("D3.1", "Is the mooring operation executed safely with no rush observed?", { dynamic: true, cic: true }),
        q("D3.2", "Is the supervising officer positioned with a clear view of the mooring station?", { dynamic: true }),
        q("D3.3", "Is PPE correctly worn and are non-essential persons absent from snap-back zones?", { dynamic: true, cic: true, risk: "HIGH" }),
        q("D3.4", "Is the station kept tidy with ropes/wires coiled and obstructions clear?", { dynamic: true }),
        q("D3.5", "Is the winch operated correctly — in gear, brake applied, warping drum used for tailing?", { dynamic: true, cic: true }),
        q("D3.6", "Is split-drum winch operation correctly executed with correct lay direction?", { dynamic: true }),
        q("D3.7", "Are rope stoppers used correctly when transferring load from drum to bitt?", { dynamic: true }),
        q("D3.8", "Are heavy-load procedures (lead-line, heaving lines) followed safely?", { dynamic: true }),
        q("D3.9", "Are fire wires deployed when required at tanker terminals? (N/A if not required)"),
      ]),
      sec("D04", "4. Monitoring & Tending Moorings [Dynamic]", [
        q("D4.1", "Are tending instructions given with weather/tidal change criteria defined?", { dynamic: true, cic: true }),
        q("D4.2", "Is crew awareness of surging risk during strong current/swell conditions demonstrated?", { dynamic: true }),
        q("D4.3", "Are mooring arrangements maintained per the MSMP pattern?", { dynamic: true, cic: true }),
        q("D4.4", "Is chafe protection checked and renewed at required intervals?", { dynamic: true }),
        q("D4.5", "Are CBM/SPM hourly checks conducted during offshore mooring? (N/A if not CBM/SPM berth)"),
        q("D4.6", "Is a tension monitoring system in use where fitted? (N/A if not fitted)"),
      ]),
      sec("D05", "5. Working with Tugs [Dynamic]", [
        q("D5.1", "Is communication with tugs clear and orders confirmed before tug movements?", { dynamic: true, cic: true }),
        q("D5.2", "Are tug line orders relayed from bridge clearly to mooring stations?", { dynamic: true }),
        q("D5.3", "Are propellers and thrusters verified as clear of tug/tow lines before engagement?", { dynamic: true, risk: "HIGH" }),
        q("D5.4", "Are crew kept clear of towing lines and tug wires during operations?", { dynamic: true, risk: "HIGH" }),
      ]),
      sec("D06", "6. Anchoring [Dynamic]", [
        q("D6.1", "Is the anchor position selected with adequate swinging room, UKC, and holding ground?", { dynamic: true, cic: true }),
        q("D6.2", "Are internal/external communications established before letting go?", { dynamic: true }),
        q("D6.3", "Is a toolbox meeting conducted for deep-water or emergency anchoring?", { dynamic: true }),
        q("D6.4", "Is the anchoring operation executed safely and at the correct scope?", { dynamic: true, cic: true }),
        q("D6.5", "Is anchor position recorded with bearings/GPS and confirmed after scope is out? Are navigation signals/lights displayed?", { dynamic: true }),
        q("D6.6", "Are engines on standby at anchor and night orders written?", { dynamic: true }),
      ]),
      sec("D07", "7. Mooring Equipment Live Audit [Dynamic]", [
        q("D7.1", "Is a toolbox meeting conducted with mooring team before the live equipment check?", { dynamic: true }),
        q("D7.2", "Is team hazard awareness satisfactory during live equipment inspection?", { dynamic: true, cic: true }),
        q("D7.3", "Do crew demonstrate knowledge of rope/heaving line properties and safe handling?", { dynamic: true }),
        q("D7.4", "Does the officer monitor crew layout and positioning during the live audit?", { dynamic: true }),
        q("D7.5", "Is snap-back zone awareness demonstrated by all crew present?", { dynamic: true, cic: true }),
        q("D7.6", "Is bridge-deck communication effective and orders clearly understood?", { dynamic: true, cic: true }),
      ]),
    ],
  },
];

// ─── Seed function ────────────────────────────────────────────────────────────

async function seedTemplates(clientOverride) {
  const prisma = clientOverride ?? _prisma;
  let totalTypes = 0;
  let totalTemplates = 0;
  let totalSections = 0;
  let totalQuestions = 0;

  for (const def of TEMPLATES) {
    // 1. Upsert inspection type
    const inspType = await prisma.virInspectionType.upsert({
      where: { code: def.inspectionType.code },
      update: {
        name: def.inspectionType.name,
        description: def.inspectionType.description,
        isActive: true,
      },
      create: {
        code: def.inspectionType.code,
        name: def.inspectionType.name,
        category: def.inspectionType.category,
        description: def.inspectionType.description,
        isActive: true,
      },
    });
    totalTypes++;

    // 2. Upsert template
    const tmpl = await prisma.virTemplate.upsert({
      where: { inspectionTypeId_version: { inspectionTypeId: inspType.id, version: def.template.version } },
      update: {
        name: def.template.name,
        description: def.template.description,
        workflowConfig: def.template.workflowConfig ?? undefined,
        isActive: true,
      },
      create: {
        inspectionTypeId: inspType.id,
        name: def.template.name,
        version: def.template.version,
        description: def.template.description,
        workflowConfig: def.template.workflowConfig ?? undefined,
        isActive: true,
      },
    });
    totalTemplates++;

    // 3. Upsert sections and questions
    for (let si = 0; si < def.sections.length; si++) {
      const secDef = def.sections[si];
      const sortOrder = si + 1;

      const section = await prisma.virTemplateSection.upsert({
        where: { templateId_sortOrder: { templateId: tmpl.id, sortOrder } },
        update: { title: secDef.title, code: secDef.code },
        create: { templateId: tmpl.id, code: secDef.code, title: secDef.title, sortOrder },
      });
      totalSections++;

      for (let qi = 0; qi < secDef.questions.length; qi++) {
        const qDef = secDef.questions[qi];
        const qSortOrder = qi + 1;

        // Upsert by section+code (unique constraint)
        const existing = await prisma.virTemplateQuestion.findFirst({
          where: { sectionId: section.id, code: qDef.code },
        });

        if (existing) {
          await prisma.virTemplateQuestion.update({
            where: { id: existing.id },
            data: {
              prompt: qDef.prompt,
              responseType: qDef.responseType,
              riskLevel: qDef.riskLevel,
              isMandatory: qDef.isMandatory,
              isCicCandidate: qDef.isCicCandidate,
              helpText: qDef.helpText,
              sortOrder: qSortOrder,
            },
          });
        } else {
          await prisma.virTemplateQuestion.create({
            data: {
              sectionId: section.id,
              code: qDef.code,
              prompt: qDef.prompt,
              responseType: qDef.responseType,
              riskLevel: qDef.riskLevel,
              isMandatory: qDef.isMandatory,
              isCicCandidate: qDef.isCicCandidate,
              helpText: qDef.helpText,
              sortOrder: qSortOrder,
            },
          });
        }
        totalQuestions++;
      }
    }

    console.log(`  ✓ ${def.template.name} — ${def.sections.length} sections, ${def.sections.reduce((s, sec) => s + sec.questions.length, 0)} questions`);
  }

  return { totalTypes, totalTemplates, totalSections, totalQuestions };
}

export default seedTemplates;

async function main() {
  console.log("[seed-templates] Seeding 8 SAF-35 inspection templates...\n");
  try {
    const counts = await seedTemplates();
    console.log(`\n[seed-templates] Done.`);
    console.log(`  Inspection types : ${counts.totalTypes}`);
    console.log(`  Templates        : ${counts.totalTemplates}`);
    console.log(`  Sections         : ${counts.totalSections}`);
    console.log(`  Questions        : ${counts.totalQuestions}`);
  } catch (err) {
    console.error("[seed-templates] Failed:", err.message);
    process.exit(1);
  } finally {
    await _prisma.$disconnect();
  }
}

main();
