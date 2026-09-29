import React, { useState, useEffect, useRef, useMemo } from "react";
import { FaSearch, FaPlus } from "react-icons/fa";
import API from "../api/api";
import { C } from "./DeclarationPanel";

const MANDATORY_BG = "#fff8e1";
const ERROR_COLOR = "#c0392b";

/* ============================================================
   PARTY REGISTRY
============================================================ */
export const PARTY_TYPES = {
  importer: {
    dataKey: "Importer",
    label: "Importer",
    commonEndpoint: "/getCommonImporterTableInfo/",
    saveEndpoint: "/postImporterTable/",
    mandatory: true,
    extraSavePayload: { MES: "", APS: "" },
    upperCaseOnSave: true,
    moduleFetch: {
      inpayment: "inpayment/getInImporterTableInfo/",
      innonpayment: "innonpayment/getInnonImporterTableInfo/",
      out: "out/getOutImporterTableInfo/",
    },
    moduleSave: { inpayment: "inpayment/postInImporterTable/" },
  },

  exporter: {
    dataKey: "Exporter",
    label: "Exporter",
    hasAddress: true,
    mandatory: true,
    commonEndpoint: "/getCommonExporterTableInfo/",
    saveEndpoint: "/postExporterTable/",
    moduleFetch: {
      innonpayment: "innonpayment/getInnonExporterTableInfo/",
      out: "out/getOutExporterTableInfo/",
    },
    // out/getOutExporterTableInfo/ returns OutUserCode / OutUserName / ...
    moduleFieldMap: {
      out: {
        Code: "OutUserCode",
        CRUEI: "OutUserCRUEI",
        Name: "OutUserName",
        Name1: "OutUserName1",
        Address: "OutUserAddress",
        Address1: "OutUserAddress1",
        City: "OutUserCity",
        SubCode: "OutUserSubCode",
        Sub: "OutUserSub",
        Postal: "OutUserPostal",
        Country: "OutUserCountry",
      },
    },
  },

  inwardCarrierAgent: {
    dataKey: "InwardCarrierAgent",
    label: "Inward Carrier Agent",
    commonEndpoint: "/getCommonInwardCarrierAgentTableInfo/",
    saveEndpoint: "/postInwardCarrierAgentTable/",
    moduleFetch: {
      inpayment: "inpayment/getInInwardCarrierAgentTableInfo/",
      innonpayment: "innonpayment/getInnonInwardCarrierAgentTableInfo/",
      out: "out/getOutInwardCarrierAgentTableInfo/",
    },
    moduleSave: { inpayment: "inpayment/postInInwardCarrierAgentTable/" },
    // defaultCode: "SATS LTD",
  },

  outwardCarrierAgent: {
    dataKey: "OutwardCarrierAgent",
    label: "Outward Carrier Agent",
    commonEndpoint: "/getCommonOutwardCarrierAgentTableInfo/",
    saveEndpoint: "/postOutwardCarrierAgentTable/",
    moduleFetch: {
      innonpayment: "innonpayment/getInnonOutwardCarrierAgentTableInfo/",
      out: "out/getOutOutwardCarrierAgentTableInfo/",
    },
  },

  freightForwarder: {
    dataKey: "FreightForwarder",
    label: "Freight Forwarder",
    commonEndpoint: "/getCommonFreightForwarderTable/",
    saveEndpoint: "/postFreightForwarderTable/",
    moduleFetch: {
      inpayment: "inpayment/getInFreightForwarderTable/",
      innonpayment: "innonpayment/getInnonFreightForwarderTable/",
      out: "out/getOutFreightForwarderTableInfo/",
    },
    moduleSave: { inpayment: "inpayment/postInFreightForwarderTable/" },
    // defaultCode: "LINEHAUL EXPRESS",
  },

  claimantParty: {
    dataKey: "ClaimantParty",
    label: "Claimant Party",
    codeField: "ClaimantCode",
    hasClaimantNameFields: true,
    commonEndpoint: "/getCommonClaimantPartyTable/",
    saveEndpoint: "/postClaimantPartyTable/",
    extraSavePayload: { Name2: "" },
    moduleFetch: {
      inpayment: "inpayment/getInClaimantPartyTable/",
      innonpayment: "innonpayment/getInnonClaimantPartyTable/",
    },
    moduleSave: { inpayment: "inpayment/postInClaimantPartyTable/" },
  },

  consignee: {
    dataKey: "Consignee",
    label: "Consignee",
    hasAddress: true,
    prefix: "Consignee", // ConsigneeCode, ConsigneeCRUEI, ...
    subKey: "Sub", // ConsigneeSub  = SUB CODE
    subDiviKey: "SubDivi", // ConsigneeSubDivi = SUB DIVISION
    commonEndpoint: "/getCommonConsigneeTableInfo/",
    saveEndpoint: "/postCongineeTable/",
    moduleFetch: {
      innonpayment: "innonpayment/getInnonConsigneeTableInfo/",
      out: "out/getOutConsigneeTableInfo/",
    },
  },

  endUser: {
    dataKey: "EndUser",
    label: "End User",
    hasAddress: true,
    prefix: "EndUser",
    subKey: "Sub",
    subDiviKey: "SubDivi",
    commonEndpoint: "/getCommonEndUserTableInfo/",
    saveEndpoint: "/postEndUserTable/",
    moduleFetch: {},
    copyFrom: "consignee", // renders a "Copy of consignee" button
  },

  manufacturer: {
    dataKey: "Manufacturer",
    label: "Manufacturer",
    hasAddress: true,
    prefix: "Manufacturer",
    subKey: "Sub",
    subDiviKey: "SubDivi",
    commonEndpoint: "/getCommonManufacturerTableInfo/",
    saveEndpoint: "/postManufacturerTable/",
    moduleFetch: { out: "out/getOutManufacturerTableInfo/" },
  },
};

/* Order of blocks per module (matches the legacy pages' focus order). */
export const MODULE_PARTY_TYPES = {
  inpayment: [
    "importer",
    "inwardCarrierAgent",
    "freightForwarder",
    "claimantParty",
  ],
  innonpayment: [
    "importer",
    "exporter",
    "inwardCarrierAgent",
    "outwardCarrierAgent",
    "freightForwarder",
    "claimantParty",
    "consignee",
  ],
  out: [
    "exporter",
    "importer",
    "inwardCarrierAgent",
    "outwardCarrierAgent",
    "freightForwarder",
    "consignee",
    "endUser",
    "manufacturer",
  ],
};

/* Which blocks are always shown, and which are gated by a flag.
   `flag` is looked up in the `visibility` prop passed to PartyTabContent —
   e.g. { showExporter: true, showOutwardCarrier: isSea, showEndUser: endUserCheck }.
   A type with no entry here is always visible for its module. */
export const PARTY_VISIBILITY = {
  exporter: { flag: "showExporter" },
  outwardCarrierAgent: { flag: "showOutwardCarrier" },
  inwardCarrierAgent: { flag: "showInwardCarrier" },
  claimantParty: { flag: "showClaimantParty" },
  consignee: { flag: "showConsignee" },
  endUser: { flag: "showEndUser" },
  manufacturer: { flag: "showCertificateOfOrigin" },
  importer: { flag: "showImporter" },
};

/* ============================================================
   MODULE-SPECIFIC DEFAULT VISIBILITY
   Centralized here so DeclarationPanel doesn't need to compute
   or override any show/hide logic — it just passes `data`.
============================================================ */
export function getModuleDefaultVisibility(moduleKey, data = {}) {
  const inwardMode = data.InwardTransportMode || "";
  const outwardMode = data.OutwardTransportMode || "";
  const decType = data.DeclarationType || "";

  if (moduleKey === "inpayment") {
    return {
      showImporter: true,
      showInwardCarrier: true,
      showOutwardCarrier: false,
      showExporter: false,
      showClaimantParty:
        decType === "BKT : Blanket" ||
        decType === "GST : GST (Including Duty Exemption)",
      showConsignee: false,
      showEndUser: false,
    };
  }

  if (moduleKey === "innonpayment") {
    const isBlanket =
      decType ===
      "BKT : BLANKET [INCLUDING BLANKET GST RELIEF (& DUTY EXEMPTION)]";
    const isTempImportOrShutOut =
      decType ===
        "TCE : TEMPORARY IMPORT FOR EXHIBITION/AUCTIONS WITHOUT SALES" ||
      decType === "TCO : TEMPORARY IMPORT FOR OTHER PURPOSES" ||
      decType === "TCR : TEMPORARY IMPORT FOR REPAIRS" ||
      decType === "TCS : TEMPORARY IMPORT FOR EXHIBITION/AUCTIONS WITH SALES" ||
      decType === "SHO : SHUT-OUT";
    const isReExportOrFtz =
      decType === "REX : FOR RE-EXPORT" || decType === "SFZ : STORAGE IN FTZ";

    return {
      showImporter: true,
      showInwardCarrier: true,
      showOutwardCarrier: isReExportOrFtz,
      showExporter: isReExportOrFtz,
      showClaimantParty:
        isBlanket || decType === "GTR : GST RELIEF (& DUTY EXEMPTION)",
      showConsignee: !isBlanket && !isTempImportOrShutOut && !isReExportOrFtz,
      showEndUser: false,
    };
  }

  if (moduleKey === "out") {
    return {
      showExporter: true,
      showImporter: !!inwardMode && inwardMode !== "--Select--",
      showInwardCarrier: !!inwardMode && inwardMode !== "--Select--",
      showOutwardCarrier: !!outwardMode && outwardMode !== "--Select--",
      showClaimantParty: false,
      showConsignee: true,
      showEndUser: !!data.EndUserChecked,
      showCertificateOfOrigin: !!data.CoType,
    };
  }

  return {};
}

/* ============================================================
   NORMALIZATION  (every backend shape -> one flat record)
============================================================ */
const ADDRESS_FIELDS = [
  "Address",
  "Address1",
  "City",
  "SubCode",
  "Sub",
  "Postal",
  "Country",
];

export function blankParty(cfg) {
  return {
    Code: cfg.defaultCode || "",
    CRUEI: "",
    Name: "",
    Name1: "",
    ...(cfg.hasClaimantNameFields
      ? { ClaimantName: "", ClaimantName1: "" }
      : {}),
    ...(cfg.hasAddress
      ? Object.fromEntries(ADDRESS_FIELDS.map((f) => [f, ""]))
      : {}),
  };
}

function readField(row, cfg, moduleKey, logicalName) {
  const map = cfg.moduleFieldMap?.[moduleKey];
  if (map?.[logicalName] && row[map[logicalName]] != null)
    return row[map[logicalName]];
  if (cfg.prefix && row[`${cfg.prefix}${logicalName}`] != null)
    return row[`${cfg.prefix}${logicalName}`];
  return row[logicalName] ?? "";
}

export function normalizePartyRow(row, cfg, moduleKey) {
  const codeField = cfg.codeField || "Code";
  const rec = {
    Id: row.Id ?? row.id ?? 0,
    Code: String(
      readField(row, cfg, moduleKey, codeField) ||
        row.Code ||
        row.ClaimantCode ||
        "",
    ),
    CRUEI: String(readField(row, cfg, moduleKey, "CRUEI") || ""),
    Name: String(readField(row, cfg, moduleKey, "Name") || ""),
    Name1: String(readField(row, cfg, moduleKey, "Name1") || ""),
  };

  if (cfg.hasClaimantNameFields) {
    rec.ClaimantName = String(row.ClaimantName || "");
    rec.ClaimantName1 = String(row.ClaimantName1 || "");
  }

  if (cfg.hasAddress) {
    rec.Address = String(readField(row, cfg, moduleKey, "Address") || "");
    rec.Address1 = String(readField(row, cfg, moduleKey, "Address1") || "");
    rec.City = String(readField(row, cfg, moduleKey, "City") || "");
    rec.SubCode = String(
      readField(row, cfg, moduleKey, cfg.subKey || "SubCode") || "",
    );
    rec.Sub = String(
      readField(row, cfg, moduleKey, cfg.subDiviKey || "Sub") || "",
    );
    rec.Postal = String(readField(row, cfg, moduleKey, "Postal") || "");
    rec.Country = String(readField(row, cfg, moduleKey, "Country") || "");
  }

  return rec;
}

/* Build the POST body in the shape the backend expects for this type. */
function buildSavePayload(party, cfg, touchUser) {
  const up = (v) =>
    cfg.upperCaseOnSave ? String(v || "").toUpperCase() : v || "";
  const p = cfg.prefix || "";
  const codeField = cfg.codeField || (p ? `${p}Code` : "Code");

  const body = {
    Id: party.Id || 0,
    [codeField]: up(party.Code),
    [p ? `${p}CRUEI` : "CRUEI"]: up(party.CRUEI),
    [p ? `${p}Name` : "Name"]: up(party.Name),
    [p ? `${p}Name1` : "Name1"]: up(party.Name1),
    TouchUser: String(touchUser || "").toUpperCase(),
    TouchTime: new Date().toISOString(),
    Status: "Active",
    ...(cfg.extraSavePayload || {}),
  };

  if (cfg.hasClaimantNameFields) {
    body.ClaimantName = party.ClaimantName || "";
    body.ClaimantName1 = party.ClaimantName1 || "";
  }

  if (cfg.hasAddress) {
    body[p ? `${p}Address` : "Address"] = party.Address || "";
    body[p ? `${p}Address1` : "Address1"] = party.Address1 || "";
    body[p ? `${p}City` : "City"] = party.City || "";
    body[p ? `${p}${cfg.subKey || "SubCode"}` : "SubCode"] =
      party.SubCode || "";
    body[p ? `${p}${cfg.subDiviKey || "Sub"}` : "Sub"] = party.Sub || "";
    body[p ? `${p}Postal` : "Postal"] = party.Postal || "";
    body[p ? `${p}Country` : "Country"] = party.Country || "";
  }

  return body;
}

/* ============================================================
   OPTION LOADING  (Common + module table, merged & de-duped)
============================================================ */
const optionsCache = {};

export async function loadPartyOptions(type, moduleKey) {
  const cfg = PARTY_TYPES[type];
  const cacheKey = `${type}:${moduleKey}`;
  if (optionsCache[cacheKey]) return optionsCache[cacheKey];

  const moduleUrl = cfg.moduleFetch?.[moduleKey];
  const calls = [API.get(cfg.commonEndpoint)];
  if (moduleUrl) calls.push(API.get(moduleUrl));

  const [commonRes, moduleRes] = await Promise.allSettled(calls);

  if (commonRes.status === "rejected")
    console.error(`Failed to fetch Common ${type}`, commonRes.reason);
  if (moduleRes?.status === "rejected")
    console.error(`Failed to fetch ${moduleKey} ${type}`, moduleRes.reason);

  const commonRows =
    commonRes.status === "fulfilled" ? commonRes.value.data || [] : [];
  const moduleRows =
    moduleRes?.status === "fulfilled" ? moduleRes.value.data || [] : [];

  const merged = commonRows.map((r) => normalizePartyRow(r, cfg, null));
  const seen = new Set(merged.map((r) => r.Code.toLowerCase()));
  const commonCodes = new Set(seen);

  for (const raw of moduleRows) {
    const r = normalizePartyRow(raw, cfg, moduleKey);
    const code = r.Code.toLowerCase();
    if (code && !seen.has(code)) {
      merged.push(r);
      seen.add(code);
    }
  }

  const result = { rows: merged, commonCodes };
  optionsCache[cacheKey] = result;
  return result;
}

export function clearPartyOptionsCache() {
  Object.keys(optionsCache).forEach((k) => delete optionsCache[k]);
}

function usePartyOptions(type, moduleKey) {
  const [state, setState] = useState({ rows: [], commonCodes: new Set() });

  useEffect(() => {
    let cancelled = false;
    loadPartyOptions(type, moduleKey).then((res) => {
      if (!cancelled) setState(res);
    });
    return () => {
      cancelled = true;
    };
  }, [type, moduleKey]);

  return state;
}

/* Popup data for the magnifier icon — same merged list. */
export async function fetchPartyPopupData(
  type,
  moduleKey,
  setData,
  setLoading,
) {
  setLoading?.(true);
  try {
    const { rows } = await loadPartyOptions(type, moduleKey);
    setData(rows);
  } catch (err) {
    console.error("Failed to fetch popup data", err);
    setData([]);
  } finally {
    setLoading?.(false);
  }
}

/* ============================================================
   INPUT  (swap for your EditableInput if it's exported)
============================================================ */
function PartyInput({
  value,
  placeholder,
  onChange,
  mandatory,
  inputRef,
  ...rest
}) {
  return (
    <input
      ref={inputRef}
      value={value || ""}
      placeholder={placeholder}
      onChange={(e) => onChange(e.target.value)}
      style={{
        width: "100%",
        fontSize: 12,
        padding: "5px 8px",
        border: `1px solid ${C.inputBorder}`,
        borderRadius: 4,
        background: mandatory ? MANDATORY_BG : "#fff",
        outline: "none",
      }}
      {...rest}
    />
  );
}

const rowStyle = (cols) => ({
  display: "grid",
  gridTemplateColumns: `repeat(${cols}, 1fr)`,
  gap: 8,
  marginBottom: 8,
});

/* ============================================================
   ONE PARTY BLOCK
============================================================ */
export function MasterPartyField({
  type,
  data,
  onEdit,
  touchUser,
  activeModule,
  readOnly,
  onOpenPopup,
  onCopyFrom,
  errors = {},
}) {
  const cfg = PARTY_TYPES[type];
  const isSea = (data.InwardTransportMode || "") === "1 : Sea";
  const isAir = (data.InwardTransportMode || "") === "4 : Air";
  const mandatory =
    type === "inwardCarrierAgent" ? isSea || isAir : cfg.mandatory;
  const { rows, commonCodes } = usePartyOptions(type, activeModule);
  const path = useMemo(() => [cfg.dataKey], [cfg.dataKey]);
  const party = data[cfg.dataKey] || blankParty(cfg);

  const [open, setOpen] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const [highlight, setHighlight] = useState(0);
  const codeRef = useRef(null);

  const set = (field, value) => onEdit([...path, field], value);

  // Seed the default record (e.g. SATS LTD, LINEHAUL EXPRESS) once options load.
  useEffect(() => {
    if (!cfg.defaultCode || !rows.length || party.Name) return;
    const norm = (v) =>
      String(v || "")
        .trim()
        .toLowerCase()
        .replace(/\.$/, "");
    if (norm(party.Code) !== norm(cfg.defaultCode)) return;
    const match = rows.find((r) => norm(r.Code) === norm(cfg.defaultCode));
    if (match) applyRecord(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows]);

  const runFilter = (val) => {
    if (!val) {
      setOpen(false);
      setFiltered([]);
      return;
    }
    const s = val.toLowerCase();
    const matches = rows.filter(
      (o) =>
        o.Code.toLowerCase().startsWith(s) ||
        o.Name.toLowerCase().startsWith(s),
    );
    setFiltered(matches.slice(0, 100));
    setHighlight(0);
    setOpen(matches.length > 0);
  };

  const applyRecord = (rec) => {
    if (!rec) return;
    set("Code", rec.Code);
    set("CRUEI", rec.CRUEI);
    set("Name", rec.Name);
    set("Name1", rec.Name1);
    if (cfg.hasClaimantNameFields) {
      set("ClaimantName", rec.ClaimantName || "");
      set("ClaimantName1", rec.ClaimantName1 || "");
    }
    if (cfg.hasAddress) ADDRESS_FIELDS.forEach((f) => set(f, rec[f] || ""));
    setOpen(false);
  };

  const handleKeyDown = (e) => {
    if (!open || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((p) => (p + 1 >= filtered.length ? 0 : p + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((p) => (p - 1 < 0 ? filtered.length - 1 : p - 1));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      applyRecord(filtered[highlight]);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  };

  // On blur, snap a typed code to the matching record (legacy focus-out behaviour).
  const handleBlur = () => {
    setTimeout(() => {
      setOpen(false);
      if (!party.Code) return;
      const hit = rows.find(
        (o) => o.Code.toLowerCase() === party.Code.toLowerCase(),
      );
      if (hit) applyRecord(hit);
    }, 150);
  };

  const handleSave = async () => {
    if (!party.Code) {
      alert("Code is required!");
      return;
    }
    if (!touchUser) {
      alert("User could not be resolved — cannot save.");
      return;
    }
    if (commonCodes.has(party.Code.toLowerCase())) {
      alert(`Duplicate code found! ${cfg.label} not saved.`);
      return;
    }

    const payload = buildSavePayload(party, cfg, touchUser);
    const moduleSaveUrl = cfg.moduleSave?.[activeModule];

    try {
      if (moduleSaveUrl) {
        await API.post(moduleSaveUrl, payload);
      }
      await API.post(cfg.saveEndpoint, payload);

      alert(
        moduleSaveUrl
          ? `${cfg.label} saved successfully in both tables!`
          : `${cfg.label} saved successfully!`,
      );
      commonCodes.add(party.Code.toLowerCase());
      clearPartyOptionsCache();
    } catch (err) {
      const msg =
        err.response?.data?.error || err.response?.data?.Result || err.message;
      alert(msg || `Failed to save ${cfg.label}`);
    }
  };

  return (
    <div
      style={{
        marginBottom: 14,
        paddingBottom: 12,
        borderBottom: `1px solid ${C.panelBorder}`,
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span style={{ color: C.navy, fontWeight: 700, fontSize: 11.5 }}>
          {cfg.label}
        </span>
        <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
          {cfg.copyFrom && onCopyFrom && (
            <button
              type="button"
              onClick={() => onCopyFrom(cfg.copyFrom, type)}
              style={{
                fontSize: 11,
                padding: "3px 8px",
                border: `1px solid ${C.bar}`,
                borderRadius: 4,
                background: "#fff",
                color: C.bar,
                cursor: "pointer",
              }}
            >
              Copy from {PARTY_TYPES[cfg.copyFrom].label}
            </button>
          )}
          <FaSearch
            style={{ color: C.bar, fontSize: 12, cursor: "pointer" }}
            onClick={() => onOpenPopup?.(type)}
          />
          <FaPlus
            style={{ color: C.bar, fontSize: 12, cursor: "pointer" }}
            onClick={handleSave}
          />
        </div>
      </div>

      <div style={rowStyle(2)}>
        <div style={{ position: "relative" }}>
          <PartyInput
            inputRef={codeRef}
            value={party.Code}
            placeholder="CODE"
            mandatory={mandatory}
            readOnly={readOnly}
            onChange={(v) => {
              set("Code", v);
              runFilter(v);
            }}
            onKeyDown={handleKeyDown}
            onFocus={() => runFilter(party.Code)}
            onBlur={handleBlur}
          />
          {open && filtered.length > 0 && (
            <div
              style={{
                position: "absolute",
                top: "100%",
                left: 0,
                right: 0,
                zIndex: 30,
                background: "#fff",
                border: `1px solid ${C.inputBorder}`,
                borderRadius: 4,
                maxHeight: 200,
                overflowY: "auto",
              }}
            >
              {filtered.map((item, i) => (
                <div
                  key={`${item.Code}-${i}`}
                  onMouseDown={() => applyRecord(item)}
                  onMouseEnter={() => setHighlight(i)}
                  style={{
                    padding: "6px 9px",
                    fontSize: 12,
                    cursor: "pointer",
                    background: i === highlight ? C.navy : "#fff",
                    color: i === highlight ? "#fff" : "#000",
                  }}
                >
                  {item.Code} - {item.Name}
                </div>
              ))}
            </div>
          )}
        </div>

        <div>
          <PartyInput
            value={party.CRUEI}
            placeholder="CRUEI"
            mandatory={mandatory}
            readOnly={readOnly}
            onChange={(v) => set("CRUEI", v)}
          />
          {errors.CRUEI && (
            <span style={{ color: ERROR_COLOR, fontSize: 11 }}>
              {errors.CRUEI}
            </span>
          )}
        </div>
      </div>

      <div style={rowStyle(2)}>
        <div>
          <PartyInput
            value={party.Name}
            placeholder="NAME"
            mandatory={mandatory}
            readOnly={readOnly}
            onChange={(v) => set("Name", v)}
          />
          {errors.Name && (
            <span style={{ color: ERROR_COLOR, fontSize: 11 }}>
              {errors.Name}
            </span>
          )}
        </div>
        <PartyInput
          value={party.Name1}
          placeholder="NAME1"
          readOnly={readOnly}
          onChange={(v) => set("Name1", v)}
        />
      </div>

      {cfg.hasClaimantNameFields && (
        <div style={rowStyle(2)}>
          <PartyInput
            value={party.ClaimantName}
            placeholder="CLAIMANT ID"
            readOnly={readOnly}
            onChange={(v) => set("ClaimantName", v)}
          />
          <PartyInput
            value={party.ClaimantName1}
            placeholder="CLAIMANT NAME"
            readOnly={readOnly}
            onChange={(v) => set("ClaimantName1", v)}
          />
        </div>
      )}

      {cfg.hasAddress && (
        <>
          <div style={rowStyle(3)}>
            <PartyInput
              value={party.Address}
              placeholder="ADDRESS"
              readOnly={readOnly}
              onChange={(v) => set("Address", v)}
            />
            <PartyInput
              value={party.Address1}
              placeholder="ADDRESS1"
              readOnly={readOnly}
              onChange={(v) => set("Address1", v)}
            />
            <PartyInput
              value={party.City}
              placeholder="CITY"
              readOnly={readOnly}
              onChange={(v) => set("City", v)}
            />
          </div>
          <div style={rowStyle(3)}>
            <PartyInput
              value={party.SubCode}
              placeholder="SUB CODE"
              readOnly={readOnly}
              onChange={(v) => set("SubCode", v)}
            />
            <PartyInput
              value={party.Sub}
              placeholder="SUB DIVISION"
              readOnly={readOnly}
              onChange={(v) => set("Sub", v)}
            />
            <PartyInput
              value={party.Postal}
              placeholder="POSTAL"
              readOnly={readOnly}
              onChange={(v) => set("Postal", v)}
            />
          </div>
          <div style={{ width: "33%" }}>
            <PartyInput
              value={party.Country}
              placeholder="COUNTRY"
              readOnly={readOnly}
              onChange={(v) => set("Country", v)}
            />
          </div>
        </>
      )}
    </div>
  );
}

/* ============================================================
   LOOKUP POPUP  (same idea as partyFunctions.SearchPopup, but it
   works on the already-normalized rows so one column set fits all)
============================================================ */
function PartyLookupPopup({ title, rows, columns, onClose, onSelect }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const perPage = 8;

  const filtered = useMemo(() => {
    if (!search) return rows;
    const s = search.toLowerCase();
    return rows.filter((r) =>
      Object.values(r).join(" ").toLowerCase().includes(s),
    );
  }, [rows, search]);

  useEffect(() => setPage(1), [search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / perPage));
  const start = (page - 1) * perPage;
  const shown = filtered.slice(start, start + perPage);

  return (
    <div
      onClick={(e) => e.target === e.currentTarget && onClose()}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 1000,
      }}
    >
      <div
        style={{
          background: "#fff",
          borderRadius: 6,
          padding: 16,
          width: 720,
          maxHeight: "80%",
          overflowY: "auto",
        }}
      >
        <h4 style={{ margin: "0 0 10px", color: C.navy, fontSize: 14 }}>
          {title}
        </h4>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={`Search ${title}...`}
          style={{
            width: "100%",
            boxSizing: "border-box",
            padding: "6px 8px",
            marginBottom: 10,
            border: `1px solid ${C.inputBorder}`,
            borderRadius: 4,
            fontSize: 12,
          }}
        />
        <table
          style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}
        >
          <thead>
            <tr>
              {columns.map((col) => (
                <th
                  key={col}
                  style={{
                    background: C.tableHead,
                    color: "#fff",
                    textAlign: "left",
                    padding: "6px 8px",
                    fontSize: 11,
                  }}
                >
                  {col}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {shown.map((row, i) => (
              <tr
                key={`${row.Code}-${i}`}
                onClick={() => onSelect(row)}
                style={{
                  cursor: "pointer",
                  background: i % 2 ? C.rowAlt : "#fff",
                }}
              >
                {columns.map((col) => (
                  <td
                    key={col}
                    style={{
                      padding: "6px 8px",
                      borderBottom: `1px solid ${C.panelBorder}`,
                    }}
                  >
                    {row[col] ?? ""}
                  </td>
                ))}
              </tr>
            ))}
            {shown.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: 12, textAlign: "center", color: C.sub }}
                >
                  No records found
                </td>
              </tr>
            )}
          </tbody>
        </table>
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginTop: 10,
            fontSize: 11.5,
          }}
        >
          <span style={{ color: C.sub }}>
            {filtered.length} records · page {page} of {totalPages}
          </span>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              type="button"
              disabled={page === 1}
              onClick={() => setPage((p) => p - 1)}
            >
              Previous
            </button>
            <button
              type="button"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Next
            </button>
            <button type="button" onClick={onClose}>
              Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================================================
   THE PARTY TAB
============================================================ */
export default function PartyTabContent({
  data,
  onEdit,
  touchUser,
  activeModule = "inpayment",
  visibility = {},
  readOnly = false,
  errors = {},
}) {
  const [popupType, setPopupType] = useState(null);
  const [popupData, setPopupData] = useState([]);
  const [, setLoading] = useState(false);

  const moduleDefaults = useMemo(
    () => getModuleDefaultVisibility(activeModule, data),
    [
      activeModule,
      data.InwardTransportMode,
      data.OutwardTransportMode,
      data.DeclarationType,
      data.EndUserChecked,
      data.CoType,
    ],
  );

  const types = (MODULE_PARTY_TYPES[activeModule] || []).filter((t) => {
    const rule = PARTY_VISIBILITY[t];
    if (!rule?.flag) return true;
    const explicit = visibility[rule.flag];
    if (explicit !== undefined) return explicit !== false;
    return moduleDefaults[rule.flag] !== false;
  });

  const openPopup = async (type) => {
    setPopupType(type);
    await fetchPartyPopupData(type, activeModule, setPopupData, setLoading);
  };

  // "Copy of consignee" — clone one party block into another.
  const copyFrom = (sourceType, targetType) => {
    const src = data[PARTY_TYPES[sourceType].dataKey] || {};
    const targetKey = PARTY_TYPES[targetType].dataKey;
    Object.entries(src).forEach(([k, v]) => onEdit([targetKey, k], v));
  };

  const popupCfg = popupType ? PARTY_TYPES[popupType] : null;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        padding: 12,
        background: "#fafcfd",
      }}
    >
      {types.map((type) => (
        <React.Fragment key={type}>
          {type === "endUser" && (
            <label
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                marginBottom: 8,
                fontWeight: 700,
                fontSize: 11.5,
                color: C.navy,
              }}
            >
              <input
                type="checkbox"
                checked={!!data.EndUserChecked}
                onChange={(e) => onEdit(["EndUserChecked"], e.target.checked)}
                style={{ width: 16, height: 16 }}
              />
              ENDUSER
            </label>
          )}
          <MasterPartyField
            key={type}
            type={type}
            data={data}
            onEdit={onEdit}
            touchUser={touchUser}
            activeModule={activeModule}
            readOnly={readOnly}
            onOpenPopup={openPopup}
            onCopyFrom={copyFrom}
            errors={errors[type] || {}}
          />
        </React.Fragment>
      ))}

      {popupCfg && (
        <PartyLookupPopup
          title={popupCfg.label.toUpperCase()}
          rows={popupData}
          columns={
            popupCfg.hasClaimantNameFields
              ? [
                  "Code",
                  "CRUEI",
                  "Name",
                  "Name1",
                  "ClaimantName",
                  "ClaimantName1",
                ]
              : popupCfg.hasAddress
                ? ["Code", "CRUEI", "Name", "Name1", "City", "Country"]
                : ["Code", "CRUEI", "Name", "Name1"]
          }
          onClose={() => setPopupType(null)}
          onSelect={(item) => {
            const key = popupCfg.dataKey;
            Object.entries(item).forEach(([k, v]) => {
              if (k !== "Id") onEdit([key, k], v);
            });
            setPopupType(null);
          }}
        />
      )}
    </div>
  );
}
