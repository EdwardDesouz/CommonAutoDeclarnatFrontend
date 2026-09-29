// ===========================================================================
// headerRules.js — the show / hide / default rules that used to live inside
// the three legacy Header.jsx handlers (DeclarationChange,
// InwardTrasnPortModeChange, OutwardTransportModeChange, CargoPackTypeChange)
// for Inpayment (IPTDEC), InNonPayment (INPDEC) and Out (OUTDEC).
//
// Pure functions only — no React, no imports — so headerTab.jsx, CargoCommon
// and (later) PartyCommon can all ask the same questions and always agree.
//
// Values are matched by their leading CODE ("BKT : Blanket" -> "BKT",
// "4 : Air" -> "4", "9: Containerized" -> "9") instead of the full text, so
// typos / wording differences in the master data do not break a rule.
// ===========================================================================

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

// active module, from moduleConfig.messageType (falls back to the flags)
export function getModuleKey(moduleConfig = {}) {
  const type = String(moduleConfig?.messageType || "").toUpperCase();
  if (type === "IPTDEC" || type === "INPDEC" || type === "OUTDEC") return type;
  // messageType missing/unexpected: try the label ("Inpayment" / "In Non-Payment" / "Out")
  const label = String(moduleConfig?.label || "");
  if (/^\s*out/i.test(label)) return "OUTDEC";
  if (/non/i.test(label)) return "INPDEC";
  if (/pay/i.test(label)) return "IPTDEC";
  if (moduleConfig?.hasCoType) return "OUTDEC";
  if (moduleConfig?.hasOutwardTransportMode) return "INPDEC";
  return "IPTDEC";
}

export function isSelected(value) {
  const text = String(value ?? "").trim();
  return !!text && !/^-+\s*select/i.test(text);
}

export function codeOf(value) {
  if (!isSelected(value)) return "";
  return String(value).split(":")[0].trim().toUpperCase();
}

// "9: Containerized" => container table + UNT rules
export function isContainerized(cargoPackType) {
  return codeOf(cargoPackType) === "9";
}

// sea | air | land (rail/road/mail/multimodal/pipeline) | none (not required)
// | "" (nothing chosen)
export function transportKind(mode) {
  if (!isSelected(mode)) return "";
  const code = codeOf(mode);
  if (code === "1") return "sea";
  if (code === "4") return "air";
  if (["2", "3", "5", "6", "7"].includes(code)) return "land";
  if (code === "N") return "none";
  const text = String(mode);
  if (/sea/i.test(text)) return "sea";
  if (/\bair\b/i.test(text)) return "air";
  if (/rail|road|mail|multi|pipeline/i.test(text)) return "land";
  if (/not\s*required/i.test(text)) return "none";
  return "";
}

// ---------------------------------------------------------------------------
// Declaration-type rules  (legacy DeclarationChange)
// ---------------------------------------------------------------------------
const BASE_DECLARATION_RULES = {
  inwardTransport: true, // Inward Transport Mode field visible in Header
  outwardTransport: false, // Outward Transport Mode field visible in Header
  coType: false, // CO Type field visible in Header (Out)
  claimantParty: false, // Party tab
  consignee: true, // Party tab
  exporter: false, // Party tab
  outwardCarrier: false, // Party tab
  storageLocation: true, // Cargo tab
  exhibition: false, // Cargo tab — EXHIBITION / TEMP IMPORT card
  exhibitionStart: false,
  exhibitionEnd: false,
  outItemHawbHbl: false, // Item tab
};

const OUT_NO_INWARD_TRANSPORT = ["APS", "TCE", "TCI", "TCO", "TCR", "TCS"];

export function getDeclarationRules(moduleKey, declarationType) {
  const code = codeOf(declarationType);
  const rules = { ...BASE_DECLARATION_RULES };

  // ---- Inpayment ----------------------------------------------------------
  if (moduleKey === "IPTDEC") {
    rules.claimantParty = code === "BKT" || code === "GST";
    if (code === "BKT") rules.inwardTransport = false;
    return rules;
  }

  // ---- Out ----------------------------------------------------------------
  if (moduleKey === "OUTDEC") {
    rules.outwardTransport = true; // always shown in Out
    rules.coType = true;
    if (OUT_NO_INWARD_TRANSPORT.includes(code)) {
      rules.inwardTransport = false;
    } else if (code === "BKT") {
      rules.inwardTransport = false;
      rules.coType = false;
    }
    return rules;
  }

  // ---- InNonPayment -------------------------------------------------------
  if (!code) return rules; // nothing chosen yet

  switch (code) {
    case "BKT": // blanket
      rules.inwardTransport = false;
      rules.exhibition = true;
      rules.exhibitionStart = true; // start date only
      rules.consignee = false;
      rules.claimantParty = true;
      break;
    case "TCE":
    case "TCO":
    case "TCR":
    case "TCS": // temporary import
      rules.consignee = false;
      rules.exhibition = true;
      rules.exhibitionStart = true;
      rules.exhibitionEnd = true;
      break;
    case "REX": // re-export
      rules.outItemHawbHbl = true;
      rules.outwardTransport = true;
      rules.exporter = true;
      rules.outwardCarrier = true;
      break;
    case "SFZ": // storage in FTZ
      rules.outItemHawbHbl = true;
      rules.outwardTransport = true;
      rules.outwardCarrier = true;
      break;
    case "GTR": // GST relief
      rules.consignee = false;
      rules.claimantParty = true;
      break;
    case "SHO": // shut-out
      rules.consignee = false;
      rules.storageLocation = false;
      break;
    default: // DES, APS, TCI and any other code keep the defaults
      break;
  }
  return rules;
}

// ---------------------------------------------------------------------------
// Transport-mode rules  (legacy Inward/OutwardTransportModeChange)
// ---------------------------------------------------------------------------
const INWARD_FIELDS_BY_KIND = {
  sea: ["voyageNumber", "vesselName", "obl"],
  land: ["conveyanceNumber", "transportId"],
  air: ["flightNumber", "aircraftRegNo", "mawb"],
};

const OUTWARD_FIELDS_BY_KIND = {
  sea: [
    "outVoyageNumber",
    "outVesselName",
    "outObl",
    "outHawb",
    "vesselType",
    "vesselNetRegisterTonnage",
    "vesselNationality",
    "towingVesselId",
    "towingVesselName",
    "nextPort",
    "lastPort",
    "seaStore",
  ],
  land: ["outHawb", "outConveyanceNumber", "outTransportId"],
  air: ["outHawb", "outFlightNumber", "outAircraftRegNo", "outMawb"],
};

// ids are CARGO_FIELD_SPECS keys (CargoCommon.jsx)
export const INWARD_FIELD_IDS = [
  "voyageNumber",
  "vesselName",
  "obl",
  "conveyanceNumber",
  "transportId",
  "flightNumber",
  "aircraftRegNo",
  "mawb",
];

export const OUTWARD_FIELD_IDS = [
  "outVoyageNumber",
  "outVesselName",
  "outObl",
  "outHawb",
  "outConveyanceNumber",
  "outTransportId",
  "outFlightNumber",
  "outAircraftRegNo",
  "outMawb",
  "vesselType",
  "vesselNetRegisterTonnage",
  "vesselNationality",
  "towingVesselId",
  "towingVesselName",
];

export const OUTWARD_LOCATION_IDS = ["nextPort", "lastPort"];

export function getInwardTransportFields(mode) {
  return new Set(INWARD_FIELDS_BY_KIND[transportKind(mode)] || []);
}

export function getOutwardTransportFields(mode) {
  return new Set(OUTWARD_FIELDS_BY_KIND[transportKind(mode)] || []);
}

// legacy: Air => HAWB, Sea / Rail / Road / Mail / ... => HBL, blank => HAWB/HBL
export function outwardHawbLabel(mode) {
  const kind = transportKind(mode);
  if (kind === "air") return "HAWB";
  if (kind === "sea" || kind === "land") return "HBL";
  return "HAWB/HBL";
}

// ---------------------------------------------------------------------------
// What the Cargo tab should show
// ---------------------------------------------------------------------------
export function getCargoRules(
  moduleKey,
  { declarationType, inwardMode, outwardMode },
) {
  const decl = getDeclarationRules(moduleKey, declarationType);
  const inKind = transportKind(inwardMode);
  const outKind = transportKind(outwardMode);
  const inpayment = moduleKey === "IPTDEC";
  const hasInwardMode = inKind !== "" && inKind !== "none";
  const hasOutwardMode = outKind !== "" && outKind !== "none";

  return {
    // Inpayment always has the card (Blanket Start Date lives in it);
    // InNonPayment / Out only once a real inward mode is chosen.
    showInward: inpayment || (decl.inwardTransport && hasInwardMode),
    // Inpayment "N : Not Required" keeps the card but hides arrival/port/HAWB
    inwardNotRequired: inpayment && inKind === "none",
    inwardFields: decl.inwardTransport
      ? getInwardTransportFields(inwardMode)
      : new Set(),

    showOutward: !inpayment && decl.outwardTransport && hasOutwardMode,
    outwardFields: getOutwardTransportFields(outwardMode),

    storageLocation: decl.storageLocation,
    exhibition: decl.exhibition,
    exhibitionStart: decl.exhibitionStart,
    exhibitionEnd: decl.exhibitionEnd,
  };
}

// ---------------------------------------------------------------------------
// What the Party tab should show (same handlers set these flags in legacy).
// Not wired into PartyCommon yet — exported so it can be.
// ---------------------------------------------------------------------------
export function getPartyRules(
  moduleKey,
  { declarationType, inwardMode, outwardMode },
) {
  const decl = getDeclarationRules(moduleKey, declarationType);
  const inKind = transportKind(inwardMode);
  const outKind = transportKind(outwardMode);

  const rules = {
    claimantParty: decl.claimantParty,
    consignee: decl.consignee,
    exporter: decl.exporter,
    outwardCarrier: decl.outwardCarrier,
    inwardCarrier: false,
    importer: false,
  };

  if (moduleKey === "OUTDEC") {
    rules.importer = isSelected(inwardMode);
    rules.inwardCarrier = inKind === "sea" || inKind === "air";
    rules.outwardCarrier =
      outKind === "sea" || outKind === "air" || outKind === "none";
  }
  return rules;
}

// ---------------------------------------------------------------------------
// Change "patches" — what the legacy handlers WROTE when a select changed.
//   clear          : cargo field ids to blank
//   clearLocations : location ids (code + name) to blank
//   set            : { fieldId: value }   (unit ids: totalOuterPackUnit /
//                                          totalGrossWeightUnit)
// headerTab.jsx turns these into onEdit calls.
// ---------------------------------------------------------------------------
function unitPatch(kind, cargoPackType, nonContainerValue) {
  const set = { totalGrossWeightUnit: "" };
  if (kind === "sea") {
    set.totalGrossWeightUnit = "TNE";
    if (isContainerized(cargoPackType)) set.totalOuterPackUnit = "UNT";
    else if (codeOf(cargoPackType) === "5")
      set.totalOuterPackUnit = nonContainerValue;
  } else if (kind === "air") {
    set.totalOuterPackUnit = "PKG";
    set.totalGrossWeightUnit = "KGM";
  }
  return set;
}

export function getInwardModeChangePatch(moduleKey, mode, cargoPackType) {
  const kind = transportKind(mode);
  const patch = { clear: [...INWARD_FIELD_IDS], clearLocations: [], set: {} };

  if (moduleKey === "IPTDEC") patch.clear.push("arrivalDate", "blanketStartDate");
  if (moduleKey === "OUTDEC") patch.clear.push("hawb");

  // Out never touched the UOMs from the inward mode
  if (moduleKey !== "OUTDEC") {
    patch.set = unitPatch(kind, cargoPackType, moduleKey === "IPTDEC" ? "-" : "");
    // Inpayment also reset the outer-pack UOM on every inward change
    if (moduleKey === "IPTDEC" && patch.set.totalOuterPackUnit === undefined) {
      patch.set.totalOuterPackUnit = "";
    }
  }
  return patch;
}

export function getOutwardModeChangePatch(moduleKey, mode, cargoPackType) {
  const kind = transportKind(mode);
  const patch = {
    clear: [...OUTWARD_FIELD_IDS],
    clearLocations: [...OUTWARD_LOCATION_IDS],
    set: {},
  };

  // legacy: choosing --Select-- also blanked these
  if (kind === "") {
    patch.clear.push("departureDate", "finalDestinationCountry");
    patch.clearLocations.push("dischargePort");
  }

  // only Out derived the UOMs from the OUTWARD mode
  if (moduleKey === "OUTDEC") patch.set = unitPatch(kind, cargoPackType, "");
  return patch;
}

// Cargo Pack Type change: Sea + Containerized => UNT, Sea + Non-containerized
// => "-" (Inpayment) / blank (others). Inpayment & InNonPayment look at the
// inward mode, Out looks at the outward mode.
export function getCargoPackChangePatch(
  moduleKey,
  cargoPackType,
  inwardMode,
  outwardMode,
) {
  const patch = { clear: [], clearLocations: [], set: {} };
  const mode = moduleKey === "OUTDEC" ? outwardMode : inwardMode;
  if (transportKind(mode) !== "sea") return patch;

  if (isContainerized(cargoPackType)) {
    patch.set.totalOuterPackUnit = "UNT";
  } else if (codeOf(cargoPackType) === "5") {
    patch.set.totalOuterPackUnit = moduleKey === "IPTDEC" ? "-" : "";
  }
  return patch;
}