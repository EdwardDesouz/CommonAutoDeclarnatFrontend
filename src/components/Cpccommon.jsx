import { FaPlus } from "react-icons/fa";
import { C, EditableInput } from "./DeclarationPanel";

// ===========================================================================
// CPC tab — ONE common file for Inpayment / InNonPayment / Out.
// Only the list of sections differs per module (same as the legacy pages):
//   type  = value saved in CPCType
//   rows  = false for CNB (a checkbox only, no processing-code rows)
// ===========================================================================

const MAX_ROWS = 5;

export const CPC_SECTIONS = {
  inpayment: [
    { type: "AEO", label: "AEO", rows: true },
    { type: "CWC", label: "CWC", rows: true },
    { type: "CNB", label: "CNB", rows: false },
    { type: "SCHEME", label: "SCHEME", rows: true },
  ],
  innonpayment: [
    { type: "AEO", label: "AEO", rows: true },
    { type: "CWC", label: "CWC", rows: true },
    { type: "SEASTORE", label: "SEA STORE", rows: true },
    { type: "CNB", label: "CNB", rows: false },
    { type: "SCHEME", label: "SCHEME", rows: true },
    { type: "IPE", label: "INTERNATIONAL PERMIT EXCHANGE", rows: true },
  ],
  out: [
    { type: "AEO", label: "AEO", rows: true },
    { type: "CWC", label: "CWC", rows: true },
    { type: "SEASTORE", label: "SEA STORE", rows: true },
    { type: "STS", label: "STS", rows: true },
    { type: "STSCWC", label: "STS & CWC", rows: true },
    { type: "DEFERREDCO", label: "DEFERRED PRINTING OF CO", rows: true },
    { type: "CNB", label: "CNB", rows: false },
    { type: "IPE", label: "INTERNATIONAL PERMIT EXCHANGE", rows: true },
  ],
};

export const getCpcSections = (activeModule) => CPC_SECTIONS[activeModule] || [];

const emptyRow = () => ({
  ProcessingCode1: "",
  ProcessingCode2: "",
  ProcessingCode3: "",
});

// data.cpc = { AEO: { on: true, rows: [...] }, CNB: { on: true }, ... }
function readSection(data, type) {
  const s = data?.cpc?.[type];
  return {
    on: !!s?.on,
    rows: Array.isArray(s?.rows) && s.rows.length > 0 ? s.rows : [emptyRow()],
  };
}

// Rows to POST to /postCpcTable/ — only sections of the ACTIVE module that are ticked.
export function buildCpcPayload(data, permitId, touchUser, messageType, activeModule) {
  const touchTime = new Date().toISOString();
  const payload = [];

  getCpcSections(activeModule).forEach((section) => {
    const { on, rows } = readSection(data, section.type);
    if (!on) return;

    if (!section.rows) {
      payload.push({
        PermitId: permitId,
        MessageType: messageType,
        RowNo: 1,
        CPCType: section.type,
        ProcessingCode1: "",
        ProcessingCode2: "",
        ProcessingCode3: "",
        TouchUser: touchUser,
        TouchTime: touchTime,
      });
      return;
    }

    rows
      .filter((r) => r.ProcessingCode1 || r.ProcessingCode2 || r.ProcessingCode3)
      .forEach((r, index) => {
        payload.push({
          PermitId: permitId,
          MessageType: messageType,
          RowNo: index + 1,
          CPCType: section.type,
          ProcessingCode1: r.ProcessingCode1 || "",
          ProcessingCode2: r.ProcessingCode2 || "",
          ProcessingCode3: r.ProcessingCode3 || "",
          TouchUser: touchUser,
          TouchTime: touchTime,
        });
      });
  });

  return payload;
}

function CpcSection({ section, data, onEdit }) {
  const { on, rows } = readSection(data, section.type);
  const base = ["cpc", section.type];

  const setRows = (next) => onEdit([...base, "rows"], next);
  const addRow = () => {
    if (rows.length >= MAX_ROWS) {
      alert("EXCEED THE MAXIMUM NUMBERS (5)");
      return;
    }
    setRows([...rows, emptyRow()]);
  };
  const deleteRow = (i) => {
    if (rows.length === 1) {
      alert("At least one row must remain.");
      return;
    }
    setRows(rows.filter((_, idx) => idx !== i));
  };

  return (
    <div
      style={{
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 8,
        padding: 12,
        background: "#fafcfd",
        marginBottom: 12,
      }}
    >
      <label
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          fontSize: 12,
          fontWeight: 800,
          color: C.navy,
          letterSpacing: 0.3,
          cursor: "pointer",
        }}
      >
        <input
          type="checkbox"
          checked={on}
          onChange={(e) => {
            onEdit([...base, "on"], e.target.checked);
            if (e.target.checked && section.rows && !data?.cpc?.[section.type]?.rows) {
              onEdit([...base, "rows"], [emptyRow()]);
            }
          }}
          style={{ width: 16, height: 16, accentColor: C.bar }}
        />
        {section.label}
      </label>

      {on && section.rows && (
        <div style={{ marginTop: 10 }}>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr) 70px",
              gap: 8,
              marginBottom: 4,
            }}
          >
            {["Processing Code 1", "Processing Code 2", "Processing Code 3"].map((h) => (
              <span key={h} style={{ color: C.sub, fontWeight: 700, fontSize: 10.5 }}>
                {h}
              </span>
            ))}
            <span />
          </div>

          {rows.map((row, i) => (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(3, 1fr) 70px",
                gap: 8,
                marginBottom: 6,
                alignItems: "center",
              }}
            >
              {["ProcessingCode1", "ProcessingCode2", "ProcessingCode3"].map((field) => (
                <EditableInput
                  key={field}
                  compact
                  value={row[field]}
                  onChange={(v) => onEdit([...base, "rows", i, field], v)}
                />
              ))}
              <button
                type="button"
                disabled={rows.length === 1}
                onClick={() => deleteRow(i)}
                style={{
                  border: "none",
                  background: C.dangerBg,
                  color: C.danger,
                  fontWeight: 700,
                  fontSize: 11,
                  padding: "5px 0",
                  borderRadius: 6,
                  cursor: rows.length === 1 ? "not-allowed" : "pointer",
                  opacity: rows.length === 1 ? 0.4 : 1,
                }}
              >
                Delete
              </button>
            </div>
          ))}

          <button
            type="button"
            onClick={addRow}
            disabled={rows.length >= MAX_ROWS}
            style={{
              border: `1.5px dashed ${C.bar}`,
              background: "transparent",
              color: C.bar,
              fontWeight: 700,
              fontSize: 12,
              padding: "5px 12px",
              borderRadius: 6,
              cursor: rows.length >= MAX_ROWS ? "not-allowed" : "pointer",
              opacity: rows.length >= MAX_ROWS ? 0.4 : 1,
              display: "inline-flex",
              alignItems: "center",
              gap: 6,
              marginTop: 2,
            }}
          >
            <FaPlus style={{ fontSize: 10 }} /> Add Row
          </button>
        </div>
      )}
    </div>
  );
}

export default function CpcTabContent({ data, onEdit, activeModule }) {
  const sections = getCpcSections(activeModule);
  if (sections.length === 0) return null;

  return (
    <div>
      {sections.map((section) => (
        <CpcSection key={section.type} section={section} data={data} onEdit={onEdit} />
      ))}
    </div>
  );
}