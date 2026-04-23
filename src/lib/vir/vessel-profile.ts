import liveUserVessels from "@/data/live-user-vessels.json";

type VesselProfileInput = {
  code: string;
  name: string;
  imoNumber?: string | null;
  vesselType?: string | null;
  fleet?: string | null;
  flag?: string | null;
  manager?: string | null;
};

type ProfileRow = {
  label: string;
  value: string;
};

type ConditionGuideRow = {
  description: string;
  criteria: string;
  scoreRange: string;
  referenceImageUrl?: string;
};

type LiveUserVesselRecord = {
  VesselCode?: string;
  VesselName?: string;
  ImoNo?: string | number;
  VesselType?: string;
  Flag?: string;
  Class?: string;
  PortOfRegistery?: string;
  Management?: string;
  RegisteredOwner?: string;
  ShipBuilder?: string;
  BuiltDate?: string;
  DeliveredDate?: string;
  LOA?: number;
  Depth?: number;
  SummerDeadWeight?: number;
  LifeBoatCapacity?: number;
  IsBowThruster?: boolean;
  EngineType?: string;
  AuxiliaryEngineType?: string;
  EngineModel?: string;
  MCR?: string;
  NCR?: string;
  AuxEngineModel?: string;
  RatedPower?: string;
  Alternators?: string | number;
  NoofAuxEngines?: string | number;
  NoofBoilers?: string | number;
  BoilerManufacturer?: string;
  BoilerType?: string;
  GBManufacturer?: string;
  GBType?: string;
  GBEvaporationRate?: string;
  GGManufacturer?: string;
  GGType?: string;
  NGManufacturer?: string;
  NGType?: string;
};

export type VesselProfile = {
  principalParticulars: ProfileRow[];
  componentConfiguration: ProfileRow[];
  machineryBlocks: Array<{
    title: string;
    rows: ProfileRow[];
  }>;
  vesselRatingGuide: Array<{
    rating: string;
    sailingInspection: string;
    portInspection: string;
  }>;
  vesselConditionGuide: ConditionGuideRow[];
};

export function buildVesselProfile(vessel: VesselProfileInput): VesselProfile {
  const liveRecord = findLiveVesselRecord(vessel);
  const seed = hashCode(`${vessel.code}-${vessel.name}-${vessel.vesselType ?? ""}`);
  const vesselType = normalizeWhitespace(liveRecord?.VesselType) || vessel.vesselType || "TANKER";
  const isGasCarrier = vesselType.includes("LPG") || vesselType.includes("LNG");
  const isOilTanker = vesselType.includes("OIL") || vesselType.includes("ASPHALT") || vesselType.includes("CHEM");
  const portRegistry = normalizeWhitespace(liveRecord?.PortOfRegistery) || pick(["MAJURO", "SINGAPORE", "PANAMA", "MONROVIA", "HONG KONG"], seed, 0);
  const classNotation = normalizeWhitespace(liveRecord?.Class) || pick(["BV", "LR", "ABS", "NK", "DNV"], seed, 1);
  const owner = pick(
    [
      "PMSLink Maritime Ltd",
      "Ocean Meridian Shipping",
      "Bluewake Tankers",
      "Harbor Crest Marine",
      "Aster Fleet Management",
    ],
    seed,
    2
  );
  const builder = normalizeWhitespace(liveRecord?.ShipBuilder) || pick(
    ["Hyundai Mipo", "New Times Shipyard", "STX Offshore", "Daehan Shipbuilding", "NACKS"],
    seed,
    3
  );
  const builtDate = normalizeWhitespace(liveRecord?.BuiltDate) || formatDateValue(liveRecord?.DeliveredDate) || `${2010 + (seed % 13)}`;
  const managementDate = formatDateValue(liveRecord?.DeliveredDate) || `${String((seed % 27) + 1).padStart(2, "0")}/04/${2010 + (seed % 13) + 1}`;
  const loa = liveRecord?.LOA ? String(liveRecord.LOA) : `${isGasCarrier ? 228 + (seed % 18) : 178 + (seed % 42)}.0`;
  const depth = liveRecord?.Depth ? String(liveRecord.Depth) : (16 + ((seed % 35) / 10)).toFixed(1);
  const dwt = liveRecord?.SummerDeadWeight ? String(liveRecord.SummerDeadWeight) : `${isGasCarrier ? 28000 + (seed % 9000) : 36000 + (seed % 52000)}`;
  const lsaCapacity = liveRecord?.LifeBoatCapacity ? String(liveRecord.LifeBoatCapacity) : `${18 + (seed % 8)}`;
  const maker = firstToken(normalizeWhitespace(liveRecord?.EngineType)) || (isGasCarrier ? "MAN B&W" : "Wartsila");
  const engineModel = normalizeWhitespace(liveRecord?.EngineModel) || normalizeWhitespace(liveRecord?.EngineType) || (isGasCarrier
    ? pick(["6S50ME-C9.6", "5G70ME-C10.5", "6G60ME-C10.5"], seed, 4)
    : pick(["6RT-flex50D", "6S60MC-C", "5RT-flex58T", "6UEC50LS"], seed, 5));
  const auxMaker = firstToken(normalizeWhitespace(liveRecord?.AuxiliaryEngineType)) || pick(["Yanmar", "Daihatsu", "MAN", "Caterpillar"], seed, 6);
  const auxModel = normalizeWhitespace(liveRecord?.AuxEngineModel) || normalizeWhitespace(liveRecord?.AuxiliaryEngineType) || pick(["6EY22ALW", "6DL-20", "L27/38", "3516B"], seed, 7);
  const boilerMaker = normalizeWhitespace(liveRecord?.BoilerManufacturer) || pick(["GESAB", "Aalborg", "Miura"], seed, 8);
  const iggMaker = normalizeWhitespace(liveRecord?.GGManufacturer) || (isGasCarrier ? "N/A" : pick(["Marflex", "Coldharbour", "Qingdao"], seed, 9));
  const nitrogenMaker = normalizeWhitespace(liveRecord?.NGManufacturer) || (isGasCarrier ? pick(["Air Liquide", "Atlas Copco", "Nikkiso"], seed, 10) : "N/A");
  const manager = normalizeWhitespace(liveRecord?.Management) || vessel.manager || "Not recorded";
  const registeredOwner = normalizeWhitespace(liveRecord?.RegisteredOwner) || owner;

  return {
    principalParticulars: [
      { label: "Ship Name", value: vessel.name },
      { label: "IMO Number", value: vessel.imoNumber ?? "Not recorded" },
      { label: "Solas/Marpol/ISM Category", value: vesselType },
      { label: "Flag Registry", value: normalizeWhitespace(liveRecord?.Flag) || vessel.flag || "Not recorded" },
      { label: "Port of Registry", value: portRegistry },
      { label: "Classification", value: classNotation },
      { label: "Fleet", value: vessel.fleet ?? "Not recorded" },
      { label: "Manager / Owner", value: `${manager} / ${registeredOwner}` },
      { label: "Depth Moulded", value: `${depth} m` },
      { label: "Summer Deadweight", value: `${dwt} t` },
      { label: "Length Overall", value: `${loa} m` },
      { label: "Delivery / Management Date", value: `${builtDate} / ${managementDate}` },
      { label: "LSA Capacity", value: lsaCapacity },
      { label: "Builder", value: builder },
    ],
    componentConfiguration: [
      { label: "Lifeboat", value: liveRecord?.LifeBoatCapacity ? `Capacity ${liveRecord.LifeBoatCapacity}` : pick(["Free Fall Lifeboat", "Davit launched life boats"], seed, 11) },
      {
        label: "Fixed firefighting system - Deck",
        value: pick(["Fixed Foam System", "Fixed DCP System", "Fixed CO2"], seed, 12),
      },
      {
        label: "Fixed firefighting system - Engine Room",
        value: pick(["Fixed CO2 / IG system", "Fixed Foam System", "Hi-Fog"], seed, 13),
      },
      { label: "Deck Crane", value: pick(["Yes", "No"], seed, 14) },
      { label: "Elevator", value: pick(["Yes", "No"], seed, 15) },
      { label: "Bow Thruster", value: typeof liveRecord?.IsBowThruster === "boolean" ? (liveRecord.IsBowThruster ? "Yes" : "No") : pick(["Yes", "No"], seed, 16) },
      {
        label: "Inert Gas System",
        value: normalizeWhitespace(liveRecord?.GGType) || (isGasCarrier ? "Inert gas / cargo reliquefaction support" : "Boiler uptake / IG generator / Other"),
      },
      {
        label: "For Oil Tankers",
        value: isOilTanker ? "Pump room / FRAMO / MARFLEX / Submersible pumps" : "Not applicable",
      },
      { label: "LNG Bunker System", value: vesselType.includes("LNG") ? "Yes" : "No" },
      { label: "UMS System", value: pick(["Yes", "No"], seed, 17) },
      { label: "COW System", value: isOilTanker ? "Yes" : "No" },
      { label: "Helicopter", value: pick(["Yes", "No"], seed, 18) },
      { label: "Hatch Cover", value: vesselType.includes("TANKER") ? "Not applicable" : pick(["Yes", "No"], seed, 19) },
      { label: "AMP System", value: pick(["Yes", "No"], seed, 20) },
      { label: "Scrubber System", value: pick(["Open loop", "Hybrid", "None"], seed, 21) },
      { label: "Steering Gear System", value: pick(["Ram type / Rotary vane", "Rotary vane", "Electro-hydraulic ram"], seed, 22) },
    ],
    machineryBlocks: [
      {
        title: "Main Engine Details",
        rows: [
          { label: "Maker", value: normalizeWhitespace(liveRecord?.EngineType) || maker },
          { label: "Model / Type", value: `${maker} / ${engineModel}` },
          { label: "MCR", value: normalizeWhitespace(liveRecord?.MCR) || `${6200 + (seed % 2600)} kW @ ${90 + (seed % 10)} rpm` },
          { label: "NCR", value: normalizeWhitespace(liveRecord?.NCR) || `${5600 + (seed % 2100)} kW @ ${84 + (seed % 9)} rpm` },
        ],
      },
      {
        title: "Auxiliary Engine Details",
        rows: [
          { label: "Maker", value: normalizeWhitespace(liveRecord?.AuxiliaryEngineType) || auxMaker },
          { label: "Model / Type", value: `${auxMaker} / ${auxModel}` },
          { label: "Number of Auxiliary Engines", value: stringifyValue(liveRecord?.NoofAuxEngines) || `${2 + (seed % 3)}` },
          { label: "Rated Power", value: normalizeWhitespace(liveRecord?.RatedPower) || `${900 + (seed % 650)} kW @ 900 rpm` },
          { label: "Alternators", value: stringifyValue(liveRecord?.Alternators) || `${2 + (seed % 3)}` },
        ],
      },
      {
        title: "Auxiliary Boiler Details",
        rows: [
          { label: "No. of Boilers", value: stringifyValue(liveRecord?.NoofBoilers) || `${1 + (seed % 2)}` },
          { label: "Manufacturer", value: boilerMaker },
          { label: "Type", value: normalizeWhitespace(liveRecord?.BoilerType) || pick(["TBH", "Composite", "Water tube"], seed, 23) },
        ],
      },
      {
        title: "Exhaust Gas Boiler Details",
        rows: [
          { label: "Manufacturer", value: normalizeWhitespace(liveRecord?.GBManufacturer) || `${boilerMaker} Composite` },
          { label: "Type", value: normalizeWhitespace(liveRecord?.GBType) || pick(["Composite", "Economiser", "PC3101P13"], seed, 24) },
          { label: "Evaporation Rate", value: normalizeWhitespace(liveRecord?.GBEvaporationRate) || `${4 + (seed % 6)} t/hr` },
        ],
      },
      {
        title: "Inert Gas Generator Details",
        rows: [
          { label: "Manufacturer", value: iggMaker },
          { label: "Type", value: normalizeWhitespace(liveRecord?.GGType) || (iggMaker === "N/A" ? "N/A" : pick(["Deck mounted", "Skid mounted", "Integrated"], seed, 25)) },
          { label: "Capacity", value: normalizeWhitespace(liveRecord?.GGType) || (iggMaker === "N/A" ? "N/A" : `${4500 + (seed % 1800)} Nm3/h`) },
        ],
      },
      {
        title: "Nitrogen Generator Details",
        rows: [
          { label: "Manufacturer", value: nitrogenMaker },
          { label: "Type", value: normalizeWhitespace(liveRecord?.NGType) || (nitrogenMaker === "N/A" ? "N/A" : pick(["Membrane", "PSA"], seed, 26)) },
          { label: "Purity", value: nitrogenMaker === "N/A" ? "N/A" : `Up to ${95 + (seed % 4)}%` },
        ],
      },
      {
        title: "Cargo Pumps and Power Packs",
        rows: [
          { label: "Manufacturer", value: isOilTanker ? pick(["FRAMO", "Marflex", "Hamworthy"], seed, 27) : "N/A" },
          { label: "Type", value: isOilTanker ? pick(["Hydraulic deepwell", "Submerged cargo pump", "Pump room driven"], seed, 28) : "N/A" },
        ],
      },
      {
        title: "Cargo Booster Pumps",
        rows: [
          { label: "Manufacturer", value: isOilTanker ? pick(["FRAMO", "Marflex", "N/A"], seed, 29) : "N/A" },
          { label: "Type", value: isOilTanker ? pick(["Vertical booster", "Horizontal booster", "N/A"], seed, 30) : "N/A" },
        ],
      },
      {
        title: "Steering gear / Emergency Steering",
        rows: [
          { label: "Manufacturer", value: pick(["Rolls Royce", "Tenfjord", "Kawasaki"], seed, 31) },
          { label: "Type", value: pick(["Denison T7DSB42", "Rotary vane", "Electro-hydraulic ram"], seed, 32) },
        ],
      },
    ],
    vesselRatingGuide: [
      {
        rating: "HIGH (Good Vessel)",
        sailingInspection:
          'Irrespective of severity, number of mandatory questions answered with findings should be <= 10% of total mandatory questions for "Sailing" option.',
        portInspection:
          'Irrespective of severity, number of mandatory questions answered with findings should be <= 10% of total mandatory questions for "P/S" option.',
      },
      {
        rating: 'MEDIUM (Vessel can be improved to "HIGH" rating)',
        sailingInspection:
          'Irrespective of severity, number of mandatory questions answered with findings should be > 10% and <= 20% of total mandatory questions for "Sailing" option.',
        portInspection:
          'Irrespective of severity, number of mandatory questions answered with findings should be > 10% and <= 20% of total mandatory questions for "P/S" option.',
      },
      {
        rating: "LOW (Concern Vessel)",
        sailingInspection:
          'Irrespective of severity, number of mandatory questions answered with findings should be > 20% of total mandatory questions for "Sailing" option.',
        portInspection:
          'Irrespective of severity, number of mandatory questions answered with findings should be > 20% of total mandatory questions for "P/S" option.',
      },
    ],
    vesselConditionGuide: [
      {
        description: "Rust marks",
        criteria: "No rust marks and no discolouration",
        scoreRange: "5",
        referenceImageUrl: "/reference-images/deck-reference.svg",
      },
      {
        description: "Rust marks",
        criteria: "Spot rust marks below 10%",
        scoreRange: "4",
        referenceImageUrl: "/reference-images/deck-reference.svg",
      },
      {
        description: "Rust marks",
        criteria: "Breaking of coating and rust marks between 10 and 20%",
        scoreRange: "3",
        referenceImageUrl: "/reference-images/deck-reference.svg",
      },
      {
        description: "Rust marks",
        criteria: "More than 20%",
        scoreRange: "2",
        referenceImageUrl: "/reference-images/deck-reference.svg",
      },
      {
        description: "Structural",
        criteria: "Damages / damages with COC",
        scoreRange: "2-3",
      },
      {
        description: "Machinery and Equipments",
        criteria: "Operational without defect / with possible rectification / non-operational",
        scoreRange: "2-5",
      },
      {
        description: "Emergency Equipments",
        criteria: "Operational without defect / with possible rectification / non-operational",
        scoreRange: "1-5",
      },
      {
        description: "Documentation",
        criteria: "Records, certification, dispensation, COC, and short-term certification compliance",
        scoreRange: "2-3",
      },
    ],
  };
}

function findLiveVesselRecord(vessel: VesselProfileInput) {
  const code = vessel.code.trim().toUpperCase();
  const name = vessel.name.trim().toUpperCase();
  const imo = (vessel.imoNumber ?? "").trim();

  return (liveUserVessels as LiveUserVesselRecord[]).find((record) => {
    const recordCode = (record.VesselCode ?? "").trim().toUpperCase();
    const recordName = (record.VesselName ?? "").trim().toUpperCase();
    const recordImo = record.ImoNo == null ? "" : String(record.ImoNo).trim();
    return recordCode === code || recordName === name || (imo !== "" && recordImo === imo);
  });
}

function normalizeWhitespace(value: string | undefined | null) {
  return value?.replace(/\s+/g, " ").trim() ?? "";
}

function stringifyValue(value: string | number | undefined | null) {
  if (value == null) {
    return "";
  }
  return String(value).trim();
}

function formatDateValue(value: string | undefined | null) {
  const normalized = normalizeWhitespace(value);
  if (!normalized) {
    return "";
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(normalized)) {
    return normalized;
  }
  const parsed = new Date(normalized);
  if (Number.isNaN(parsed.getTime())) {
    return normalized;
  }
  return `${String(parsed.getUTCDate()).padStart(2, "0")}/${String(parsed.getUTCMonth() + 1).padStart(2, "0")}/${parsed.getUTCFullYear()}`;
}

function firstToken(value: string) {
  return value.split(/\s+/).filter(Boolean).slice(0, 2).join(" ");
}

function pick<T>(values: readonly T[], seed: number, offset: number): T {
  return values[Math.abs(seed + offset) % values.length]!;
}

function hashCode(value: string) {
  let hash = 0;

  for (let index = 0; index < value.length; index += 1) {
    hash = (hash * 31 + value.charCodeAt(index)) | 0;
  }

  return Math.abs(hash);
}
