import { useEffect, useState, useCallback } from "react";
import EmailSidebar from "./components/EmailSidebar";
import PdfViewer from "./components/PdfViewer";
import DeclarationPanel from "./components/DeclarationPanel";
import {
  fetchEmails,
  fetchEmailDetail,
  fetchAttachments,
  notifyN8n,
  dismissEmail,
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
  const [declaration, setDeclaration] = useState(null);
  const [busy, setBusy] = useState(false);
  const [syncedAt, setSyncedAt] = useState(new Date());

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

  const totalPending = accounts.reduce(
    (sum, acct) => sum + (acct.count || 0),
    0,
  );

  const handleSelect = async (email) => {
    setAttachments([]);
    setDeclaration(null);
    setBusy(true);

    try {
      const [detail, attData] = await Promise.all([
        fetchEmailDetail(email.id),
        fetchAttachments(email.id),
      ]);
      setSelectedEmail({ ...email, ...detail, body_preview: detail.body });
      setAttachments(attData.attachments || attData || []);
    } catch (err) {
      console.error("Failed to load email detail/attachments", err);
      setSelectedEmail(email);
      setBusy(false);
      return;
    }

    try {
      const n8nResult = await notifyN8n(email.id);
      console.log("n8n raw response:", n8nResult);
      setDeclaration(n8nResult?.n8n_response || null);
    } catch (err) {
      console.error("n8n declaration extraction failed or timed out", err);
      setDeclaration(null);
    } finally {
      setBusy(false);
    }
  };

  const handleDismiss = async (id) => {
    setAccounts((prev) =>
      prev.map((acct) => ({
        ...acct,
        emails: acct.emails.filter((e) => e.id !== id),
        count: acct.emails.filter((e) => e.id !== id).length,
      })),
    );
    setSelectedEmail((current) => (current?.id === id ? null : current));

    try {
      await dismissEmail(id);
    } catch (err) {
      console.error("Failed to persist dismiss on server:", err);
      loadEmails();
    }
  };

  const handleDeselect = () => {
    setSelectedEmail(null);
    setAttachments([]);
    setDeclaration(null);
  };

  // Called by DeclarationPanel after a successful Save Permit. No backend
  // "mark as saved" endpoint exists yet, so this just logs for now — see
  // note below.
  // App.jsx
  const handleSaveDeclaration = async (savedData, pageIndex) => {
    console.log("Declaration saved:", savedData, "pageIndex:", pageIndex);
    if (!selectedEmail) return;
    const id = selectedEmail.id;

    setAccounts((prev) =>
      prev.map((acct) => ({
        ...acct,
        emails: acct.emails.filter((e) => e.id !== id),
        count: acct.emails.filter((e) => e.id !== id).length,
      })),
    );
    setSelectedEmail(null);
    setAttachments([]);
    setDeclaration(null);

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
          email={selectedEmail}
          declaration={declaration}
          busy={busy}
          onSave={handleSaveDeclaration}
          onDismissEmail={handleDismiss}
          onDeselectEmail={handleDeselect}
        />
      </div>
    </div>
  );
}
