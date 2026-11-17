import {
  clean, firstName, mapInvoice, mapItems,
  parts, pick, num, party,
} from "./common";

const MISSING = /^\s*MISSING\s*\/\s*NOT CONFIRMED\s*$/i;

const stripMissing = (v) => {
  if (typeof v === "string") return MISSING.test(v) ? "" : v;
  if (Array.isArray(v)) return v.map(stripMissing);
  if (v && typeof v === "object")
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, stripMissing(x)]));
  return v;
};

const digits = (s) => {
  const m = String(s ?? "").match(/\d[\d,]*\.?\d*/);
  return m ? m[0].replace(/,/g, "") : "";
};

const splitQty = (s) => {
  const w = String(s ?? "").toLowerCase();
  const unit = /carton|ctn/.test(w) ? "CTN" : /pallet|plt/.test(w) ? "PLT"
    : /pack|pkg/.test(w) ? "PKG" : /box/.test(w) ? "BOX" : "";
  return { qty: digits(s), unit };
};

const toDate = (s) => {
  const m = String(s ?? "").match(/(\d{2})\/(\d{2})\/(\d{4})/);
  return m ? `${m[1]}/${m[2]}/${m[3]}` : "";
};

export function mapOut(r) {
  const { s, p, inv } = parts(r);
  const hawb = pick(s, "hawb", "reference_no");
  const mawb = pick(s, "mawb");

  const { qty, unit } = splitQty(pick(s, "total_qty", "no_of_packages", "packages"));
  const wtRaw = String(pick(s, "gross_weight", "weight") ?? "");

  // ---- idha add pannunga (flight + departure) ----
  const flight = String(pick(s, "flight_number") ?? "").split("/")[0].trim();
  const depDate = toDate(pick(s, "departure_date"));

  return stripMissing({
    ConsignmentNo: pick(s, "reference_no", "hawb"),

    Hawb: hawb,
    OutHawb: hawb,
    Mawb: mawb,
    OutMawb: mawb,
    CrossReference: pick(s, "reference_no"),

    TotalOuterPack: qty,
    TotalOuterPackUnit: unit,
    TotalGrossWeight: digits(wtRaw),
    TotalGrossWeightUnit: /\bk/i.test(wtRaw) ? "KGM" : "",

    OutFlightNumber: flight,   // OUTWARD DETAILS > Flight Number
    DepartureDate: depDate,    // OUTWARD DETAILS > Departure Date

    Exporter: party(firstName(pick(p, "exporter"))),
    Importer: party(firstName(pick(p, "importer"))),
    Consignee: party(firstName(pick(p, "consignee"))),

    invoice: mapInvoice(inv),
    items: mapItems(r.items),
    _source: { import_export: clean(s.import_export), review: r._review },
  });
}