import { useState, useEffect, useRef } from "react";
import { FaSearch, FaPlus } from "react-icons/fa";
import StatusStamp from "./StatusStamp";
import API from "../api/api";
import ItemsTabContent from "./item/Index";
import InvoiceTabContent from "./invoice";
import HeaderTabContent, {
  HEADER_FIELD_SPECS,
  HEADER_SELECT_KEYS,
} from "./headerTab";
import PartyTabContent, { PARTY_TYPES, blankParty } from "./PartyCommon";
import CargoTabContent, {
  CARGO_FIELD_SPECS,
  seedCargoUnitDefaults,
  seedHawbDefault,
  seedTotalGrossWeightDefault,
} from "./CargoCommon";
import CpcTabContent, { buildCpcPayload } from "./Cpccommon";
import { getModuleConfig } from "./moduleConfig";
import { SummaryTabContent } from "./SummaryCommon";
import { C } from "./Theme";

// Re-exported so any other file still doing `import { C } from "./DeclarationPanel"`
// keeps working. The actual definition now lives in theme.js — this avoids a
// circular import now that DeclarationPanel also imports from SummaryCommon,
// which itself needs C.
export { C };

const ALL_DECLARATION_MODULES = ["inpayment", "innonpayment", "out"];

function isPlainObject(val) {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

// Immutable deep setter. Handles object keys and array indexes in `path`
// e.g. setDeep(d, ["items", 2, "Code"], "1234") or setDeep(d, ["Importer", "Name"], "ABC")
function setDeep(obj, path, value) {
  if (!path || path.length === 0) return value;
  const [head, ...rest] = path;

  let base;
  if (Array.isArray(obj)) {
    base = obj.slice();
  } else if (isPlainObject(obj)) {
    base = { ...obj };
  } else {
    // Missing/primitive container: create the right shape from the key type
    base = typeof head === "number" ? [] : {};
  }

  base[head] = setDeep(base[head], rest, value);
  return base;
}

function formatLabel(key) {
  return String(key)
    .replace(/_/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function isScalarValue(v) {
  return !Array.isArray(v) && !isPlainObject(v);
}

function groupEntries(entries) {
  const groups = [];
  let current = null;
  entries.forEach(([key, value]) => {
    if (isScalarValue(value)) {
      if (!current || current.type !== "scalar") {
        current = { type: "scalar", items: [] };
        groups.push(current);
      }
      current.items.push([key, value]);
    } else {
      groups.push({ type: "complex", items: [[key, value]] });
      current = null;
    }
  });
  return groups;
}

function ScalarFieldGrid({ items, path, onEdit, labelStyle }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px 14px",
        marginBottom: 14,
      }}
    >
      {items.map(([key, value]) => (
        <div key={key} className="decl-field-row">
          <span
            className="decl-field-label"
            style={{
              display: "block",
              marginBottom: 6,
              ...labelStyle,
            }}
          >
            {formatLabel(key)}
          </span>
          <span className="decl-field-value">
            <EditableValue
              value={value}
              path={[...path, key]}
              onEdit={onEdit}
            />
          </span>
        </div>
      ))}
    </div>
  );
}

function renderGroupedEntries(
  entries,
  path,
  onEdit,
  { labelStyle, renderComplex },
) {
  const groups = groupEntries(entries);
  return groups.map((g, i) => {
    if (g.type === "scalar") {
      return (
        <ScalarFieldGrid
          key={`grp-${i}`}
          items={g.items}
          path={path}
          onEdit={onEdit}
          labelStyle={labelStyle}
        />
      );
    }
    const [key, value] = g.items[0];
    return renderComplex(key, value);
  });
}

const ITEM_FIELD_SPECS = [
  {
    key: "code",
    label: "HS Code",
    aliases: ["code", "hscode", "hs_code", "commoditycode", "commodity_code"],
  },
  {
    key: "description",
    label: "Description",
    aliases: ["description", "desc"],
  },
  { key: "quantity", label: "Quantity", aliases: ["quantity", "qty"] },
  {
    key: "unitValue",
    label: "Unit Value",
    aliases: ["unitvalue", "unit_value", "unitprice"],
  },
  {
    key: "totalValue",
    label: "Total Value",
    aliases: ["totalvalue", "total_value"],
  },
  { key: "country", label: "Country", aliases: ["country"] },
  {
    key: "countryOfManufacture",
    label: "Country Of Manufacture",
    aliases: [
      "countryofmanufacture",
      "country_of_manufacture",
      "coo",
      "countryoforigin",
    ],
  },
];

function isItemsField(key) {
  return typeof key === "string" && key.trim().toLowerCase() === "items";
}

function blankItemRow() {
  return Object.fromEntries(ITEM_FIELD_SPECS.map((s) => [s.key, ""]));
}

function normalizeKey(k) {
  return String(k)
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

export function findRowKey(row, aliases) {
  const keys = Object.keys(row || {});
  return keys.find((k) => aliases.includes(normalizeKey(k)));
}

function getNestedCI(obj, outerAliases, innerAliases) {
  const outerKey = findRowKey(obj, outerAliases);
  const inner = outerKey ? obj[outerKey] : null;
  if (!isPlainObject(inner)) return "";
  const innerKey = findRowKey(inner, innerAliases);
  return innerKey ? inner[innerKey] : "";
}

const PARTY_TOP_LEVEL_FIELDS = ["shipper", "receiver"];

// ---------------------------------------------------------------------------
// Location suggestions (Release Location / Receipt Location / Loading Port)
// ---------------------------------------------------------------------------

function useLocationOptions(endpoint) {
  const [options, setOptions] = useState(
    () => locationOptionsCache[endpoint] || [],
  );

  useEffect(() => {
    if (!endpoint) return;
    if (locationOptionsCache[endpoint]) {
      setOptions(locationOptionsCache[endpoint]);
      return;
    }
    let cancelled = false;
    API.get(endpoint)
      .then((response) => {
        const list = response.data || [];
        locationOptionsCache[endpoint] = list;
        if (!cancelled) setOptions(list);
      })
      .catch((error) => {
        console.error(
          `Error fetching location options from ${endpoint}`,
          error,
        );
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  return options;
}

function LocationSuggestField({
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
}) {
  const options = useLocationOptions(endpoint);
  const [showDropdown, setShowDropdown] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const [highlighted, setHighlighted] = useState(0);
  const inputRef = useRef(null);

  useEffect(() => {
    if (!defaultCode) return;
    if (!options.length) return;
    if (code) return;
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
      if (!code) {
        setShowDropdown(false);
        return;
      }
      const match = options.find(
        (item) =>
          String(item[codeKey] || "").toLowerCase() === code.toLowerCase(),
      );
      if (match) applyItem(match);
      setShowDropdown(false);
    }, 150);
  };
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
      <span
        style={{
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
        }}
      >
        {label}
      </span>
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
          onFocus={() => runFilter(code)}
          onBlur={handleBlur}
          placeholder="CODE"
          style={{
            width: "100%",
            minWidth: 0,
            padding: "4px 6px",
            border: "1px solid #C3C1B5",
            borderRadius: 4,
            fontFamily: "monospace",
            fontSize: 11.5,
            color: "#12202E",
            background: "#fff",
            boxSizing: "border-box",
          }}
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
        onChange={(e) => onNameChange(e.target.value.toUpperCase())}
        placeholder="NAME"
        style={{
          flex: 1,
          minWidth: 0,
          padding: "4px 6px",
          border: "1px solid #C3C1B5",
          borderRadius: 4,
          fontFamily: "monospace",
          fontSize: 11.5,
          color: "#12202E",
          background: "#fff",
          boxSizing: "border-box",
        }}
      />
    </div>
  );
}

let hsCodeCache = null;

function useHsCodeSuggestions() {
  const [suggestions, setSuggestions] = useState(hsCodeCache || []);

  useEffect(() => {
    if (hsCodeCache) {
      setSuggestions(hsCodeCache);
      return;
    }
    let cancelled = false;
    API.get("/getCommonHsCodeTableInfo/")
      .then((response) => {
        hsCodeCache = response.data || [];
        if (!cancelled) setSuggestions(hsCodeCache);
      })
      .catch((error) => {
        console.error("Error fetching Hs Code suggestions", error);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return suggestions;
}

export function EditableInput({
  value,
  onChange,
  placeholder,
  compact,
  onKeyDown,
  onFocus,
  onBlur,
  disabled,
}) {
  return (
    <input
      type="text"
      value={value ?? ""}
      placeholder={placeholder ?? ""}
      onChange={(e) => onChange && onChange(e.target.value.toUpperCase())}
      onKeyDown={onKeyDown}
      onFocus={onFocus}
      onBlur={onBlur}
      readOnly={disabled}
      style={{
        border: `1px solid ${C.inputBorder}`,
        borderRadius: 4,
        padding: compact ? "5px 7px" : "7px 9px",
        fontSize: compact ? 11.5 : 13,
        color: disabled ? C.sub : C.navy,
        background: disabled ? C.tabIdleBg : C.inputBg,
        outline: "none",
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "inherit",
        cursor: disabled ? "default" : "text",
      }}
    />
  );
}

function HsCodeInput({ value, onChangeText, onSelect }) {
  const suggestions = useHsCodeSuggestions();
  const [showDropdown, setShowDropdown] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const [highlighted, setHighlighted] = useState(0);

  const runFilter = (val) => {
    if (!val) {
      setShowDropdown(false);
      setFiltered([]);
      return;
    }
    const matches = suggestions.filter(
      (i) =>
        i.HSCode?.toLowerCase().includes(val.toLowerCase()) ||
        i.Description?.toLowerCase().includes(val.toLowerCase()),
    );
    const exactMatch = matches.filter(
      (i) => i.HSCode?.toLowerCase() === val.toLowerCase(),
    );
    const finalList =
      exactMatch.length > 0 ? exactMatch : matches.slice(0, 100);
    setFiltered(finalList);
    setShowDropdown(finalList.length > 0);
  };

  const handleChange = (val) => {
    onChangeText(val);
    setHighlighted(0);
    runFilter(val);
  };

  const handleSelect = (item) => {
    onSelect(item);
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
      if (!value) {
        setShowDropdown(false);
        return;
      }
      const match = suggestions.find(
        (i) =>
          String(i.HSCode || "").toLowerCase() === String(value).toLowerCase(),
      );
      if (match) {
        onSelect(match);
      }
      setShowDropdown(false);
    }, 150);
  };

  return (
    <div style={{ position: "relative" }}>
      <EditableInput
        compact
        value={value}
        onChange={handleChange}
        onKeyDown={handleKeyDown}
        onFocus={() => runFilter(value)}
        onBlur={handleBlur}
      />
      {showDropdown && filtered.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 20,
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
              key={item.HSCode + index}
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
              {item.HSCode} - {item.Description}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function PartySearchDropdown({
  items,
  highlighted,
  onSelect,
  onHover,
  getLabel,
}) {
  return (
    <div
      style={{
        position: "absolute",
        top: "100%",
        left: 0,
        right: 0,
        zIndex: 20,
        background: "#fff",
        border: `1px solid ${C.inputBorder}`,
        borderRadius: 4,
        marginTop: 2,
        maxHeight: 220,
        overflowY: "auto",
        boxShadow: "0 4px 10px rgba(0,0,0,0.12)",
      }}
    >
      {items.map((item, index) => (
        <div
          key={index}
          onMouseDown={() => onSelect(item)}
          onMouseEnter={() => onHover(index)}
          style={{
            padding: "6px 9px",
            fontSize: 12,
            cursor: "pointer",
            background: index === highlighted ? C.bar : "#fff",
            color: index === highlighted ? "#fff" : C.navy,
          }}
        >
          {getLabel(item)}
        </div>
      ))}
    </div>
  );
}

function RemoveBtn({ onClick, title }) {
  return (
    <button
      type="button"
      title={title || "Remove"}
      onClick={onClick}
      style={{
        border: "none",
        background: "#fdeceb",
        color: C.danger,
        width: 26,
        height: 26,
        borderRadius: 6,
        cursor: "pointer",
        fontSize: 14,
        fontWeight: 800,
        flexShrink: 0,
      }}
    >
      x
    </button>
  );
}

function AddBtn({ onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        border: `1.5px dashed ${C.bar}`,
        background: "transparent",
        color: C.bar,
        fontWeight: 700,
        fontSize: 12,
        padding: "6px 12px",
        borderRadius: 6,
        cursor: "pointer",
        marginTop: 6,
      }}
    >
      {label}
    </button>
  );
}

const SUPPLIER_PLACEHOLDER_LOCAL = "-"; // kept for any local fallback use in this file only

function PartyFieldRow({ children }) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 8,
        marginBottom: 8,
      }}
    >
      {children}
    </div>
  );
}

function PartyFieldCell({ label, children }) {
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 4,
        position: "relative",
      }}
    >
      {label && (
        <span
          style={{
            color: C.sub,
            fontWeight: 700,
            fontSize: 10,
            letterSpacing: 0.3,
          }}
        >
          {label}
        </span>
      )}
      {children}
    </div>
  );
}

function MasterPartyField({ type, data, onEdit, touchUser }) {
  const cfg = PARTY_TYPES[type];
  const { list, commonCodes } = usePartySuggestions(type);
  const path = [cfg.dataKey];
  const party = data[cfg.dataKey] || blankMasterParty(cfg);
  const codeKey = cfg.hasClaimantNameFields ? "ClaimantCode" : "Code";
  const codeInputRef = useRef(null);

  const [showDropdown, setShowDropdown] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const [highlighted, setHighlighted] = useState(0);

  useEffect(() => {
    if (!cfg.defaultCode) return;
    if (!list.length) return;
    if (party.Name) return;
    if ((party.Code || "").toLowerCase() !== cfg.defaultCode.toLowerCase()) {
      return;
    }

    const normalize = (s) =>
      String(s || "")
        .trim()
        .toLowerCase()
        .replace(/\.$/, "");
    const target = normalize(cfg.defaultCode);

    const match = list.find((i) => normalize(i[codeKey]) === target);

    if (match) {
      onEdit([...path, "Code"], match[codeKey] || cfg.defaultCode);
      onEdit([...path, "CRUEI"], match.CRUEI || "");
      onEdit([...path, "Name"], match.Name || "");
      onEdit([...path, "Name1"], match.Name1 || "");
      if (cfg.hasClaimantNameFields) {
        onEdit([...path, "ClaimantName"], match.ClaimantName || "");
        onEdit([...path, "ClaimantName1"], match.ClaimantName1 || "");
      }
    }
  }, [list]);

  const runFilter = (val) => {
    if (!val) {
      setShowDropdown(false);
      setFiltered([]);
      return;
    }
    const search = val.toLowerCase();
    const matches = list.filter((i) => {
      const code = String(i[codeKey] || "").toLowerCase();
      const name = String(i.Name || "").toLowerCase();
      return code.startsWith(search) || name.startsWith(search);
    });
    setFiltered(matches.slice(0, 100));
    setShowDropdown(matches.length > 0);
  };

  const applyRecord = (rec) => {
    onEdit([...path, "Code"], rec[codeKey] || "");
    onEdit([...path, "CRUEI"], rec.CRUEI || "");
    onEdit([...path, "Name"], rec.Name || "");
    onEdit([...path, "Name1"], rec.Name1 || "");
    if (cfg.hasClaimantNameFields) {
      onEdit([...path, "ClaimantName"], rec.ClaimantName || "");
      onEdit([...path, "ClaimantName1"], rec.ClaimantName1 || "");
    }
  };
  const handleCodeChange = (val) => {
    onEdit([...path, "Code"], val);
    setHighlighted(0);
    runFilter(val);
  };

  const handleSelect = (rec) => {
    applyRecord(rec);
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
      if (!party.Code) {
        setShowDropdown(false);
        return;
      }
      const match = list.find(
        (i) =>
          String(i[codeKey] || "").toLowerCase() === party.Code.toLowerCase(),
      );
      if (match) {
        applyRecord(match);
      }
      setShowDropdown(false);
    }, 150);
  };

  const handleSave = async () => {
    if (!party.Code) {
      alert("Code is required!");
      codeInputRef.current?.focus();
      return;
    }
    if (commonCodes.has(party.Code.toLowerCase())) {
      alert(`Duplicate code found! ${cfg.label} not saved.`);
      return;
    }

    const code = (party.Code || "").toUpperCase();
    const cruei = (party.CRUEI || "").toUpperCase();
    const name = (party.Name || "").toUpperCase();
    const name1 = (party.Name1 || "").toUpperCase();
    const claimantExtra = cfg.hasClaimantNameFields
      ? {
          ClaimantName: (party.ClaimantName || "").toUpperCase(),
          ClaimantName1: (party.ClaimantName1 || "").toUpperCase(),
          Name2: "",
        }
      : {};
    // NOTE: still uses the fixed DEFAULT_TOUCH_USER, not the email's
    // touchUser — open question from earlier (Step E), unresolved. Master
    // party saves (Importer/Carrier/Forwarder/Claimant) are not yet wired
    // to the per-mail touch user.
    if (!touchUser) {
      alert(
        "This email's mailbox username could not be resolved — cannot save.",
      );
      return;
    }
    const touchTime = new Date().toISOString();

    const commonPayload = {
      Id: 0,
      [codeKey]: code,
      CRUEI: cruei,
      Name: name,
      Name1: name1,
      ...claimantExtra,
      TouchUser: touchUser,
      TouchTime: touchTime,
      Status: "Active",
    };

    const inpaymentPayload = {
      Id: 0,
      [codeKey]: code,
      CRUEI: cruei,
      Name: name,
      Name1: name1,
      ...claimantExtra,
      TouchUser: touchUser,
      TouchTime: touchTime,
      Status: "Active",
    };

    let commonSaved = false;
    try {
      const commonResponse = await API.post(cfg.saveEndpoint, commonPayload);
      commonSaved = true;
      console.log(`Saved to Common${cfg.label}:`, commonResponse.data);

      if (cfg.inpaymentSaveEndpoint) {
        const inpaymentResponse = await API.post(
          cfg.inpaymentSaveEndpoint,
          inpaymentPayload,
        );
        console.log(
          `Saved to ${cfg.label} (inpayment):`,
          inpaymentResponse.data,
        );
      }

      alert(`${cfg.label} saved successfully in both tables!`);
      commonCodes.add(code.toLowerCase());
    } catch (err) {
      console.error(`Failed to save ${cfg.label}:`, err.response?.data || err);
      if (commonSaved) {
        alert(
          `Warning: Code "${code}" was saved to Common${cfg.label} but FAILED to save to ${cfg.label} (inpayment) table. ` +
            `Tables are now inconsistent.\n\nError: ${err.response?.data?.error || err.response?.data?.Result || err.message}`,
        );
        commonCodes.add(code.toLowerCase());
      } else {
        alert(
          err.response?.data?.error ||
            err.response?.data?.Result ||
            `Failed to save ${cfg.label}, check console for details`,
        );
      }
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
      {/* LABEL + ICONS */}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            color: C.navy,
            fontWeight: 700,
            fontSize: 11.5,
            letterSpacing: 0.2,
            textTransform: "uppercase",
          }}
        >
          {cfg.label}
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FaSearch
            style={{ color: C.bar, fontSize: 12, cursor: "pointer" }}
            title={`Search ${cfg.label}`}
            onClick={() => codeInputRef.current?.focus()}
          />
          <FaPlus
            style={{ cursor: "pointer", color: C.bar, fontSize: 12 }}
            onClick={handleSave}
            title={`Save as new ${cfg.label}`}
          />
        </div>
      </div>

      {/* LINE 1: CODE | CRUEI */}
      <PartyFieldRow>
        <PartyFieldCell label="Code">
          <EditableInput
            compact
            value={party.Code}
            onChange={handleCodeChange}
            onKeyDown={handleKeyDown}
            onFocus={() => runFilter(party.Code)}
            onBlur={handleBlur}
            placeholder="CODE"
          />
          {showDropdown && filtered.length > 0 && (
            <PartySearchDropdown
              items={filtered}
              highlighted={highlighted}
              onHover={setHighlighted}
              onSelect={handleSelect}
              getLabel={(item) => `${item[codeKey]} - ${item.Name || ""}`}
            />
          )}
        </PartyFieldCell>
        <PartyFieldCell label="CRUEI">
          <EditableInput
            compact
            value={party.CRUEI}
            onChange={(v) => onEdit([...path, "CRUEI"], v)}
            placeholder="CRUEI"
          />
        </PartyFieldCell>
      </PartyFieldRow>

      {/* LINE 2: NAME | NAME1 */}
      <PartyFieldRow>
        <PartyFieldCell label="Name">
          <EditableInput
            compact
            value={party.Name}
            onChange={(v) => onEdit([...path, "Name"], v)}
            placeholder="NAME"
          />
        </PartyFieldCell>
        <PartyFieldCell label="Name1">
          <EditableInput
            compact
            value={party.Name1}
            onChange={(v) => onEdit([...path, "Name1"], v)}
            placeholder="NAME1"
          />
        </PartyFieldCell>
      </PartyFieldRow>

      {/* CLAIMANT ID / CLAIMANT NAME — extra line, same two-column pattern */}
      {cfg.hasClaimantNameFields && (
        <PartyFieldRow>
          <PartyFieldCell label="Claimant Id">
            <EditableInput
              compact
              value={party.ClaimantName}
              onChange={(v) => onEdit([...path, "ClaimantName"], v)}
              placeholder="CLAIMANT ID"
            />
          </PartyFieldCell>
          <PartyFieldCell label="Claimant Name">
            <EditableInput
              compact
              value={party.ClaimantName1}
              onChange={(v) => onEdit([...path, "ClaimantName1"], v)}
              placeholder="CLAIMANT NAME"
            />
          </PartyFieldCell>
        </PartyFieldRow>
      )}
    </div>
  );
}

function EditableValue({ value, path, onEdit }) {
  const fieldKey = path[path.length - 1];

  if (isItemsField(fieldKey)) {
    const rows =
      Array.isArray(value) && value.length > 0 && isPlainObject(value[0])
        ? value
        : [blankItemRow()];

    const getCell = (row, spec) => {
      const existingKey = findRowKey(row, spec.aliases);
      return existingKey ? row[existingKey] : "";
    };

    const updateCell = (rowIdx, spec, v) => {
      const row = rows[rowIdx] || {};
      const existingKey = findRowKey(row, spec.aliases) || spec.key;
      onEdit([...path, rowIdx, existingKey], v);
    };

    const selectHsCode = (rowIdx, hsItem) => {
      const row = rows[rowIdx] || {};
      const codeSpec = ITEM_FIELD_SPECS.find((s) => s.key === "code");
      const descSpec = ITEM_FIELD_SPECS.find((s) => s.key === "description");
      const codeKey = findRowKey(row, codeSpec.aliases) || codeSpec.key;
      const descKey = findRowKey(row, descSpec.aliases) || descSpec.key;
      onEdit([...path, rowIdx, codeKey], hsItem.HSCode || "");
      onEdit([...path, rowIdx, descKey], hsItem.Description || "");
    };

    const removeRow = (rowIdx) => {
      const next = rows.slice();
      next.splice(rowIdx, 1);
      onEdit(path, next);
    };

    const addRow = () => onEdit(path, [...rows, blankItemRow()]);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {rows.map((row, i) => (
          <div
            key={i}
            style={{
              border: `1px solid ${C.panelBorder}`,
              borderRadius: 8,
              padding: 12,
              background: i % 2 ? C.rowAlt : "#fff",
            }}
          >
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                marginBottom: 10,
              }}
            >
              <span
                style={{
                  color: C.navy,
                  fontWeight: 800,
                  fontSize: 11.5,
                  letterSpacing: 0.3,
                }}
              >
                Item {i + 1}
              </span>
              <RemoveBtn onClick={() => removeRow(i)} title="Remove item" />
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: "10px 12px",
              }}
            >
              {ITEM_FIELD_SPECS.map((spec) => (
                <div
                  key={spec.key}
                  style={{ display: "flex", flexDirection: "column", gap: 4 }}
                >
                  <span
                    style={{
                      color: C.sub,
                      fontWeight: 700,
                      fontSize: 10.5,
                      letterSpacing: 0.3,
                    }}
                  >
                    {spec.label}
                  </span>
                  {spec.key === "code" ? (
                    <HsCodeInput
                      value={truncateHsCodeDisplay(getCell(row, spec))}
                      onChangeText={(v) => updateCell(i, spec, v)}
                      onSelect={(hsItem) => selectHsCode(i, hsItem)}
                    />
                  ) : (
                    <EditableInput
                      compact
                      value={getCell(row, spec)}
                      onChange={(v) => updateCell(i, spec, v)}
                    />
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
        <AddBtn onClick={addRow} label="+ Add Item" />
      </div>
    );
  }

  if (Array.isArray(value) && value.length > 0 && isPlainObject(value[0])) {
    const columns = Array.from(
      new Set(value.flatMap((row) => Object.keys(row))),
    );
    const updateCell = (rowIdx, col, v) => onEdit([...path, rowIdx, col], v);
    const removeRow = (rowIdx) => {
      const next = value.slice();
      next.splice(rowIdx, 1);
      onEdit(path, next);
    };
    const addRow = () => {
      const blank = Object.fromEntries(columns.map((c) => [c, ""]));
      onEdit(path, [...value, blank]);
    };
    return (
      <div>
        <div style={{ overflowX: "auto" }}>
          <table
            style={{
              width: "100%",
              borderCollapse: "collapse",
              fontSize: 12.5,
            }}
          >
            <thead>
              <tr>
                <th style={{ background: C.tableHead, width: 34 }} />
                {columns.map((col) => (
                  <th
                    key={col}
                    style={{
                      background: C.tableHead,
                      color: "#fff",
                      padding: "8px 10px",
                      textAlign: "left",
                      fontSize: 11,
                      letterSpacing: 0.4,
                    }}
                  >
                    {formatLabel(col)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {value.map((row, i) => (
                <tr key={i} style={{ background: i % 2 ? C.rowAlt : "#fff" }}>
                  <td
                    style={{
                      padding: 6,
                      borderBottom: `1px solid ${C.panelBorder}`,
                      textAlign: "center",
                    }}
                  >
                    <RemoveBtn
                      onClick={() => removeRow(i)}
                      title="Remove row"
                    />
                  </td>
                  {columns.map((col) => (
                    <td
                      key={col}
                      style={{
                        padding: 6,
                        borderBottom: `1px solid ${C.panelBorder}`,
                      }}
                    >
                      <EditableInput
                        compact
                        value={row[col]}
                        onChange={(v) => updateCell(i, col, v)}
                      />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <AddBtn onClick={addRow} label="+ Add row" />
      </div>
    );
  }

  if (Array.isArray(value)) {
    const updateItem = (i, v) => {
      const next = value.slice();
      next[i] = v;
      onEdit(path, next);
    };
    const removeItem = (i) => {
      const next = value.slice();
      next.splice(i, 1);
      onEdit(path, next);
    };
    const addItem = () => onEdit(path, [...value, ""]);
    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {value.map((item, i) => (
          <div
            key={i}
            style={{ display: "flex", gap: 6, alignItems: "center" }}
          >
            <EditableInput
              compact
              value={item}
              onChange={(v) => updateItem(i, v)}
            />
            <RemoveBtn onClick={() => removeItem(i)} />
          </div>
        ))}
        <AddBtn onClick={addItem} label="+ Add" />
      </div>
    );
  }

  if (isPlainObject(value)) {
    const entries = Object.entries(value);
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 10,
          background: "#fafcfd",
          border: `1px solid ${C.panelBorder}`,
          borderRadius: 6,
          padding: 12,
        }}
      >
        {renderGroupedEntries(entries, path, onEdit, {
          labelStyle: { color: C.sub, fontWeight: 700, fontSize: 11.5 },
          renderComplex: (k, v) => (
            <div key={k} className="decl-field-row">
              <span
                className="decl-field-label"
                style={{ color: C.sub, fontWeight: 700, fontSize: 11.5 }}
              >
                {formatLabel(k)}
              </span>
              <span className="decl-field-value">
                <EditableValue value={v} path={[...path, k]} onEdit={onEdit} />
              </span>
            </div>
          ),
        })}
      </div>
    );
  }

  if (typeof value === "boolean") {
    return (
      <input
        type="checkbox"
        checked={value}
        onChange={(e) => onEdit(path, e.target.checked)}
        style={{ width: 16, height: 16, accentColor: C.bar }}
      />
    );
  }

  return (
    <EditableInput value={value ?? ""} onChange={(v) => onEdit(path, v)} />
  );
}

function deepUpperCase(value) {
  if (typeof value === "string") return value.toUpperCase();
  if (Array.isArray(value)) return value.map(deepUpperCase);
  if (isPlainObject(value)) {
    return Object.fromEntries(
      Object.entries(value).map(([k, v]) => [k, deepUpperCase(v)]),
    );
  }
  return value;
}

function deepUpperCaseTopLevelExcept(obj, skipKeysNormalized) {
  if (!isPlainObject(obj)) return deepUpperCase(obj);
  const result = {};
  for (const [k, v] of Object.entries(obj)) {
    result[k] = skipKeysNormalized.has(normalizeKey(k)) ? v : deepUpperCase(v);
  }
  return result;
}

const WRAPPER_KEYS = ["json", "output", "data", "result", "body", "response"];

function tryParseJsonString(str) {
  if (typeof str !== "string") return str;
  let s = str.trim();
  const fenceMatch = s.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fenceMatch) s = fenceMatch[1].trim();
  try {
    return JSON.parse(s);
  } catch {
    return str;
  }
}

function normalizeDeclaration(raw) {
  let val = raw;
  let depth = 0;
  while (depth < 6) {
    if (typeof val === "string") {
      const parsed = tryParseJsonString(val);
      if (parsed !== val) {
        val = parsed;
        depth++;
        continue;
      }
      break;
    }
    if (Array.isArray(val)) {
      if (val.length === 0) return null;
      val = val[0];
      depth++;
      continue;
    }
    if (isPlainObject(val)) {
      const keys = Object.keys(val);
      if (keys.length === 1 && WRAPPER_KEYS.includes(keys[0].toLowerCase())) {
        val = val[keys[0]];
        depth++;
        continue;
      }
    }
    break;
  }

  return isPlainObject(val) ? val : null;
}

function unwrapToObjectOrArray(raw) {
  let val = raw;
  let depth = 0;
  while (depth < 6) {
    if (typeof val === "string") {
      const parsed = tryParseJsonString(val);
      if (parsed !== val) {
        val = parsed;
        depth++;
        continue;
      }
      break;
    }
    if (isPlainObject(val)) {
      const keys = Object.keys(val);
      if (keys.length === 1 && WRAPPER_KEYS.includes(keys[0].toLowerCase())) {
        val = val[keys[0]];
        depth++;
        continue;
      }
    }
    break;
  }
  return val;
}

function looksLikeMultipleDeclarations(arr) {
  return (
    Array.isArray(arr) &&
    arr.length > 1 &&
    arr.every(
      (v) =>
        isPlainObject(v) &&
        (findRowKey(v, ["fileindex"]) || findRowKey(v, ["consignmentno"])),
    )
  );
}

function normalizeDeclarations(raw) {
  const unwrapped = unwrapToObjectOrArray(raw);

  if (Array.isArray(unwrapped)) {
    if (unwrapped.length === 0) return [null];

    if (looksLikeMultipleDeclarations(unwrapped)) {
      return unwrapped.map((item) => {
        const inner = unwrapToObjectOrArray(item);
        if (isPlainObject(inner)) return inner;

        return normalizeDeclaration(inner);
      });
    }

    return [normalizeDeclaration(unwrapped)];
  }

  return [isPlainObject(unwrapped) ? unwrapped : null];
}

function blankDeclaration() {
  return {
    FileIndex: "",
    InvoiceIndex: "",
    Format: "",
    ConsignmentNo: "",
    Shipper: {
      Name: "",
      ContactNumber: "",
    },
    Receiver: {
      Name: "",
      Country: "",
      ContactNumber: "",
    },
    NoOfParcels: "",
    TotalWeight: "",

    MessageType: "",

    DeclarationType: "",
    PreviousPermitNo: "",
    CargoPackType: "",
    InwardTransportMode: "",
    BgIndicator: "",
    OverrideExgeRate: false,
    SupplyIndicator: false,
    ReferenceDocument: false,
    MailboxId: "",
    DeclarantName: "",
    DeclarantCode: "",
    DeclarantTelephone: "",
    CrUeiNo: "",
    TotalOuterPack: "",
    TotalOuterPackUnit: "",
    TotalGrossWeight: "",
    TotalGrossWeightUnit: "",
    PermitGrossWeight: "",
    ReleaseLocation: { Code: "", Name: "" },
    ReceiptLocation: { Code: "", Name: "" },
    LoadingPort: { Code: "", Name: "" },
    Hawb: "",
    ArrivalDate: "",
    FlightNumber: "",
    AircraftRegNo: "",
    Mawb: "",
    BlanketStartDate: "",

    Importer: blankParty(PARTY_TYPES.importer),
    Exporter: blankParty(PARTY_TYPES.exporter),
    InwardCarrierAgent: blankParty(PARTY_TYPES.inwardCarrierAgent),
    OutwardCarrierAgent: blankParty(PARTY_TYPES.outwardCarrierAgent),
    FreightForwarder: blankParty(PARTY_TYPES.freightForwarder),
    ClaimantParty: blankParty(PARTY_TYPES.claimantParty),
    Consignee: blankParty(PARTY_TYPES.consignee),
    EndUser: blankParty(PARTY_TYPES.endUser),
    Manufacturer: blankParty(PARTY_TYPES.manufacturer),

    // Summary tab
    ApprovedBy: "",
    CustomerRemarks: "",
    TradeRemarks: "",
    FormatRemark: "",
    CrossReference: "",
    InternalRemarks: "",
    DeclarationChecked: false,

    invoice: {},
    invoices: [],
    items: [],
  };
}

// ---------------------------------------------------------------------------
// Tabs
// ---------------------------------------------------------------------------

const TABS = [
  { id: "header", label: "Header" },
  { id: "party", label: "Party" },
  { id: "cargo", label: "Cargo" },
  { id: "invoice", label: "Invoice" },
  { id: "items", label: "Items" },
  { id: "cpc", label: "CPC" },
  { id: "summary", label: "Summary" },
];

function TabBar({ active, onChange }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        marginBottom: 16,
        flexWrap: "wrap",
      }}
    >
      {TABS.map((tab) => {
        const isActive = tab.id === active;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            style={{
              border: `1.5px solid ${isActive ? C.danger : "transparent"}`,
              background: isActive ? C.dangerBg : C.tabIdleBg,
              color: isActive ? C.danger : C.sub,
              fontWeight: 800,
              fontSize: 11.5,
              letterSpacing: 0.5,
              textTransform: "uppercase",
              padding: "9px 18px",
              borderRadius: 20,
              cursor: "pointer",
            }}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
}

// ---------------------------------------------------------------------------
// ModuleCheckboxBar — now ALWAYS shows Inpayment / InNonPayment / Out,
// regardless of mailbox/account. Selecting a module updates activeModule in
// DeclarationPanel, which cascades into MessageType, GST visibility (Invoice
// tab), CO Type/Certificate of Origin (Header tab), and save/permit
// endpoints — all automatically, no other manual step. Nothing is
// pre-selected — the New button and the rest of the tabs only appear once
// the user picks one.
// ---------------------------------------------------------------------------

function ModuleCheckboxBar({ activeModule, onChange, locked }) {
  return (
    <div
      style={{
        display: "flex",
        gap: 14,
        marginBottom: 14,
        alignItems: "center",
      }}
    >
      <span
        style={{
          color: C.sub,
          fontWeight: 700,
          fontSize: 10.5,
          letterSpacing: 0.4,
          textTransform: "uppercase",
        }}
      ></span>
      {ALL_DECLARATION_MODULES.map((m) => {
        const isChosen = activeModule === m;
        const isDisabled = locked && !isChosen;
        return (
          <label
            key={m}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontSize: 12.5,
              fontWeight: 700,
              color: isDisabled ? C.sub : C.navy,
              cursor: isDisabled ? "not-allowed" : "pointer",
              opacity: isDisabled ? 0.45 : 1,
            }}
          >
            <input
              type="radio"
              name="declarationModule"
              checked={isChosen}
              disabled={isDisabled}
              onChange={() => !isDisabled && onChange(m)}
              style={{ accentColor: C.bar }}
            />
            {getModuleConfig(m).label}
          </label>
        );
      })}
    </div>
  );
}

function DeclarationPageBar({
  dataList,
  activeIndex,
  onChange,
  pageIdentities,
}) {
  return (
    <div
      style={{
        display: "flex",
        gap: 8,
        margin: "4px 0 16px",
        flexWrap: "wrap",
        alignItems: "center",
      }}
    >
      <span
        style={{
          color: C.sub,
          fontWeight: 700,
          fontSize: 10.5,
          letterSpacing: 0.4,
          textTransform: "uppercase",
          marginRight: 2,
        }}
      >
        {dataList.length} declarations found:
      </span>
      {dataList.map((d, i) => {
        const isActive = i === activeIndex;
        const fileIndex = d?.FileIndex || d?.fileIndex || i + 1;
        const consignmentNo = d?.ConsignmentNo || d?.consignmentNo || "";
        const label = consignmentNo
          ? `File ${fileIndex} · ${consignmentNo}`
          : `Declaration ${i + 1}`;
        const needsNew = !pageIdentities?.[i];
        return (
          <button
            key={i}
            type="button"
            onClick={() => onChange(i)}
            title={
              needsNew
                ? "Click New to generate a Permit ID for this declaration"
                : undefined
            }
            style={{
              border: `1.5px solid ${isActive ? C.bar : needsNew ? C.danger : C.panelBorder}`,
              background: isActive ? C.bar : "#fff",
              color: isActive ? "#fff" : needsNew ? C.danger : C.navy,
              fontWeight: 700,
              fontSize: 11.5,
              padding: "6px 14px",
              borderRadius: 16,
              cursor: "pointer",
            }}
          >
            {label}
            {needsNew ? " •" : ""}
          </button>
        );
      })}
    </div>
  );
}

function cargoGetWeightPair(data, spec, covered) {
  const valueKey = findRowKey(data, spec.aliases);
  const unitKey = findRowKey(data, spec.unitAliases);
  if (valueKey && covered) covered.add(normalizeKey(valueKey));
  if (unitKey && covered) covered.add(normalizeKey(unitKey));
  return {
    value: valueKey ? data[valueKey] : "",
    unit: unitKey ? data[unitKey] : spec.defaultUnit,
    valuePath: [valueKey || spec.key],
    unitPath: [unitKey || `${spec.key}Unit`],
  };
}

function cargoGetLocation(data, spec, covered) {
  const nestedKey = findRowKey(data, spec.nestedAliases);
  if (nestedKey && isPlainObject(data[nestedKey])) {
    if (covered) covered.add(normalizeKey(nestedKey));
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
    if (flatCodeKey && covered) covered.add(normalizeKey(flatCodeKey));
    if (flatNameKey && covered) covered.add(normalizeKey(flatNameKey));
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

function CargoTextRow({ label, value, onChange, disabled }) {
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
      <span
        style={{
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
        }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onChange && onChange(e.target.value.toUpperCase())}
        disabled={disabled}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "4px 6px",
          border: disabled ? "1px solid #8FA5B5" : "1px solid #C3C1B5",
          borderRadius: 4,
          fontFamily: "monospace",
          fontSize: 11.5,
          fontWeight: disabled ? 700 : 400,
          color: disabled ? "#0b2f3f" : "#12202E",
          background: disabled ? "#e9eef2" : "#fff",
          boxSizing: "border-box",
        }}
      />
    </div>
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
    <div
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 6,
        marginBottom: 6,
        minWidth: 0,
      }}
    >
      <span
        style={{
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
        }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value ?? ""}
        onChange={(e) => onValueChange(e.target.value)}
        style={{
          flex: "0 0 50px",
          minWidth: 0,
          padding: "4px 6px",
          border: "1px solid #8FA5B5",
          borderRadius: 4,
          fontFamily: "monospace",
          fontSize: 11.5,
          fontWeight: 600,
          color: "#12202E",
          background: "#fff",
          boxSizing: "border-box",
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
    </div>
  );
}

function CargoDateField({ label, value, onChange }) {
  const [error, setError] = useState(false);

  const getTodayDate = () => {
    const today = new Date();
    const day = String(today.getDate()).padStart(2, "0");
    const month = String(today.getMonth() + 1).padStart(2, "0");
    const year = today.getFullYear();
    return `${day}/${month}/${year}`;
  };

  const handleBlur = () => {
    if (!value || value.trim() === "") {
      setError(false);
      return;
    }
    const raw = value.replace(/\D/g, "");

    if (raw.length === 8) {
      const dd = raw.slice(0, 2);
      const mm = raw.slice(2, 4);
      const yyyy = raw.slice(4, 8);
      if (
        parseInt(dd, 10) >= 1 &&
        parseInt(dd, 10) <= 31 &&
        parseInt(mm, 10) >= 1 &&
        parseInt(mm, 10) <= 12
      ) {
        onChange(`${dd}/${mm}/${yyyy}`);
        setError(false);
      } else {
        onChange(getTodayDate());
        setError(true);
      }
    } else if (value.length === 10 && value.includes("/")) {
      setError(false);
    } else {
      onChange(getTodayDate());
      setError(false);
    }
  };

  const handleKeyDown = (e) => {
    if (e.key === " " || e.keyCode === 32) {
      e.preventDefault();
      onChange(getTodayDate());
    }
  };

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
      <span
        style={{
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
        }}
      >
        {label}
      </span>
      <input
        type="text"
        value={value ?? ""}
        placeholder="DD/MM/YYYY"
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          flex: 1,
          minWidth: 0,
          padding: "4px 6px",
          border: error ? "1px solid #c0392b" : "1px solid #C3C1B5",
          borderRadius: 4,
          fontFamily: "monospace",
          fontSize: 11.5,
          color: "#12202E",
          background: "#fff",
          boxSizing: "border-box",
        }}
      />
      {error && (
        <span
          style={{
            color: "#c0392b",
            fontSize: 10,
            fontWeight: 700,
            alignSelf: "center",
          }}
        >
          Invalid date — reset to today
        </span>
      )}
    </div>
  );
}

function seedHeaderDefaults(d) {
  let result = d;
  HEADER_FIELD_SPECS.forEach((spec) => {
    if (spec.default === undefined) return;
    const existingKey = findRowKey(result, spec.aliases);
    const raw = existingKey ? result[existingKey] : undefined;
    const hasValue = raw !== undefined && raw !== null && raw !== "";
    if (!hasValue) {
      result = setDeep(result, [existingKey || spec.key], spec.default);
    }
  });
  return result;
}

export default function DeclarationPanel({
  email,
  declaration,
  onSave,
  busy,
  onDismissEmail,
  onDeselectEmail,
}) {
  const buildData = (raw) =>
    seedHawbDefault(
      seedTotalGrossWeightDefault(
        seedCargoUnitDefaults(
          seedHeaderDefaults(
            deepUpperCaseTopLevelExcept(
              raw ?? blankDeclaration(),
              HEADER_SELECT_KEYS,
            ),
          ),
        ),
      ),
    );
  const buildAll = (raw) => {
    const rawList = normalizeDeclarations(raw);
    return rawList.map((r) => buildData(r ?? blankDeclaration()));
  };

  const [dataList, setDataList] = useState(() => buildAll(declaration));
  const [pageIndex, setPageIndex] = useState(0);
  const [activeTab, setActiveTab] = useState("header");

  const [declareMode, setDeclareMode] = useState(null);

  // ── UPDATED: touch user now comes straight from the email's own mailbox
  // (email.touchUsername, resolved backend-side from MAILBOXES by
  // mailbox_id — see server.js/mailboxes.js), not from any account-config
  // lookup keyed by mailbox username. DEFAULT_TOUCH_USER is only a fallback
  // for the rare case the backend couldn't resolve a mailbox.
  const touchUser = email?.touch_username || "";

  if (!touchUser && email) {
    console.error(
      `Missing touch_username for email id=${email.id} (accountId=${email.accountId}). Cannot save under an unresolved mailbox.`,
    );
  }

  // ── UPDATED: module selection is now fully manual via the checkbox — no
  // default module, no dependency on which mailbox/account the email came
  // from. Nothing is selected until the user picks Inpayment / InNonPayment
  // / Out; moduleConfig stays null until then, gating the New button and
  // the rest of the tabs (see below).
  const [activeModule, setActiveModule] = useState(null);
  const moduleConfig = activeModule ? getModuleConfig(activeModule) : null;

  // Reset the module choice whenever a different email is opened — the
  // user has to pick again for each new declaration.
  useEffect(() => {
    setActiveModule(null);
  }, [email?.accountId]);
  // ─────────────────────────────────────────────────────────────────────

  const buildInitialIdentities = (list) =>
    list.map((d) => {
      const permitKey = findRowKey(d, ["permitid"]);
      const permitVal = permitKey ? d[permitKey] : "";
      if (!permitVal) return null;
      const jobKey = findRowKey(d, ["jobid"]);
      const msgKey = findRowKey(d, ["msgid"]);
      return {
        PermitId: permitVal,
        JobId: jobKey ? d[jobKey] : "",
        MSGId: msgKey ? d[msgKey] : "",
        Refid: d.Refid || "",
        TradeNetMailboxID: d.TradeNetMailboxID || "",
        DeclarantCompanyCode: d.DeclarantCompanyCode || "",
        source: "existing",
      };
    });

  const [pageIdentities, setPageIdentities] = useState(() =>
    buildInitialIdentities(buildAll(declaration)),
  );
  const [generatingNew, setGeneratingNew] = useState(false);

  const originalDataRef = useRef(buildAll(declaration));

  useEffect(() => {
    const list = buildAll(declaration);
    setDataList(list);
    originalDataRef.current = list;
    setPageIndex(0);
    setActiveTab("header");
    setPageIdentities(buildInitialIdentities(list));
    setGeneratingNew(false);
  }, [declaration, email?.id]);

  // ── MessageType auto-syncs with the active module ─────────────────────
  // This is the "checkbox click → automatic condition change" cascade:
  // switching activeModule updates every declaration page's MessageType
  // immediately, with no separate manual step. Guarded now, since
  // moduleConfig can be null before the user picks a module.
  useEffect(() => {
    if (!moduleConfig) return;
    setDataList((prev) =>
      prev.map((d) => {
        const existingKey = findRowKey(d, ["messagetype", "message_type"]);
        return setDeep(
          d,
          [existingKey || "MessageType"],
          moduleConfig.messageType,
        );
      }),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeModule]);
  // ─────────────────────────────────────────────────────────────────────

  const data = dataList[pageIndex] || blankDeclaration();
  const hasMultiple = dataList.length > 1;
  const needsModeChoice = hasMultiple && !declareMode;

  const receiverName = getNestedCI(data, ["receiver"], ["name"]);
  const partyData = data.Importer?.Code
    ? data
    : {
        ...data,
        Importer: {
          ...blankParty(PARTY_TYPES.importer),
          Code: receiverName || "",
          Name: receiverName || "",
        },
      };
  const resetDeclareMode = () => {
    setDeclareMode(null);
    setDataList((prev) => prev.map((d) => setDeep(d, ["PermitId"], "")));
    setPageIdentities((prev) => prev.map(() => null));
    setGeneratingNew(false);
  };

  const handleUseSinglePermitForAll = async () => {
    if (!email || !hasMultiple || !moduleConfig) return;
    if (!touchUser) {
      alert(
        "This email's mailbox username could not be resolved — cannot generate a Permit ID.",
      );
      return;
    }

    setGeneratingNew(true);
    try {
      let identity = pageIdentities[pageIndex];
      if (!identity) {
        const res = await API.get(moduleConfig.newPermitEndpoint(touchUser));
        if (!res.data?.PermitId) throw new Error("Failed to generate PermitId");
        identity = {
          PermitId: res.data.PermitId,
          JobId: res.data.JobId,
          MSGId: res.data.MsgId,
          Refid: res.data.RefId,
          TradeNetMailboxID: res.data.TradeNetMailboxID,
          DeclarantCompanyCode: res.data.Code,
          source: "generated",
        };
      }

      setPageIdentities((prev) => prev.map(() => identity));
      setDataList((prev) =>
        prev.map((d) => setDeep(d, ["PermitId"], identity.PermitId)),
      );
    } catch (err) {
      console.error("Use single permit failed:", err);
      alert(
        "Failed to set a single Permit ID for all declarations. Please try again.",
      );
    } finally {
      setGeneratingNew(false);
    }
  };

  const handleExitPermit = (idx = pageIndex) => {
    const isSharedSingle = hasMultiple && declareMode === "single";

    setPageIdentities((prev) => {
      const next = prev.slice();
      if (isSharedSingle) return next.map(() => null);
      next[idx] = null;
      return next;
    });

    setDataList((prev) =>
      prev.map((d, i) => {
        if (isSharedSingle || i === idx) {
          return originalDataRef.current[i] ?? blankDeclaration();
        }
        return d;
      }),
    );

    setActiveTab("header");
  };

  const handleNewPermit = async (idx = pageIndex) => {
    if (!email || !moduleConfig) return;
    if (!touchUser) {
      alert(
        "This email's mailbox username could not be resolved — cannot generate a Permit ID.",
      );
      return;
    }
    if (hasMultiple && declareMode === "single") {
      return handleUseSinglePermitForAll();
    }
    setGeneratingNew(true);
    try {
      const res = await API.get(moduleConfig.newPermitEndpoint(touchUser));
      if (!res.data?.PermitId) throw new Error("Failed to generate PermitId");

      const identity = {
        PermitId: res.data.PermitId,
        JobId: res.data.JobId,
        MSGId: res.data.MsgId,
        Refid: res.data.RefId,
        TradeNetMailboxID: res.data.TradeNetMailboxID,
        DeclarantCompanyCode: res.data.Code,
        source: "generated",
      };

      setPageIdentities((prev) => {
        const next = prev.slice();
        next[idx] = identity;
        return next;
      });
      setDataList((prev) =>
        prev.map((d, i) =>
          i === idx ? setDeep(d, ["PermitId"], identity.PermitId) : d,
        ),
      );
    } catch (err) {
      console.error("New permit failed:", err);
      alert("Failed to generate a new Permit ID. Please try again.");
    } finally {
      setGeneratingNew(false);
    }
  };

  const handleEdit = (path, value) => {
    const skipUpperCase =
      path.length === 1 && HEADER_SELECT_KEYS.has(normalizeKey(path[0]));
    setDataList((prev) =>
      prev.map((d, i) =>
        i === pageIndex
          ? setDeep(d, path, skipUpperCase ? value : deepUpperCase(value))
          : d,
      ),
    );
  };

  const currentIdentity = pageIdentities[pageIndex];

  // ── Saving now goes through the shared SummaryCommon.jsx implementation,
  // which already branches correctly per module (inpayment / innonpayment /
  // out) — validation, party master-table checks, CPC payload, header
  // payload, and mirror-table saves. The old inpayment-only postHeader /
  // handleSaveCurrent pair above has been removed; these two callbacks just
  // wire the result back into this panel's own state (dismissing the email,
  // advancing to the next declaration, etc.) the same way the old
  // handleSaveCurrent did.
  const handleSummarySaved = (savedData, result) => {
    const permitId = result?.permitId || savedData.PermitId;
    const toSave = setDeep(savedData, ["PermitId"], permitId);

    alert(`Saved Permit: ${permitId}`);

    if (hasMultiple) {
      onSave(toSave, pageIndex);
    } else {
      onSave(toSave);
    }

    if (hasMultiple && declareMode === "separate") {
      const savedIndex = pageIndex;
      const remaining = dataList.filter((_, i) => i !== savedIndex);
      const remainingIdentities = pageIdentities.filter(
        (_, i) => i !== savedIndex,
      );

      if (remaining.length === 0) {
        onDismissEmail?.(email?.id);
      } else {
        setDataList(remaining);
        setPageIdentities(remainingIdentities);
        setPageIndex((prev) => Math.min(prev, remaining.length - 1));
        setActiveTab("header");
      }
    } else {
      onDismissEmail?.(email?.id);
    }
  };

  const handleSummaryDraftSaved = () => {
    alert("Declaration saved as draft.");
    onDismissEmail?.(email?.id);
  };

  const moduleLocked = !!currentIdentity || generatingNew;

  return (
    <aside className="declaration-panel">
      <div className="decl-toolbar">
        <button
          className="decl-button decl-button-amber"
          onClick={() => {
            onDismissEmail?.(email?.id);
          }}
        >
          Draft
        </button>
        <button
          className="decl-button decl-button-red"
          onClick={() => {
            onDismissEmail?.(email?.id);
          }}
        >
          Query
        </button>
        {email && !needsModeChoice && activeModule && (
          <>
            <button
              className="decl-button"
              disabled={generatingNew || !email}
              onClick={() => handleNewPermit(pageIndex)}
              title={
                hasMultiple && declareMode === "single"
                  ? "Generate a shared Permit ID for every declaration in this email"
                  : "Generate a new Permit ID for this declaration only"
              }
            >
              {generatingNew ? "Generating…" : "New"}
            </button>
            {currentIdentity && (
              <button
                className="decl-button decl-button-red"
                onClick={() => {
                  handleExitPermit(pageIndex);
                  onDeselectEmail?.(email?.id);
                }}
                title="Discard this Permit ID and go back to the initial state"
              >
                Exit
              </button>
            )}

            {hasMultiple && declareMode === "single" && (
              <button
                className="decl-button"
                disabled={generatingNew}
                onClick={handleUseSinglePermitForAll}
                title="Use one shared Permit ID across all declarations found in this email"
              >
                {generatingNew ? "Generating…" : "Use One Permit For All"}
              </button>
            )}
            {hasMultiple && (
              <button
                className="decl-button"
                onClick={resetDeclareMode}
                title="Change how these declarations will be declared"
              >
                Change Grouping
              </button>
            )}
          </>
        )}
      </div>

      <div className="decl-scroll">
        <div className="decl-header">
          <div>
            <h2>{email?.subject || "Untitled declaration"}</h2>
            <div className="decl-sub">{email?.sender || ""}</div>
            {currentIdentity?.PermitId && (
              <div className="decl-sub" style={{ fontWeight: 700 }}>
                Permit ID: {currentIdentity.PermitId}
              </div>
            )}
          </div>
          {email && <StatusStamp status={email.status} />}
        </div>

        <ModuleCheckboxBar
          activeModule={activeModule}
          onChange={setActiveModule}
          locked={moduleLocked}
        />

        {hasMultiple && !needsModeChoice && (
          <DeclarationPageBar
            dataList={dataList}
            activeIndex={pageIndex}
            onChange={setPageIndex}
            pageIdentities={pageIdentities}
          />
        )}

        <div className="decl-body">
          {needsModeChoice ? (
            <div
              style={{
                border: `1px dashed ${C.panelBorder}`,
                borderRadius: 8,
                padding: 24,
                textAlign: "center",
                color: C.sub,
                background: "#fafcfd",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  marginBottom: 8,
                  color: C.navy,
                }}
              >
                {dataList.length} declarations found in this email
              </div>
              <div style={{ fontSize: 12.5, marginBottom: 16 }}>
                Should these be declared as one combined permit, or as{" "}
                {dataList.length} separate permits?
              </div>
              <div
                style={{
                  display: "flex",
                  justifyContent: "center",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <button
                  className="decl-button decl-button-verdigris"
                  onClick={() => setDeclareMode("single")}
                >
                  Declare As Single Permit
                </button>
                <button
                  className="decl-button"
                  onClick={() => setDeclareMode("separate")}
                >
                  Declare As Separate Permits
                </button>
              </div>
            </div>
          ) : !activeModule ? (
            <div
              style={{
                border: `1px dashed ${C.panelBorder}`,
                borderRadius: 8,
                padding: 24,
                textAlign: "center",
                color: C.sub,
                background: "#fafcfd",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  marginBottom: 8,
                  color: C.navy,
                }}
              >
                Select a module to continue
              </div>
              <div style={{ fontSize: 12.5 }}>
                Choose Inpayment, InNonPayment, or Out above to start this
                declaration.
              </div>
            </div>
          ) : !currentIdentity ? (
            <div
              style={{
                border: `1px dashed ${C.panelBorder}`,
                borderRadius: 8,
                padding: 24,
                textAlign: "center",
                color: C.sub,
                background: "#fafcfd",
              }}
            >
              <div
                style={{
                  fontWeight: 700,
                  fontSize: 13,
                  marginBottom: 8,
                  color: C.navy,
                }}
              >
                No Permit ID yet
              </div>
              <div style={{ fontSize: 12.5, marginBottom: 14 }}>
                Click <strong>New</strong> above to generate a Permit ID before
                editing this declaration.
              </div>
              <button
                className="decl-button decl-button-verdigris"
                disabled={generatingNew || !email}
                onClick={() => handleNewPermit(pageIndex)}
              >
                {generatingNew ? "Generating…" : "New"}
              </button>
            </div>
          ) : (
            <>
              <TabBar active={activeTab} onChange={setActiveTab} />
              {activeTab === "header" && (
                <>
                  {console.log("DEBUG email object:", email)}
                  {console.log("DEBUG account_id VALUE:", email?.account_id)}
                  {console.log("DEBUG email KEYS:", Object.keys(email || {}))}
                  <HeaderTabContent
                    data={data}
                    onEdit={handleEdit}
                    moduleConfig={moduleConfig}
                    accountId={email?.account_id}
                  />
                </>
              )}
              {activeTab === "party" && (
                <PartyTabContent
                  data={partyData}
                  onEdit={handleEdit}
                  touchUser={touchUser}
                  activeModule={activeModule}
                />
              )}
              {activeTab === "cargo" && (
                <CargoTabContent
                  data={data}
                  onEdit={handleEdit}
                  moduleConfig={moduleConfig}
                />
              )}
              {activeTab === "invoice" && (
                <InvoiceTabContent
                  key={activeModule}
                  data={data}
                  onEdit={handleEdit}
                  permitId={currentIdentity?.PermitId}
                  activeModule={activeModule}
                  touchUser={touchUser}
                />
              )}
              {activeTab === "items" && (
                <ItemsTabContent
                  key={activeModule}
                  data={data}
                  onEdit={handleEdit}
                  permitId={currentIdentity?.PermitId}
                  user={{ username: touchUser }}
                  activeModule={activeModule}
                />
              )}
              {activeTab === "cpc" && (
                <CpcTabContent
                  data={data}
                  onEdit={handleEdit}
                  activeModule={activeModule}
                />
              )}
              {activeTab === "summary" && (
                <SummaryTabContent
                  data={data}
                  onEdit={handleEdit}
                  activeModule={activeModule}
                  ids={currentIdentity}
                  touchUser={touchUser}
                  onSaved={handleSummarySaved}
                  onDraftSaved={handleSummaryDraftSaved}
                  onGoToPartyTab={() => setActiveTab("party")}
                />
              )}
              <details style={{ marginTop: 16 }}>
                <summary style={{ cursor: "pointer", color: "var(--muted)" }}>
                  Raw response
                </summary>
                <pre
                  style={{
                    fontSize: 12,
                    whiteSpace: "pre-wrap",
                    wordBreak: "break-word",
                    background: "rgba(0,0,0,0.03)",
                    padding: 12,
                    borderRadius: 6,
                    marginTop: 8,
                  }}
                >
                  {JSON.stringify(
                    hasMultiple ? { declarations: dataList, pageIndex } : data,
                    null,
                    2,
                  )}
                </pre>
              </details>
            </>
          )}
        </div>
      </div>
    </aside>
  );
}
