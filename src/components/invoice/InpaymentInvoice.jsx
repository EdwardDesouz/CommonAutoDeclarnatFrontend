import { useState, useEffect } from "react";
import { FaSearch, FaPlus } from "react-icons/fa";
import API from "../../api/api";
import { C, EditableInput, findRowKey } from "../DeclarationPanel";

// ===========================================================================
// INPAYMENT INVOICE  —  fully self-contained. Only this file's numbers,
// URLs and calculation apply to the Inpayment module.
// ===========================================================================

const MESSAGE_TYPE = "IPTDEC";
const SAVE_ENDPOINT = "/postInvoiceTable/";
const DELETE_COMMON_ENDPOINT = "/deleteInvoiceNo/";
const DELETE_MODULE_ENDPOINT = "inpayment/deleteInInvoiceNo/";
const INSURANCE_EXRATE_EDITABLE = false;

export const RELATIONSHIP_OPTIONS = ["RELATED", "NOT RELATED"];
const DEFAULT_GST_CHARGE = "9";
const TOTAL_VALUE_GBP_ALIASES = ["totalvaluegbp", "totalvalue"];

// ---------------------------------------------------------------------------
// Master data (cached)
// ---------------------------------------------------------------------------

const termTypeCache = { list: null };

function useTermTypeOptions() {
  const [options, setOptions] = useState(() => termTypeCache.list || []);
  useEffect(() => {
    if (termTypeCache.list) {
      setOptions(termTypeCache.list);
      return;
    }
    let cancelled = false;
    API.get("/getTermTypeFromCommonMaster/")
      .then((response) => {
        const seen = new Set();
        const list = (response.data || []).filter((t) => {
          if (!t?.Name || seen.has(t.Name)) return false;
          seen.add(t.Name);
          return true;
        });
        termTypeCache.list = list;
        if (!cancelled) setOptions(list);
      })
      .catch((error) => console.error("Error fetching term types", error));
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

const currencyCache = { list: null };

function useCurrencyOptions() {
  const [options, setOptions] = useState(() => currencyCache.list || []);
  useEffect(() => {
    if (currencyCache.list) {
      setOptions(currencyCache.list);
      return;
    }
    let cancelled = false;
    API.get("/getCommonCurrencyTableInfo/")
      .then((response) => {
        const list = response.data || [];
        currencyCache.list = list;
        if (!cancelled) setOptions(list);
      })
      .catch((error) => console.error("Error fetching currency list", error));
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

const supplierSuggestionsCache = { list: null };

function useSupplierSuggestions() {
  const [list, setList] = useState(() => supplierSuggestionsCache.list || []);
  useEffect(() => {
    if (supplierSuggestionsCache.list) {
      setList(supplierSuggestionsCache.list);
      return;
    }
    let cancelled = false;
    API.get("/getCommonSupplierManufacturerPartTableInfo/")
      .then((response) => {
        const data = (response.data || []).map(
          (i) => `${i.Code}:${i.CRUEI}:${i.Name}:${i.Name1}`,
        );
        supplierSuggestionsCache.list = data;
        if (!cancelled) setList(data);
      })
      .catch((error) =>
        console.error("Failed to fetch Supplier/Manufacturer suggestions", error),
      );
    return () => {
      cancelled = true;
    };
  }, []);
  return list;
}

// ---------------------------------------------------------------------------
// Term type rules (which rows show, insurance preset)
// ---------------------------------------------------------------------------

const TERM_TYPE_VISIBILITY = {
  "CFR : Cost and Frieght ( also known as C & F )": {
    showFreight: false,
    showInsurance: true,
    presetInsurance: true,
  },
  "CIF : Cost,Insurance and Frieght": {
    showFreight: false,
    showInsurance: false,
  },
  "CNI : Cost and Insurance (also Known as C & I )": {
    showFreight: true,
    showInsurance: false,
  },
  "EXW : Exw Works (also known as Ex-Factory)": {
    showFreight: true,
    showInsurance: true,
    presetInsurance: true,
  },
  "FAS : Free Alongside Ship": {
    showFreight: true,
    showInsurance: true,
    presetInsurance: true,
  },
  "FOB : Free On Board": {
    showFreight: true,
    showInsurance: true,
    presetInsurance: true,
  },
};

const normalizeTermType = (s) => (s || "").trim().toLowerCase();

const NORMALIZED_TERM_TYPE_VISIBILITY = Object.fromEntries(
  Object.entries(TERM_TYPE_VISIBILITY).map(([k, v]) => [normalizeTermType(k), v]),
);

function getTermTypeVisibility(termType) {
  return (
    NORMALIZED_TERM_TYPE_VISIBILITY[normalizeTermType(termType)] || {
      showFreight: true,
      showInsurance: true,
    }
  );
}

// ---------------------------------------------------------------------------
// Blank shapes
// ---------------------------------------------------------------------------

const blankParty = () => ({ code: "", uen: "", name: "", name1: "" });

const blankValueRow = () => ({
  charges: "",
  currency: "",
  exRate: "",
  amount: "",
  amountSgd: "",
});

export function blankInvoice() {
  return {
    supplier: blankParty(),
    importer: blankParty(),
    serialNumber: "",
    invoiceDate: "",
    invoiceNumber: "",
    termType: "",
    supplierImporterRelationship: "",
    preferentialDutyRateIndicator: false,
    invoiceValue: blankValueRow(),
    otherValue: blankValueRow(),
    freightValue: { includeInCif: false, ...blankValueRow() },
    insuranceValue: { includeInCif: false, ...blankValueRow() },
    costInsuranceFreight: { amountSgd: "" },
  };
}

// ---------------------------------------------------------------------------
// Small UI pieces
// ---------------------------------------------------------------------------

function InvoiceDateField({ value, onChange }) {
  const [error, setError] = useState(false);

  const getTodayDate = () => {
    const t = new Date();
    return `${String(t.getDate()).padStart(2, "0")}/${String(t.getMonth() + 1).padStart(2, "0")}/${t.getFullYear()}`;
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
    <div>
      <input
        type="text"
        value={value ?? ""}
        placeholder="DD/MM/YYYY"
        onChange={(e) => onChange(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        style={{
          border: `1px solid ${error ? C.danger : C.inputBorder}`,
          borderRadius: 4,
          padding: "6px 8px",
          fontSize: 12.5,
          color: C.navy,
          background: C.inputBg,
          width: "100%",
          boxSizing: "border-box",
          fontFamily: "inherit",
        }}
      />
      {error && (
        <span
          style={{
            color: C.danger,
            fontSize: 10,
            fontWeight: 700,
            display: "block",
            marginTop: 2,
          }}
        >
          Invalid date — reset to today
        </span>
      )}
    </div>
  );
}

function InvoiceField({ label, children }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <span
        style={{
          color: C.sub,
          fontWeight: 700,
          fontSize: 10.5,
          letterSpacing: 0.3,
        }}
      >
        {label}
      </span>
      {children}
    </div>
  );
}

function InvoiceSelect({ value, onChange, options }) {
  const normalize = (s) => (s || "").trim().toLowerCase();
  const canonicalMatch = options.find((o) => normalize(o) === normalize(value));
  const selectValue = canonicalMatch ?? (value || "");

  return (
    <select
      value={selectValue}
      onChange={(e) => onChange(e.target.value)}
      style={{
        border: `1px solid ${C.inputBorder}`,
        borderRadius: 4,
        padding: "6px 8px",
        fontSize: 12.5,
        color: C.navy,
        background: C.inputBg,
        width: "100%",
        boxSizing: "border-box",
        fontFamily: "inherit",
      }}
    >
      <option value="">Select</option>
      {value && !canonicalMatch && <option value={value}>{value}</option>}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

function InvoiceValueRow({
  label,
  row,
  path,
  onEdit,
  hasCheckbox,
  rowBg,
  currencyOptions,
  onCurrencyChange,
  amountDisabled,
  exRateEditable,
}) {
  const cell = { padding: 6, borderBottom: `1px solid ${C.panelBorder}` };
  return (
    <tr style={{ background: rowBg }}>
      <td
        style={{
          padding: "7px 9px",
          borderBottom: `1px solid ${C.panelBorder}`,
          fontSize: 12,
          color: C.navy,
        }}
      >
        {hasCheckbox && (
          <input
            type="checkbox"
            checked={!!row.includeInCif}
            onChange={(e) => onEdit([...path, "includeInCif"], e.target.checked)}
            style={{ marginRight: 6, verticalAlign: -2, accentColor: C.bar }}
          />
        )}
        {label}
      </td>
      <td style={cell}>
        <EditableInput
          compact
          value={row.charges}
          onChange={(v) => onEdit([...path, "charges"], v)}
          placeholder="0.00"
        />
      </td>
      <td style={cell}>
        <InvoiceSelect
          value={row.currency}
          onChange={onCurrencyChange}
          options={currencyOptions}
        />
      </td>
      <td style={cell}>
        <EditableInput
          compact
          value={row.exRate}
          onChange={(v) => onEdit([...path, "exRate"], v)}
          placeholder="0.00"
          disabled={!exRateEditable}
        />
      </td>
      <td style={cell}>
        <EditableInput
          compact
          value={row.amount}
          onChange={(v) => onEdit([...path, "amount"], v)}
          placeholder="0.00"
          disabled={amountDisabled}
        />
      </td>
      <td style={cell}>
        <EditableInput compact value={row.amountSgd} placeholder="0.00" disabled />
      </td>
    </tr>
  );
}

// ---------------------------------------------------------------------------
// Supplier / Manufacturer (editable with suggestions)
// ---------------------------------------------------------------------------

function InvoiceSupplierField({ supplier, onEdit, touchUser }) {
  const suggestions = useSupplierSuggestions();
  const [showDropdown, setShowDropdown] = useState(false);
  const [filtered, setFiltered] = useState([]);
  const [highlighted, setHighlighted] = useState(0);

  const runFilter = (val) => {
    if (!val) {
      setShowDropdown(false);
      setFiltered([]);
      return;
    }
    const matches = suggestions.filter((i) =>
      i.toLowerCase().startsWith(val.toLowerCase()),
    );
    setFiltered(matches.slice(0, 100));
    setShowDropdown(matches.length > 0);
  };

  const applyItem = (item) => {
    const [code, cruei, name, name1] = item.split(":");
    onEdit(["invoice", "supplier", "code"], code || "");
    onEdit(["invoice", "supplier", "uen"], cruei || "");
    onEdit(["invoice", "supplier", "name"], name || "");
    onEdit(["invoice", "supplier", "name1"], name1 || "");
  };

  const handleCodeChange = (val) => {
    onEdit(["invoice", "supplier", "code"], val);
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
      setHighlighted((p) => (p + 1 >= filtered.length ? 0 : p + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlighted((p) => (p - 1 < 0 ? filtered.length - 1 : p - 1));
    } else if (e.key === "Enter" || e.key === "Tab") {
      e.preventDefault();
      handleSelect(filtered[highlighted]);
    }
  };

  const handleBlur = () => {
    setTimeout(() => {
      if (!supplier.code) {
        setShowDropdown(false);
        return;
      }
      const match = suggestions
        .map((i) => i.split(":"))
        .find(([code]) => code.toLowerCase() === supplier.code.toLowerCase());
      if (match) applyItem(match.join(":"));
      setShowDropdown(false);
    }, 150);
  };

  const handleSave = async () => {
    if (!supplier.code) {
      alert("Code is required!");
      return;
    }
    const duplicate = suggestions.some(
      (i) => i.split(":")[0].toLowerCase() === supplier.code.toLowerCase(),
    );
    if (duplicate) {
      alert("Duplicate code found! Supplier/Manufacturer not saved.");
      return;
    }
    if (!touchUser) {
      alert("This email's mailbox username could not be resolved — cannot save.");
      return;
    }
    const payload = {
      Id: 0,
      Code: supplier.code || "",
      CRUEI: supplier.uen || "",
      Name: supplier.name || "",
      Name1: supplier.name1 || "",
      TouchUser: touchUser,
      TouchTime: new Date().toISOString(),
      Status: "Active",
    };
    try {
      const response = await API.post("/postSupplierManufacturerPartTable/", payload);
      alert(response.data?.message || "Supplier/Manufacturer saved successfully!");
      supplierSuggestionsCache.list = [
        ...suggestions,
        `${payload.Code}:${payload.CRUEI}:${payload.Name}:${payload.Name1}`,
      ];
    } catch (err) {
      console.error("Failed to save Supplier/Manufacturer:", err.response?.data || err);
      alert(
        err.response?.data?.error ||
          "Failed to save Supplier/Manufacturer, check console for details",
      );
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 16 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ color: C.navy, fontWeight: 800, fontSize: 11.5, letterSpacing: 0.3 }}>
          Supplier / Manufacturer
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          <FaSearch
            style={{ color: C.bar, fontSize: 12, cursor: "pointer" }}
            title="Search Supplier / Manufacturer"
            onClick={() => runFilter(supplier.code)}
          />
          <FaPlus
            style={{ cursor: "pointer", color: C.bar, fontSize: 12 }}
            onClick={handleSave}
            title="Save as new Supplier / Manufacturer"
          />
        </div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <InvoiceField label="Code">
          <div style={{ position: "relative" }}>
            <EditableInput
              compact
              value={supplier.code}
              onChange={handleCodeChange}
              onKeyDown={handleKeyDown}
              onFocus={() => runFilter(supplier.code)}
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
                {filtered.map((item, index) => {
                  const [code, , name] = item.split(":");
                  return (
                    <div
                      key={code + index}
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
                      {code} - {name || ""}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </InvoiceField>
        <InvoiceField label="UEN">
          <EditableInput
            compact
            value={supplier.uen}
            onChange={(v) => onEdit(["invoice", "supplier", "uen"], v)}
          />
        </InvoiceField>
        <InvoiceField label="Name">
          <EditableInput
            compact
            value={supplier.name}
            onChange={(v) => onEdit(["invoice", "supplier", "name"], v)}
          />
        </InvoiceField>
        <InvoiceField label="Name 1">
          <EditableInput
            compact
            value={supplier.name1}
            onChange={(v) => onEdit(["invoice", "supplier", "name1"], v)}
          />
        </InvoiceField>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Parties block: Supplier (editable) + Importer (read-only from Party tab)
// ---------------------------------------------------------------------------

function InvoicePartiesBlock({ data, onEdit, touchUser }) {
  const invoice = { ...blankInvoice(), ...(data.invoice || {}) };
  const importer = data.Importer || { Code: "", CRUEI: "", Name: "", Name1: "" };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        padding: 14,
        marginBottom: 18,
        background: "#fafcfd",
      }}
    >
      <InvoiceSupplierField
        supplier={invoice.supplier}
        onEdit={onEdit}
        touchUser={touchUser}
      />

      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        <span style={{ color: C.navy, fontWeight: 800, fontSize: 11.5, letterSpacing: 0.3 }}>
          Importer
        </span>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
          <InvoiceField label="Code">
            <EditableInput compact value={importer.Code} disabled />
          </InvoiceField>
          <InvoiceField label="CRUEI">
            <EditableInput compact value={importer.CRUEI} disabled />
          </InvoiceField>
          <InvoiceField label="Name">
            <EditableInput compact value={importer.Name} disabled />
          </InvoiceField>
          <InvoiceField label="Name 1">
            <EditableInput compact value={importer.Name1} disabled />
          </InvoiceField>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Details block — INPAYMENT CALCULATION lives here
// ---------------------------------------------------------------------------

function InvoiceDetailsBlock({ data, onEdit, serialNumber }) {
  const path = ["invoice"];
  const invoice = { ...blankInvoice(), ...(data.invoice || {}) };

  const gstCharge = data.gstCharge ?? DEFAULT_GST_CHARGE;
  const gstAmountSgd = data.gstAmountSgd ?? "";

  const termTypeOptions = useTermTypeOptions();
  const currencyOptions = useCurrencyOptions();
  const currencyNames = currencyOptions.map((c) => c.Currency).filter(Boolean);

  const visibility = getTermTypeVisibility(invoice.termType);
  const showFreight = visibility.showFreight;
  const showInsurance = visibility.showInsurance;

  const findCurrencyRate = (name) => {
    const match = currencyOptions.find((c) => c.Currency === name);
    return match ? String(match.CurrencyRate) : "";
  };

  const handleCurrencyChange = (rowPath, name, resetInsurance) => {
    onEdit([...rowPath, "currency"], name);
    onEdit([...rowPath, "exRate"], findCurrencyRate(name));
    if (resetInsurance) {
      onEdit([...rowPath, "charges"], "0");
      onEdit([...rowPath, "amount"], "0");
      onEdit([...rowPath, "amountSgd"], "0");
    }
  };

  // Prefill Invoice Value amount from totalValueGBP (only when still empty)
  const totalValueGBPKey = findRowKey(data, TOTAL_VALUE_GBP_ALIASES);
  const totalValueGBP = totalValueGBPKey ? data[totalValueGBPKey] : "";

  useEffect(() => {
    if (totalValueGBP === "" || totalValueGBP == null) return;
    if (invoice.invoiceValue.amount) return;
    onEdit([...path, "invoiceValue", "amount"], String(totalValueGBP));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [totalValueGBP]);

  const handleTermTypeChange = (newTermType) => {
    const rule = getTermTypeVisibility(newTermType);
    onEdit(path, {
      ...invoice,
      termType: newTermType,
      invoiceValue: blankValueRow(),
      otherValue: blankValueRow(),
      freightValue: { includeInCif: false, ...blankValueRow() },
      insuranceValue: {
        includeInCif: false,
        ...blankValueRow(),
        ...(rule.presetInsurance
          ? { charges: "1.00", currency: "SGD", exRate: "1.000000" }
          : {}),
      },
      costInsuranceFreight: { amountSgd: "" },
    });
    onEdit(["gstCharge"], DEFAULT_GST_CHARGE);
    onEdit(["gstAmountSgd"], "");
  };

  // ── INPAYMENT CALCULATION ─────────────────────────────────────────────
  // Invoice ($) = amount × exRate
  // Freight amount  = Invoice($) × charge% / exRate      (if charge > 0)
  // Insurance amt   = (Invoice($) [+ Freight($)]) × charge%   (if charge > 0)
  // CIF = Invoice($) + Other($) + Freight($) + Insurance($)
  // GST = CIF × gst%
  useEffect(() => {
    const invAmount = parseFloat(invoice.invoiceValue.amount) || 0;
    const invEx = parseFloat(invoice.invoiceValue.exRate) || 0;
    const invDollar = invAmount * invEx;

    const othAmount = parseFloat(invoice.otherValue.amount) || 0;
    const othEx = parseFloat(invoice.otherValue.exRate) || 0;
    const othDollar = othAmount * othEx;

    let frAmount = 0;
    let frDollar = 0;
    if (showFreight) {
      const frCharge = parseFloat(invoice.freightValue.charges) || 0;
      const frEx = parseFloat(invoice.freightValue.exRate) || 0;
      frAmount = parseFloat(invoice.freightValue.amount) || 0;

      if (frCharge > 0 && frEx > 0) {
        const calculated = (invDollar * frCharge) / 100 / frEx;
        if (invoice.freightValue.amount !== calculated.toFixed(2)) {
          onEdit([...path, "freightValue", "amount"], calculated.toFixed(2));
        }
        frAmount = calculated;
      }
      frDollar = frAmount * frEx;
    }

    let insAmount = 0;
    let insDollar = 0;
    if (showInsurance) {
      const charge = parseFloat(invoice.insuranceValue.charges) || 0;
      const insEx = parseFloat(invoice.insuranceValue.exRate) || 0;

      if (charge > 0) {
        const base = showFreight ? invDollar + frDollar : invDollar;
        const calculated = (base * charge) / 100;
        if (invoice.insuranceValue.amount !== calculated.toFixed(2)) {
          onEdit([...path, "insuranceValue", "amount"], calculated.toFixed(2));
        }
        insAmount = calculated;
      } else {
        insAmount = parseFloat(invoice.insuranceValue.amount) || 0;
      }
      insDollar = insAmount * insEx;
    }

    const next = {
      inv: invDollar.toFixed(2),
      oth: othDollar.toFixed(2),
      fr: frDollar.toFixed(2),
      ins: insDollar.toFixed(2),
    };

    if (invoice.invoiceValue.amountSgd !== next.inv)
      onEdit([...path, "invoiceValue", "amountSgd"], next.inv);
    if (invoice.otherValue.amountSgd !== next.oth)
      onEdit([...path, "otherValue", "amountSgd"], next.oth);
    if (invoice.freightValue.amountSgd !== next.fr)
      onEdit([...path, "freightValue", "amountSgd"], next.fr);
    if (invoice.insuranceValue.amountSgd !== next.ins)
      onEdit([...path, "insuranceValue", "amountSgd"], next.ins);

    const cif = invDollar + othDollar + frDollar + insDollar;
    const cifFixed = cif.toFixed(2);
    if (invoice.costInsuranceFreight.amountSgd !== cifFixed)
      onEdit([...path, "costInsuranceFreight", "amountSgd"], cifFixed);

    const gstPercent = parseFloat(gstCharge) || 0;
    const gstFixed = (cif * (gstPercent / 100)).toFixed(2);
    if (gstAmountSgd !== gstFixed) onEdit(["gstAmountSgd"], gstFixed);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    invoice.invoiceValue.amount,
    invoice.invoiceValue.exRate,
    invoice.otherValue.amount,
    invoice.otherValue.exRate,
    invoice.freightValue.amount,
    invoice.freightValue.charges,
    invoice.freightValue.exRate,
    invoice.insuranceValue.amount,
    invoice.insuranceValue.charges,
    invoice.insuranceValue.exRate,
    gstCharge,
    showFreight,
    showInsurance,
  ]);

  const thStyle = {
    background: C.tableHead,
    color: "#fff",
    padding: "8px 9px",
    textAlign: "left",
    fontSize: 10.5,
    letterSpacing: 0.3,
  };

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        padding: 14,
        marginBottom: 18,
        background: "#fafcfd",
      }}
    >
      <div
        style={{
          background: C.bar,
          color: C.barText,
          fontWeight: 800,
          fontSize: 11.5,
          letterSpacing: 0.4,
          textAlign: "center",
          padding: "7px 0",
          borderRadius: 4,
          marginBottom: 14,
        }}
      >
        INVOICE INFORMATION
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(3, 1fr)",
          gap: 14,
          marginBottom: 18,
        }}
      >
        <InvoiceField label="Serial Number">
          <EditableInput compact value={serialNumber} disabled />
        </InvoiceField>
        <InvoiceField label="Invoice Date">
          <InvoiceDateField
            value={invoice.invoiceDate}
            onChange={(v) => onEdit([...path, "invoiceDate"], v)}
          />
        </InvoiceField>
        <InvoiceField label="Invoice Number">
          <EditableInput
            compact
            value={invoice.invoiceNumber}
            onChange={(v) => onEdit([...path, "invoiceNumber"], v)}
          />
        </InvoiceField>
        <InvoiceField label="Term Type">
          <InvoiceSelect
            value={invoice.termType}
            onChange={handleTermTypeChange}
            options={termTypeOptions.map((t) => t.Name).filter(Boolean)}
          />
        </InvoiceField>
        <InvoiceField label="Supplier Importer Relationship">
          <InvoiceSelect
            value={invoice.supplierImporterRelationship}
            onChange={(v) => onEdit([...path, "supplierImporterRelationship"], v)}
            options={RELATIONSHIP_OPTIONS}
          />
        </InvoiceField>
        <div style={{ display: "flex", alignItems: "center", gap: 8, paddingTop: 18 }}>
          <input
            type="checkbox"
            checked={!!invoice.preferentialDutyRateIndicator}
            onChange={(e) =>
              onEdit([...path, "preferentialDutyRateIndicator"], e.target.checked)
            }
            style={{ width: 16, height: 16, accentColor: C.bar }}
          />
          <span style={{ fontSize: 12, color: C.navy }}>
            Preferential Duty Rate Indicator
          </span>
        </div>
      </div>

      <div style={{ overflowX: "auto" }}>
        <table
          style={{
            width: "100%",
            borderCollapse: "collapse",
            fontSize: 12,
            tableLayout: "fixed",
          }}
        >
          <thead>
            <tr>
              {["Item", "Charges (%)", "Currency", "Ex.Rate", "Amount", "Amount ($)"].map(
                (h) => (
                  <th key={h} style={thStyle}>
                    {h}
                  </th>
                ),
              )}
            </tr>
          </thead>
          <tbody>
            <InvoiceValueRow
              label="Invoice Value"
              row={invoice.invoiceValue}
              path={[...path, "invoiceValue"]}
              onEdit={onEdit}
              rowBg={C.rowAlt}
              currencyOptions={currencyNames}
              onCurrencyChange={(name) =>
                handleCurrencyChange([...path, "invoiceValue"], name)
              }
            />
            <InvoiceValueRow
              label="Other Value"
              row={invoice.otherValue}
              path={[...path, "otherValue"]}
              onEdit={onEdit}
              rowBg="#fff"
              currencyOptions={currencyNames}
              onCurrencyChange={(name) =>
                handleCurrencyChange([...path, "otherValue"], name)
              }
            />
            {showFreight && (
              <InvoiceValueRow
                label="Freight Value (Incl. Other Value)"
                row={invoice.freightValue}
                path={[...path, "freightValue"]}
                onEdit={onEdit}
                hasCheckbox
                rowBg={C.rowAlt}
                currencyOptions={currencyNames}
                onCurrencyChange={(name) =>
                  handleCurrencyChange([...path, "freightValue"], name)
                }
                amountDisabled={parseFloat(invoice.freightValue.charges) > 0}
              />
            )}
            {showInsurance && (
              <InvoiceValueRow
                label="Insurance Value (Incl. Freight Value)"
                row={invoice.insuranceValue}
                path={[...path, "insuranceValue"]}
                onEdit={onEdit}
                hasCheckbox
                rowBg="#fff"
                currencyOptions={currencyNames}
                onCurrencyChange={(name) =>
                  handleCurrencyChange([...path, "insuranceValue"], name, true)
                }
                amountDisabled={parseFloat(invoice.insuranceValue.charges) > 0}
                exRateEditable={INSURANCE_EXRATE_EDITABLE}
              />
            )}
            <tr style={{ background: C.rowAlt }}>
              <td
                style={{
                  padding: "7px 9px",
                  borderBottom: `1px solid ${C.panelBorder}`,
                  fontSize: 12,
                  color: C.navy,
                }}
              >
                Cost, Insurance &amp; Freight
              </td>
              <td colSpan={4} style={{ borderBottom: `1px solid ${C.panelBorder}` }} />
              <td style={{ padding: 6, borderBottom: `1px solid ${C.panelBorder}` }}>
                <EditableInput
                  compact
                  value={invoice.costInsuranceFreight.amountSgd}
                  placeholder="0.00"
                  disabled
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: "7px 9px", fontSize: 12, color: C.navy }}>GST</td>
              <td style={{ padding: 6 }}>
                <EditableInput
                  compact
                  value={gstCharge}
                  onChange={(v) => onEdit(["gstCharge"], v)}
                  placeholder="0.00"
                />
              </td>
              <td colSpan={2} />
              <td />
              <td style={{ padding: 6 }}>
                <EditableInput compact value={gstAmountSgd} placeholder="0.00" disabled />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoice table (bottom list)
// ---------------------------------------------------------------------------

function InvoiceTableSection({ invoices, onEditRow, onDeleteRow, deleting }) {
  const columns = [
    "Delete",
    "Edit",
    "S.No",
    "Invoice Number",
    "Invoice Date",
    "Term Type",
    "Currency",
    "Amount",
    "CIF/FOB ($)",
    "GST ($)",
  ];
  const th = {
    background: C.tableHead,
    color: "#fff",
    padding: "8px 9px",
    textAlign: "left",
    fontSize: 10.5,
    letterSpacing: 0.3,
  };
  const td = {
    padding: "7px 9px",
    borderBottom: `1px solid ${C.panelBorder}`,
    fontSize: 12,
    color: C.navy,
  };

  return (
    <div style={{ marginTop: 8 }}>
      <div
        style={{
          background: C.bar,
          color: C.barText,
          fontWeight: 800,
          fontSize: 11.5,
          letterSpacing: 0.4,
          textAlign: "center",
          padding: "7px 0",
          borderRadius: 4,
          marginBottom: 10,
        }}
      >
        INVOICE TABLE
      </div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12.5 }}>
          <thead>
            <tr>
              {columns.map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {invoices.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  style={{ padding: 14, textAlign: "center", color: C.sub, fontSize: 12.5 }}
                >
                  No invoices added yet.
                </td>
              </tr>
            ) : (
              invoices.map((inv, i) => (
                <tr key={inv.sNo ?? i} style={{ background: i % 2 ? C.rowAlt : "#fff" }}>
                  <td style={{ ...td, padding: 6, textAlign: "center" }}>
                    <button
                      type="button"
                      title="Delete invoice"
                      disabled={deleting}
                      onClick={() => onDeleteRow(inv.sNo)}
                      style={{
                        border: "none",
                        background: "#fdeceb",
                        color: C.danger,
                        width: 26,
                        height: 26,
                        borderRadius: 6,
                        cursor: deleting ? "not-allowed" : "pointer",
                        opacity: deleting ? 0.5 : 1,
                        fontSize: 14,
                        fontWeight: 800,
                      }}
                    >
                      x
                    </button>
                  </td>
                  <td style={{ ...td, padding: 6, textAlign: "center" }}>
                    <button
                      type="button"
                      onClick={() => onEditRow(inv.sNo)}
                      title="Edit invoice"
                      style={{
                        border: "none",
                        background: "transparent",
                        color: C.bar,
                        cursor: "pointer",
                        fontWeight: 800,
                        fontSize: 14,
                      }}
                    >
                      ✎
                    </button>
                  </td>
                  <td style={td}>{inv.sNo}</td>
                  <td style={td}>{inv.invoiceNumber || "—"}</td>
                  <td style={td}>{inv.invoiceDate || "—"}</td>
                  <td style={td}>{inv.termType || "—"}</td>
                  <td style={td}>{inv.invoiceValue?.currency || "—"}</td>
                  <td style={td}>{inv.invoiceValue?.amount || "—"}</td>
                  <td style={td}>{inv.costInsuranceFreight?.amountSgd || "—"}</td>
                  <td style={td}>{inv.gstAmountSgd || "—"}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Payload for this module's table
// ---------------------------------------------------------------------------

function formatDateForApi(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

function buildInvoicePayload(invoice, importer, sNo, permitId, gstCharge, gstAmountSgd, touchUser) {
  const { showFreight, showInsurance } = getTermTypeVisibility(invoice.termType);

  return {
    PermitId: permitId,
    SNo: sNo,
    InvoiceNo: (invoice.invoiceNumber || "").toUpperCase(),
    InvoiceDate: formatDateForApi(invoice.invoiceDate),
    TermType: invoice.termType || "",
    AdValoremIndicator: "False",
    PreDutyRateIndicator: invoice.preferentialDutyRateIndicator ? "True" : "False",
    SupplierImporterRelationship: invoice.supplierImporterRelationship || "--Select--",
    SupplierCode: invoice.supplier?.code || "-",
    ImportPartyCode: importer?.Code || "",

    TICurrency: invoice.invoiceValue.currency || "",
    TIExRate: Number(invoice.invoiceValue.exRate) || 0,
    TIAmount: Number(invoice.invoiceValue.amount) || 0,
    TISAmount: Number(invoice.invoiceValue.amountSgd) || 0,

    OTCCharge: Number(invoice.otherValue.charges) || 0,
    OTCCurrency: invoice.otherValue.currency || "--Select--",
    OTCExRate: Number(invoice.otherValue.exRate) || 0,
    OTCAmount: Number(invoice.otherValue.amount) || 0,
    OTCSAmount: Number(invoice.otherValue.amountSgd) || 0,

    FCCharge: showFreight ? Number(invoice.freightValue.charges) || 0 : 0,
    FCCurrency: showFreight ? invoice.freightValue.currency || "--Select--" : "--Select--",
    FCExRate: showFreight ? Number(invoice.freightValue.exRate) || 0 : 0,
    FCAmount: showFreight ? Number(invoice.freightValue.amount) || 0 : 0,
    FCSAmount: showFreight ? Number(invoice.freightValue.amountSgd) || 0 : 0,

    ICCharge: showInsurance ? Number(invoice.insuranceValue.charges) || 0 : 0,
    ICCurrency: showInsurance ? invoice.insuranceValue.currency || "--Select--" : "--Select--",
    ICExRate: showInsurance ? Number(invoice.insuranceValue.exRate) || 0 : 0,
    ICAmount: showInsurance ? Number(invoice.insuranceValue.amount) || 0 : 0,
    ICSAmount: showInsurance ? Number(invoice.insuranceValue.amountSgd) || 0 : 0,

    CIFSUMAmount: Number(invoice.costInsuranceFreight.amountSgd) || 0,
    GSTPercentage: Number(gstCharge) || 0,
    GSTSUMAmount: Number(gstAmountSgd) || 0,
    MessageType: MESSAGE_TYPE,
    TouchUser: touchUser,
    TouchTime: new Date().toISOString(),
    ChkOtherInv: "No",
  };
}

// ---------------------------------------------------------------------------
// Main component — add / edit / delete for THIS module
// ---------------------------------------------------------------------------

export default function InpaymentInvoice({ data, onEdit, permitId, touchUser }) {
  const invoices = Array.isArray(data.invoices) ? data.invoices : [];
  const [savingInvoice, setSavingInvoice] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [editingSNo, setEditingSNo] = useState(null);

  const nextSNo =
    invoices.length > 0
      ? Math.max(...invoices.map((inv) => Number(inv.sNo) || 0)) + 1
      : 1;
  const displaySerialNumber = editingSNo ?? nextSNo;

  const handleAddInvoice = async () => {
    if (!permitId) {
      alert('Click "New" first to generate a Permit ID before adding an invoice.');
      return;
    }
    if (!touchUser) {
      alert("This email's mailbox username could not be resolved — cannot save this invoice.");
      return;
    }

    const current = { ...blankInvoice(), ...(data.invoice || {}) };
    const gstCharge = data.gstCharge ?? DEFAULT_GST_CHARGE;
    const gstAmountSgd = data.gstAmountSgd ?? "";

    if (!current.invoiceNumber || !current.invoiceNumber.trim()) {
      alert("Invoice Number is required!");
      return;
    }
    if (!current.invoiceDate || !current.invoiceDate.trim()) {
      alert("Invoice Date is required!");
      return;
    }
    if (!current.invoiceValue.currency) {
      alert("Invoice Currency is required!");
      return;
    }

    const sNo = editingSNo ?? nextSNo;
    const rowToSave = { ...current, sNo, gstCharge, gstAmountSgd };
    const payload = buildInvoicePayload(
      rowToSave,
      data.Importer,
      sNo,
      permitId,
      gstCharge,
      gstAmountSgd,
      touchUser,
    );

    setSavingInvoice(true);
    try {
      const response = await API.post(SAVE_ENDPOINT, payload);
      if (response.data?.Warning) alert(response.data.Warning);

      const nextInvoices = editingSNo
        ? invoices.map((inv) => (inv.sNo === editingSNo ? rowToSave : inv))
        : [...invoices, rowToSave];

      onEdit(["invoices"], nextInvoices);
      onEdit(["invoice"], blankInvoice());
      onEdit(["gstCharge"], DEFAULT_GST_CHARGE);
      onEdit(["gstAmountSgd"], "");
      setEditingSNo(null);
    } catch (err) {
      console.error("Failed to save invoice:", err.response?.data || err);
      alert(
        err.response?.data?.error ||
          err.response?.data?.Result ||
          "Failed to save invoice. Please try again.",
      );
    } finally {
      setSavingInvoice(false);
    }
  };

  const handleEditRow = (sNo) => {
    const row = invoices.find((inv) => inv.sNo === sNo);
    if (!row) return;
    onEdit(["invoice"], row);
    onEdit(["gstCharge"], row.gstCharge ?? DEFAULT_GST_CHARGE);
    onEdit(["gstAmountSgd"], row.gstAmountSgd ?? "");
    setEditingSNo(sNo);
  };

  const handleDeleteRow = async (sNo) => {
    if (!permitId) return;
    setDeleting(true);
    let commonDeleted = false;
    try {
      await API.post(DELETE_COMMON_ENDPOINT, { SNo: sNo, PermitId: permitId });
      commonDeleted = true;
      await API.post(DELETE_MODULE_ENDPOINT, { SNo: sNo, PermitId: permitId });
    } catch (err) {
      console.error("Delete failed", err);
      if (!commonDeleted) {
        alert(err.response?.data?.error || "Failed to delete invoice, check console for details");
        setDeleting(false);
        return;
      }
      alert(
        `Warning: Invoice SNo ${sNo} was deleted from the common table but FAILED to delete from the module table.\n\n` +
          `Error: ${err.response?.data?.error || err.message}`,
      );
    }

    // Re-number like the legacy page does, and leave edit mode
    const remaining = invoices
      .filter((inv) => inv.sNo !== sNo)
      .map((inv, i) => ({ ...inv, sNo: i + 1 }));
    onEdit(["invoices"], remaining);
    if (editingSNo !== null) {
      onEdit(["invoice"], blankInvoice());
      onEdit(["gstCharge"], DEFAULT_GST_CHARGE);
      onEdit(["gstAmountSgd"], "");
      setEditingSNo(null);
    }
    setDeleting(false);
  };

  return (
    <div>
      <InvoicePartiesBlock data={data} onEdit={onEdit} touchUser={touchUser} />
      <InvoiceDetailsBlock data={data} onEdit={onEdit} serialNumber={displaySerialNumber} />

      <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 18 }}>
        <button
          type="button"
          onClick={handleAddInvoice}
          disabled={savingInvoice}
          style={{
            border: `1.5px dashed ${C.bar}`,
            background: "transparent",
            color: C.bar,
            fontWeight: 700,
            fontSize: 12,
            padding: "6px 12px",
            borderRadius: 6,
            cursor: savingInvoice ? "not-allowed" : "pointer",
            opacity: savingInvoice ? 0.6 : 1,
          }}
        >
          {savingInvoice ? "Saving…" : editingSNo ? "Update Invoice" : "+ Add Invoice"}
        </button>
      </div>

      <InvoiceTableSection
        invoices={invoices}
        onEditRow={handleEditRow}
        onDeleteRow={handleDeleteRow}
        deleting={deleting}
      />
    </div>
  );
}