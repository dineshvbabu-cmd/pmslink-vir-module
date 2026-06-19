export type DemoVesselSeed = {
  code: string;
  name: string;
  imoNumber: string;
  vesselType: string;
  fleet: string;
  flag: string;
  manager: string;
};

export const DEMO_INSPECTOR_COMPANY = "PMSLink QHSE";

export const DEMO_VESSELS: DemoVesselSeed[] = [
  {
    code: "ASMALK001",
    name: "Alkebulan",
    imoNumber: "9769101",
    vesselType: "CHEM / PROD TANKER",
    fleet: "ASM",
    flag: "MARSHALL ISLANDS",
    manager: "ASM",
  },
  {
    code: "ASMWAT001",
    name: "Watson",
    imoNumber: "9769102",
    vesselType: "MR TANKER",
    fleet: "ASM",
    flag: "PANAMA",
    manager: "ASM",
  },
  {
    code: "ASMRAT001",
    name: "Rathbone",
    imoNumber: "9769103",
    vesselType: "PRODUCT TANKER",
    fleet: "ASM",
    flag: "LIBERIA",
    manager: "ASM",
  },
  {
    code: "ASMSHE001",
    name: "Sherlock",
    imoNumber: "9769104",
    vesselType: "CHEM / PROD TANKER",
    fleet: "ASM",
    flag: "MARSHALL ISLANDS",
    manager: "ASM",
  },
  {
    code: "ASMBUR001",
    name: "Buran",
    imoNumber: "9769105",
    vesselType: "MR TANKER",
    fleet: "ASM",
    flag: "PANAMA",
    manager: "ASM",
  },
  {
    code: "UMLBDP001",
    name: "BDP Spirit",
    imoNumber: "9769106",
    vesselType: "CHEM / PROD TANKER",
    fleet: "UML",
    flag: "MARSHALL ISLANDS",
    manager: "UML",
  },
  {
    code: "UMLOMB001",
    name: "OM Borneo",
    imoNumber: "9769107",
    vesselType: "PRODUCT TANKER",
    fleet: "UML",
    flag: "SINGAPORE",
    manager: "UML",
  },
  {
    code: "UMLWES001",
    name: "Westmore",
    imoNumber: "9769108",
    vesselType: "MR TANKER",
    fleet: "UML",
    flag: "PANAMA",
    manager: "UML",
  },
  {
    code: "UMLMON001",
    name: "Montagu",
    imoNumber: "9769109",
    vesselType: "CHEM / PROD TANKER",
    fleet: "UML",
    flag: "LIBERIA",
    manager: "UML",
  },
  {
    code: "UMLMIN001",
    name: "UM Minami",
    imoNumber: "9769110",
    vesselType: "MR TANKER",
    fleet: "UML",
    flag: "MARSHALL ISLANDS",
    manager: "UML",
  },
];

export const TECHNICAL_SUPERINTENDENT_VESSEL_CODES = DEMO_VESSELS.slice(0, 5).map((vessel) => vessel.code);
export const MARINE_SUPERINTENDENT_VESSEL_CODES = DEMO_VESSELS.slice(5).map((vessel) => vessel.code);
export const TSI_VESSEL_CODES = DEMO_VESSELS.map((vessel) => vessel.code);
