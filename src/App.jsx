import { useEffect, useState, useCallback, useRef, useMemo } from "react";
import EmailSidebar from "./components/EmailSidebar";
import PdfViewer from "./components/PdfViewer";
import DeclarationPanel from "./components/DeclarationPanel";
import { mapResponse, moduleMismatch } from "./mappers/mapResponse";
import {
  fetchEmails,
  fetchEmailDetail,
  fetchAttachments,
  notifyN8n,
  dismissEmail,
  completeEmail,
} from "./api/client";
import { mapAllianceMail } from "./mappers/mapAllianceMail";
import { parseAllianceMail } from "./helpers/parseAllianceMail";
// NNR
import { mapNnrGeEngineMail } from "./mappers/mapNNrGeEngineMail";
import { mapNnrGeMaterialsMail } from "./mappers/mapNnrGeMaterials";
import { mapNnrZebraTechMail } from "./mappers/mapNnrZebraTech";
import { mapNnrYamahaMail } from "./mappers/mapNnrYamaha";

// Placeholder until a real GE mail parser exists: returns no fields, so only
// the defaults from the mapper apply.
const parseGeMail = () => ({});

const CUSTOMER_FLOWS = {
  "ALLIANCE MOVERS": { parse: parseAllianceMail, map: mapAllianceMail },
  "GE ENGINE": { parse: parseGeMail, map: mapNnrGeEngineMail, n8n: true },
  "GE MATERIALS": { parse: parseGeMail, map: mapNnrGeMaterialsMail, n8n: true },
  "ZEBRA TECH": { parse: parseGeMail, map: mapNnrZebraTechMail, n8n: true },
  "YAMAHA": { parse: parseGeMail, map: mapNnrYamahaMail, n8n: true },
};

const isObj = (v) => v && typeof v === "object" && !Array.isArray(v);

// Defaults win wherever they have a value. Fields the defaults leave blank
// (or don't mention) are filled from the n8n response.
function mergeDefaults(n8nMapped, defaults) {
  const merge = (base, over) => {
    if (!isObj(base) || !isObj(over)) return over ?? base;
    const out = { ...base };
    for (const [k, v] of Object.entries(over)) {
      if (isObj(v) && isObj(base[k])) {
        out[k] = merge(base[k], v);
      } else if (v !== "" && v != null) {
        out[k] = v;
      }
    }
    return out;
  };

  const apply = (item) => ({
    ...merge(isObj(item) ? item : {}, defaults),
    _mapped: true,
  });

  return Array.isArray(n8nMapped) ? n8nMapped.map(apply) : apply(n8nMapped);
}

const POLL_INTERVAL_MS = 5000;

function formatSyncTime(date) {
  return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

export default function App() {
  const [accounts, setAccounts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedEmail, setSelectedEmail] = useState(null);
  const [attachments, setAttachments] = useState([]);
  const [rawDeclaration, setRawDeclaration] = useState(null);
  const [moduleType, setModuleType] = useState(null);
  const [busy, setBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState(new Date());
  const [activeCustomer, setActiveCustomer] = useState(null);
  const [customerLogin, setCustomerLogin] = useState(null);
  const activeRequest = useRef(null);

  // Memoized so the panel's form state is not reset on every render
  const declaration = useMemo(
    () => mapResponse(moduleType, rawDeclaration),
    [moduleType, rawDeclaration],
  );

  const loadEmails = useCallback(async () => {
    try {
      const data = await fetchEmails();
      setAccounts(data.results || []);
      setSyncedAt(new Date());
    } catch (err) {
      console.error("Failed to load emails", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadEmails();
    const interval = setInterval(loadEmails, POLL_INTERVAL_MS);
    return () => clearInterval(interval);
  }, [loadEmails]);

  const totalPending = accounts.reduce((sum, a) => sum + (a.count || 0), 0);

  const resetSelection = () => {
    activeRequest.current = null;
    setSelectedEmail(null);
    setAttachments([]);
    setRawDeclaration(null);
    setModuleType(null);
    setActiveCustomer(null);
    setCustomerLogin(null);
    setBusy(false);
  };

  const handleSelect = async (email) => {
    activeRequest.current = email.id;
    setAttachments([]);
    setRawDeclaration(null);
    setModuleType(null);
    setActiveCustomer(null);
    setCustomerLogin(null);
    setBusy(true);

    let mod = email.module_type || null;

    try {
      const [detail, attData] = await Promise.all([
        fetchEmailDetail(email.id),
        fetchAttachments(email.id),
      ]);
      if (activeRequest.current !== email.id) return;
      mod = detail.module_type || mod;
      setModuleType(mod);
      setSelectedEmail({ ...email, ...detail, body_preview: detail.body });
      setAttachments(attData.attachments || attData || []);
    } catch (err) {
      console.error("Failed to load email detail/attachments", err);
      if (activeRequest.current === email.id) {
        setSelectedEmail(email);
        setBusy(false);
      }
      return;
    }

    // OPERATION / test_agent / nnr_export mails: no n8n call here.
    // Extraction happens only after a customer is clicked.
    if (["OPERATION", "test_agent", "nnr_export"].includes(email.mailboxId)) {
      if (activeRequest.current === email.id) setBusy(false);
      return;
    }

    try {
      const n8nResult = await notifyN8n(email.id);
      if (activeRequest.current !== email.id) return;
      console.log("n8n raw response:", n8nResult);

      const raw = n8nResult?.n8n_response || null;
      const warn = moduleMismatch(mod, raw);
      if (warn) console.warn(warn);

      setRawDeclaration(raw);
    } catch (err) {
      if (activeRequest.current !== email.id) return;
      if (err.response?.data?.code !== "NO_PDF") {
        console.error(
          "n8n declaration extraction failed:",
          err.message,
          "| status:", err.response?.status,
          "| body:", err.response?.data,
        );
      }
      setRawDeclaration(null);
    } finally {
      if (activeRequest.current === email.id) setBusy(false);
    }
  };

  const handleCustomerSelect = async ({ customer, login, email }) => {
    if (!login) {
      alert(`No login mapped for ${customer}`);
      return;
    }
    activeRequest.current = email.id;
    setActiveCustomer(customer);
    setCustomerLogin(login);
    setSelectedEmail((cur) => ({
      ...(cur || email),
      touch_username: login.touchUsername,
      touchUsername: login.touchUsername,
      mailboxUsername: login.touchUsername,
      accountId: login.accountId,
      account_id: login.accountId,
    }));
    setModuleType("out");

    // Customers without a flow: login only, no extraction
    const flow = CUSTOMER_FLOWS[customer.trim().toUpperCase()];
    if (!flow) {
      setRawDeclaration(null);
      setBusy(false);
      return;
    }

    const mailText =
      selectedEmail?.body_preview ||
      selectedEmail?.body ||
      email?.body_preview ||
      email?.body ||
      "";
    console.log("mail text:", mailText);

    // Defaults must apply even if the mail is empty or parsing fails
    let extracted = {};
    try {
      extracted = mailText ? flow.parse(mailText) : {};
      console.log("extracted:", extracted);
      if (extracted.conflicts?.length)
        console.warn("Mail has two different values for:", extracted.conflicts);
    } catch (err) {
      console.error("Parse failed:", err.message);
    }

    const mapped = flow.map(extracted);
    console.log("[app] mapped:", mapped);
    setRawDeclaration(mapped); // defaults appear immediately

    if (!flow.n8n) {
      setBusy(false);
      return;
    }

    // Then fetch the item details from n8n and merge them under the defaults
    setBusy(true);
    try {
      const n8nResult = await notifyN8n(email.id);
      if (activeRequest.current !== email.id) return;
      console.log("n8n raw response:", n8nResult);

      const raw = n8nResult?.n8n_response || null;
      if (raw) {
        const n8nMapped = mapResponse("out", raw);
        console.log("[app] n8n mapped:", n8nMapped);
        const merged = mergeDefaults(n8nMapped, mapped);
        console.log("[app] merged:", merged);
        setRawDeclaration(merged);
      }
    } catch (err) {
      if (activeRequest.current !== email.id) return;
      if (err.response?.data?.code !== "NO_PDF") {
        console.error(
          "n8n extraction failed:",
          err.message,
          "| status:", err.response?.status,
          "| body:", err.response?.data,
        );
      }
    } finally {
      if (activeRequest.current === email.id) setBusy(false);
    }
  };

  const removeFromList = (id) =>
    setAccounts((prev) =>
      prev.map((acct) => ({
        ...acct,
        emails: acct.emails.filter((e) => e.id !== id),
        count: acct.emails.filter((e) => e.id !== id).length,
      })),
    );

  const handleDismiss = async (id) => {
    removeFromList(id);
    setSelectedEmail((cur) => (cur?.id === id ? null : cur));
    try {
      await dismissEmail(id);
    } catch (err) {
      console.error("Failed to persist dismiss on server:", err);
      loadEmails();
    }
  };

  const handleSaveDeclaration = async (savedData, pageIndex) => {
    console.log("Declaration saved:", savedData, "pageIndex:", pageIndex);
    if (!selectedEmail) return;
    const id = selectedEmail.id;

    removeFromList(id);
    resetSelection();

    try {
      await completeEmail(id);
    } catch (err) {
      console.error("Failed to persist saved-permit status:", err);
      loadEmails();
    }
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <h1>Manifest Desk</h1>
          <span className="brand-tag">Declarant Review</span>
        </div>
        <div className="topbar-meta">
          {totalPending > 0 && (
            <span className="pending-pill">
              <span className="dot" />
              {totalPending} pending
            </span>
          )}
          <span>Synced {formatSyncTime(syncedAt)}</span>
        </div>
      </header>

      <div className="workspace">
        <EmailSidebar
          accounts={accounts}
          activeId={selectedEmail?.id}
          onSelect={handleSelect}
          onCustomerSelect={handleCustomerSelect}
          activeCustomer={activeCustomer}
          onDismiss={handleDismiss}
          loading={loading}
        />
        <PdfViewer email={selectedEmail} attachments={attachments} />
        <DeclarationPanel
          moduleType={moduleType}
          login={customerLogin}
          email={selectedEmail}
          declaration={declaration}
          busy={busy}
          onSave={handleSaveDeclaration}
          onDismissEmail={handleDismiss}
          onDeselectEmail={resetSelection}
        />
      </div>
    </div>
  );
}