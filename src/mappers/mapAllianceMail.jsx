const ALLIANCE_DEFAULTS = {
  OutwardTransportMode: "1 : Sea",
  DeclarationType: "DRT : DIRECT (INCLUDING STORAGE IN FTZ)",
  DeclaringFor: "ALLIANCEMOVERS-EXP",
  CARGO_CONTAINERISED: "9: Containerized",
  CARGO_NON_CONTAINERISED: "5 : Other non-Containerized",
  VESSEL_TYPE: "CV : CARGO VESSEL",
  TERM_TYPE: "",
  ITEM_HS_CODE: "98920021",
};

const WEIGHT_UNITS = { KG: "KGM", KGS: "KGM", KGM: "KGM", MT: "TNE", TNE: "TNE" };

const PACK_UNITS = { CASE: "CAS", CASES: "CAS" };

const compact = (o) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v != null));

const party = (name) =>
  name ? { Code: "", CRUEI: "", Name: String(name).trim(), Name1: "" } : undefined;

const loc = (v, codeOk = false) => {
  if (!v) return undefined;
  const s = String(v).trim();
  return codeOk && /^[A-Z0-9]{1,4}$/i.test(s)
    ? { Code: s.toUpperCase(), Name: "" }
    : { Code: "", Name: s };
};

export function mapAllianceMail(x = {}) {
  const u = String(x.total_gross_weight_unit || "").trim().toUpperCase();
  const numbers = x.container_numbers || [];
  const seals = x.seal_numbers || [];

  const containers = numbers.map((n, i) => ({
    id: i + 1,
    number: n,
    sizeType: "",
    weight: "",
    seal: seals[i] || "",
    isSaved: false,
    isChecked: false,
  }));

  const isContainerised = containers.some((c) => c.number && c.seal);

  if (numbers.length && !isContainerised) {
    console.warn("Container no present but no seal -> Non-Containerized");
  }

  return {
    ...compact({
      // ---- Header defaults ----
      OutwardTransportMode: ALLIANCE_DEFAULTS.OutwardTransportMode,
      DeclarationType: ALLIANCE_DEFAULTS.DeclarationType,
      DeclaringFor: ALLIANCE_DEFAULTS.DeclaringFor,
      CargoPackType: isContainerised
        ? ALLIANCE_DEFAULTS.CARGO_CONTAINERISED
        : ALLIANCE_DEFAULTS.CARGO_NON_CONTAINERISED,

      // ---- Party ----
      Exporter: party(x.exporter),
      OutwardCarrierAgent: party(x.outward_carrier_agent),

      // ---- Cargo ----
      TotalGrossWeight: x.total_gross_weight,
      TotalGrossWeightUnit: WEIGHT_UNITS[u] || u,
      TotalOuterPack: x.total_outer_pack,
      TotalOuterPackUnit:
        PACK_UNITS[String(x.total_outer_pack_unit || "").toUpperCase()] ||
        x.total_outer_pack_unit,

      DischargePort: loc(x.port_of_discharge),
      ReceiptLocation: loc(x.place_of_receipt, true),
      FinalDestinationCountry: x.country_of_final_destination,
      DepartureDate: x.departure_date,

      OutVesselName: x.outward_transport_id,
      VesselType: ALLIANCE_DEFAULTS.VESSEL_TYPE,
      OutVoyageNumber: x.conveyance_reference_no,
      OutObl: x.obl_mawb_ucr_no,

      Containers: isContainerised ? containers : undefined,

      // ---- Invoice form (Currency + Amount from mail) ---- 
      invoice:
        x.currency || x.value
          ? {
            invoiceDate: "",
            invoiceNumber: "",
            termType: ALLIANCE_DEFAULTS.TERM_TYPE,
            supplierImporterRelationship: "",
            preferentialDutyRateIndicator: false,
            invoiceValue: {
              charges: "",
              currency: x.currency || "",
              exRate: "",
              amount: x.value || "",
              amountSgd: "",
            },
            costInsuranceFreight: { amountSgd: "" },
          }
          : undefined,
    }),
    items: [
      {
        HSCode: ALLIANCE_DEFAULTS.ITEM_HS_CODE,
        TotalLineAmount: x.value || "",
      },
    ],
    _mapped: true,
  };

}