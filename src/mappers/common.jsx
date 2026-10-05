const MISSING = /^\s*MISSING\s*\/\s*NOT CONFIRMED\s*$/i;

export const clean = (v) => (v == null || MISSING.test(String(v)) ? "" : v);

export const firstName = (s) => String(clean(s)).split(",")[0].trim();

export const toDDMMYYYY = (v) => {
  const s = String(clean(v)).trim();
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}/${m[2]}/${m[1]}`;
  return /^\d{2}\/\d{2}\/\d{4}$/.test(s) ? s : "";
};

const TERM_TYPES = {
  FOB: "FOB : Free On Board",
  CIF: "CIF : Cost,Insurance and Frieght",
  CFR: "CFR : Cost and Frieght ( also known as C & F )",
  CNI: "CNI : Cost and Insurance (also Known as C & I )",
  EXW: "EXW : Exw Works (also known as Ex-Factory)",
  FAS: "FAS : Free Alongside Ship",
};

export const mapTerm = (v) => {
  const key = String(clean(v)).replace(/[^A-Za-z]/g, "").toUpperCase();
  return TERM_TYPES[key] || "";
};

export const valueRow = (o = {}) => ({
  charges: "",
  currency: "",
  exRate: "",
  amount: "",
  amountSgd: "",
  ...o,
});

// first non-empty value among candidate keys (MISSING skip aagum)
export const pick = (obj = {}, ...keys) => {
  for (const k of keys) {
    const v = clean(obj[k]);
    if (v !== "" && v != null) return v;
  }
  return "";
};

// "12.5 KG" -> "12.5"
export const num = (v) => {
  const m = String(clean(v)).replace(/,/g, "").match(/\d+(\.\d+)?/);
  return m ? m[0] : "";
};

export const party = (name) => ({
  Code: name,
  CRUEI: "",
  Name: name,
  Name1: "",
});

const isStamp = (v) => /^\d{4}-\d{2}-\d{2}/.test(String(v));

// "2026-09-26 03:21:42" maadhiri timestamp invoice number ah vandha blank
export const cleanInvoiceNo = (v) => {
  const s = String(clean(v)).trim();
  return isStamp(s) ? "" : s;
};

export const mapInvoice = (inv = {}) => ({
  invoiceNumber: cleanInvoiceNo(inv.invoice_no),
  invoiceDate: toDDMMYYYY(inv.invoice_date),
  termType: mapTerm(inv.incoterm),
  invoiceValue: valueRow({
    currency: clean(inv.currency),
    amount: num(inv.invoice_value),
  }),
  ...(Number(num(inv.freight)) > 0
    ? { freightValue: valueRow({ amount: num(inv.freight) }) }
    : {}),
});

export const mapItems = (items = []) =>
  (Array.isArray(items) ? items : []).map((it) => {
    const q = Number(clean(it.quantity)) || 0;
    const u = Number(clean(it.unit_value)) || 0;
    const t = Number(clean(it.total_value)) || 0;
    // qty*unit != total, aana total/unit whole number na adhai qty ah edu
    const qty = u && t && q * u !== t && Number.isInteger(t / u) ? t / u : q;
    return {
      code: String(clean(it.hs_code)).slice(0, 8),
      description: clean(it.description),
      quantity: qty ? String(qty) : "",
      unitValue: u ? String(u) : "",
      totalValue: t ? String(t) : "",
      countryOfManufacture: clean(it.coo),
      country: clean(it.coo),
    };
  });

export const parts = (r = {}) => ({
  s: r.shipment || {},
  p: r.parties || {},
  inv: r.invoice || {},
});