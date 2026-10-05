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
    setBusy(false);
  };

  const handleSelect = async (email) => {
    activeRequest.current = email.id;
    setAttachments([]);
    setRawDeclaration(null);
    setModuleType(null);
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
          onDismiss={handleDismiss}
          loading={loading}
        />
        <PdfViewer email={selectedEmail} attachments={attachments} />
        <DeclarationPanel
          moduleType={moduleType}
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