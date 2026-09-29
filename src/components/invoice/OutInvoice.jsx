import { useState, useEffect } from "react";
import API from "../../api/api";
import { C, EditableInput } from "../DeclarationPanel";

// ===========================================================================
// OUT INVOICE  —  fully self-contained. Matches the legacy Out page:
// Exporter + Invoice Value only. CIF Value = Invoice ($). No supplier,
// term type, freight, insurance or GST.
// ===========================================================================

const MESSAGE_TYPE = "OUTDEC";
const SAVE_ENDPOINT = "out/postOutInvoiceTable/";
const DELETE_COMMON_ENDPOINT = "/deleteInvoiceNo/";
const DELETE_MODULE_ENDPOINT = "out/deleteOutInvoiceNo/";

const RELATIONSHIP_OPTIONS = ["RELATED", "NOT RELATED"];

// ---------------------------------------------------------------------------
// Master data (cached)
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Blank shape
// ---------------------------------------------------------------------------

const blankValueRow = () => ({
  charges: "",
  currency: "",
  exRate: "",
  amount: "",
  amountSgd: "",
});

export function blankInvoice() {
  return {
    invoiceDate: "",
    invoiceNumber: "",
    supplierImporterRelationship: "",
    preferentialDutyRateIndicator: false,
    invoiceValue: blankValueRow(),
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

// ---------------------------------------------------------------------------
// Exporter block (read-only, mirrors data.Exporter from the Party tab)
// ---------------------------------------------------------------------------

function OutPartiesBlock({ data }) {
  const exporter = data.Exporter || { Code: "", CRUEI: "", Name: "", Name1: "" };
  return (
    <div
      style={{
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        padding: 14,
        marginBottom: 18,
        background: "#fafcfd",
      }}
    >
      <div style={{ color: C.navy, fontWeight: 800, fontSize: 11.5, letterSpacing: 0.3, marginBottom: 6 }}>
        Exporter
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
        <InvoiceField label="Code">
          <EditableInput compact value={exporter.Code} disabled />
        </InvoiceField>
        <InvoiceField label="CRUEI">
          <EditableInput compact value={exporter.CRUEI} disabled />
        </InvoiceField>
        <InvoiceField label="Name">
          <EditableInput compact value={exporter.Name} disabled />
        </InvoiceField>
        <InvoiceField label="Name 1">
          <EditableInput compact value={exporter.Name1} disabled />
        </InvoiceField>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Details block — OUT CALCULATION lives here
// ---------------------------------------------------------------------------

function OutDetailsBlock({ data, onEdit, serialNumber }) {
  const path = ["invoice"];
  const invoice = { ...blankInvoice(), ...(data.invoice || {}) };

  const currencyOptions = useCurrencyOptions();
  const currencyNames = currencyOptions.map((c) => c.Currency).filter(Boolean);

  const handleCurrencyChange = (name) => {
    const match = currencyOptions.find((c) => c.Currency === name);
    onEdit([...path, "invoiceValue", "currency"], name);
    onEdit([...path, "invoiceValue", "exRate"], match ? String(match.CurrencyRate) : "");
  };

  // ── OUT CALCULATION ───────────────────────────────────────────────────
  // Invoice ($) = amount × exRate ;  CIF Value = Invoice ($)
  useEffect(() => {
    const amt = parseFloat(invoice.invoiceValue.amount) || 0;
    const ex = parseFloat(invoice.invoiceValue.exRate) || 0;
    const sgd = (amt * ex).toFixed(2);

    if (invoice.invoiceValue.amountSgd !== sgd)
      onEdit([...path, "invoiceValue", "amountSgd"], sgd);
    if (invoice.costInsuranceFreight.amountSgd !== sgd)
      onEdit([...path, "costInsuranceFreight", "amountSgd"], sgd);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [invoice.invoiceValue.amount, invoice.invoiceValue.exRate]);

  const th = {
    background: C.tableHead,
    color: "#fff",
    padding: "8px 9px",
    textAlign: "left",
    fontSize: 10.5,
    letterSpacing: 0.3,
  };
  const cell = { padding: 6, borderBottom: `1px solid ${C.panelBorder}` };

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
              {["Item", "Currency", "Ex.Rate", "Amount", "Amount ($)"].map((h) => (
                <th key={h} style={th}>
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            <tr style={{ background: C.rowAlt }}>
              <td
                style={{
                  padding: "7px 9px",
                  borderBottom: `1px solid ${C.panelBorder}`,
                  fontSize: 12,
                  color: C.navy,
                }}
              >
                Invoice Value
              </td>
              <td style={cell}>
                <InvoiceSelect
                  value={invoice.invoiceValue.currency}
                  onChange={handleCurrencyChange}
                  options={currencyNames}
                />
              </td>
              <td style={cell}>
                <EditableInput
                  compact
                  value={invoice.invoiceValue.exRate}
                  placeholder="0.00"
                  disabled
                />
              </td>
              <td style={cell}>
                <EditableInput
                  compact
                  value={invoice.invoiceValue.amount}
                  onChange={(v) => {
                    if (v === "" || /^\d*\.?\d*$/.test(v))
                      onEdit([...path, "invoiceValue", "amount"], v);
                  }}
                  placeholder="0.00"
                />
              </td>
              <td style={cell}>
                <EditableInput
                  compact
                  value={invoice.invoiceValue.amountSgd}
                  placeholder="0.00"
                  disabled
                />
              </td>
            </tr>
            <tr>
              <td style={{ padding: "7px 9px", fontSize: 12, color: C.navy }}>CIF Value</td>
              <td colSpan={3} />
              <td style={{ padding: 6 }}>
                <EditableInput
                  compact
                  value={invoice.costInsuranceFreight.amountSgd}
                  placeholder="0.00"
                  disabled
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Invoice table (bottom list) — no Term Type / GST columns for Out
// ---------------------------------------------------------------------------

function InvoiceTableSection({ invoices, onEditRow, onDeleteRow, deleting }) {
  const columns = [
    "Delete",
    "Edit",
    "S.No",
    "Invoice Number",
    "Invoice Date",
    "Currency",
    "Amount",
    "CIF/FOB ($)",
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
                  <td style={td}>{inv.invoiceValue?.currency || "—"}</td>
                  <td style={td}>{inv.invoiceValue?.amount || "—"}</td>
                  <td style={td}>{inv.costInsuranceFreight?.amountSgd || "—"}</td>
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
// Payload for the Out table
// ---------------------------------------------------------------------------

function formatDateForApi(dateStr) {
  if (!dateStr) return null;
  const parts = String(dateStr).split("/");
  if (parts.length !== 3) return null;
  const [day, month, year] = parts;
  return `${year}-${month}-${day}`;
}

function buildOutPayload(row, exporter, sNo, permitId, touchUser) {
  const exporterCode = exporter?.Code || "";
  return {
    PermitId: permitId,
    SNo: sNo,
    InvoiceNo: (row.invoiceNumber || "").toUpperCase(),
    InvoiceDate: formatDateForApi(row.invoiceDate),
    TermType: "",
    AdValoremIndicator: "False",
    PreDutyRateIndicator: row.preferentialDutyRateIndicator ? "True" : "False",
    SupplierImporterRelationship: row.supplierImporterRelationship || "--Select--",
    SupplierCode: "-",
    ImportPartyCode: exporterCode,
    ExportPartyCode: exporterCode,

    TICurrency: row.invoiceValue.currency || "",
    TIExRate: Number(row.invoiceValue.exRate) || 0,
    TIAmount: Number(row.invoiceValue.amount) || 0,
    TISAmount: Number(row.invoiceValue.amountSgd) || 0,

    OTCCharge: 0,
    OTCCurrency: "--Select--",
    OTCExRate: 0,
    OTCAmount: 0,
    OTCSAmount: 0,

    FCCharge: 0,
    FCCurrency: "--Select--",
    FCExRate: 0,
    FCAmount: 0,
    FCSAmount: 0,

    ICCharge: 0,
    ICCurrency: "--Select--",
    ICExRate: 0,
    ICAmount: 0,
    ICSAmount: 0,

    CIFSUMAmount: Number(row.costInsuranceFreight.amountSgd) || 0,
    GSTPercentage: 0,
    GSTSUMAmount: 0,
    MessageType: MESSAGE_TYPE,
    TouchUser: touchUser,
    TouchTime: new Date().toISOString(),
    ChkOtherInv: "No",
  };
}

// ---------------------------------------------------------------------------
// Main component — add / edit / delete for THIS module
// ---------------------------------------------------------------------------

export default function OutInvoice({ data, onEdit, permitId, touchUser }) {
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
    if (!data.Exporter?.Code) {
      alert("Exporter is not filled in the Party tab!");
      return;
    }

    const current = { ...blankInvoice(), ...(data.invoice || {}) };

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
    const rowToSave = { ...current, sNo };
    const payload = buildOutPayload(rowToSave, data.Exporter, sNo, permitId, touchUser);

    setSavingInvoice(true);
    try {
      const response = await API.post(SAVE_ENDPOINT, payload);
      if (response.data?.Warning) alert(response.data.Warning);

      const nextInvoices = editingSNo
        ? invoices.map((inv) => (inv.sNo === editingSNo ? rowToSave : inv))
        : [...invoices, rowToSave];

      onEdit(["invoices"], nextInvoices);
      onEdit(["invoice"], blankInvoice());
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

    const remaining = invoices
      .filter((inv) => inv.sNo !== sNo)
      .map((inv, i) => ({ ...inv, sNo: i + 1 }));
    onEdit(["invoices"], remaining);
    if (editingSNo !== null) {
      onEdit(["invoice"], blankInvoice());
      setEditingSNo(null);
    }
    setDeleting(false);
  };

  return (
    <div>
      <OutPartiesBlock data={data} />
      <OutDetailsBlock data={data} onEdit={onEdit} serialNumber={displaySerialNumber} />

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