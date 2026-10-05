import {
  clean, firstName, mapInvoice, mapItems,
  parts, pick, num, party,
} from "./common";

export function mapOut(r) {
  const { s, p, inv } = parts(r);
  const hawb = pick(s, "hawb", "reference_no");
  const mawb = pick(s, "mawb");

  return {
    ConsignmentNo: pick(s, "reference_no", "hawb"),

    // Out Cargo tab OutHawb / OutMawb padikkum, Hawb/Mawb Summary ku
    Hawb: hawb,
    OutHawb: hawb,
    Mawb: mawb,
    OutMawb: mawb,

    TotalOuterPack: num(pick(s, "no_of_packages", "packages")),
    TotalGrossWeight: num(pick(s, "gross_weight", "weight")),

    Exporter: party(firstName(pick(p, "exporter"))),
    Consignee: party(firstName(pick(p, "consignee"))),

    invoice: mapInvoice(inv),
    items: mapItems(r.items),
    _source: { import_export: clean(s.import_export), review: r._review },
  };
}