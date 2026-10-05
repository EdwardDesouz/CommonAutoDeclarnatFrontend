import {
  clean, firstName, toDDMMYYYY, mapInvoice, mapItems,
  parts, pick, num, party,
} from "./common";

export function mapInpayment(r) {
  const { s, p, inv } = parts(r);
  const importerName = firstName(pick(p, "importer", "consignee"));

  return {
    // PermitId on purpose drop: "New" click pannina fresh ah varum
    ConsignmentNo: pick(s, "reference_no", "hawb"),
    Hawb: pick(s, "hawb", "hbl", "reference_no"),
    Mawb: pick(s, "mawb"),

    // n8n idhellam anuppina auto fill aagum
    TotalOuterPack: num(pick(s, "no_of_packages", "packages")),
    TotalGrossWeight: num(pick(s, "gross_weight", "weight")),
    ArrivalDate: toDDMMYYYY(pick(s, "arrival_date")),
    FlightNumber: pick(s, "flight_no"),
    LoadingPort: { Code: pick(s, "loading_port"), Name: "" },

    Importer: party(importerName),

    invoice: mapInvoice(inv),
    items: mapItems(r.items),
    _source: { import_export: clean(s.import_export), review: r._review },
  };
}