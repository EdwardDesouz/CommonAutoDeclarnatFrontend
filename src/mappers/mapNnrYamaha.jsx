const GE_DEFAULTS = {
  OutwardTransportMode: "4 : Air",
  DeclarationType: "DRT : DIRECT (INCLUDING STORAGE IN FTZ)",
  CARGO_NON_CONTAINERISED: "5 : Other non-Containerized",
};

const GE_PARTIES = {
  Exporter: {
    Code: "YAMAHA",
    CRUEI: "200300872R",
    Name: "YAMAHA MOTOR DISTRIBUTION SINGAPORE",
    Name1: "PTE. LTD.",
    Postel: "408600",
    Country: "SG",
  },
  OutwardCarrierAgent: {
    Code: "SATS LTD",
    CRUEI: "197201770G",
    Name: "SATS LTD.",
    Name1: "",
  },
  FreightForwarder: {
    Code: "NNR GLOBAL LOGISTICS (S) PTE LTD",
    CRUEI: "199409260K",
    Name: "NNR GLOBAL LOGISTICS (S) PTE LTD",
    Name1: "",
  },
};

const compact = (o) =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== "" && v != null));

const loc = (v) => (v ? { Code: "", Name: String(v).trim() } : undefined);

export function mapNnrYamahaMail(x = {}) {
  return {
    ...compact({
      // ---- Header defaults ----
      OutwardTransportMode: GE_DEFAULTS.OutwardTransportMode,
      DeclarationType: GE_DEFAULTS.DeclarationType,
      CargoPackType: GE_DEFAULTS.CARGO_NON_CONTAINERISED,

      // ---- Party defaults ----
      ...GE_PARTIES,

      // ---- Location defaults ----
      ReleaseLocation: { Code: "O", Name: "IMPORTER / EXPORTER OWN PREMISES" },
      ReceiptLocation: { Code: "CZ", Name: "CHANGI FTZ" },

      // ---- From mail (only filled if the parser found them) ----
      TotalGrossWeight: x.total_gross_weight,
      TotalGrossWeightUnit: x.total_gross_weight_unit,
      TotalOuterPack: x.total_outer_pack,
      TotalOuterPackUnit: x.total_outer_pack_unit,
      DischargePort: loc(x.port_of_discharge),
      FinalDestinationCountry: x.country_of_final_destination,
      DepartureDate: x.departure_date,
    }),
    _mapped: true,
  };
}