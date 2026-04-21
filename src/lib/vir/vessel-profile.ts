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
  const seed = hashCode(`${vessel.code}-${vessel.name}-${vessel.vesselType ?? ""}`);
  const vesselType = vessel.vesselType ?? "TANKER";
  const isGasCarrier = vesselType.includes("LPG") || vesselType.includes("LNG");
  const portRegistry = pick(["MAJURO", "SINGAPORE", "PANAMA", "MONROVIA", "HONG KONG"], seed, 0);
  const classNotation = pick(["BV", "LR", "ABS", "NK", "DNV"], seed, 1);
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
  const builder = pick(
    ["Hyundai Mipo", "New Times Shipyard", "STX Offshore", "Daehan Shipbuilding", "NACKS"],
    seed,
    3
  );
  const builtYear = 2010 + (seed % 13);
  const managementDate = `${String((seed % 27) + 1).padStart(2, "0")}/04/${builtYear + 1}`;
  const loa = isGasCarrier ? 228 + (seed % 18) : 178 + (seed % 42);
  const depth = (16 + ((seed % 35) / 10)).toFixed(1);
  const dwt = isGasCarrier ? `${28000 + (seed % 9000)}` : `${36000 + (seed % 52000)}`;
  const lsaCapacity = `${18 + (seed % 8)}`;
  const maker = isGasCarrier ? "MAN B&W" : "Wartsila";
  const engineModel = isGasCarrier
    ? pick(["6S50ME-C9.6", "5G70ME-C10.5", "6G60ME-C10.5"], seed, 4)
    : pick(["6RT-flex50D", "6S60MC-C", "5RT-flex58T", "6UEC50LS"], seed, 5);
  const auxMaker = pick(["Yanmar", "Daihatsu", "MAN", "Caterpillar"], seed, 6);
  const auxModel = pick(["6EY22ALW", "6DL-20", "L27/38", "3516B"], seed, 7);
  const boilerMaker = pick(["GESAB", "Aalborg", "Miura"], seed, 8);
  const iggMaker = isGasCarrier ? "N/A" : pick(["Marflex", "Coldharbour", "Qingdao"], seed, 9);
  const nitrogenMaker = isGasCarrier ? pick(["Air Liquide", "Atlas Copco", "Nikkiso"], seed, 10) : "N/A";

  return {
    principalParticulars: [
      { label: "Ship Name", value: vessel.name },
      { label: "IMO Number", value: vessel.imoNumber ?? "Not recorded" },
      { label: "Solas/Marpol/ISM Category", value: vesselType },
      { label: "Flag Registry", value: vessel.flag ?? "Not recorded" },
      { label: "Port of Registry", value: portRegistry },
      { label: "Classification", value: classNotation },
      { label: "Fleet", value: vessel.fleet ?? "Not recorded" },
      { label: "Manager / Owner", value: `${vessel.manager ?? "Not recorded"} / ${owner}` },
      { label: "Depth Moulded", value: `${depth} m` },
      { label: "Summer Deadweight", value: `${dwt} t` },
      { label: "Length Overall", value: `${loa}.0 m` },
      { label: "Delivery / Management Date", value: `${builtYear} / ${managementDate}` },
      { label: "LSA Capacity", value: lsaCapacity },
      { label: "Builder", value: builder },
    ],
    componentConfiguration: [
      { label: "Lifeboat", value: pick(["Free Fall Lifeboat", "Davit launched life boats"], seed, 11) },
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
      { label: "Bow Thruster", value: pick(["Yes", "No"], seed, 16) },
      { label: "Inert Gas System", value: isGasCarrier ? "Inert gas / cargo reliquefaction support" : "Boiler uptake / IG generator" },
      { label: "For Oil Tankers", value: vesselType.includes("OIL") ? "Pump room / FRAMO / Deepwell mix" : "Not applicable" },
      { label: "LNG Bunker System", value: vesselType.includes("LNG") ? "Yes" : "No" },
      { label: "UMS System", value: pick(["Yes", "No"], seed, 17) },
      { label: "COW System", value: vesselType.includes("OIL") ? "Yes" : "No" },
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
          { label: "Maker", value: maker },
          { label: "Model / Type", value: `${maker} / ${engineModel}` },
          { label: "MCR", value: `${6200 + (seed % 2600)} kW @ ${90 + (seed % 10)} rpm` },
          { label: "NCR", value: `${5600 + (seed % 2100)} kW @ ${84 + (seed % 9)} rpm` },
        ],
      },
      {
        title: "Auxiliary Engine Details",
        rows: [
          { label: "Maker", value: auxMaker },
          { label: "Model / Type", value: `${auxMaker} / ${auxModel}` },
          { label: "Number of Auxiliary Engines", value: `${2 + (seed % 3)}` },
          { label: "Rated Power", value: `${900 + (seed % 650)} kW` },
          { label: "Alternator", value: `Taiyo Electric / ${950 + (seed % 240)} kW / 900 rpm` },
        ],
      },
      {
        title: "Auxiliary Boiler Details",
        rows: [
          { label: "No. of Boilers", value: `${1 + (seed % 2)}` },
          { label: "Manufacturer", value: boilerMaker },
          { label: "Type", value: pick(["TBH", "Composite", "Water tube"], seed, 23) },
        ],
      },
      {
        title: "Exhaust Gas Boiler Details",
        rows: [
          { label: "Manufacturer", value: boilerMaker },
          { label: "Type", value: pick(["TBH", "Composite", "Economiser"], seed, 24) },
          { label: "Evaporation Rate", value: `${4 + (seed % 6)} t/hr` },
        ],
      },
      {
        title: "Inert Gas Generator Details",
        rows: [
          { label: "Manufacturer", value: iggMaker },
          { label: "Type", value: iggMaker === "N/A" ? "N/A" : pick(["Deck mounted", "Skid mounted", "Integrated"], seed, 25) },
          { label: "Capacity", value: iggMaker === "N/A" ? "N/A" : `${4800 + (seed % 1600)} m3/hr` },
        ],
      },
      {
        title: "Nitrogen Generator Details",
        rows: [
          { label: "Manufacturer", value: nitrogenMaker },
          { label: "Type", value: nitrogenMaker === "N/A" ? "N/A" : pick(["Membrane", "PSA"], seed, 26) },
          { label: "Purity", value: nitrogenMaker === "N/A" ? "N/A" : `Up to ${95 + (seed % 4)}%` },
        ],
      },
    ],
    vesselRatingGuide: [
      {
        rating: "HIGH (Good Vessel)",
        sailingInspection: "Irrespective of severity, number of mandatory questions answered with findings should be ≤ 10% of total mandatory questions.",
        portInspection: "Irrespective of severity, number of mandatory questions answered with findings should be ≤ 10% of total mandatory questions.",
      },
      {
        rating: "MEDIUM (Vessel can be improved to HIGH rating)",
        sailingInspection: "Mandatory questions answered with findings should be > 10% and ≤ 20% of total mandatory questions.",
        portInspection: "Mandatory questions answered with findings should be > 10% and ≤ 20% of total mandatory questions.",
      },
      {
        rating: "LOW (Concern Vessel)",
        sailingInspection: "Mandatory questions answered with findings should be > 20% of total mandatory questions.",
        portInspection: "Mandatory questions answered with findings should be > 20% of total mandatory questions.",
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
