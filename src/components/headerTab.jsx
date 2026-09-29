import { useState, useEffect } from "react";
import API from "../api/api";
import { C, EditableInput, findRowKey } from "./DeclarationPanel";
import { COMMON_MASTER_ENDPOINTS } from "./moduleConfig";
import { CARGO_FIELD_SPECS } from "./CargoCommon";
import { getFieldConfig } from "./accountFieldConfig";
import {
  getModuleKey,
  getDeclarationRules,
  getInwardModeChangePatch,
  getOutwardModeChangePatch,
  getCargoPackChangePatch,
} from "./headerRules";

// ---------------------------------------------------------------------------
// HEADER_FIELD_SPECS
//
// Fields common to every module keep a static `endpoint`. Fields that
// differ PER MODULE come in three flavors:
//   1. Endpoint differs per module (DeclarationType, DeclaringFor) — no
//      `endpoint` here, resolved from moduleConfig at render time in
//      resolveSpecEndpoint().
//   2. VISIBILITY differs per module (OutwardTransportMode) — a
//      `moduleVisibilityKey` says which moduleConfig flag gates it.
//   3. VISIBILITY depends on the chosen DECLARATION TYPE — a `ruleKey` says
//      which flag of getDeclarationRules() (headerRules.js) gates it. Those
//      rules are the ones the legacy Header.jsx files kept in their
//      DeclarationChange handlers.
//
// MessageType has no `default` for the same reason as (1) — it comes from
// moduleConfig.messageType.
// ---------------------------------------------------------------------------

export const HEADER_FIELD_SPECS = [
  {
    key: "MessageType",
    label: "Message Type",
    type: "text",
    aliases: ["messagetype", "message_type"],
    disabled: true,
    // default resolved from moduleConfig.messageType — see resolveFallback()
  },
  {
    key: "DeclarationType",
    label: "Declaration Type",
    type: "select",
    aliases: ["declarationtype", "declaration_type"],
    // endpoint resolved from moduleConfig.declarationTypeEndpoint
    required: true,
  },
  {
    key: "PreviousPermitNo",
    label: "Previous Permit No",
    type: "text",
    aliases: ["previouspermitno", "previous_permit_no"],
  },
  {
    key: "CargoPackType",
    label: "Cargo Pack Type",
    type: "select",
    aliases: ["cargopacktype", "cargo_pack_type"],
    endpoint: COMMON_MASTER_ENDPOINTS.cargoPackType, // CONFIRMED common
    // default: "5 : Other non-Containerized",
    required: true,
  },
  {
    key: "InwardTransportMode",
    label: "Inward Transport Mode",
    type: "select",
    aliases: ["inwardtransportmode", "inward_transport_mode"],
    endpoint: COMMON_MASTER_ENDPOINTS.inwardTransportMode, // CONFIRMED common
    // default: "4 : Air",
    // hidden for BKT (Inpayment / InNonPayment) and for APS/TCE/TCI/TCO/TCR/
    // TCS/BKT (Out) — see getDeclarationRules()
    ruleKey: "inwardTransport",
  },
  {
    // Only Out and InNonpayment have this field in their legacy Header.jsx
    // files; Inpayment never did. Same shared master-data endpoint as
    // InwardTransportMode (both legacy fetchOutwardTransportMode calls hit
    // getInwardTransportModeFromCommonMaster).
    //   - moduleVisibilityKey: module must have the field at all
    //   - ruleKey: InNonPayment only shows it for REX / SFZ, Out always
    key: "OutwardTransportMode",
    label: "Outward Transport Mode",
    type: "select",
    aliases: ["outwardtransportmode", "outward_transport_mode"],
    endpoint: COMMON_MASTER_ENDPOINTS.inwardTransportMode,
    moduleVisibilityKey: "hasOutwardTransportMode",
    ruleKey: "outwardTransport",
    required: true,
  },
  {
    key: "DeclaringFor",
    label: "Declaring For",
    type: "select",
    aliases: ["declaringfor", "declaring_for"],
    // endpoint resolved from moduleConfig.declaringForEndpoint
    // visibility controlled by fieldConfig.showDeclaringFor (per-account — see below)
  },
  {
    key: "BgIndicator",
    label: "BG Indicator",
    type: "select",
    aliases: ["bgindicator", "bg_indicator"],
    endpoint: COMMON_MASTER_ENDPOINTS.bgIndicator, // CONFIRMED common
    default: "",
  },
  {
    key: "OverrideExgeRate",
    label: "Override Exge Rate",
    type: "checkbox",
    aliases: ["overrideexgerate", "override_exge_rate"],
  },
  {
    key: "SupplyIndicator",
    label: "Supply Indicator",
    type: "checkbox",
    aliases: ["supplyindicator", "supply_indicator"],
  },
  {
    key: "ReferenceDocument",
    label: "Reference Document",
    type: "checkbox",
    aliases: ["referencedocument", "reference_document"],
  },
];

export const HEADER_SELECT_KEYS = new Set(
  HEADER_FIELD_SPECS.filter((s) => s.type === "select").flatMap((s) => [
    s.key.toLowerCase(),
    ...s.aliases,
  ]),
);

// resolves which master-data endpoint a select field should use — static
// for common fields (including OutwardTransportMode, which is common but
// module-gated for visibility), module-driven for DeclarationType/DeclaringFor
function resolveSpecEndpoint(spec, moduleConfig) {
  if (spec.key === "DeclarationType")
    return moduleConfig.declarationTypeEndpoint;
  if (spec.key === "DeclaringFor") return moduleConfig.declaringForEndpoint;
  return spec.endpoint;
}

function resolveFallback(spec, moduleConfig) {
  if (spec.key === "MessageType") return moduleConfig.messageType;
  return spec.default ?? (spec.type === "checkbox" ? false : "");
}

// A field is hidden for the active module if it declares
// `moduleVisibilityKey` and moduleConfig doesn't set that flag truthy.
// Add `hasOutwardTransportMode: true` to the Out and InNonpayment entries
// in moduleConfig.js (and leave it unset/false for Inpayment) to match
// each module's legacy Header.jsx exactly.
function isVisibleForModule(spec, moduleConfig) {
  if (!spec.moduleVisibilityKey) return true;
  return !!moduleConfig[spec.moduleVisibilityKey];
}

// Effective value of a header field: the real value from `data`, otherwise
// the same fallback/default the field displays.
function readSpecValue(data, specKey, moduleConfig) {
  const spec = HEADER_FIELD_SPECS.find((s) => s.key === specKey);
  if (!spec) return "";
  const key = findRowKey(data, spec.aliases);
  const raw = key ? data[key] : undefined;
  if (raw !== undefined && raw !== null && raw !== "") return raw;
  return resolveFallback(spec, moduleConfig);
}

// ---------------------------------------------------------------------------
// Change side-effects — what the legacy handlers WROTE when a select changed
// (clear the transport fields, default the UOMs, ...). The rules themselves
// are in headerRules.js; this only turns a "patch" into onEdit calls.
// ---------------------------------------------------------------------------
function isPlainObject(val) {
  return val !== null && typeof val === "object" && !Array.isArray(val);
}

// patch ids are CARGO_FIELD_SPECS keys, plus the two unit fields
function specForPatchId(id) {
  const S = CARGO_FIELD_SPECS;
  if (id === "totalOuterPackUnit")
    return { key: "TotalOuterPackUnit", aliases: S.totalOuterPack.unitAliases };
  if (id === "totalGrossWeightUnit")
    return {
      key: "TotalGrossWeightUnit",
      aliases: S.totalGrossWeight.unitAliases,
    };
  return S[id];
}

function clearLocation(spec, data, onEdit) {
  if (!spec) return;
  const nestedKey = findRowKey(data, spec.nestedAliases);
  if (nestedKey && isPlainObject(data[nestedKey])) {
    const codeKey = findRowKey(data[nestedKey], ["code"]);
    const nameKey = findRowKey(data[nestedKey], ["name"]);
    if (codeKey && data[nestedKey][codeKey]) onEdit([nestedKey, codeKey], "");
    if (nameKey && data[nestedKey][nameKey]) onEdit([nestedKey, nameKey], "");
    return;
  }
  [spec.codeAliases, spec.nameAliases].forEach((aliases) => {
    const key = findRowKey(data, aliases);
    if (key && data[key]) onEdit([key], "");
  });
}

function applyPatch(patch, data, onEdit) {
  // only blank fields that exist and hold something — avoids creating empty keys
  (patch.clear || []).forEach((id) => {
    const spec = specForPatchId(id);
    if (!spec) return;
    const key = findRowKey(data, spec.aliases);
    if (key && data[key] !== "" && data[key] != null) onEdit([key], "");
  });

  Object.entries(patch.set || {}).forEach(([id, value]) => {
    const spec = specForPatchId(id);
    if (!spec) return;
    onEdit([findRowKey(data, spec.aliases) || spec.key], value);
  });

  (patch.clearLocations || []).forEach((id) =>
    clearLocation(CARGO_FIELD_SPECS[id], data, onEdit),
  );
}

function runSideEffects({ specKey, value, data, moduleConfig, onEdit }) {
  const moduleKey = getModuleKey(moduleConfig);
  const cargoPackType = readSpecValue(data, "CargoPackType", moduleConfig);

  if (specKey === "InwardTransportMode") {
    applyPatch(
      getInwardModeChangePatch(moduleKey, value, cargoPackType),
      data,
      onEdit,
    );
  } else if (specKey === "OutwardTransportMode") {
    applyPatch(
      getOutwardModeChangePatch(moduleKey, value, cargoPackType),
      data,
      onEdit,
    );
  } else if (specKey === "CargoPackType") {
    applyPatch(
      getCargoPackChangePatch(
        moduleKey,
        value,
        readSpecValue(data, "InwardTransportMode", moduleConfig),
        readSpecValue(data, "OutwardTransportMode", moduleConfig),
      ),
      data,
      onEdit,
    );
  }
}

// ---------------------------------------------------------------------------
// Generic master-options fetcher — same caching pattern used elsewhere in
// this codebase (useTermTypeOptions/useCurrencyOptions in invoiceTab.js),
// duplicated here rather than imported to match that existing convention.
// ---------------------------------------------------------------------------

const masterOptionsCache = {};

function useMasterOptions(endpoint) {
  const [options, setOptions] = useState(
    () => masterOptionsCache[endpoint] || [],
  );

  useEffect(() => {
    if (!endpoint || endpoint.startsWith("TODO_")) return; // guard against unresolved placeholders
    if (masterOptionsCache[endpoint]) {
      setOptions(masterOptionsCache[endpoint]);
      return;
    }
    let cancelled = false;
    API.get(endpoint)
      .then((response) => {
        masterOptionsCache[endpoint] = response.data || [];
        if (!cancelled) setOptions(masterOptionsCache[endpoint]);
      })
      .catch((error) => {
        console.error(`Error fetching options from ${endpoint}`, error);
      });
    return () => {
      cancelled = true;
    };
  }, [endpoint]);

  return options;
}

function HeaderSelectField({ endpoint, value, onChange, fallback }) {
  const fetchedOptions = useMasterOptions(endpoint);
  const options =
    fetchedOptions.length > 0
      ? fetchedOptions.map((o) => o.Name)
      : fallback
        ? [fallback]
        : [];

  return (
    <select
      value={value ?? ""}
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
      <option value="">--Select--</option>
      {value && !options.includes(value) && (
        <option value={value}>{value}</option>
      )}
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  );
}

// ---------------------------------------------------------------------------
// License section — shown only when ReferenceDocument is checked. Stored as
// 5 separate top-level fields (License1..License5) for easy editing; join
// into the single comma-joined "License" string your legacy save payload
// expects at save time (in postHeader), not here.
// ---------------------------------------------------------------------------

function LicenseSection({ data, onEdit }) {
  return (
    <div
      style={{
        gridColumn: "1 / -1",
        border: `1px solid ${C.panelBorder}`,
        borderRadius: 6,
        padding: 12,
        marginTop: 4,
      }}
    >
      <div
        style={{
          fontWeight: 800,
          fontSize: 11.5,
          color: C.navy,
          marginBottom: 8,
        }}
      >
        LICENSE
      </div>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr",
          gap: "8px 12px",
        }}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <EditableInput
            key={n}
            compact
            placeholder={`Licence ${n}`}
            value={data[`License${n}`]}
            onChange={(v) => onEdit([`License${n}`], v)}
          />
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Out-only: CO Type + Certificate of Origin block.
// Mirrors legacy: Certificate of Origin section shows once CoType has a
// value (OutCoTypeChange sets showCertificateOfOrigin = coType !== "").
// Gated by moduleConfig.hasCoType — true only for Out, matching its
// legacy Header.jsx (InNonpayment and Inpayment never have CO Type) — and by
// getDeclarationRules().coType (hidden for BKT declarations).
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
        currencyCache.list = response.data || [];
        if (!cancelled) setOptions(currencyCache.list);
      })
      .catch((error) => console.error("Error fetching currency list", error));
    return () => {
      cancelled = true;
    };
  }, []);
  return options;
}

function CoTypeAndCertificateSection({ data, onEdit, moduleConfig }) {
  const coTypeOptions = useMasterOptions(moduleConfig.coTypeEndpoint);
  const certificateOptions = useMasterOptions(
    moduleConfig.certificateTypeEndpoint,
  );
  const currencyOptions = useCurrencyOptions();

  const coType = data.CoType || "";
  const showCertificateOfOrigin = !!coType; // mirrors legacy OutCoTypeChange

  return (
    <>
      <div style={{ gridColumn: "1 / -1" }}>
        <span
          className="decl-field-label"
          style={{
            display: "block",
            marginBottom: 6,
            color: C.navy,
            fontWeight: 800,
            fontSize: 12,
          }}
        >
          CO Type
        </span>
        <HeaderSelectField
          endpoint={moduleConfig.coTypeEndpoint}
          value={coType}
          onChange={(v) => onEdit(["CoType"], v)}
        />
      </div>

      {showCertificateOfOrigin && (
        <div
          style={{
            gridColumn: "1 / -1",
            border: `1px solid ${C.panelBorder}`,
            borderRadius: 6,
            padding: 12,
          }}
        >
          <div
            style={{
              fontWeight: 800,
              fontSize: 11.5,
              color: C.navy,
              marginBottom: 10,
            }}
          >
            CERTIFICATE OF ORIGIN
          </div>
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(3, 1fr)",
              gap: 12,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: C.sub,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Certificate Type 1
              </span>
              <HeaderSelectField
                endpoint={moduleConfig.certificateTypeEndpoint}
                value={data.CertificateType1}
                onChange={(v) => onEdit(["CertificateType1"], v)}
              />
            </div>
            <div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: C.sub,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Copies 1
              </span>
              <EditableInput
                compact
                value={data.CertificateCopy1}
                onChange={(v) => onEdit(["CertificateCopy1"], v)}
              />
            </div>
            <div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: C.sub,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Currency Code
              </span>
              <select
                value={data.CurrencyCode ?? ""}
                onChange={(e) => onEdit(["CurrencyCode"], e.target.value)}
                style={{
                  border: `1px solid ${C.inputBorder}`,
                  borderRadius: 4,
                  padding: "6px 8px",
                  fontSize: 12.5,
                  width: "100%",
                  boxSizing: "border-box",
                }}
              >
                <option value="">--Select--</option>
                {currencyOptions.map((c) => (
                  <option key={c.Currency} value={c.Currency}>
                    {c.Currency}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: C.sub,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Certificate Type 2
              </span>
              <HeaderSelectField
                endpoint={moduleConfig.certificateTypeEndpoint}
                value={data.CertificateType2}
                onChange={(v) => onEdit(["CertificateType2"], v)}
              />
            </div>
            <div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: C.sub,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Copies 2
              </span>
              <EditableInput
                compact
                value={data.CertificateCopy2}
                onChange={(v) => onEdit(["CertificateCopy2"], v)}
              />
            </div>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 1fr",
              gap: 12,
              marginTop: 12,
            }}
          >
            <div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: C.sub,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Additional Certificate Details
              </span>
              {[1, 2, 3, 4, 5].map((n) => (
                <EditableInput
                  key={n}
                  compact
                  value={data[`AdditionalCertificateDetails${n}`]}
                  onChange={(v) =>
                    onEdit([`AdditionalCertificateDetails${n}`], v)
                  }
                  placeholder={`Detail ${n}`}
                />
              ))}
            </div>
            <div>
              <span
                style={{
                  fontSize: 10.5,
                  fontWeight: 700,
                  color: C.sub,
                  display: "block",
                  marginBottom: 4,
                }}
              >
                Transport Details
              </span>
              {[1, 2, 3, 4, 5].map((n) => (
                <EditableInput
                  key={n}
                  compact
                  value={data[`TransportDetails${n}`]}
                  onChange={(v) => onEdit([`TransportDetails${n}`], v)}
                  placeholder={`Detail ${n}`}
                />
              ))}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// HeaderTabContent — module-aware.
//
//   moduleConfig   — from getModuleConfig(activeModule); required. Must
//                    provide `messageType` (IPTDEC / INPDEC / OUTDEC — it
//                    selects the show/hide rules), `hasOutwardTransportMode:
//                    true` for Out and InNonpayment (leave false/unset for
//                    Inpayment) and `hasCoType: true` for Out only.
//   fieldConfig    — { showDeclaringFor: boolean }. Placeholder default
//                    { showDeclaringFor: true } until accountFieldConfig.js
//                    is wired in — replace with the real per-account lookup
//                    once shared.
//
// Visibility that depends on the Declaration Type comes from
// getDeclarationRules(); the "clear the transport fields / default the UOMs"
// behaviour of the legacy mode-change handlers runs in runSideEffects().
// ---------------------------------------------------------------------------

export default function HeaderTabContent({
  data,
  onEdit,
  moduleConfig,
  accountId,
}) {
  const fieldConfig = getFieldConfig(accountId);
  const moduleKey = getModuleKey(moduleConfig);
  const rules = getDeclarationRules(
    moduleKey,
    readSpecValue(data, "DeclarationType", moduleConfig),
  );

  const handleSelectChange = (spec, writeKey, value) => {
    onEdit([writeKey], value);
    runSideEffects({ specKey: spec.key, value, data, moduleConfig, onEdit });
  };

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: "10px 14px",
      }}
    >
      {HEADER_FIELD_SPECS.map((spec) => {
        if (spec.key === "DeclaringFor" && !fieldConfig.showDeclaringFor)
          return null;
        if (!isVisibleForModule(spec, moduleConfig)) return null;
        if (spec.ruleKey && !rules[spec.ruleKey]) return null;

        const existingKey = findRowKey(data, spec.aliases);
        const rawValue = existingKey ? data[existingKey] : undefined;
        const hasRealValue =
          rawValue !== undefined && rawValue !== null && rawValue !== "";
        const fallback = resolveFallback(spec, moduleConfig);
        const value = hasRealValue ? rawValue : fallback;
        const writeKey = existingKey || spec.key;
        const endpoint = resolveSpecEndpoint(spec, moduleConfig);

        return (
          <div key={spec.key} className="decl-field-row">
            <span
              className="decl-field-label"
              style={{
                display: "block",
                marginBottom: 6,
                color: C.navy,
                fontWeight: 800,
                fontSize: 12,
              }}
            >
              {spec.label}
              {spec.required && <span style={{ color: C.danger }}> *</span>}
            </span>
            <span className="decl-field-value">
              {spec.type === "checkbox" ? (
                <input
                  type="checkbox"
                  checked={!!value}
                  onChange={(e) => onEdit([writeKey], e.target.checked)}
                  style={{ width: 16, height: 16, accentColor: C.bar }}
                />
              ) : spec.type === "select" ? (
                <HeaderSelectField
                  endpoint={endpoint}
                  value={value}
                  onChange={(v) => handleSelectChange(spec, writeKey, v)}
                  fallback={spec.default}
                />
              ) : (
                <EditableInput
                  compact
                  value={value}
                  disabled={spec.disabled}
                  onChange={(v) => onEdit([writeKey], v)}
                />
              )}
            </span>
          </div>
        );
      })}

      {data.ReferenceDocument && <LicenseSection data={data} onEdit={onEdit} />}

      {moduleConfig.hasCoType && rules.coType && (
        <CoTypeAndCertificateSection
          data={data}
          onEdit={onEdit}
          moduleConfig={moduleConfig}
        />
      )}
    </div>
  );
}