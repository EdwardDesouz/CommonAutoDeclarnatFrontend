import { useState, useEffect, useMemo, useRef } from "react";
import { FaSearch } from "react-icons/fa";
import API from "../api/api";
import { C, findRowKey } from "./DeclarationPanel";
import { HEADER_FIELD_SPECS } from "./headerTab";
import { getModuleKey, getCargoRules, outwardHawbLabel } from "./headerRules";

// TEMP: shows a yellow line at the top of the Cargo tab with what it sees.
// Set to false once the Outward card shows correctly.
const SHOW_CARGO_DEBUG = true;

// ===========================================================================
// CargoCommon.jsx — ONE Cargo tab for Inpayment, InNonPayment and Out.
//
// How the modules differ is described in two places only:
//   1. CARGO_MODULES      — per-module behaviour (labels, read-only, checks)
//   2. headerRules.js     — show/hide rules (which sections / fields appear
//                           for which declaration type + transport mode),
//                           ported from the legacy Header.jsx handlers and
//                           shared with the Header tab.
// The active module is read from moduleConfig.messageType (IPTDEC / INPDEC /
// OUTDEC), falling back to the hasCoType / hasOutwardTransportMode flags.
// ===========================================================================

// ---------------------------------------------------------------------------
// Small utilities
// ---------------------------------------------------------------------------
function isPlainObject(val) {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

function formatDMY(date) {
  const dd = String(date.getDate()).padStart(2, "0");
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  return `${dd}/${mm}/${date.getFullYear()}`;
}

function todayDMY() {
  return formatDMY(new Date());
}

// "DD/MM/YYYY" -> Date, or null when it is not a real calendar date
function parseDMY(str) {
  if (!str || typeof str !== "string") return null;
  const parts = str.split("/");
  if (parts.length !== 3) return null;
  const [d, m, y] = parts.map(Number);
  if (!d || !m || !y) return null;
  const date = new Date(y, m - 1, d);
  if (
    date.getFullYear() !== y ||
    date.getMonth() !== m - 1 ||
    date.getDate() !== d
  ) {
    return null;
  }
  return date;
}

function addDaysToDate(str, days) {
  const date = parseDMY(str);
  if (!date) return "";
  date.setDate(date.getDate() + days);
  return formatDMY(date);
}

// ---------------------------------------------------------------------------
// One cached API-list hook (replaces the two near-identical hooks before).
// Pass a falsy endpoint to skip fetching.
// ---------------------------------------------------------------------------
const EMPTY_LIST = [];
const apiListCache = {};

function useApiList(endpoint) {
  const [list, setList] = useState(
    () => (endpoint && apiListCache[endpoint]) || EMPTY_LIST,
  );

  useEffect(() => {
    if (!endpoint) return;
    if (apiListCache[endpoint]) {
      setList(apiListCache[endpoint]);
      return;
    }
    let cancelled = false;
    API.get(endpoint)
      .then((response) => {
        const rows = Array.isArray(response.data) ? response.data : EMPTY_LIST;
        apiListCache[endpoint] = rows;
        if (!cancelled) setList(rows);
      })
      .catch((error) => {
        console.error(`Error fetching options from ${endpoint}`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  return list;
}

// unique "Name" values of a master-data endpoint
function useMasterNames(endpoint) {
  const list = useApiList(endpoint);
  return useMemo(
    () => Array.from(new Set(list.map((i) => i?.Name).filter(Boolean))),
    [list],
  );
}

// ---------------------------------------------------------------------------
// Shared styles + layout primitives
// ---------------------------------------------------------------------------
const LABEL_STYLE = {
  width: 62,
  flexShrink: 0,
  fontSize: 11,
  fontWeight: 600,
  lineHeight: 1.2,
  color: "#2A3D4F",
  whiteSpace: "normal",
  wordBreak: "normal",
  overflowWrap: "break-word",
  paddingTop: 4,
};

const ERROR_STYLE = {
  color: "#c0392b",
  fontSize: 10,
  fontWeight: 700,
  marginTop: 2,
};

const inputStyle = ({ disabled = false, invalid = false } = {}) => ({
  width: "100%",
  minWidth: 0,
  padding: "4px 6px",
  border: invalid
    ? "1px solid #c0392b"
    : disabled
      ? "1px solid #8FA5B5"
      : "1px solid #C3C1B5",
  borderRadius: 4,
  fontFamily: "monospace",
  fontSize: 11.5,
  fontWeight: disabled ? 700 : 400,
  color: disabled ? "#0b2f3f" : "#12202E",
  background: disabled ? "#e9eef2" : "#fff",
  boxSizing: "border-box",
});

function FieldRow({ label, children }) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        marginBottom: 6,
        minWidth: 0,
      }}
    >
      <span style={LABEL_STYLE}>{label}</span>
      {children}
    </div>
  );
}

// input column with an optional error message underneath
function FieldBody({ error, children }) {
  return (
    <div style={{ flex: 1, minWidth: 0 }}>
      {children}
      {error && <div style={ERROR_STYLE}>{error}</div>}
    </div>
  );
}

function CargoSectionCard({ title, children }) {
  return (
    <div
      style={{
        border: "1px solid #c2d7e8",
        borderRadius: 5,
        padding: 8,
        background: "#fafcfd",
        minWidth: 0,
        overflow: "hidden",
      }}
    >
      <div
        style={{
          background: "#0f3c52",
          color: "#eaf3f9",
          fontWeight: 700,
          fontSize: 11,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          textAlign: "center",
          padding: "7px 0",
          borderRadius: 4,
          marginBottom: 10,
        }}
      >
        {title}
      </div>
      {children}
    </div>
  );
}

function CargoTextRow({ label, value, onChange, disabled, error }) {
  return (
    <FieldRow label={label}>
      <FieldBody error={error}>
        <input
          type="text"
          value={value ?? ""}
          disabled={disabled}
          onChange={(e) => onChange && onChange(e.target.value.toUpperCase())}
          style={inputStyle({ disabled, invalid: !!error })}
        />
      </FieldBody>
    </FieldRow>
  );
}

function CargoCheckRow({ label, checked, onChange }) {
  return (
    <FieldRow label={label}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => onChange(e.target.checked)}
        style={{
          width: 16,
          height: 16,
          marginTop: 3,
          cursor: "pointer",
          accentColor: C.bar,
        }}
      />
    </FieldRow>
  );
}

function CargoWeightRow({
  label,
  value,
  unit,
  unitOptions,
  onValueChange,
  onUnitChange,
}) {
  return (
    <FieldRow label={label}>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value)}
        style={{
          ...inputStyle(),
          width: undefined,
          flex: "0 0 50px",
          border: "1px solid #8FA5B5",
          fontWeight: 600,
        }}
      />
      <select
        value={unit || ""}
        onChange={(e) => onUnitChange(e.target.value)}
        style={{
          flex: "0 0 58px",
          minWidth: 0,
          padding: "3px 4px",
          border: "1px solid #8FA5B5",
          borderRadius: 4,
          fontFamily: "monospace",
          fontSize: 10.5,
          fontWeight: 600,
          color: "#0b2f3f",
          background: "#fff",
        }}
      >
        <option value="">--Select--</option>
        {unit && unitOptions && !unitOptions.includes(unit) && (
          <option value={unit}>{unit}</option>
        )}
        {(unitOptions || []).map((o) => (
          <option key={o} value={o}>
            {o}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

// <select> whose options come from an API list. It owns its own fetch, so the
// request only happens when the row is actually rendered.
function CargoApiSelectRow({
  label,
  endpoint,
  value,
  onChange,
  getValue,
  getLabel,
}) {
  const list = useApiList(endpoint);
  const options = list
    .map((item) => ({ value: getValue(item), label: getLabel(item) }))
    .filter((o) => o.value);
  const missing = value && !options.some((o) => o.value === value);

  return (
    <FieldRow label={label}>
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value)}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "4px 4px",
          border: "1px solid #C3C1B5",
          borderRadius: 4,
          fontFamily: "monospace",
          fontSize: 11,
          color: "#12202E",
          background: "#fff",
        }}
      >
        <option value="">--Select--</option>
        {missing && <option value={value}>{value}</option>}
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
    </FieldRow>
  );
}

// Text date field: 8 digits are auto-formatted, an invalid date resets to
// today, Space inserts today. `onConfirm` fires (with the final value) after a
// valid blur — used for the Exhibition start date -> end date +180 days rule.
function CargoDateField({
  label,
  value,
  onChange,
  onConfirm,
  error: outerError,
}) {
  const [error, setError] = useState(false);

  const handleBlur = () => {
    const str = String(value ?? "").trim();
    if (!str) {
      setError(false);
      return;
    }

    let next = str;
    let invalid = false;
    const digits = str.replace(/\D/g, "");

    if (digits.length === 8) {
      const candidate = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4, 8)}`;
      if (parseDMY(candidate)) {
        next = candidate;
      } else {
        next = todayDMY();
        invalid = true;
      }
    } else if (!(str.length === 10 && parseDMY(str))) {
      next = todayDMY();
    }

    if (next !== value) onChange(next);
    setError(invalid);
    if (!invalid && onConfirm) onConfirm(next);
  };

  const handleKeyDown = (e) => {
    if (e.key === " ") {
      e.preventDefault();
      onChange(todayDMY());
    }
  };

  const message = error ? "Invalid date — reset to today" : outerError;

  return (
    <FieldRow label={label}>
      <FieldBody error={message}>
        <input
          type="text"
          value={value ?? ""}
          placeholder="DD/MM/YYYY"
          onChange={(e) => onChange(e.target.value)}
          onBlur={handleBlur}
          onKeyDown={handleKeyDown}
          style={inputStyle({ invalid: error })}
        />
      </FieldBody>
    </FieldRow>
  );
}

// ---------------------------------------------------------------------------
// Location suggestions (Release / Receipt / Storage / Loading / Discharge /
// Next / Last port). Exported because other tabs may reuse it.
// ---------------------------------------------------------------------------
export function LocationSuggestField({
  label,
  endpoint,
  codeKey,
  nameKey,
  extraKey,
  code,
  name,
  onCodeChange,
  onNameChange,
  defaultCode,
  nameMatch = "includes",
  nameReadOnly = false,
}) {
  const options = useApiList(endpoint);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!defaultCode || !options.length || code) return;
    const match = options.find(
      (item) =>
        String(item[codeKey] || "").toLowerCase() === defaultCode.toLowerCase(),
    );
    if (match) {
      onCodeChange(match[codeKey] || defaultCode);
      onNameChange(match[nameKey] || "");
    }
  }, [options, defaultCode]);

  const runFilter = (val) => {
    const search = String(val || "").toLowerCase();
    const matches = !search
      ? options
      : options.filter((item) => {
          const c = String(item[codeKey] || "").toLowerCase();
          const n = String(item[nameKey] || "").toLowerCase();
          const nameMatches =
            nameMatch === "startsWith"
              ? n.startsWith(search)
              : n.includes(search);
          return c.startsWith(search) || nameMatches;
        });
    setFiltered(matches.slice(0, 100));
    setShowDropdown(matches.length > 0);
  };

  const applyItem = (item) => {
    onCodeChange(item[codeKey] || "");
    onNameChange(item[nameKey] || "");
  };

  const handleCodeChange = (val) => {
    onCodeChange(val);
    setHighlighted(0);
    runFilter(val);
  };

  const handleSelect = (item) => {
    if (!item) return;
    applyItem(item);
    setShowDropdown(false);
  };

  const handleKeyDown = (e) => {
    if (!showDropdown || filtered.length === 0) return;
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlighted((prev) => (prev + 1 >= filtered.length ? 0 : prev + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((prev) => (prev - 1 < 0 ? filtered.length - 1 : prev - 1));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      handleSelect(filtered[highlighted]);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (code) {
        const typed = String(code).toLowerCase();
        const match = options.find(
          (item) =>
            String(item[codeKey] || "").toLowerCase() === typed ||
            String(item[nameKey] || "").toLowerCase() === typed,
        );
        if (match) applyItem(match);
      }
      setShowDropdown(false);
    }, 150);
  };

  return (
    <FieldRow label={label}>
      <FaSearch
        style={{
          color: "#1e6e5c",
          fontSize: 11,
          flexShrink: 0,
          marginTop: 5,
          cursor: "pointer",
        }}
        title={`Browse ${label}`}
        onClick={() => {
          inputRef.current?.focus();
          runFilter(code);
        }}
      />
      <div style={{ flex: "0 0 92px", minWidth: 0, position: "relative" }}>
        <input
          ref={inputRef}
          type="text"
          value={code ?? ""}
          onChange={(e) => handleCodeChange(e.target.value.toUpperCase())}
          onKeyDown={handleKeyDown}
          onBlur={handleBlur}
          placeholder="CODE"
          style={inputStyle()}
        />
        {showDropdown && filtered.length > 0 && (
          <div
            style={{
              position: "absolute",
              top: "100%",
              left: 0,
              minWidth: 260,
              zIndex: 30,
              background: "#fff",
              border: `1px solid ${C.inputBorder}`,
              borderRadius: 4,
              marginTop: 2,
              maxHeight: 220,
              overflowY: "auto",
              boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
            }}
          >
            {filtered.map((item, index) => (
              <div
                key={`${item[codeKey]}-${index}`}
                onMouseDown={() => handleSelect(item)}
                onMouseEnter={() => setHighlighted(index)}
                style={{
                  padding: "6px 9px",
                  fontSize: 12,
                  cursor: "pointer",
                  background: index === highlighted ? C.bar : "#fff",
                  color: index === highlighted ? "#fff" : C.navy,
                }}
              >
                {item[codeKey]} - {item[nameKey]}
                {extraKey && item[extraKey] ? ` (${item[extraKey]})` : ""}
              </div>
            ))}
          </div>
        )}
      </div>
      <input
        type="text"
        value={name ?? ""}
        readOnly={nameReadOnly}
        onChange={(e) => onNameChange(e.target.value.toUpperCase())}
        placeholder="NAME"
        style={{
          ...inputStyle({ disabled: nameReadOnly }),
          flex: 1,
          width: undefined,
        }}
      />
    </FieldRow>
  );
}

// ---------------------------------------------------------------------------
// Cargo field specs — single source of truth for aliases / default units.
// (headerTab.jsx also reads these to know which data keys to clear / default
// when a transport mode changes.)
//
// NOTE: the aliases for the transport / outward fields are best guesses from
// the legacy payload names — check them against your real data keys.
// ---------------------------------------------------------------------------
export const CARGO_FIELD_SPECS = {
  // ---- outer pack ---------------------------------------------------------
  totalOuterPack: {
    key: "TotalOuterPack",
    label: "Total Outer Pack",
    aliases: ["totalouterpack", "outerpackqty", "outerpackquantity"],
    unitAliases: ["totalouterpackunit", "outerpackunit", "totalouterpackuom"],
    // defaultUnit: "PKG",
  },
  totalGrossWeight: {
    key: "TotalGrossWeight",
    label: "Total Gross Weight",
    aliases: ["totalgrossweight", "grossweight"],
    unitAliases: [
      "totalgrossweightunit",
      "grossweightunit",
      "totalgrossweightuom",
    ],
    // defaultUnit: "KGM",
  },
  permitGrossWeight: {
    key: "PermitGrossWeight",
    label: "Permit Gross Weight",
    aliases: ["permitgrossweight"],
  },

  // ---- locations ----------------------------------------------------------
  releaseLocation: {
    key: "ReleaseLocation",
    label: "Release Location",
    nestedAliases: ["releaselocation"],
    codeAliases: ["releaselocationcode"],
    nameAliases: ["releaselocationname"],
    // defaultCode: "CZ",
  },
  receiptLocation: {
    key: "ReceiptLocation",
    label: "Receipt Location",
    nestedAliases: ["receiptlocation"],
    codeAliases: ["receiptlocationcode"],
    nameAliases: ["receiptlocationname"],
    // defaultCode: "O",
  },
  storageLocation: {
    key: "StorageLocation",
    label: "Storage Location",
    nestedAliases: ["storagelocation"],
    codeAliases: ["storagelocationcode", "storagecode"],
    nameAliases: ["storagelocationdescription", "storagelocationname"],
  },
  loadingPort: {
    key: "LoadingPort",
    label: "Loading Port",
    nestedAliases: ["loadingport"],
    codeAliases: ["loadingportcode"],
    nameAliases: ["loadingportname"],
  },
  dischargePort: {
    key: "DischargePort",
    label: "Discharge Port",
    nestedAliases: ["dischargeport"],
    codeAliases: ["dischargeportcode"],
    nameAliases: ["dischargeportname"],
  },
  nextPort: {
    key: "NextPort",
    label: "Next Port",
    nestedAliases: ["nextport"],
    codeAliases: ["nextportcode"],
    nameAliases: ["nextportname"],
  },
  lastPort: {
    key: "LastPort",
    label: "Last Port",
    nestedAliases: ["lastport"],
    codeAliases: ["lastportcode"],
    nameAliases: ["lastportname"],
  },

  // ---- inward scalars -----------------------------------------------------
  hawb: { key: "Hawb", label: "HAWB", aliases: ["hawb", "hbl", "inhawb"] },
  arrivalDate: {
    key: "ArrivalDate",
    label: "Arrival Date",
    aliases: ["arrivaldate"],
  },
  blanketStartDate: {
    key: "BlanketStartDate",
    label: "Blanket Start Date",
    aliases: ["blanketstartdate"],
  },
  voyageNumber: {
    key: "VoyageNumber",
    label: "Voyage Number",
    aliases: ["voyagenumber", "voyageno"],
  },
  vesselName: {
    key: "VesselName",
    label: "Vessel Name",
    aliases: ["vesselname"],
  },
  flightNumber: {
    key: "FlightNumber",
    label: "Flight Number",
    aliases: ["flightnumber", "flightno"],
  },
  aircraftRegNo: {
    key: "AircraftRegNo",
    label: "Aircraft Reg No",
    aliases: ["aircraftregno", "aircraftregistrationno"],
  },
  mawb: { key: "Mawb", label: "MAWB", aliases: ["mawb", "masterairwaybill"] },
  obl: {
    key: "Obl", // postHeader reads d.Obl
    label: "OBL",
    aliases: ["obl", "oblnumber", "oceanbilloflading", "oceanbillofladingno"],
  },
  conveyanceNumber: {
    key: "ConveyanceNumber", // postHeader reads d.ConveyanceNumber
    label: "Conveyance No",
    aliases: ["conveyancerefno", "conveyancenumber", "conveyanceno"],
  },
  transportId: {
    key: "TransportDetails", // postHeader reads d.TransportDetails
    label: "Transport ID",
    aliases: ["transportid", "transportdetails"],
  },

  // ---- outward scalars ----------------------------------------------------
  departureDate: {
    key: "DepartureDate",
    label: "Departure Date",
    aliases: ["departuredate"],
  },
  finalDestinationCountry: {
    key: "FinalDestinationCountry",
    label: "Final Destination Country",
    aliases: ["finaldestinationcountry", "finaldestination"],
  },
  seaStore: {
    key: "OutSeaStore",
    label: "Sea Store",
    aliases: ["seastore", "outseastore"],
  },
  outHawb: {
    key: "OutHawb",
    label: "HAWB",
    aliases: ["outhawb", "outhbl", "outcargohawb", "outhblhawb"],
  },
  outVoyageNumber: {
    key: "OutVoyageNumber",
    label: "Voyage Number",
    aliases: ["outvoyagenumber", "outwardvoyagenumber", "outvoyageno"],
  },
  outVesselName: {
    key: "OutVesselName",
    label: "Vessel Name",
    aliases: ["outvesselname", "outwardvesselname"],
  },
  outFlightNumber: {
    key: "OutFlightNumber",
    label: "Flight Number",
    aliases: ["outflightnumber", "outwardflightnumber", "outflightno"],
  },
  outAircraftRegNo: {
    key: "OutAircraftRegNo",
    label: "Aircraft Reg No",
    aliases: [
      "outaircraftregno",
      "outaircraftregnumber",
      "outwardaircraftregno",
    ],
  },
  outMawb: {
    key: "OutMawb",
    label: "MAWB",
    aliases: ["outmawb", "outmawbnumber"],
  },
  outObl: {
    key: "OutObl",
    label: "OBL",
    aliases: ["outobl", "outoblnumber"],
  },
  outConveyanceNumber: {
    key: "OutConveyanceNumber",
    label: "Conveyance No",
    aliases: ["outconveyancenumber", "outconveyanceno", "outconveyancerefno"],
  },
  outTransportId: {
    key: "OutTransportDetails",
    label: "Transport ID",
    aliases: ["outtransportdetails", "outtransportid"],
  },
  vesselType: {
    key: "VesselType",
    label: "Vessel Type",
    aliases: ["vesseltype"],
  },
  vesselNetRegisterTonnage: {
    key: "VesselNetRegisterTonnage",
    label: "Vessel Net Register Tonnage",
    aliases: ["vesselnetregistertonnage", "vesselnrt"],
  },
  vesselNationality: {
    key: "VesselNationality",
    label: "Vessel Nationality",
    aliases: ["vesselnationality"],
  },
  towingVesselId: {
    key: "TowingVesselId",
    label: "Towing Vessel ID",
    aliases: ["towingvesselid"],
  },
  towingVesselName: {
    key: "TowingVesselName",
    label: "Towing Vessel Name",
    aliases: ["towingvesselname"],
  },

  // ---- exhibition / temp import ------------------------------------------
  exhibitionStartDate: {
    key: "ExhibitionStartDate",
    label: "Start Date",
    aliases: ["exhibitionstartdate", "exhibitionstart"],
  },
  exhibitionEndDate: {
    key: "ExhibitionEndDate",
    label: "End Date",
    aliases: ["exhibitionenddate", "exhibitionend"],
  },
};

// endpoint / field mapping for each location picker
const LOCATION_SOURCES = {
  release: {
    endpoint: "/getReleaseLocation/",
    codeKey: "Code",
    nameKey: "Description",
    extraKey: "LocationCode",
    nameMatch: "includes",
  },
  receipt: {
    endpoint: "/getReceiptLocation/",
    codeKey: "Code",
    nameKey: "Description",
    extraKey: "LocationCode",
    nameMatch: "startsWith",
  },
  storage: {
    endpoint: "/getStorageLocation/",
    codeKey: "StorageCode",
    nameKey: "Description",
    nameMatch: "includes",
  },
  port: {
    endpoint: "/getLoadingPort/",
    codeKey: "PortCode",
    nameKey: "PortName",
    extraKey: "Country",
    nameMatch: "includes",
    nameReadOnly: true,
  },
};

// ---------------------------------------------------------------------------
// Per-module BEHAVIOUR switches (not show/hide). Show/hide — which sections
// and fields appear for which declaration type and transport mode — lives in
// headerRules.js, ported from the legacy Header.jsx handlers, so the Header
// tab and this tab always agree.
// ---------------------------------------------------------------------------
const CARGO_MODULES = {
  // Inpayment (IPTDEC)
  IPTDEC: {
    name: "Inpayment",
    seaWeightCheck: true, // Sea inward mode => gross weight UOM must be TNE
    permitWeightReadOnly: true,
    storageLocation: false, // module has no Storage Location
    blanketStartDate: "inward", // shown inside INWARD DETAILS
    arrivalLabel: "Arrival Date",
    hawbEmptyLabel: "HAWB",
    duplicateHawbCheck: true,
    loadingPortNameMatch: "includes",
    aeoDepartureCheck: false,
  },
  // InNonPayment (INPDEC)
  INPDEC: {
    name: "InNonPayment",
    seaWeightCheck: true,
    permitWeightReadOnly: false,
    storageLocation: true,
    blanketStartDate: null,
    arrivalLabel: "Arrival Date",
    hawbEmptyLabel: "HAWB/HBL",
    duplicateHawbCheck: true,
    loadingPortNameMatch: "startsWith",
    aeoDepartureCheck: false,
  },
  // Out (OUTDEC)
  OUTDEC: {
    name: "Out",
    seaWeightCheck: false,
    permitWeightReadOnly: true,
    storageLocation: true,
    blanketStartDate: "location", // shown inside LOCATION INFORMATION
    arrivalLabel: "Arrival Date & Time",
    hawbEmptyLabel: "HAWB/HBL",
    duplicateHawbCheck: false,
    loadingPortNameMatch: "includes",
    aeoDepartureCheck: true, // past departure date => "AEO FAILED"
  },
};

export function getCargoConfig(moduleConfig = {}) {
  return CARGO_MODULES[getModuleKey(moduleConfig)];
}

// legacy inward HAWB label: Air => HAWB, blank => module default, else HBL
function hawbLabel(mode, emptyLabel) {
  if (/air/i.test(mode || "")) return "HAWB";
  if (!mode) return emptyLabel;
  return "HBL";
}

// ---------------------------------------------------------------------------
// Data readers (data + aliases -> value / write path)
// ---------------------------------------------------------------------------
function cargoGetScalar(data, aliases) {
  const key = findRowKey(data, aliases);
  return key ? data[key] : "";
}

function cargoScalarPath(data, aliases, fallbackKey) {
  const key = findRowKey(data, aliases);
  return [key || fallbackKey];
}

function cargoGetWeightPair(data, spec) {
  const valueKey = findRowKey(data, spec.aliases);
  const unitKey = findRowKey(data, spec.unitAliases);
  return {
    value: valueKey ? data[valueKey] : "",
    unit: unitKey ? data[unitKey] : spec.defaultUnit,
    valuePath: [valueKey || spec.key],
    unitPath: [unitKey || `${spec.key}Unit`],
  };
}

function cargoGetLocation(data, spec) {
  const nestedKey = findRowKey(data, spec.nestedAliases);
  if (nestedKey && isPlainObject(data[nestedKey])) {
    const obj = data[nestedKey];
    const codeKey = findRowKey(obj, ["code"]);
    const nameKey = findRowKey(obj, ["name"]);
    return {
      code: codeKey ? obj[codeKey] : "",
      name: nameKey ? obj[nameKey] : "",
      codePath: [nestedKey, codeKey || "Code"],
      namePath: [nestedKey, nameKey || "Name"],
    };
  }

  const flatCodeKey = findRowKey(data, spec.codeAliases);
  const flatNameKey = findRowKey(data, spec.nameAliases);
  if (flatCodeKey || flatNameKey) {
    return {
      code: flatCodeKey ? data[flatCodeKey] : "",
      name: flatNameKey ? data[flatNameKey] : "",
      codePath: [flatCodeKey || `${spec.key}Code`],
      namePath: [flatNameKey || `${spec.key}Name`],
    };
  }

  return {
    code: "",
    name: "",
    codePath: [spec.key, "Code"],
    namePath: [spec.key, "Name"],
  };
}

function readHeaderField(data, specKey) {
  const spec = HEADER_FIELD_SPECS.find((s) => s.key === specKey);
  const key = (spec && findRowKey(data, spec.aliases)) || specKey;
  const value = data[key];
  if (value !== undefined && value !== null && value !== "") return value;
  // same fallback the Header tab displays (e.g. Inward mode "4 : Air")
  return spec?.default ?? "";
}

// text / date row that resolves its own value + write path from `data`
function CargoScalarRow({ data, onEdit, specKey, type = "text", ...rest }) {
  const spec = CARGO_FIELD_SPECS[specKey];
  const value = cargoGetScalar(data, spec.aliases);
  const path = cargoScalarPath(data, spec.aliases, spec.key);
  const Row = type === "date" ? CargoDateField : CargoTextRow;
  return (
    <Row
      label={spec.label}
      value={value}
      onChange={(v) => onEdit(path, v)}
      {...rest}
    />
  );
}

// location picker row that resolves code/name + write paths from `data`
function CargoLocationRow({ data, onEdit, specKey, source, nameMatch, label }) {
  const spec = CARGO_FIELD_SPECS[specKey];
  const src = LOCATION_SOURCES[source];
  const loc = cargoGetLocation(data, spec);
  return (
    <LocationSuggestField
      label={label || spec.label}
      endpoint={src.endpoint}
      codeKey={src.codeKey}
      nameKey={src.nameKey}
      extraKey={src.extraKey}
      nameMatch={nameMatch || src.nameMatch}
      nameReadOnly={src.nameReadOnly}
      code={loc.code}
      name={loc.name}
      onCodeChange={(v) => onEdit(loc.codePath, v)}
      onNameChange={(v) => onEdit(loc.namePath, v)}
      defaultCode={spec.defaultCode}
    />
  );
}

// ---------------------------------------------------------------------------
// Default seeding helpers — used by DeclarationPanel.jsx's buildData()
// pipeline before the tab even mounts. (Unchanged behaviour.)
// ---------------------------------------------------------------------------
export function seedCargoUnitDefaults(d) {
  let result = d;
  const seedUnit = (spec) => {
    const unitKey = findRowKey(result, spec.unitAliases);
    const hasUnit = unitKey && result[unitKey];
    if (!hasUnit && spec.defaultUnit) {
      result = { ...result, [unitKey || `${spec.key}Unit`]: spec.defaultUnit };
    }
  };
  seedUnit(CARGO_FIELD_SPECS.totalOuterPack);
  seedUnit(CARGO_FIELD_SPECS.totalGrossWeight);
  return result;
}

export function seedHawbDefault(d) {
  const hawbKey = findRowKey(d, CARGO_FIELD_SPECS.hawb.aliases);
  const hasHawb = hawbKey && d[hawbKey];
  if (hasHawb) return d;

  const consignmentNoKey = findRowKey(d, ["consignmentno"]);
  const consignmentNo = consignmentNoKey ? d[consignmentNoKey] : "";
  if (!consignmentNo) return d;

  return { ...d, [hawbKey || CARGO_FIELD_SPECS.hawb.key]: consignmentNo };
}

export function seedTotalGrossWeightDefault(d) {
  const grossKey = findRowKey(d, CARGO_FIELD_SPECS.totalGrossWeight.aliases);
  const hasGross = grossKey && d[grossKey] !== "" && d[grossKey] != null;
  if (hasGross) return d;

  const totalWeightKey = findRowKey(d, ["totalweight"]);
  const totalWeight = totalWeightKey ? d[totalWeightKey] : "";
  if (totalWeight === "" || totalWeight == null) return d;

  return {
    ...d,
    [grossKey || CARGO_FIELD_SPECS.totalGrossWeight.key]: String(totalWeight),
  };
}

// ---------------------------------------------------------------------------
// CargoTabContent
//
//   data          — the declaration row
//   onEdit        — onEdit(path[], value)
//   moduleConfig  — from getModuleConfig(activeModule) (same one the Header
//                   tab gets). Needs .messageType (IPTDEC / INPDEC / OUTDEC).
//   errors        — optional validation flags coming from the panel:
//                   { hawbMandatory, outHawbMandatory }
// ---------------------------------------------------------------------------
export default function CargoTabContent({
  data,
  onEdit,
  moduleConfig,
  errors = {},
}) {
  const S = CARGO_FIELD_SPECS;
  const cfg = getCargoConfig(moduleConfig);
  const moduleKey = getModuleKey(moduleConfig);

  const inwardMode = readHeaderField(data, "InwardTransportMode");
  const outwardMode = readHeaderField(data, "OutwardTransportMode");
  const declarationType = readHeaderField(data, "DeclarationType");

  // show / hide decisions — the same rules the Header tab uses (headerRules.js)
  const rules = getCargoRules(moduleKey, {
    declarationType,
    inwardMode,
    outwardMode,
  });
  const showOutward = rules.showOutward;
  const inShow = (id) => rules.inwardFields.has(id);
  const outShow = (id) => rules.outwardFields.has(id);
  const inwardNotRequired = rules.inwardNotRequired;

  // ---- outer pack / weights ------------------------------------------------
  const outerPackUnitOptions = useMasterNames(
    "/getTotalOuterPackFromCommonMaster/",
  );
  const grossWeightUnitOptions = ["KGM", "TNE"];

  const totalOuterPack = cargoGetWeightPair(data, S.totalOuterPack);

  const totalWeightKey = findRowKey(data, ["totalweight"]);
  const totalWeightFallback = totalWeightKey ? data[totalWeightKey] : "";
  const grossRaw = cargoGetWeightPair(data, S.totalGrossWeight);
  const grossKeyExists = !!findRowKey(data, S.totalGrossWeight.aliases);
  const totalGrossWeight = {
    ...grossRaw,
    value: grossKeyExists ? grossRaw.value : totalWeightFallback || "",
  };

  const permitGrossWeight = cargoGetScalar(data, S.permitGrossWeight.aliases);
  const permitWeightPath = cargoScalarPath(
    data,
    S.permitGrossWeight.aliases,
    S.permitGrossWeight.key,
  );

  // Permit Gross Weight = Total Gross Weight (÷1000 when TNE).
  // On mount an existing permit weight is kept (so a manual InNonPayment edit
  // is not overwritten); afterwards it recalculates when weight/UOM change.
  // It only calls onEdit when the value really changes, so it no longer
  // creates an empty PermitGrossWeight key on every mount.
  const prevWeightKey = useRef(null);
  useEffect(() => {
    const raw = totalGrossWeight.value;
    const uom = totalGrossWeight.unit;
    const weightKey = `${raw}|${uom}`;
    const changed =
      prevWeightKey.current !== null && prevWeightKey.current !== weightKey;
    prevWeightKey.current = weightKey;

    if (!changed && permitGrossWeight !== "" && permitGrossWeight != null) {
      return;
    }

    let computed = "";
    const weight = Number(raw);
    if (raw && uom && uom !== "--Select--" && !isNaN(weight)) {
      computed = String(uom === "TNE" ? weight / 1000 : weight);
    }
    if (String(permitGrossWeight ?? "") !== computed) {
      onEdit(permitWeightPath, computed);
    }
  }, [totalGrossWeight.value, totalGrossWeight.unit]);

  const seaUnitMismatch =
    cfg.seaWeightCheck &&
    /sea/i.test(inwardMode) &&
    !!totalGrossWeight.unit &&
    totalGrossWeight.unit !== "TNE";

  // ---- inward HAWB (+ duplicate check) -------------------------------------
  const consignmentNoKey = findRowKey(data, ["consignmentno"]);
  const consignmentNo = consignmentNoKey ? data[consignmentNoKey] : "";
  const hawbKeyExists = !!findRowKey(data, S.hawb.aliases);
  const hawb = hawbKeyExists
    ? cargoGetScalar(data, S.hawb.aliases)
    : consignmentNo || "";
  const hawbPath = cargoScalarPath(data, S.hawb.aliases, S.hawb.key);

  const permitIdKey = findRowKey(data, ["permitid"]);
  const permitId = permitIdKey ? data[permitIdKey] : "";
  const [hawbDuplicateMsg, setHawbDuplicateMsg] = useState("");

  const checkDuplicateHawb = async (value) => {
    const v = String(value ?? "").trim();
    if (!cfg.duplicateHawbCheck || !v) {
      setHawbDuplicateMsg("");
      return;
    }
    try {
      const q = encodeURIComponent(v);
      const response = await API.get(
        `/checkDuplicateHawb/?HBL=${q}&INHAWB=${q}&outHAWB=${q}&PermitId=${encodeURIComponent(permitId || "")}`,
      );
      setHawbDuplicateMsg(
        response.data?.duplicate
          ? response.data.message || "Duplicate HAWB found."
          : "",
      );
    } catch (error) {
      console.error("Error checking duplicate HAWB:", error);
    }
  };

  useEffect(() => {
    if (permitId && hawb) checkDuplicateHawb(hawb);
  }, [permitId]);

  const hawbError =
    hawbDuplicateMsg ||
    (errors.hawbMandatory
      ? "Cargo HAWB/HBL is required when Freight Forwarder is entered."
      : "");

  // ---- outward: departure date, sea store ---------------------------------
  const departureDate = cargoGetScalar(data, S.departureDate.aliases);
  const departureInPast = (() => {
    if (!cfg.aeoDepartureCheck) return false;
    const departure = parseDMY(departureDate);
    if (!departure) return false;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    return departure < today;
  })();

  const seaStoreRaw = cargoGetScalar(data, S.seaStore.aliases);
  const seaStore =
    seaStoreRaw === true || /^(true|y|yes|1)$/i.test(String(seaStoreRaw));
  const seaStorePath = cargoScalarPath(
    data,
    S.seaStore.aliases,
    S.seaStore.key,
  );
  const dischargePort = cargoGetLocation(data, S.dischargePort);
  const finalDestPath = cargoScalarPath(
    data,
    S.finalDestinationCountry.aliases,
    S.finalDestinationCountry.key,
  );

  // Sea Store ticked => discharge port + final destination are hidden AND cleared
  const handleSeaStore = (checked) => {
    onEdit(seaStorePath, checked);
    if (checked) {
      onEdit(dischargePort.codePath, "");
      onEdit(dischargePort.namePath, "");
      onEdit(finalDestPath, "");
    }
  };

  // ---- exhibition / temp import -------------------------------------------
  // InNonPayment: BKT (start date only) and TCE / TCO / TCR / TCS (both dates)
  const showExhibition = rules.exhibition;
  const exhibitionEndPath = cargoScalarPath(
    data,
    S.exhibitionEndDate.aliases,
    S.exhibitionEndDate.key,
  );

  // ---- small render helpers ------------------------------------------------
  const scalar = (specKey, extra = {}) => (
    <CargoScalarRow
      key={specKey}
      data={data}
      onEdit={onEdit}
      specKey={specKey}
      {...extra}
    />
  );

  const blanketStartRow = scalar("blanketStartDate", { type: "date" });

  // Inward alone => full width. As soon as Outward and/or Exhibition is
  // visible too, the sections sit side by side in the 2-column grid.
  const detailSectionCount =
    (rules.showInward ? 1 : 0) +
    (showOutward ? 1 : 0) +
    (showExhibition ? 1 : 0);
  const detailGridClass =
    detailSectionCount > 1 ? "cargo-grid-2col" : undefined;

  // =========================================================================
  return (
    <div
      style={{ display: "flex", flexDirection: "column", gap: 6, minWidth: 0 }}
    >
      {/* ---------------- OUTER PACK + LOCATION ---------------- */}
      <div className="cargo-grid-2col">
        <CargoSectionCard title="OUTER PACK DETAILS">
          <CargoWeightRow
            label="Total Outer Pack"
            value={totalOuterPack.value}
            unit={totalOuterPack.unit}
            unitOptions={outerPackUnitOptions}
            onValueChange={(v) => onEdit(totalOuterPack.valuePath, v)}
            onUnitChange={(v) => onEdit(totalOuterPack.unitPath, v)}
          />
          <CargoWeightRow
            label="Total Gross Weight"
            value={totalGrossWeight.value}
            unit={totalGrossWeight.unit}
            unitOptions={grossWeightUnitOptions}
            onValueChange={(v) => onEdit(totalGrossWeight.valuePath, v)}
            onUnitChange={(v) => onEdit(totalGrossWeight.unitPath, v)}
          />
          {seaUnitMismatch && (
            <div style={{ ...ERROR_STYLE, marginTop: -2, marginBottom: 6 }}>
              Sea mode requires Gross Weight unit = TNE
            </div>
          )}
          <CargoTextRow
            label="Permit Gross Weight"
            value={permitGrossWeight}
            disabled={cfg.permitWeightReadOnly}
            onChange={(v) => onEdit(permitWeightPath, v)}
          />
        </CargoSectionCard>

        <CargoSectionCard title="LOCATION INFORMATION">
          <CargoLocationRow
            data={data}
            onEdit={onEdit}
            specKey="releaseLocation"
            source="release"
          />
          <CargoLocationRow
            data={data}
            onEdit={onEdit}
            specKey="receiptLocation"
            source="receipt"
          />
          {cfg.storageLocation && rules.storageLocation && (
            <CargoLocationRow
              data={data}
              onEdit={onEdit}
              specKey="storageLocation"
              source="storage"
            />
          )}
          {cfg.blanketStartDate === "location" && blanketStartRow}
        </CargoSectionCard>
      </div>

      {/* ---------------- INWARD / OUTWARD / EXHIBITION ---------------- */}
      <div className={detailGridClass}>
        {rules.showInward && (
          <CargoSectionCard title="INWARD DETAILS">
            {/* read-only: the mode is chosen in the Header tab */}
            <CargoTextRow label="Mode" value={inwardMode} disabled />

            {!inwardNotRequired &&
              scalar("arrivalDate", {
                type: "date",
                label: cfg.arrivalLabel,
              })}

            {!inwardNotRequired && (
              <CargoLocationRow
                data={data}
                onEdit={onEdit}
                specKey="loadingPort"
                source="port"
                nameMatch={cfg.loadingPortNameMatch}
              />
            )}

            {!inwardNotRequired && (
              <CargoTextRow
                label={hawbLabel(inwardMode, cfg.hawbEmptyLabel)}
                value={hawb}
                error={hawbError}
                onChange={(v) => {
                  onEdit(hawbPath, v);
                  if (hawbDuplicateMsg) setHawbDuplicateMsg("");
                }}
              />
            )}

            {inShow("voyageNumber") && scalar("voyageNumber")}
            {inShow("vesselName") && scalar("vesselName")}
            {inShow("flightNumber") && scalar("flightNumber")}
            {inShow("aircraftRegNo") && scalar("aircraftRegNo")}
            {inShow("mawb") && scalar("mawb")}
            {inShow("obl") && scalar("obl")}
            {inShow("conveyanceNumber") && scalar("conveyanceNumber")}
            {inShow("transportId") && scalar("transportId")}

            {cfg.blanketStartDate === "inward" && blanketStartRow}
          </CargoSectionCard>
        )}

        {showOutward && (
          <CargoSectionCard title="OUTWARD DETAILS">
            {/* read-only: the mode is chosen in the Header tab */}
            <CargoTextRow label="Mode" value={outwardMode} disabled />

            {scalar("departureDate", {
              type: "date",
              error: departureInPast ? "AEO FAILED" : "",
            })}

            {!seaStore && (
              <>
                <CargoLocationRow
                  data={data}
                  onEdit={onEdit}
                  specKey="dischargePort"
                  source="port"
                />
                <CargoApiSelectRow
                  label="Final Destination Country"
                  endpoint="/getCommonCountryTableInfo/"
                  value={cargoGetScalar(
                    data,
                    S.finalDestinationCountry.aliases,
                  )}
                  onChange={(v) => onEdit(finalDestPath, v)}
                  getValue={(i) => i.CountryCode}
                  getLabel={(i) => `${i.CountryCode}:${i.Description}`}
                />
              </>
            )}

            {outShow("seaStore") && (
              <CargoCheckRow
                label="Sea Store"
                checked={seaStore}
                onChange={handleSeaStore}
              />
            )}

            {outShow("outFlightNumber") && scalar("outFlightNumber")}
            {outShow("outAircraftRegNo") && scalar("outAircraftRegNo")}
            {outShow("outMawb") && scalar("outMawb")}
            {outShow("outVoyageNumber") && scalar("outVoyageNumber")}
            {outShow("outVesselName") && scalar("outVesselName")}
            {outShow("outObl") && scalar("outObl")}

            {outShow("vesselType") && (
              <CargoApiSelectRow
                label="Vessel Type"
                endpoint="/getVesselTypeFromCommonMaster/"
                value={cargoGetScalar(data, S.vesselType.aliases)}
                onChange={(v) =>
                  onEdit(
                    cargoScalarPath(
                      data,
                      S.vesselType.aliases,
                      S.vesselType.key,
                    ),
                    v,
                  )
                }
                getValue={(i) => i.Name}
                getLabel={(i) => i.Name}
              />
            )}
            {outShow("vesselNetRegisterTonnage") &&
              scalar("vesselNetRegisterTonnage")}
            {outShow("vesselNationality") && (
              <CargoApiSelectRow
                label="Vessel Nationality"
                endpoint="/getCommonCountryTableInfo/"
                value={cargoGetScalar(data, S.vesselNationality.aliases)}
                onChange={(v) =>
                  onEdit(
                    cargoScalarPath(
                      data,
                      S.vesselNationality.aliases,
                      S.vesselNationality.key,
                    ),
                    v,
                  )
                }
                getValue={(i) => i.CountryCode}
                getLabel={(i) => `${i.CountryCode}:${i.Description}`}
              />
            )}
            {outShow("towingVesselId") && scalar("towingVesselId")}
            {outShow("towingVesselName") && scalar("towingVesselName")}

            {outShow("nextPort") && (
              <CargoLocationRow
                data={data}
                onEdit={onEdit}
                specKey="nextPort"
                source="port"
              />
            )}
            {outShow("lastPort") && (
              <CargoLocationRow
                data={data}
                onEdit={onEdit}
                specKey="lastPort"
                source="port"
              />
            )}

            {outShow("outConveyanceNumber") && scalar("outConveyanceNumber")}
            {outShow("outTransportId") && scalar("outTransportId")}

            {outShow("outHawb") &&
              scalar("outHawb", {
                label: outwardHawbLabel(outwardMode),
                error: errors.outHawbMandatory
                  ? "Out Cargo HAWB is required when Freight Forwarder is entered."
                  : "",
              })}
          </CargoSectionCard>
        )}

        {showExhibition && (
          <CargoSectionCard title="EXHIBITION / TEMP IMPORT">
            {rules.exhibitionStart &&
              scalar("exhibitionStartDate", {
                type: "date",
                // typing a valid start date auto-fills the end date (+180 days)
                onConfirm: (v) =>
                  onEdit(exhibitionEndPath, addDaysToDate(v, 180)),
              })}
            {rules.exhibitionEnd &&
              scalar("exhibitionEndDate", { type: "date" })}
          </CargoSectionCard>
        )}
      </div>
    </div>
  );
}
