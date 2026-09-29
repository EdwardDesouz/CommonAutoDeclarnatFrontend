import InpaymentItem from "./InpaymentItem";
import InnonpaymentItem from "./InnonpaymentItem";
import OutItem from "./OutItem";

// Shows ONLY the selected module's item page.
export default function ItemsTabContent({ activeModule, ...props }) {
  switch (activeModule) {
    case "inpayment":
      return <InpaymentItem {...props} />;
    case "innonpayment":
      return <InnonpaymentItem {...props} />;
    case "out":
      return <OutItem {...props} />;
    default:
      return null;
  }
}