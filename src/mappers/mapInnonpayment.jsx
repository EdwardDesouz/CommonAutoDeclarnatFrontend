import { mapInpayment } from "./mapInpayment";
import { firstName, pick, party } from "./common";
import { parts } from "./common";

export function mapInnonpayment(r) {
  const { p } = parts(r);
  return {
    ...mapInpayment(r),
    Exporter: party(firstName(pick(p, "exporter"))),
    Consignee: party(firstName(pick(p, "consignee"))),
  };
}