import InpaymentItem from "./Inpaymentitem";
import InnonpaymentItem from "./Innonpaymentitem";
import OutItem from "./Outitem";

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