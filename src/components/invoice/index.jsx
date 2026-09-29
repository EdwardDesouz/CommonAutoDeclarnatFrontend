import InpaymentInvoice from "./InpaymentInvoice";
import InnonpaymentInvoice from "./InnonpaymentInvoice";
import OutInvoice from "./OutInvoice";

// Shows ONLY the selected module's invoice page.
export default function InvoiceTabContent({ activeModule, ...props }) {
  switch (activeModule) {
    case "inpayment":
      return <InpaymentInvoice {...props} />;
    case "innonpayment":
      return <InnonpaymentInvoice {...props} />;
    case "out":
      return <OutInvoice {...props} />;
    default:
      return null;
  }
}