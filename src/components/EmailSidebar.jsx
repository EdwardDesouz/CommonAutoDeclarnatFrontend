import { useState } from "react";

function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export default function EmailSidebar({
  accounts = [],
  activeId,
  onSelect,
  onDismiss,
  loading,
}) {
  const [expanded, setExpanded] = useState(null);

  const totalCount = accounts.reduce((sum, a) => sum + (a.count || 0), 0);

  return (
    <aside className="sidebar">
      <div className="sidebar-header">
        <h2>Inbox &middot; {totalCount}</h2>
      </div>

      {loading && (
        <div style={{ padding: 16 }}>
          <div className="skeleton-line" style={{ width: "80%" }} />
          <div className="skeleton-line" style={{ width: "60%" }} />
        </div>
      )}

      {!loading && accounts.length === 0 && (
        <div className="empty-state">
          <div className="stamp-outline">EMPTY</div>
          <p>No mailboxes to show.</p>
        </div>
      )}

      {!loading &&
        accounts.map((acct) => (
          <div key={acct.mailbox_id} className="account-group">
            <button
              className="account-header"
              onClick={() =>
                setExpanded(
                  expanded === acct.mailbox_id ? null : acct.mailbox_id,
                )
              }
            >
              <span className="account-name">{acct.username}</span>
              <span className="account-badge">{acct.count}</span>
              <span
                className={`account-chevron ${expanded === acct.mailbox_id ? "open" : ""}`}
              >
                ▾
              </span>
            </button>

            {expanded === acct.mailbox_id && (
              <div className="account-emails">
                {acct.emails.length === 0 ? (
                  <div className="account-empty">No unread emails</div>
                ) : (
                  acct.emails.map((email) => (
                    <div
                      key={email.id}
                      className={`email-item ${activeId === email.id ? "active" : ""}`}
                    >
                      <button
                        className="email-item-dismiss"
                        onClick={(e) => {
                          e.stopPropagation();
                          onDismiss?.(email.id);
                        }}
                        aria-label="Dismiss"
                      >
                        ✕
                      </button>

                      <button
                        className="email-item-body"
                        onClick={() =>
                          onSelect({
                            ...email,
                            mailboxId: acct.mailbox_id,
                            mailboxUsername: acct.username,
                          })
                        }
                      >
                        <div className="email-subject">
                          {email.sender || "Unknown sender"}
                        </div>
                        <div className="email-meta-row">
                          <span className="attachment-count">
                            {email.attachment_count} file
                            {email.attachment_count === 1 ? "" : "s"}
                          </span>
                          <span
                            className="attachment-count"
                            style={{ marginLeft: "auto" }}
                          >
                            {timeAgo(email.received_date)}
                          </span>
                        </div>
                      </button>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        ))}
    </aside>
  );
}
