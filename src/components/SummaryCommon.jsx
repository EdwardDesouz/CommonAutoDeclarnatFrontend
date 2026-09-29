// SummaryCommon.jsx
import { useState } from "react";
import API from "../api/api";
import { buildCpcPayload } from "./CpcCommon";
import { getModuleConfig } from "./moduleConfig";
import { C } from "./Theme";

// ---------------------------------------------------------------------------
// Endpoints that differ per module (taken 1:1 from the legacy Summary.jsx
// files). commonHeaderEndpoint / mirrorHeaderEndpoint / messageType come
// from moduleConfig.js already (DeclarationPanel uses those today).
// ---------------------------------------------------------------------------
const MODULE_ENDPOINTS = {
  inpayment: {
    mirrorCpc: (id) => `inpayment/postInCpcTable/?PermitId=${id}`,
  },
  innonpayment: {
    mirrorCpc: (id) => `innonpayment/postInnonCpcTable/?PermitId=${id}`,
  },
  out: {
    mirrorCpc: (id) => `out/postOutCpcTable/?PermitId=${id}`,
  },
};
const commonCpcEndpoint = (id) => `/postCpcTable/?PermitId=${id}`;

// ---------------------------------------------------------------------------
// Party master-table checks, per module (mirrors handleSavePermit in each
// legacy file). Party codes are read from the canonical shape already used
// in blankDeclaration(): data.Importer.Code, data.Exporter.Code, etc.
// ---------------------------------------------------------------------------
const PARTY_CHECKS = {
  inpayment: [
    {
      key: "Importer",
      label: "IMPORTER",
      endpoint: "/getCommonImporterTableInfo/",
      matchField: "Code",
    },
    {
      key: "InwardCarrierAgent",
      label: "INWARD CARRIER AGENT",
      endpoint: "/getCommonInwardCarrierAgentTableInfo/",
      matchField: "Code",
    },
    {
      key: "FreightForwarder",
      label: "FREIGHT FORWARDER",
      endpoint: "/getCommonFreightForwarderTable/",
      matchField: "Code",
    },
    {
      key: "ClaimantParty",
      label: "CLAIMANT PARTY",
      endpoint: "/getCommonClaimantPartyTable/",
      matchField: "ClaimantCode",
    },
  ],
  innonpayment: [
    {
      key: "Importer",
      label: "IMPORTER",
      endpoint: "/getCommonImporterTableInfo/",
      matchField: "Code",
    },
    {
      key: "Exporter",
      label: "EXPORTER",
      endpoint: "/getCommonExporterTableInfo/",
      matchField: "Code",
    },
    {
      key: "InwardCarrierAgent",
      label: "INWARD CARRIER AGENT",
      endpoint: "/getCommonInwardCarrierAgentTableInfo/",
      matchField: "Code",
    },
    {
      key: "OutwardCarrierAgent",
      label: "OUTWARD CARRIER AGENT",
      endpoint: "/getCommonOutwardCarrierAgentTableInfo/",
      matchField: "Code",
    },
    {
      key: "FreightForwarder",
      label: "FREIGHT FORWARDER",
      endpoint: "/getCommonFreightForwarderTable/",
      matchField: "Code",
    },
    {
      key: "ClaimantParty",
      label: "CLAIMANT PARTY",
      endpoint: "/getCommonClaimantPartyTable/",
      matchField: "ClaimantCode",
    },
    {
      key: "Consignee",
      label: "CONSIGNEE",
      endpoint: "/getCommonConsigneeTableInfo/",
      matchField: "ConsigneeCode",
    },
  ],
  out: [
    {
      key: "Exporter",
      label: "EXPORTER",
      endpoint: "/getCommonExporterTableInfo/",
      matchField: "Code",
    },
    {
      key: "Importer",
      label: "IMPORTER",
      endpoint: "/getCommonImporterTableInfo/",
      matchField: "Code",
    },
    {
      key: "InwardCarrierAgent",
      label: "INWARD CARRIER AGENT",
      endpoint: "/getCommonInwardCarrierAgentTableInfo/",
      matchField: "Code",
    },
    {
      key: "OutwardCarrierAgent",
      label: "OUTWARD CARRIER AGENT",
      endpoint: "/getCommonOutwardCarrierAgentTableInfo/",
      matchField: "Code",
    },
    {
      key: "FreightForwarder",
      label: "FREIGHT FORWARDER",
      endpoint: "/getCommonFreightForwarderTable/",
      matchField: "Code",
    },
    {
      key: "Consignee",
      label: "CONSIGNEE",
      endpoint: "/getCommonConsigneeTableInfo/",
      matchField: "ConsigneeCode",
    },
    {
      key: "ClaimantParty",
      label: "CLAIMANT PARTY",
      endpoint: "/getCommonClaimantPartyTable/",
      matchField: "ClaimantCode",
    },
    {
      key: "EndUser",
      label: "END USER",
      endpoint: "/getCommonEndUserTableInfo/",
      matchField: "EndUserCode",
    },
    {
      key: "Manufacturer",
      label: "MANUFACTURER",
      endpoint: "/getCommonManufacturerTableInfo/",
      matchField: "ManufacturerCode",
    },
  ],
};

export async function checkPartyMasterTables(data, moduleKey) {
  const checks = PARTY_CHECKS[moduleKey] || [];
  const missing = [];
  for (const check of checks) {
    const code = (data[check.key]?.Code || "").trim();
    if (!code) continue;
    try {
      const res = await API.get(check.endpoint);
      const exists = (res.data || []).some(
        (row) =>
          String(row[check.matchField] || "").toLowerCase() ===
          code.toLowerCase(),
      );
      if (!exists) missing.push({ label: check.label, code });
    } catch (err) {
      console.error(`Failed to verify ${check.label} in master table`, err);
      // legacy behavior: if the check call itself fails, don't block the save
    }
  }
  return missing;
}

// ---------------------------------------------------------------------------
// Validation — one function per module, each a faithful port of that
// module's own legacy runValidation(). No shared conditionals: a field
// check only exists in a module's function if that module's legacy
// Summary.jsx actually performed it. Dispatched by moduleKey below.
// ---------------------------------------------------------------------------
function emptyErrors() {
  return {
    header: [],
    party: [],
    cargo: [],
    invoice: [],
    item: [],
    summary: [],
  };
}

function validateInpayment(data, containers) {
  const errors = emptyErrors();
  let isValid = true;
  const fail = (section, msg) => {
    errors[section].push(msg);
    isValid = false;
  };

  const items = Array.isArray(data.items) ? data.items : [];
  const invoices = Array.isArray(data.invoices) ? data.invoices : [];

  // Freight forwarder <-> HAWB (inward transport mode + Hawb)
  const isHawbMode =
    data.InwardTransportMode === "4 : Air" || !data.InwardTransportMode;
  const hasFreightForwarder = !!(data.FreightForwarder?.Code || "").trim();
  const hasHawb = !!(data.Hawb || "").trim();
  if (isHawbMode) {
    if (hasFreightForwarder && !hasHawb)
      fail("cargo", "CARGO HAWB IS REQUIRED WHEN FREIGHT FORWARDER IS ENTERED");
    if (hasHawb && !hasFreightForwarder)
      fail("party", "FREIGHT FORWARDER IS REQUIRED WHEN CARGO HAWB IS ENTERED");
  }

  // Header
  if (!data.DeclarationType || data.DeclarationType === "--Select--")
    fail("header", "CHECK THE DECLARATION TYPE");
  if (!data.CargoPackType || data.CargoPackType === "--Select--")
    fail("header", "CHECK THE CARGO PACK TYPE");
  if (data.DeclarationType !== "BKT : Blanket") {
    if (!data.InwardTransportMode || data.InwardTransportMode === "--Select--")
      fail("header", "CHECK THE INWARD TRANSPORT MODE");
  }

  // Party
  if (!(data.Importer?.Code || "").trim())
    fail("party", "CHECK THE IMPORTER CRUEI");
  if (!(data.Importer?.Name || "").trim())
    fail("party", "CHECK THE IMPORTER NAME");
  if (
    data.InwardTransportMode === "1 : Sea" ||
    data.InwardTransportMode === "4 : Air"
  ) {
    if (!(data.InwardCarrierAgent?.Code || "").trim())
      fail("party", "CHECK THE INWARD CARRIER CRUEI");
  }

  // Cargo
  if (!data.TotalOuterPack) fail("cargo", "CHECK THE TOTAL OUTER PACK VALUE");
  if (!data.TotalOuterPackUnit || data.TotalOuterPackUnit === "--Select--")
    fail("cargo", "CHECK THE TOTAL OUTER PACK UOM");
  if (!data.TotalGrossWeight) fail("cargo", "CHECK THE TOTAL GROSS WEIGHT");
  if (!data.TotalGrossWeightUnit || data.TotalGrossWeightUnit === "--Select--")
    fail("cargo", "CHECK THE GROSS WEIGHT UOM");
  if (!(data.ReleaseLocation?.Code || "").trim())
    fail("cargo", "CHECK THE RELEASE LOCATION");
  if (!(data.ReceiptLocation?.Code || "").trim())
    fail("cargo", "CHECK THE RECEIPT LOCATION");

  if (data.InwardTransportMode !== "N : Not Required") {
    if (!(data.LoadingPort?.Code || "").trim())
      fail("cargo", "CHECK THE LOADING PORT");
    if (!(data.ArrivalDate || "").trim())
      fail("cargo", "CHECK THE ARRIVAL DATE");
  }
  if (data.InwardTransportMode === "1 : Sea") {
    if (!(data.VoyageNumber || "").trim())
      fail("cargo", "CHECK THE VOYAGE NUMBER");
    if (!(data.VesselName || "").trim()) fail("cargo", "CHECK THE VESSEL NAME");
    if (!(data.Obl || "").trim()) fail("cargo", "CHECK THE OBL");
  }
  if (data.InwardTransportMode === "4 : Air") {
    if (!(data.FlightNumber || "").trim())
      fail("cargo", "CHECK THE FLIGHT NUMBER");
    if (!(data.Mawb || "").trim()) fail("cargo", "CHECK THE MAWB");
  }
  if (data.CargoPackType === "9: Containerized") {
    const hasValidContainer = containers.some(
      (c) => c.isSaved && (c.number || "").trim() !== "",
    );
    if (!hasValidContainer)
      fail("cargo", "CHECK THE CONTAINER — AT LEAST ONE REQUIRED");
  }

  if (invoices.length < 1) fail("invoice", "PLEASE ADD AT LEAST ONE INVOICE");
  if (items.length < 1) fail("item", "PLEASE ADD AT LEAST ONE ITEM");
  if (!data.DeclarationChecked)
    fail("summary", "PLEASE CHECK THE DECLARATION INDICATOR");

  return { isValid, errors };
}

function validateInnonpayment(data, containers) {
  const errors = emptyErrors();
  let isValid = true;
  const fail = (section, msg) => {
    errors[section].push(msg);
    isValid = false;
  };

  const items = Array.isArray(data.items) ? data.items : [];
  const invoices = Array.isArray(data.invoices) ? data.invoices : [];

  // Freight forwarder <-> HAWB (same pattern as inpayment: inward mode + Hawb)
  const isHawbMode =
    data.InwardTransportMode === "4 : Air" || !data.InwardTransportMode;
  const hasFreightForwarder = !!(data.FreightForwarder?.Code || "").trim();
  const hasHawb = !!(data.Hawb || "").trim();
  if (isHawbMode) {
    if (hasFreightForwarder && !hasHawb)
      fail("cargo", "CARGO HAWB IS REQUIRED WHEN FREIGHT FORWARDER IS ENTERED");
    if (hasHawb && !hasFreightForwarder)
      fail("party", "FREIGHT FORWARDER IS REQUIRED WHEN CARGO HAWB IS ENTERED");
  }

  // Header
  if (!data.DeclarationType || data.DeclarationType === "--Select--")
    fail("header", "CHECK THE DECLARATION TYPE");
  if (!data.CargoPackType || data.CargoPackType === "--Select--")
    fail("header", "CHECK THE CARGO PACK TYPE");
  if (
    data.DeclarationType !==
    "BKT : BLANKET [INCLUDING BLANKET GST RELIEF (& DUTY EXEMPTION)]"
  ) {
    if (!data.InwardTransportMode || data.InwardTransportMode === "--Select--")
      fail("header", "CHECK THE INWARD TRANSPORT MODE");
  }
  // legacy pushes this message but does NOT fail validation — kept faithful
  if (
    data.DeclarationType === "REX : FOR RE-EXPORT" ||
    data.DeclarationType === "SFZ : STORAGE IN FTZ"
  ) {
    if (
      !data.OutwardTransportMode ||
      data.OutwardTransportMode === "--Select--"
    )
      errors.header.push("CHECK THE OUTWARD TRANSPORT MODE");
  }

  // Party
  if (!(data.Importer?.Code || "").trim())
    fail("party", "CHECK THE IMPORTER CRUEI");
  if (!(data.Importer?.Name || "").trim())
    fail("party", "CHECK THE IMPORTER NAME");
  if (
    data.InwardTransportMode === "1 : Sea" ||
    data.InwardTransportMode === "4 : Air"
  ) {
    if (!(data.InwardCarrierAgent?.Code || "").trim())
      fail("party", "CHECK THE INWARD CARRIER CRUEI");
  }

  // Cargo
  if (!data.TotalOuterPack) fail("cargo", "CHECK THE TOTAL OUTER PACK VALUE");
  if (!data.TotalOuterPackUnit || data.TotalOuterPackUnit === "--Select--")
    fail("cargo", "CHECK THE TOTAL OUTER PACK UOM");
  if (!data.TotalGrossWeight) fail("cargo", "CHECK THE TOTAL GROSS WEIGHT");
  if (!data.TotalGrossWeightUnit || data.TotalGrossWeightUnit === "--Select--")
    fail("cargo", "CHECK THE GROSS WEIGHT UOM");
  if (!(data.ReleaseLocation?.Code || "").trim())
    fail("cargo", "CHECK THE RELEASE LOCATION");
  if (!(data.ReceiptLocation?.Code || "").trim())
    fail("cargo", "CHECK THE RECEIPT LOCATION");

  if (data.InwardTransportMode !== "N : Not Required") {
    if (!(data.LoadingPort?.Code || "").trim())
      fail("cargo", "CHECK THE LOADING PORT");
    if (!(data.ArrivalDate || "").trim())
      fail("cargo", "CHECK THE ARRIVAL DATE");
  }
  if (data.InwardTransportMode === "1 : Sea") {
    if (!(data.VoyageNumber || "").trim())
      fail("cargo", "CHECK THE VOYAGE NUMBER");
    if (!(data.VesselName || "").trim()) fail("cargo", "CHECK THE VESSEL NAME");
    if (!(data.Obl || "").trim()) fail("cargo", "CHECK THE OBL");
  }
  if (data.InwardTransportMode === "4 : Air") {
    if (!(data.FlightNumber || "").trim())
      fail("cargo", "CHECK THE FLIGHT NUMBER");
    if (!(data.Mawb || "").trim()) fail("cargo", "CHECK THE MAWB");
  }
  if (data.CargoPackType === "9: Containerized") {
    const hasValidContainer = containers.some(
      (c) => c.isSaved && (c.number || "").trim() !== "",
    );
    if (!hasValidContainer)
      fail("cargo", "CHECK THE CONTAINER — AT LEAST ONE REQUIRED");
  }

  if (invoices.length < 1) fail("invoice", "PLEASE ADD AT LEAST ONE INVOICE");
  if (items.length < 1) fail("item", "PLEASE ADD AT LEAST ONE ITEM");
  if (!data.DeclarationChecked)
    fail("summary", "PLEASE CHECK THE DECLARATION INDICATOR");

  return { isValid, errors };
}

function validateOut(data, containers) {
  const errors = emptyErrors();
  let isValid = true;
  const fail = (section, msg) => {
    errors[section].push(msg);
    isValid = false;
  };

  const items = Array.isArray(data.items) ? data.items : [];
  const invoices = Array.isArray(data.invoices) ? data.invoices : [];

  // Freight forwarder <-> HAWB — OUT uses OUTWARD mode + OutHawb, not inward
  const isHawbMode =
    data.OutwardTransportMode === "4 : Air" || !data.OutwardTransportMode;
  const hasFreightForwarder = !!(data.FreightForwarder?.Code || "").trim();
  const hasHawb = !!(data.OutHawb || "").trim();
  if (isHawbMode) {
    if (hasFreightForwarder && !hasHawb)
      fail(
        "cargo",
        "OUT CARGO HAWB IS REQUIRED WHEN FREIGHT FORWARDER IS ENTERED",
      );
    if (hasHawb && !hasFreightForwarder)
      fail(
        "party",
        "FREIGHT FORWARDER IS REQUIRED WHEN OUT CARGO HAWB IS ENTERED",
      );
  }

  // Header — OUT never validates inward transport mode; outward is always mandatory
  if (!data.DeclarationType || data.DeclarationType === "--Select--")
    fail("header", "CHECK THE DECLARATION TYPE");
  if (!data.CargoPackType || data.CargoPackType === "--Select--")
    fail("header", "CHECK THE CARGO PACK TYPE");
  if (!data.OutwardTransportMode || data.OutwardTransportMode === "--Select--")
    fail("header", "CHECK THE OUTWARD TRANSPORT MODE");

  // Party — OUT never validates Importer CRUEI/Name
  if (
    data.InwardTransportMode === "1 : Sea" ||
    data.InwardTransportMode === "4 : Air"
  ) {
    if (!(data.InwardCarrierAgent?.Code || "").trim())
      fail("party", "CHECK THE INWARD CARRIER CRUEI");
  }

  // Cargo
  if (!data.TotalOuterPack) fail("cargo", "CHECK THE TOTAL OUTER PACK VALUE");
  if (!data.TotalOuterPackUnit || data.TotalOuterPackUnit === "--Select--")
    fail("cargo", "CHECK THE TOTAL OUTER PACK UOM");
  if (!data.TotalGrossWeight) fail("cargo", "CHECK THE TOTAL GROSS WEIGHT");
  if (!data.TotalGrossWeightUnit || data.TotalGrossWeightUnit === "--Select--")
    fail("cargo", "CHECK THE GROSS WEIGHT UOM");
  if (!(data.ReleaseLocation?.Code || "").trim())
    fail("cargo", "CHECK THE RELEASE LOCATION");
  if (!(data.ReceiptLocation?.Code || "").trim())
    fail("cargo", "CHECK THE RECEIPT LOCATION");

  // NOTE: no Loading Port / Arrival Date check for OUT — this is the block
  // that was leaking in from the shared function and is now correctly gone.

  if (data.InwardTransportMode === "1 : Sea") {
    if (!(data.VoyageNumber || "").trim())
      fail("cargo", "CHECK THE VOYAGE NUMBER");
    if (!(data.VesselName || "").trim()) fail("cargo", "CHECK THE VESSEL NAME");
    if (!(data.Obl || "").trim()) fail("cargo", "CHECK THE OBL");
  }
  if (data.InwardTransportMode === "4 : Air") {
    if (!(data.FlightNumber || "").trim())
      fail("cargo", "CHECK THE FLIGHT NUMBER");
    if (!(data.Mawb || "").trim()) fail("cargo", "CHECK THE MAWB");
  }
  if (data.CargoPackType === "9: Containerized") {
    const hasValidContainer = containers.some(
      (c) => c.isSaved && (c.number || "").trim() !== "",
    );
    if (!hasValidContainer)
      fail("cargo", "CHECK THE CONTAINER — AT LEAST ONE REQUIRED");
  }

  if (invoices.length < 1) fail("invoice", "PLEASE ADD AT LEAST ONE INVOICE");
  if (items.length < 1) fail("item", "PLEASE ADD AT LEAST ONE ITEM");
  if (!data.DeclarationChecked)
    fail("summary", "PLEASE CHECK THE DECLARATION INDICATOR");

  return { isValid, errors };
}

// Dispatcher — same exported signature as before, so SummaryTabContent
// (handleSavePermitClick) needs no changes at all.
export function runSummaryValidation(data, moduleKey, containers = []) {
  if (moduleKey === "inpayment") return validateInpayment(data, containers);
  if (moduleKey === "innonpayment")
    return validateInnonpayment(data, containers);
  if (moduleKey === "out") return validateOut(data, containers);
  return { isValid: true, errors: emptyErrors() };
}
// ---------------------------------------------------------------------------
// Header payload builder — mirrors doSavePermit()'s headerPayload in each
// legacy file, unified. The module-specific block below (innonpayment/out
// only fields) uses best-guess key names matching your PascalCase model —
// verify these against whatever your Header/Cargo tabs actually set.
// ---------------------------------------------------------------------------
function toApiDate(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}`;
}
function toDecimal(val) {
  if (val === null || val === undefined || val === "") return 0;
  const num = parseFloat(String(val).replace(/,/g, ""));
  return isNaN(num) ? 0 : num;
}

// ---------------------------------------------------------------------------
// computeTotals() — single source of truth for item-derived totals. Both
// the save payload (buildHeaderPayload) and the on-screen Summary grid
// (SummaryTabContent) call this now, so what the user sees before saving
// always matches what actually gets posted.
//
// UPDATED: now takes moduleKey. The "out" module never carries GST /
// Excise Duty / Customs Duty / Other Tax at the item level (the legacy
// Out Summary.jsx never computed these — export permits don't have this
// duty/GST concept). So for "out" we short-circuit and return zeros for
// those fields instead of summing item columns that don't apply, and the
// UI (SummaryTabContent below) hides those boxes entirely rather than
// showing misleading "0.00" values.
// ---------------------------------------------------------------------------

function toBigInt(val) {
  if (val === null || val === undefined || val === "") return null;
  const num = parseInt(val, 10);
  return isNaN(num) ? null : num;
}

function computeTotals(data, moduleKey) {
  const items = Array.isArray(data.items) ? data.items : [];
  const toNum = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };
  const totalCIFFOBValue = items.reduce((s, it) => s + toNum(it.CIFFOB), 0);

  if (moduleKey === "out") {
    return {
      items,
      totalCIFFOBValue,
      totalGSTTaxAmt: 0,
      totalExDutyAmt: 0,
      totalCusDutyAmt: 0,
      totalODutyAmt: 0,
      totalAmountPayable: 0,
    };
  }

  const totalGSTTaxAmt = items.reduce((s, it) => s + toNum(it.GSTAmount), 0);
  const totalExDutyAmt = items.reduce(
    (s, it) => s + toNum(it.ExciseDutyAmount),
    0,
  );
  const totalCusDutyAmt = items.reduce(
    (s, it) => s + toNum(it.CustomsDutyAmount),
    0,
  );
  const totalODutyAmt = items.reduce(
    (s, it) => s + toNum(it.OtherTaxAmount),
    0,
  );
  const totalAmountPayable =
    data.DeclarationType === "DNG : Duty & GST"
      ? totalODutyAmt + totalExDutyAmt + totalGSTTaxAmt + totalCusDutyAmt
      : totalGSTTaxAmt;
  return {
    items,
    totalCIFFOBValue,
    totalGSTTaxAmt,
    totalExDutyAmt,
    totalCusDutyAmt,
    totalODutyAmt,
    totalAmountPayable,
  };
}

// ===========================================================================
// HEADER PAYLOAD BUILDERS — one per module (no shared branching)
// All three follow the inpayment rules:
//   flags  -> "true" / "false"
//   License -> ",,,,"
//   Refid   -> toBigInt()
// ===========================================================================

// ── INPAYMENT ───────────────────────────────────────────────────────────────
export function buildInpaymentHeaderPayload(data, ids, touchUser) {
  const cfg = getModuleConfig("inpayment");
  const {
    items,
    totalCIFFOBValue,
    totalGSTTaxAmt,
    totalExDutyAmt,
    totalCusDutyAmt,
    totalODutyAmt,
    totalAmountPayable,
  } = computeTotals(data, "inpayment");

  const flag = (v) => (v ? "true" : "false");

  let permitNumber = data.PermitNumber || ids?.PermitNumber || "";
  if (permitNumber === "None" || permitNumber === "NONE") permitNumber = "";

  return {
    Refid: toBigInt(ids?.Refid),
    JobId: ids?.JobId || "",
    MSGId: ids?.MSGId || "",
    PermitId: (ids?.PermitId || "").toUpperCase(),
    TradeNetMailboxID: ids?.TradeNetMailboxID || "",
    DeclarantCompanyCode: ids?.DeclarantCompanyCode || "",
    MessageType: data.MessageType || cfg.messageType,

    DeclarationType: data.DeclarationType || "--Select--",
    PreviousPermit: data.PreviousPermitNo || "",
    CargoPackType: data.CargoPackType || "--Select--",
    InwardTransportMode: data.InwardTransportMode || "--Select--",
    BGIndicator: data.BgIndicator || "--Select--",
    SupplyIndicator: flag(data.SupplyIndicator),
    ReferenceDocuments: flag(data.ReferenceDocument),
    License: data.License || ",,,,",
    Recipient: data.Recipient || "--",

    ImporterCompanyCode: data.Importer?.Code || "",
    InwardCarrierAgentCode: data.InwardCarrierAgent?.Code || "",
    FreightForwarderCode: data.FreightForwarder?.Code || "",
    ClaimantPartyCode: data.ClaimantParty?.Code || "",

    HBL: data.Hawb || "",
    ArrivalDate: toApiDate(data.ArrivalDate),
    LoadingPortCode: data.LoadingPort?.Code || "",
    VoyageNumber: data.VoyageNumber || "",
    VesselName: data.VesselName || "",
    OceanBillofLadingNo: data.Obl || "",
    ConveyanceRefNo: data.ConveyanceNumber || "",
    TransportId: data.TransportDetails || "",
    FlightNO: data.FlightNumber || "",
    AircraftRegNo: data.AircraftRegNo || "",
    MasterAirwayBill: data.Mawb || "",
    ReleaseLocation: data.ReleaseLocation?.Code || "",
    ResLoaName: data.ReleaseLocation?.Name || "",
    RecepitLocation: data.ReceiptLocation?.Code || "",
    RecepitLocName: data.ReceiptLocation?.Name || "",
    TotalOuterPack: data.TotalOuterPack || "",
    TotalOuterPackUOM: data.TotalOuterPackUnit || "",
    TotalGrossWeight:
      data.PermitGrossWeight !== "" && data.PermitGrossWeight != null
        ? data.PermitGrossWeight
        : data.TotalGrossWeight || "",
    TotalGrossWeightUOM: data.TotalGrossWeightUnit || "",
    BlanketStartDate: toApiDate(data.BlanketStartDate) || "1900-01-01",

    NumberOfItems: items.length,
    TotalCIFFOBValue: toDecimal(totalCIFFOBValue),
    TotalGSTTaxAmt: toDecimal(totalGSTTaxAmt),
    TotalExDutyAmt: toDecimal(totalExDutyAmt),
    TotalCusDutyAmt: toDecimal(totalCusDutyAmt),
    TotalODutyAmt: toDecimal(totalODutyAmt),
    TotalAmtPay: toDecimal(totalAmountPayable),

    Status: "LLMNEW",
    TouchUser: (touchUser || "").toUpperCase(),
    TouchTime: new Date().toISOString(),
    PermitNumber: permitNumber,
    prmtStatus: data.prmtStatus || data.PrmtStatus || ids?.prmtStatus || "NEW",
    Cnb: flag(data.cpc?.CNB?.on),
    DeclareIndicator: flag(data.DeclarationChecked),
    DeclarningFor: data.DeclaringFor || data.DeclFor || "--Select--",
    MRDate: toApiDate(data.MRDate),
    MRTime: data.MRTime || "",

    GrossReference: data.CrossReference || "",
    TradeRemarks: data.TradeRemarks || "",
    InternalRemarks: data.InternalRemarks || "",
    CustomerRemarks: data.CustomerRemarks || "",
    gstVerified: data.ApprovedBy || "",
  };
}

// ── INNONPAYMENT ────────────────────────────────────────────────────────────
export function buildInnonpaymentHeaderPayload(data, ids, touchUser) {
  const cfg = getModuleConfig("innonpayment");
  const {
    items,
    totalCIFFOBValue,
    totalGSTTaxAmt,
    totalExDutyAmt,
    totalCusDutyAmt,
    totalODutyAmt,
    totalAmountPayable,
  } = computeTotals(data, "innonpayment");

  const flag = (v) => (v ? "true" : "false");

  let permitNumber = data.PermitNumber || ids?.PermitNumber || "";
  if (permitNumber === "None" || permitNumber === "NONE") permitNumber = "";

  return {
    Refid: toBigInt(ids?.Refid),
    JobId: ids?.JobId || "",
    MSGId: ids?.MSGId || "",
    PermitId: (ids?.PermitId || "").toUpperCase(),
    TradeNetMailboxID: ids?.TradeNetMailboxID || "",
    DeclarantCompanyCode: ids?.DeclarantCompanyCode || "",
    MessageType: data.MessageType || cfg.messageType,

    DeclarationType: data.DeclarationType || "--Select--",
    PreviousPermit: data.PreviousPermitNo || "",
    CargoPackType: data.CargoPackType || "--Select--",
    InwardTransportMode: data.InwardTransportMode || "--Select--",
    OutwardTransportMode: data.OutwardTransportMode || "--Select--",
    BGIndicator: data.BgIndicator || "--Select--",
    SupplyIndicator: flag(data.SupplyIndicator),
    ReferenceDocuments: flag(data.ReferenceDocument),
    License: data.License || ",,,,",
    Recipient: data.Recipient || "--",

    ImporterCompanyCode: data.Importer?.Code || "",
    ExporterCompanyCode: data.Exporter?.Code || "",
    InwardCarrierAgentCode: data.InwardCarrierAgent?.Code || "",
    OutwardCarrierAgentCode: data.OutwardCarrierAgent?.Code || "",
    FreightForwarderCode: data.FreightForwarder?.Code || "",
    ClaimantPartyCode: data.ClaimantParty?.Code || "",
    CONSIGNEECode: data.Consignee?.Code || "",

    // Inward
    HBL: data.Hawb || "",
    INHAWB: data.Hawb || "",
    ArrivalDate: toApiDate(data.ArrivalDate),
    LoadingPortCode: data.LoadingPort?.Code || "",
    VoyageNumber: data.VoyageNumber || "",
    VesselName: data.VesselName || "",
    OceanBillofLadingNo: data.Obl || "",
    ConveyanceRefNo: data.ConveyanceNumber || "",
    TransportId: data.TransportDetails || "",
    FlightNO: data.FlightNumber || "",
    AircraftRegNo: data.AircraftRegNo || "",
    MasterAirwayBill: data.Mawb || "",

    // Outward
    outHAWB: data.OutHawb || "",
    DepartureDate: toApiDate(data.DepartureDate),
    DischargePort: data.DischargePort?.Code || "",
    FinalDestinationCountry: data.FinalDestinationCountry || "",
    OutVoyageNumber: data.OutVoyageNumber || "",
    OutVesselName: data.OutVesselName || "",
    OutOceanBillofLadingNo: data.OutObl || "",
    VesselType: data.VesselType || "",
    VesselNetRegTon: data.VesselNetRegisterTonnage || "",
    VesselNationality: data.VesselNationality || "",
    TowingVesselID: data.TowingVesselId || "",
    TowingVesselName: data.TowingVesselName || "",
    NextPort: data.NextPortCode || "",
    LastPort: data.LastPortCode || "",
    OutConveyanceRefNo: data.OutConveyanceNumber || "",
    OutTransportId: data.OutTransportDetails || "",
    OutFlightNO: data.OutFlightNumber || "",
    OutAircraftRegNo: data.OutAirCraftRegNumber || "",
    OutMasterAirwayBill: data.OutMawb || "",
    seastore: flag(data.SeaStore),

    // Location / cargo
    StorageLocation: data.StorageLocation?.Code || "",
    ExhibitionSDate: toApiDate(data.ExhibitionStartDate),
    ExhibitionEDate: toApiDate(data.ExhibitionEndDate),
    ReleaseLocation: data.ReleaseLocation?.Code || "",
    ResLoaName: data.ReleaseLocation?.Name || "",
    RecepitLocation: data.ReceiptLocation?.Code || "",
    RecepitLocName: data.ReceiptLocation?.Name || "",
    TotalOuterPack: data.TotalOuterPack || "",
    TotalOuterPackUOM: data.TotalOuterPackUnit || "",
    TotalGrossWeight:
      data.PermitGrossWeight !== "" && data.PermitGrossWeight != null
        ? data.PermitGrossWeight
        : data.TotalGrossWeight || "",
    TotalGrossWeightUOM: data.TotalGrossWeightUnit || "",
    BlanketStartDate: toApiDate(data.BlanketStartDate) || "1900-01-01",
    DepartureDate: toApiDate(data.DepartureDate) || "1900-01-01",


    // Totals
    NumberOfItems: items.length,
    TotalCIFFOBValue: toDecimal(totalCIFFOBValue),
    TotalGSTTaxAmt: toDecimal(totalGSTTaxAmt),
    TotalExDutyAmt: toDecimal(totalExDutyAmt),
    TotalCusDutyAmt: toDecimal(totalCusDutyAmt),
    TotalODutyAmt: toDecimal(totalODutyAmt),
    TotalAmtPay: toDecimal(totalAmountPayable),

    Status: "LLMNEW",
    TouchUser: (touchUser || "").toUpperCase(),
    TouchTime: new Date().toISOString(),
    PermitNumber: permitNumber,
    prmtStatus: data.prmtStatus || data.PrmtStatus || ids?.prmtStatus || "NEW",
    Cnb: flag(data.cpc?.CNB?.on),
    DeclareIndicator: flag(data.DeclarationChecked),
    DeclarningFor: data.DeclaringFor || data.DeclFor || "--Select--",
    MRDate: toApiDate(data.MRDate),
    MRTime: data.MRTime || "",

    GrossReference: data.CrossReference || "",
    TradeRemarks: data.TradeRemarks || "",
    InternalRemarks: data.InternalRemarks || "",
    CustomerRemarks: data.CustomerRemarks || "",
    gstVerified: data.ApprovedBy || "",
  };
}

// ── OUT ─────────────────────────────────────────────────────────────────────
export function buildOutHeaderPayload(data, ids, touchUser) {
  const cfg = getModuleConfig("out");
  // computeTotals("out") returns zeros for GST / duty / tax
  const { items, totalCIFFOBValue } = computeTotals(data, "out");

  const flag = (v) => (v ? "true" : "false");

  let permitNumber = data.PermitNumber || ids?.PermitNumber || "";
  if (permitNumber === "None" || permitNumber === "NONE") permitNumber = "";

  return {
    Refid: toBigInt(ids?.Refid),
    JobId: ids?.JobId || "",
    MSGId: ids?.MSGId || "",
    PermitId: (ids?.PermitId || "").toUpperCase(),
    TradeNetMailboxID: ids?.TradeNetMailboxID || "",
    DeclarantCompanyCode: ids?.DeclarantCompanyCode || "",
    MessageType: data.MessageType || cfg.messageType,

    DeclarationType: data.DeclarationType || "--Select--",
    PreviousPermit: data.PreviousPermitNo || "",
    CargoPackType: data.CargoPackType || "--Select--",
    InwardTransportMode: data.InwardTransportMode || "--Select--",
    OutwardTransportMode: data.OutwardTransportMode || "--Select--",
    BGIndicator: data.BgIndicator || "--Select--",
    SupplyIndicator: flag(data.SupplyIndicator),
    ReferenceDocuments: flag(data.ReferenceDocument),
    License: data.License || ",,,,",
    Recipient: data.Recipient || "--",

    ExporterCompanyCode: data.Exporter?.Code || "",
    ImporterCompanyCode: data.Importer?.Code || "",
    InwardCarrierAgentCode: data.InwardCarrierAgent?.Code || "",
    OutwardCarrierAgentCode: data.OutwardCarrierAgent?.Code || "",
    FreightForwarderCode: data.FreightForwarder?.Code || "",
    ClaimantPartyCode: data.ClaimantParty?.Code || "",
    CONSIGNEECode: data.Consignee?.Code || "",
    EndUserCode: data.EndUser?.Code || "",
    Manufacturer: data.Manufacturer?.Code || "",

    // Inward
    HBL: data.Hawb || "",
    INHAWB: data.Hawb || "",
    ArrivalDate: toApiDate(data.ArrivalDate)|| "1900-01-01",
    LoadingPortCode: data.LoadingPort?.Code || "",
    VoyageNumber: data.VoyageNumber || "",
    VesselName: data.VesselName || "",
    OceanBillofLadingNo: data.Obl || "",
    ConveyanceRefNo: data.ConveyanceNumber || "",
    TransportId: data.TransportDetails || "",
    FlightNO: data.FlightNumber || "",
    AircraftRegNo: data.AircraftRegNo || "",
    MasterAirwayBill: data.Mawb || "",
    ArrivalTime:	data.ArrivalTime || "",
    DepartureTime:	data.DepartureTime || "",
    RepLocName:	data.ReceiptLocation?.Name || "",
    CertificateNumber:	data.CertificateNumber || "",
    Defrentprinting:	data.Defrentprinting || "",
    CondColor:	data.CondColor || "",
    TransmitId:	data.TransmitId || "",

    // Outward
    outHAWB: data.OutHawb || "",
    DepartureDate: toApiDate(data.DepartureDate)|| "1900-01-01",
    DischargePort: data.DischargePort?.Code || "",
    FinalDestinationCountry: data.FinalDestinationCountry || "",
    OutVoyageNumber: data.OutVoyageNumber || "",
    OutVesselName: data.OutVesselName || "",
    OutOceanBillofLadingNo: data.OutObl || "",
    VesselType: data.VesselType || "",
    VesselNetRegTon: data.VesselNetRegisterTonnage || "",
    VesselNationality: data.VesselNationality || "",
    TowingVesselID: data.TowingVesselId || "",
    TowingVesselName: data.TowingVesselName || "",
    NextPort: data.NextPortCode || "",
    LastPort: data.LastPortCode || "",
    OutConveyanceRefNo: data.OutConveyanceNumber || "",
    OutTransportId: data.OutTransportDetails || "",
    OutFlightNO: data.OutFlightNumber || "",
    OutAircraftRegNo: data.OutAirCraftRegNumber || "",
    OutMasterAirwayBill: data.OutMawb || "",
    seastore: flag(data.SeaStore),

    // Out-only
    COType: data.CoType || "--Select--",
    Entryyear: data.EntryYear || "",
    GSPDonorCountry: data.GSPDonorCountry || "--Select--",
    PerCommon:data.PerCommon || "",
    Inwardcarriercode: data.InwardCarrierCode || "",
    CerDetailtype1: data.CertificateType1 || "--Select--",
    CerDetailCopies1: data.CertificateCopy1 || "",
    CerDetailtype2: data.CertificateType2 || "--Select--",
    CerDetailCopies2: data.CertificateCopy2 || "",
    CurrencyCode: data.CurrencyCode || "--Select--",
    TransDtl: data.TransportDetailsHeader || "----",
    AddCerDtl: data.AdditionalCertificateDetails || "----",

    // Location / cargo
    StorageLocation: data.StorageLocation?.Code || "",
    ExhibitionSDate: toApiDate(data.ExhibitionStartDate),
    ExhibitionEDate: toApiDate(data.ExhibitionEndDate),
    ReleaseLocation: data.ReleaseLocation?.Code || "",
    ResLoaName: data.ReleaseLocation?.Name || "",
    RecepitLocation: data.ReceiptLocation?.Code || "",
    RecepitLocName: data.ReceiptLocation?.Name || "",
    TotalOuterPack: data.TotalOuterPack || "",
    TotalOuterPackUOM: data.TotalOuterPackUnit || "",
    TotalGrossWeight:
      data.PermitGrossWeight !== "" && data.PermitGrossWeight != null
        ? data.PermitGrossWeight
        : data.TotalGrossWeight || "",
    TotalGrossWeightUOM: data.TotalGrossWeightUnit || "",
    BlanketStartDate: toApiDate(data.BlanketStartDate) || "1900-01-01",

    // Totals — no GST / duty for out
    NumberOfItems: items.length,
    TotalCIFFOBValue: toDecimal(totalCIFFOBValue),
    TotalGSTTaxAmt: 0,
    TotalExDutyAmt: 0,
    TotalCusDutyAmt: 0,
    TotalODutyAmt: 0,
    TotalAmtPay: 0,

    Status: "LLMNEW",
    TouchUser: (touchUser || "").toUpperCase(),
    TouchTime: new Date().toISOString(),
    PermitNumber: permitNumber,
    prmtStatus: data.prmtStatus || data.PrmtStatus || ids?.prmtStatus || "NEW",
    Cnb: flag(data.cpc?.CNB?.on),
    DeclareIndicator: flag(data.DeclarationChecked),
    DeclarningFor: data.DeclaringFor || data.DeclFor || "--Select--",
    MRDate: toApiDate(data.MRDate),
    MRTime: data.MRTime || "",

    GrossReference: data.CrossReference || "",
    TradeRemarks: data.TradeRemarks || "",
    InternalRemarks: data.InternalRemarks || "",
    CustomerRemarks: data.CustomerRemarks || "",
    gstVerified: data.ApprovedBy || "",
  };
}

// Dispatcher — used by saveAsDraft and any other caller
export function buildHeaderPayload(data, ids, moduleKey, touchUser) {
  if (moduleKey === "innonpayment")
    return buildInnonpaymentHeaderPayload(data, ids, touchUser);
  if (moduleKey === "out") return buildOutHeaderPayload(data, ids, touchUser);
  return buildInpaymentHeaderPayload(data, ids, touchUser);
}

// ===========================================================================
// SAVE FUNCTIONS — one per module
// Order: containers → common CPC → common header → mirror CPC → mirror header
// ===========================================================================

async function saveUnsavedContainers(
  containers,
  permitId,
  messageType,
  touchUser,
) {
  const now = new Date().toISOString();
  const unsaved = containers.filter(
    (c) => !c.isSaved && (c.number || "").trim() !== "",
  );
  for (const container of unsaved) {
    const rowNo = containers.findIndex((c) => c.id === container.id) + 1;
    try {
      await API.post("/postContainerTable/", {
        PermitId: permitId,
        RowNo: rowNo,
        ContainerNo: String(container.number).trim(),
        Size:
          typeof container.sizeType === "object"
            ? String(container.sizeType?.value || "").trim()
            : String(container.sizeType || "").trim(),
        Weight: Number(container.weight) || 0,
        SealNo: String(container.seal || "").trim(),
        MessageType: messageType,
        TouchUser: touchUser,
        TouchTime: now,
      });
    } catch (err) {
      console.error(`Error auto-saving container row ${rowNo}:`, err);
    }
  }
}

// ── INPAYMENT ───────────────────────────────────────────────────────────────
export async function savePermitInpayment({
  data,
  ids,
  touchUser,
  containers = [],
}) {
  const cfg = getModuleConfig("inpayment");
  const permitId = (ids?.PermitId || "").toUpperCase();

  await saveUnsavedContainers(containers, permitId, cfg.messageType, touchUser);

  const cpcData = buildCpcPayload(
    data,
    permitId,
    touchUser,
    cfg.messageType,
    "inpayment",
  );
  await API.post(commonCpcEndpoint(permitId), cpcData);

  const headerPayload = buildInpaymentHeaderPayload(data, ids, touchUser);
  const commonResponse = await API.post(
    cfg.commonHeaderEndpoint,
    headerPayload,
  );

  let step = "mirror CPC";
  try {
    await API.post(MODULE_ENDPOINTS.inpayment.mirrorCpc(permitId), cpcData);

    step = "mirror header";
    const mirrorPayload = {
      ...headerPayload,
      JobId: commonResponse?.data?.JobId ?? headerPayload.JobId,
      MSGId: commonResponse?.data?.MSGId ?? headerPayload.MSGId,
    };
    // InHeaderTbl uses ReleaseLocName instead of ResLoaName
    mirrorPayload.ReleaseLocName = headerPayload.ResLoaName || "";
    delete mirrorPayload.ResLoaName;
    await API.post(cfg.mirrorHeaderEndpoint, mirrorPayload);
  } catch (mirrorErr) {
    throw new Error(
      `Permit was saved to the common header table but FAILED at "${step}" (${mirrorErr.config?.url || ""}) for the ${cfg.label} table. ` +
        `Please contact support or retry.\n\n${mirrorErr.response?.data?.error || mirrorErr.message}`,
    );
  }
  return { permitId };
}

// ── INNONPAYMENT ────────────────────────────────────────────────────────────
// Set to false if InnonHeaderTbl uses ResLoaName instead of ReleaseLocName.
const INNON_MIRROR_USES_RELEASE_LOC_NAME = true;

export async function savePermitInnonpayment({
  data,
  ids,
  touchUser,
  containers = [],
}) {
  const cfg = getModuleConfig("innonpayment");
  const permitId = (ids?.PermitId || "").toUpperCase();

  await saveUnsavedContainers(containers, permitId, cfg.messageType, touchUser);

  const cpcData = buildCpcPayload(
    data,
    permitId,
    touchUser,
    cfg.messageType,
    "innonpayment",
  );
  await API.post(commonCpcEndpoint(permitId), cpcData);

  const headerPayload = buildInnonpaymentHeaderPayload(data, ids, touchUser);
  const commonResponse = await API.post(
    cfg.commonHeaderEndpoint,
    headerPayload,
  );

  let step = "mirror CPC";
  try {
    await API.post(MODULE_ENDPOINTS.innonpayment.mirrorCpc(permitId), cpcData);

    step = "mirror header";
    const mirrorPayload = {
      ...headerPayload,
      JobId: commonResponse?.data?.JobId ?? headerPayload.JobId,
      MSGId: commonResponse?.data?.MSGId ?? headerPayload.MSGId,
    };
    if (INNON_MIRROR_USES_RELEASE_LOC_NAME) {
      mirrorPayload.ReleaseLocName = headerPayload.ResLoaName || "";
      delete mirrorPayload.ResLoaName;
    }
    await API.post(cfg.mirrorHeaderEndpoint, mirrorPayload);
  } catch (mirrorErr) {
    throw new Error(
      `Permit was saved to the common header table but FAILED at "${step}" (${mirrorErr.config?.url || ""}) for the ${cfg.label} table. ` +
        `Please contact support or retry.\n\n${mirrorErr.response?.data?.error || mirrorErr.message}`,
    );
  }
  return { permitId };
}

// ── OUT ─────────────────────────────────────────────────────────────────────
// Set to false if OutHeaderTbl uses ResLoaName instead of ReleaseLocName.
const OUT_MIRROR_USES_RELEASE_LOC_NAME = true;

export async function savePermitOut({ data, ids, touchUser, containers = [] }) {
  const cfg = getModuleConfig("out");
  const permitId = (ids?.PermitId || "").toUpperCase();

  await saveUnsavedContainers(containers, permitId, cfg.messageType, touchUser);

  const cpcData = buildCpcPayload(
    data,
    permitId,
    touchUser,
    cfg.messageType,
    "out",
  );
  await API.post(commonCpcEndpoint(permitId), cpcData);

  const headerPayload = buildOutHeaderPayload(data, ids, touchUser);
  const commonResponse = await API.post(
    cfg.commonHeaderEndpoint,
    headerPayload,
  );

  let step = "mirror CPC";
  try {
    await API.post(MODULE_ENDPOINTS.out.mirrorCpc(permitId), cpcData);

    step = "mirror header";
    const mirrorPayload = {
      ...headerPayload,
      JobId: commonResponse?.data?.JobId ?? headerPayload.JobId,
      MSGId: commonResponse?.data?.MSGId ?? headerPayload.MSGId,
    };
    if (OUT_MIRROR_USES_RELEASE_LOC_NAME) {
      mirrorPayload.ReleaseLocName = headerPayload.ResLoaName || "";
      delete mirrorPayload.ResLoaName;
    }
    await API.post(cfg.mirrorHeaderEndpoint, mirrorPayload);
  } catch (mirrorErr) {
    throw new Error(
      `Permit was saved to the common header table but FAILED at "${step}" (${mirrorErr.config?.url || ""}) for the ${cfg.label} table. ` +
        `Please contact support or retry.\n\n${mirrorErr.response?.data?.error || mirrorErr.message}`,
    );
  }
  return { permitId };
}

// Dispatcher — same exported signature, so SummaryTabContent is unchanged
export async function savePermit(args) {
  if (args.moduleKey === "innonpayment") return savePermitInnonpayment(args);
  if (args.moduleKey === "out") return savePermitOut(args);
  return savePermitInpayment(args);
}

// ── SAVE AS DRAFT ───────────────────────────────────────────────────────────
export async function saveAsDraft({
  data,
  ids,
  moduleKey,
  touchUser,
  draftReason,
}) {
  const cfg = getModuleConfig(moduleKey);
  const permitId = (ids?.PermitId || "").toUpperCase();

  const cpcData = buildCpcPayload(
    data,
    permitId,
    touchUser,
    cfg.messageType,
    moduleKey,
  );
  if (cpcData.length > 0) {
    await API.post(commonCpcEndpoint(permitId), cpcData);
  }

  const headerPayload = {
    ...buildHeaderPayload(data, ids, moduleKey, touchUser),
    Message: (draftReason || "").trim().toUpperCase(),
    Status: "SAVEASDRF",
    prmtStatus: "SAVEASDRF",
  };

  const response = await API.post(cfg.commonHeaderEndpoint, [headerPayload]);
  return response?.data;
}


// ---------------------------------------------------------------------------
// UI — totals grid + remarks + declaration checkbox + Save/Draft actions +
// the three modals (validation, party-not-saved, save-as-draft) + spinner.
// ---------------------------------------------------------------------------
function money(val) {
  const num = Number(val);
  return isNaN(num) ? "0.00" : num.toFixed(2);
}

function SummaryInputBox({ label, value, onChange, readOnly, wide }) {
  return (
    <div style={{ gridColumn: wide ? "span 2" : "span 1", minWidth: 0 }}>
      <div
        style={{
          fontSize: 10,
          fontWeight: 700,
          color: C.navy,
          marginBottom: 3,
        }}
      >
        {label}
      </div>
      <input
        type="text"
        value={value ?? ""}
        readOnly={readOnly}
        onChange={(e) => onChange && onChange(e.target.value)}
        style={{
          width: "100%",
          boxSizing: "border-box",
          padding: "4px 6px",
          fontSize: 11,
          border: `1px solid ${C.inputBorder}`,
          borderRadius: 3,
          background: readOnly ? "#eef2f5" : "#fff",
          color: C.navy,
        }}
      />
    </div>
  );
}

const btnStyle = {
  border: "none",
  background: C.bar,
  color: "#fff",
  fontWeight: 700,
  fontSize: 10,
  padding: "4px 9px",
  borderRadius: 3,
  cursor: "pointer",
};

function ValidationErrorsModal({ errors, onClose }) {
  const totalCount = Object.values(errors).flat().length;
  const sections = [
    { key: "header", label: "HEADER" },
    { key: "party", label: "PARTY" },
    { key: "cargo", label: "CARGO" },
    { key: "invoice", label: "INVOICE" },
    { key: "item", label: "ITEM" },
    { key: "summary", label: "SUMMARY" },
  ];
  return (
    <div
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        zIndex: 9999,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
      onClick={onClose}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 8,
          width: 600,
          maxHeight: "80vh",
          overflowY: "auto",
          padding: 24,
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <h5 style={{ margin: 0, color: C.navy, fontWeight: "bold" }}>
            VALIDATION ERRORS ({totalCount})
          </h5>
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              fontSize: 20,
              cursor: "pointer",
            }}
          >
            ✕
          </button>
        </div>
        {sections.map(({ key, label }) =>
          errors[key].length > 0 ? (
            <div key={key} style={{ marginBottom: 12 }}>
              <div
                style={{
                  background: "#fc240c",
                  color: "#fff",
                  padding: "4px 10px",
                  borderRadius: 4,
                  fontWeight: "bold",
                  fontSize: 12.5,
                  marginBottom: 4,
                }}
              >
                {label}
              </div>
              {errors[key].map((msg, i) => (
                <div
                  key={i}
                  style={{
                    padding: "6px 12px",
                    background: "#fdf0f0",
                    borderLeft: `3px solid ${C.danger}`,
                    marginBottom: 4,
                    fontSize: 12.5,
                  }}
                >
                  {label} ➜ {msg}
                </div>
              ))}
            </div>
          ) : null,
        )}
        <div style={{ textAlign: "center", marginTop: 16 }}>
          <button className="NextpageBtns" onClick={onClose}>
            CLOSE & FIX ERRORS
          </button>
        </div>
      </div>
    </div>
  );
}

function PartyNotSavedModal({ missing, onClose, onGoToPartyTab }) {
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 1040,
        }}
        onClick={onClose}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          background: "#fff",
          borderRadius: 8,
          width: 500,
          zIndex: 1050,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: C.danger,
            color: "#fff",
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: "bold" }}>
            ⚠ PARTY CODE(S) NOT SAVED IN MASTER TABLE
          </span>
          <span style={{ cursor: "pointer" }} onClick={onClose}>
            ✕
          </span>
        </div>
        <div style={{ padding: "20px 24px" }}>
          <div
            style={{
              background: "#fdf0f0",
              border: "1px solid #e74c3c",
              borderRadius: 6,
              padding: "12px 16px",
              fontSize: 13,
              color: "#922b21",
              marginBottom: 16,
            }}
          >
            The following code(s) are filled but <strong>not yet saved</strong>{" "}
            in their master tables. Go to the <strong>PARTY</strong> tab, save
            each one, then click <strong>SAVE</strong> again.
          </div>
          <table
            style={{ width: "100%", fontSize: 13, borderCollapse: "collapse" }}
          >
            <thead>
              <tr style={{ background: "#f5b7b1" }}>
                <th
                  style={{
                    padding: "7px 10px",
                    textAlign: "left",
                    border: "1px solid #e74c3c",
                  }}
                >
                  PARTY FIELD
                </th>
                <th
                  style={{
                    padding: "7px 10px",
                    textAlign: "left",
                    border: "1px solid #e74c3c",
                  }}
                >
                  CODE ENTERED
                </th>
              </tr>
            </thead>
            <tbody>
              {missing.map((item, idx) => (
                <tr
                  key={idx}
                  style={{ background: idx % 2 === 0 ? "#fff" : "#fdf2f2" }}
                >
                  <td
                    style={{
                      padding: "7px 10px",
                      border: "1px solid #fadbd8",
                      fontWeight: 600,
                    }}
                  >
                    {item.label}
                  </td>
                  <td
                    style={{
                      padding: "7px 10px",
                      border: "1px solid #fadbd8",
                      color: C.danger,
                      fontWeight: "bold",
                    }}
                  >
                    {item.code}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div
          style={{
            padding: "12px 24px 20px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            onClick={onClose}
            style={{
              background: "#6c757d",
              color: "#fff",
              border: "none",
              padding: "7px 20px",
              borderRadius: 4,
              cursor: "pointer",
            }}
          >
            CLOSE
          </button>
          <button
            onClick={() => {
              onClose();
              onGoToPartyTab?.();
            }}
            style={{
              background: C.danger,
              color: "#fff",
              border: "none",
              padding: "7px 20px",
              borderRadius: 4,
              cursor: "pointer",
              fontWeight: "bold",
            }}
          >
            GO TO PARTY PAGE →
          </button>
        </div>
      </div>
    </>
  );
}

function DraftReasonModal({
  draftReason,
  setDraftReason,
  error,
  isSaving,
  onCancel,
  onConfirm,
}) {
  return (
    <>
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.5)",
          zIndex: 1040,
        }}
        onClick={onCancel}
      />
      <div
        style={{
          position: "fixed",
          top: "50%",
          left: "50%",
          transform: "translate(-50%,-50%)",
          background: "#fff",
          borderRadius: 8,
          width: 460,
          zIndex: 1050,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            background: "#1a6db5",
            color: "#fff",
            padding: "14px 20px",
            display: "flex",
            justifyContent: "space-between",
          }}
        >
          <span style={{ fontWeight: "bold" }}>SAVE AS DRAFT</span>
          <span style={{ cursor: "pointer" }} onClick={onCancel}>
            ✕
          </span>
        </div>
        <div style={{ padding: "24px 24px 16px" }}>
          <div
            style={{
              background: "#fff8e1",
              border: "1px solid #ffe082",
              borderRadius: 6,
              padding: "10px 14px",
              marginBottom: 18,
              fontSize: 13,
              color: "#7b5800",
            }}
          >
            This permit will be saved as <strong>DRAFT (DRF)</strong>.
          </div>
          <label
            style={{
              fontWeight: 600,
              fontSize: 13,
              display: "block",
              marginBottom: 6,
            }}
          >
            WHY ARE YOU SAVING AS DRAFT? <span style={{ color: "red" }}>*</span>
          </label>
          <textarea
            rows={4}
            value={draftReason}
            onChange={(e) => setDraftReason(e.target.value)}
            style={{
              width: "100%",
              resize: "vertical",
              fontSize: 13,
              border: error ? "1px solid red" : `1px solid ${C.inputBorder}`,
              borderRadius: 4,
              padding: 8,
              boxSizing: "border-box",
            }}
            autoFocus
          />
          {error && (
            <span style={{ color: "red", fontSize: 12 }}>
              Please provide a reason before saving as draft.
            </span>
          )}
        </div>
        <div
          style={{
            padding: "12px 24px 20px",
            display: "flex",
            justifyContent: "flex-end",
            gap: 10,
          }}
        >
          <button
            onClick={onCancel}
            disabled={isSaving}
            style={{
              background: "#6c757d",
              color: "#fff",
              border: "none",
              padding: "7px 20px",
              borderRadius: 4,
            }}
          >
            CANCEL
          </button>
          <button
            onClick={onConfirm}
            disabled={isSaving || draftReason.length > 200}
            style={{
              background: isSaving ? "#90caf9" : "#1a6db5",
              color: "#fff",
              border: "none",
              padding: "7px 20px",
              borderRadius: 4,
              fontWeight: "bold",
            }}
          >
            {isSaving ? "SAVING..." : "💾 SAVE AS DRAFT"}
          </button>
        </div>
      </div>
    </>
  );
}

export function SummaryTabContent({
  data,
  onEdit,
  activeModule,
  ids,
  touchUser,
  onSaved,
  onDraftSaved,
  onGoToPartyTab,
}) {
  // ── Out declarations don't carry GST / Excise / Customs / Other-tax —
  // this flag is used below to hide those boxes from the grid and to
  // suppress the money strings that would otherwise read "0.00".
  const isOut = activeModule === "out";

  const items = Array.isArray(data.items) ? data.items : [];
  const invoices = Array.isArray(data.invoices) ? data.invoices : [];
  const containers = Array.isArray(data.Containers) ? data.Containers : [];
  const importer = data.Importer || { Code: "", Name: "" };
  const exporter = data.Exporter || { Code: "", Name: "" };

  const toNum = (v) => {
    const n = parseFloat(v);
    return isNaN(n) ? 0 : n;
  };

  // Totals now come from the same computeTotals() the save payload uses
  // (buildHeaderPayload → computeTotals), passing activeModule through so
  // "out" correctly comes back with zeroed duty/GST fields instead of
  // summing item columns that don't exist for export declarations.
  const sumItemValue = items.reduce(
    (s, it) => s + toNum(it.TotalLineAmount),
    0,
  );
  const totalInvoiceCif = invoices.reduce(
    (s, inv) => s + toNum(inv?.costInsuranceFreight?.amountSgd),
    0,
  );
  const totalInvoiceGstAmount = invoices.reduce(
    (s, inv) => s + toNum(inv?.gstAmountSgd),
    0,
  );

  const {
    totalCIFFOBValue: totalItemCifValue,
    totalGSTTaxAmt: totalItemGstAmount,
    totalExDutyAmt: sumOfExciseDutyAmount,
    totalCusDutyAmt: sumOfCustomsDutyAmount,
    totalODutyAmt: sumOfOtherTaxAmount,
    totalAmountPayable,
  } = computeTotals(data, activeModule);

  const invoiceByCurrency = {};
  invoices.forEach((inv) => {
    const cur = inv?.invoiceValue?.currency || "";
    invoiceByCurrency[cur] =
      (invoiceByCurrency[cur] || 0) + toNum(inv?.invoiceValue?.amount);
  });
  const itemByCurrency = {};
  items.forEach((it) => {
    const cur = it.UnitPriceCurrency || "";
    itemByCurrency[cur] =
      (itemByCurrency[cur] || 0) + toNum(it.TotalLineAmount);
  });

  const set = (field, value) => onEdit([field], value);

  const [validationErrors, setValidationErrors] = useState(null);
  const [missingPartyCodes, setMissingPartyCodes] = useState(null);
  const [showDraftModal, setShowDraftModal] = useState(false);
  const [draftReason, setDraftReason] = useState("");
  const [draftReasonError, setDraftReasonError] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingPermit, setIsSavingPermit] = useState(false);

  const handleSavePermitClick = async () => {
    if (!activeModule) {
      alert("Select a module (Inpayment / InNonPayment / Out) first.");
      return;
    }
    if (!ids?.PermitId) {
      alert('Click "New" first to generate a Permit ID for this declaration.');
      return;
    }
    const { isValid, errors } = runSummaryValidation(
      data,
      activeModule,
      containers,
    );
    if (!isValid) {
      setValidationErrors(errors);
      return;
    }
    const missing = await checkPartyMasterTables(data, activeModule);
    if (missing.length > 0) {
      setMissingPartyCodes(missing);
      return;
    }
    setIsSavingPermit(true);
    try {
      const result = await savePermit({
        data,
        ids,
        moduleKey: activeModule,
        touchUser,
        containers,
      });
      onSaved?.(data, result);
    } catch (err) {
      console.error("Save failed:", err);
      alert(err.message || "Failed to save permit.");
    } finally {
      setIsSavingPermit(false);
    }
  };

  const handleConfirmDraft = async () => {
    if (!draftReason.trim()) {
      setDraftReasonError(true);
      return;
    }
    if (!activeModule || !ids?.PermitId) {
      alert("Select a module and generate a Permit ID before saving as draft.");
      return;
    }
    setIsSaving(true);
    try {
      const responseData = await saveAsDraft({
        data,
        ids,
        moduleKey: activeModule,
        touchUser,
        draftReason,
      });
      setShowDraftModal(false);
      setDraftReason("");
      setDraftReasonError(false);
      onDraftSaved?.(responseData);
    } catch (err) {
      console.error("SAVE AS DRAFT ERROR:", err);
      alert("Error saving draft. Please try again.");
    } finally {
      setIsSaving(false);
    }
  };

  const showPermitFunction = () => {
    const text = data.PreviousPermitNo?.trim()
      ? `PREVIOUS PERMIT NO : ${data.PreviousPermitNo}`
      : "PREVIOUS PERMIT NO :";
    set(
      "TradeRemarks",
      (data.TradeRemarks || "") + (data.TradeRemarks ? "\n" : "") + text,
    );
  };

  const showExRate = () => {
    const grouped = {};
    invoices.forEach((inv) => {
      const cur = inv?.invoiceValue?.currency || "";
      grouped[cur] = (grouped[cur] || 0) + toNum(inv?.invoiceValue?.exRate);
    });
    const text = Object.keys(grouped)
      .map(
        (cur) =>
          `CURRENCY : ${cur} , EXCHANGE RATE : ${grouped[cur].toFixed(6)}`,
      )
      .join("\n");
    set(
      "TradeRemarks",
      (data.TradeRemarks || "") + (data.TradeRemarks ? "\n" : "") + text,
    );
  };

  const applyFormatRemark = () => {
    set(
      "TradeRemarks",
      (data.TradeRemarks || "").replaceAll("\n", data.FormatRemark || ""),
    );
    set("FormatRemark", "");
  };

  const gridStyle = {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: "8px 10px",
    marginBottom: 10,
  };

  return (
    <div
      style={{
        background: "#e9f1f8",
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        padding: 16,
      }}
    >
      <div style={gridStyle}>
        <SummaryInputBox
          label="NO OF INVOICES"
          value={invoices.length}
          readOnly
        />
        <SummaryInputBox label="NO OF ITEMS" value={items.length} readOnly />
        <SummaryInputBox
          label="SUM OF ITEM VALUE"
          value={money(sumItemValue)}
          readOnly
        />
        <SummaryInputBox
          label="TOTAL INVOICE CIF VALUE"
          value={money(totalInvoiceCif)}
          readOnly
        />

        <SummaryInputBox
          label="TOTAL CIF/FOB VALUE"
          value={money(totalItemCifValue)}
          readOnly
        />
        {/* Out declarations don't carry GST/Excise/Customs — hide these
            boxes entirely instead of showing misleading "0.00" values,
            matching the legacy Out Summary.jsx which never rendered them. */}
        {!isOut && (
          <>
            <SummaryInputBox
              label="TOTAL GST VALUE"
              value={money(totalItemGstAmount)}
              readOnly
            />
            <SummaryInputBox
              label="EXCISE DUTY"
              value={money(sumOfExciseDutyAmount)}
              readOnly
            />
            <SummaryInputBox
              label="CUSTOMS DUTY"
              value={money(sumOfCustomsDutyAmount)}
              readOnly
            />
          </>
        )}

        {!isOut && (
          <>
            <SummaryInputBox
              label="OTHER TAX"
              value={money(sumOfOtherTaxAmount)}
              readOnly
            />
            <SummaryInputBox
              label="TOTAL AMOUNT PAYABLE"
              value={money(totalAmountPayable)}
              readOnly
            />
          </>
        )}
        <div>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: C.navy,
              marginBottom: 4,
            }}
          >
            SUM OF INVOICE AMOUNT
          </div>
          {Object.entries(invoiceByCurrency).length === 0 ? (
            <SummaryInputBox value="" readOnly />
          ) : (
            Object.entries(invoiceByCurrency).map(([cur, amt]) => (
              <div
                key={cur}
                style={{ display: "flex", gap: 6, marginBottom: 4 }}
              >
                <input
                  value={cur}
                  readOnly
                  style={{
                    width: 60,
                    border: `1px solid ${C.inputBorder}`,
                    borderRadius: 4,
                    padding: "4px 6px",
                    background: "#eef2f5",
                  }}
                />
                <input
                  value={money(amt)}
                  readOnly
                  style={{
                    flex: 1,
                    border: `1px solid ${C.inputBorder}`,
                    borderRadius: 4,
                    padding: "4px 6px",
                    background: "#eef2f5",
                  }}
                />
              </div>
            ))
          )}
        </div>
        <div>
          <div
            style={{
              fontSize: 11.5,
              fontWeight: 700,
              color: C.navy,
              marginBottom: 4,
            }}
          >
            SUM OF ITEM AMOUNT
          </div>
          {Object.entries(itemByCurrency).length === 0 ? (
            <SummaryInputBox value="" readOnly />
          ) : (
            Object.entries(itemByCurrency).map(([cur, amt]) => (
              <div
                key={cur}
                style={{ display: "flex", gap: 6, marginBottom: 4 }}
              >
                <input
                  value={cur}
                  readOnly
                  style={{
                    width: 60,
                    border: `1px solid ${C.inputBorder}`,
                    borderRadius: 4,
                    padding: "4px 6px",
                    background: "#eef2f5",
                  }}
                />
                <input
                  value={money(amt)}
                  readOnly
                  style={{
                    flex: 1,
                    border: `1px solid ${C.inputBorder}`,
                    borderRadius: 4,
                    padding: "4px 6px",
                    background: "#eef2f5",
                  }}
                />
              </div>
            ))
          )}
        </div>
      </div>

      <div style={gridStyle}>
        <SummaryInputBox
          label="APPROVED BY"
          value={data.ApprovedBy}
          onChange={(v) => set("ApprovedBy", v)}
        />
        <SummaryInputBox
          label="CUSTOMER REMARKS"
          value={data.CustomerRemarks}
          onChange={(v) => set("CustomerRemarks", v)}
          wide
        />
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 10,
          marginBottom: 10,
          flexWrap: "wrap",
        }}
      >
        <div style={{ fontSize: 11.5, fontWeight: 700, color: C.navy }}>
          TRADER REMARKS
        </div>
        <button type="button" onClick={showPermitFunction} style={btnStyle}>
          PREV PERMIT NUMBER
        </button>
        <button type="button" onClick={showExRate} style={btnStyle}>
          EX. RATE
        </button>
        <SummaryInputBox
          label="FORMAT REMARKS"
          value={data.FormatRemark}
          onChange={(v) => set("FormatRemark", v)}
        />
        <button type="button" onClick={applyFormatRemark} style={btnStyle}>
          CONFIG
        </button>
        <SummaryInputBox
          label="CROSS REFERENCE"
          value={data.CrossReference}
          onChange={(v) => set("CrossReference", v)}
          wide
        />
      </div>

      <textarea
        value={data.TradeRemarks || ""}
        onChange={(e) => set("TradeRemarks", e.target.value)}
        style={{
          width: "100%",
          minHeight: 90,
          boxSizing: "border-box",
          padding: 8,
          fontSize: 12.5,
          border: `1px solid ${C.inputBorder}`,
          borderRadius: 4,
          marginBottom: 12,
          fontFamily: "inherit",
        }}
      />

      <SummaryInputBox
        label="INTERNAL REMARKS"
        value={data.InternalRemarks}
        onChange={(v) => set("InternalRemarks", v)}
      />

      <div
        style={{
          background: C.bar,
          color: C.barText,
          fontWeight: 800,
          fontSize: 12,
          textAlign: "center",
          padding: "8px 0",
          borderRadius: 4,
          margin: "16px 0 10px",
        }}
      >
        DECLARATION SUMMARY
      </div>

      <div style={gridStyle}>
        <SummaryInputBox
          label="IMPORTER"
          value={`${importer.CRUEI || ""}-${importer.Name || ""}`}
          readOnly
          wide
        />
        <SummaryInputBox label="HAWB/HBL" value={data.Hawb} readOnly wide />
        <SummaryInputBox label="MAWB/OBL" value={data.Mawb} readOnly wide />
        <SummaryInputBox
          label="GROSS WEIGHT"
          value={`${data.TotalGrossWeight || ""}-${data.TotalGrossWeightUnit || ""}`}
          readOnly
          wide
        />
        <SummaryInputBox
          label="NO OF PACKING"
          value={`${data.TotalOuterPack || ""}-${data.TotalOuterPackUnit || ""}`}
          readOnly
          wide
        />
        {!isOut && (
          <SummaryInputBox
            label="TOTAL ITEM GST"
            value={money(totalItemGstAmount)}
            readOnly
            wide
          />
        )}
        <SummaryInputBox
          label="INVOICE AMOUNT"
          value={Object.entries(invoiceByCurrency)
            .map(([c, a]) => `${c} : ${money(a)}`)
            .join(", ")}
          readOnly
          wide
        />
        {!isOut && (
          <SummaryInputBox
            label="TOTAL INVOICE GST"
            value={money(totalInvoiceGstAmount)}
            readOnly
            wide
          />
        )}
      </div>

      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 10,
          marginTop: 8,
          marginBottom: 20,
        }}
      >
        <input
          type="checkbox"
          checked={!!data.DeclarationChecked}
          onChange={(e) => set("DeclarationChecked", e.target.checked)}
          style={{ width: 16, height: 16, accentColor: C.bar }}
        />
        <span style={{ fontSize: 12.5, color: C.navy, fontWeight: 600 }}>
          I/WE DECLARE THAT ALL PARTICULARS IN THIS APPLICATION ARE TRUE AND
          CORRECT
        </span>
      </div>

      <div style={{ display: "flex", justifyContent: "center", gap: 12 }}>
        <button
          className="decl-button decl-button-amber"
          onClick={() => {
            setDraftReason("");
            setDraftReasonError(false);
            setShowDraftModal(true);
          }}
        >
          SAVE AS DRAFT
        </button>
        <button
          className="decl-button decl-button-verdigris"
          disabled={isSavingPermit}
          onClick={handleSavePermitClick}
        >
          {isSavingPermit ? "SAVING..." : "SAVE PERMIT"}
        </button>
      </div>

      {validationErrors && (
        <ValidationErrorsModal
          errors={validationErrors}
          onClose={() => setValidationErrors(null)}
        />
      )}
      {missingPartyCodes && (
        <PartyNotSavedModal
          missing={missingPartyCodes}
          onClose={() => setMissingPartyCodes(null)}
          onGoToPartyTab={onGoToPartyTab}
        />
      )}
      {showDraftModal && (
        <DraftReasonModal
          draftReason={draftReason}
          setDraftReason={(v) => {
            setDraftReason(v);
            if (v.trim()) setDraftReasonError(false);
          }}
          error={draftReasonError}
          isSaving={isSaving}
          onCancel={() => setShowDraftModal(false)}
          onConfirm={handleConfirmDraft}
        />
      )}
      {isSavingPermit && (
        <div
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(255,255,255,0.7)",
            display: "flex",
            flexDirection: "column",
            alignItems: "center",
            justifyContent: "center",
            zIndex: 2000,
          }}
        >
          <div style={{ fontSize: 16, fontWeight: "bold", color: "#165f03" }}>
            SAVING PERMIT...
          </div>
        </div>
      )}
    </div>
  );
}
