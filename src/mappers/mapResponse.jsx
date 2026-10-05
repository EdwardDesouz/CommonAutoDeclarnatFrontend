import { mapInpayment } from "./mapInpayment";
import { mapInnonpayment } from "./mapInnonpayment";
import { mapOut } from "./mapOut";

const MAPPERS = {
  inpayment: mapInpayment,
  innonpayment: mapInnonpayment,
  out: mapOut,
};

const WRAPPERS = ["json", "output", "data", "result", "body", "response"];

function unwrap(raw) {
  let v = raw;
  for (let i = 0; i < 6; i++) {
    if (typeof v === "string") {
      try {
        v = JSON.parse(v.trim().replace(/^```(?:json)?|```$/gi, ""));
        continue;
      } catch {
        return v;
      }
    }
    if (v && typeof v === "object" && !Array.isArray(v)) {
      const keys = Object.keys(v);
      if (keys.length === 1 && WRAPPERS.includes(keys[0].toLowerCase())) {
        v = v[keys[0]];
        continue;
      }
    }
    break;
  }
  return v;
}

export function mapResponse(moduleType, raw) {
  const fn = MAPPERS[moduleType];
  if (!raw || !fn) return raw;
  const v = unwrap(raw);
  if (Array.isArray(v)) return v.map((x) => fn(unwrap(x)));
  return v && typeof v === "object" ? fn(v) : null;
}

export function moduleMismatch(moduleType, raw) {
  const v = unwrap(raw);
  const first = Array.isArray(v) ? unwrap(v[0]) : v;
  const ie = String(first?.shipment?.import_export || "").toUpperCase();
  if (!ie || /MISSING/.test(ie)) return null;
  return (ie === "EXPORT") !== (moduleType === "out")
    ? `n8n says ${ie}, but module is "${moduleType}"`
    : null;
}