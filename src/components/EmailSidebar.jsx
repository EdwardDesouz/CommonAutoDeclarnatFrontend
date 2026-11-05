import { useState } from "react";
import { CUSTOMER_LOGIN_MAP as OPERATION_CUSTOMERS } from "../helpers/operationMail";
import { CUSTOMER_LOGIN_MAP as TEST_AGENT_CUSTOMERS } from "../helpers/testAgentMail";

const CUSTOMER_MAPS = {
  OPERATION: OPERATION_CUSTOMERS,
  test_agent: TEST_AGENT_CUSTOMERS,
};

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

function sortNewestFirst(emails = []) {
  return [...emails].sort(
    (a, b) =>
      (new Date(b.received_date).getTime() || 0) -
      (new Date(a.received_date).getTime() || 0),
  );
}

export default function EmailSidebar({
  accounts = [],
  activeId,
  onSelect,
  onCustomerSelect,
  activeCustomer,
  loading,
}) {
  const [expanded, setExpanded] = useState(null);

  const totalCount = accounts.reduce((sum, a) => sum + a.emails.length, 0);


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
              <span className="account-badge">{acct.emails.length}</span>
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
                  sortNewestFirst(acct.emails).map((email) => {
                    const isActive = activeId === email.id;
                    const customerMap = CUSTOMER_MAPS[acct.mailbox_id];
                    const showCustomers = !!customerMap && isActive;

                    return (
                      <div key={email.id}>
                        <div
                          className={`email-item ${isActive ? "active" : ""}`}
                        >
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

                        {showCustomers && (
                          <div className="customer-box">
                            <div className="customer-box-title">
                              Select customer
                            </div>
                            <div className="customer-list">
                              {Object.entries(customerMap).map(([customer, login]) => (
                                <button
                                  key={customer}
                                  className={`customer-item ${activeCustomer === customer ? "active" : ""
                                    }`}
                                  title={`Login as ${login.touchUsername}`}
                                  onClick={() =>
                                    onCustomerSelect?.({
                                      customer,
                                      login,
                                      email: {
                                        ...email,
                                        mailboxId: acct.mailbox_id,
                                        mailboxUsername: acct.username,
                                      },
                                    })
                                  }
                                >
                                  {customer}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ))}
    </aside>
  );
}