import { useEffect, useState } from "react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

const STATUS_OPTIONS = [
  { label: "All", value: "all" },
  { label: "New", value: "new" },
  { label: "Active", value: "active" },
  { label: "Replied", value: "replied" },
  { label: "Opted Out", value: "opted_out" },
  { label: "Invalid", value: "invalid" },
];

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 250, 500];

export default function ContactsPage() {
  const [contacts, setContacts] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
    hasNextPage: false,
    hasPrevPage: false,
  });

  const [search, setSearch] = useState("");
  const [appliedSearch, setAppliedSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const [selectedContact, setSelectedContact] = useState(null);
  const [loadingDetails, setLoadingDetails] = useState(false);

  const [messages, setMessages] = useState([]);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [messageText, setMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);

  const [campaigns, setCampaigns] = useState([]);
  const [selectedCampaignId, setSelectedCampaignId] = useState("");
  const [bulkEnrolling, setBulkEnrolling] = useState(false);
  const [selectedContactIds, setSelectedContactIds] = useState([]);

  async function fetchContacts(
    nextPage = 1,
    nextSearch = appliedSearch,
    nextStatus = status,
    nextLimit = pagination.limit
  ) {
    try {
      setLoading(true);
      setError("");
      setSuccess("");

      const params = new URLSearchParams({
        page: String(nextPage),
        limit: String(Math.min(nextLimit || 10, 500)),
        search: nextSearch,
        status: nextStatus,
      });

      const data = await apiFetch(`/contacts?${params.toString()}`);
      setContacts(data.items || []);
      setPagination(data.pagination || {});
    } catch (err) {
      setError(err.message || "Failed to load contacts");
    } finally {
      setLoading(false);
    }
  }

  async function fetchCampaigns() {
    try {
      const data = await apiFetch("/campaigns");
      setCampaigns(data.items || []);
    } catch (err) {
      setError(err.message || "Failed to load campaigns");
    }
  }

  async function fetchContactDetails(id) {
    try {
      setLoadingDetails(true);
      setError("");
      setSuccess("");

      const data = await apiFetch(`/contacts/${id}`);
      setSelectedContact(data);
    } catch (err) {
      setError(err.message || "Failed to load contact details");
    } finally {
      setLoadingDetails(false);
    }
  }

  async function fetchMessages(contactId) {
    try {
      setLoadingMessages(true);
      setError("");

      const data = await apiFetch(`/messages/contact/${contactId}`);
      setMessages(data.items || []);
    } catch (err) {
      setError(err.message || "Failed to load messages");
      setMessages([]);
    } finally {
      setLoadingMessages(false);
    }
  }

  async function handleSelectContact(contactId) {
    await fetchContactDetails(contactId);
    await fetchMessages(contactId);
  }

  async function handleSendMessage(e) {
    e.preventDefault();

    if (!selectedContact?._id) {
      setError("Select a contact first");
      return;
    }

    if (!messageText.trim()) {
      setError("Message cannot be empty");
      return;
    }

    try {
      setSendingMessage(true);
      setError("");
      setSuccess("");

      const payload = {
        contactId: selectedContact._id,
        body: messageText.trim(),
      };

      const data = await apiFetch("/messages/send", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setMessages((prev) => [...prev, data.item]);
      setMessageText("");
      setSuccess("Message sent successfully");
    } catch (err) {
      setError(err.message || "Failed to send message");
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleSingleEnroll(contactId) {
    if (!selectedCampaignId) {
      setError("Select a campaign first");
      return;
    }

    try {
      setBulkEnrolling(true);
      setError("");
      setSuccess("");

      await apiFetch("/enrollments", {
        method: "POST",
        body: JSON.stringify({
          contactId,
          campaignId: selectedCampaignId,
        }),
      });

      setSuccess("Contact enrolled successfully");
    } catch (err) {
      setError(err.message || "Failed to enroll contact");
    } finally {
      setBulkEnrolling(false);
    }
  }

  async function handleBulkEnroll() {
    if (!selectedContactIds.length) {
      setError("Select at least one contact");
      return;
    }

    if (!selectedCampaignId) {
      setError("Select a campaign");
      return;
    }

    try {
      setBulkEnrolling(true);
      setError("");
      setSuccess("");

      const data = await apiFetch("/enrollments/bulk", {
        method: "POST",
        body: JSON.stringify({
          contactIds: selectedContactIds,
          campaignId: selectedCampaignId,
        }),
      });

      setSuccess(
        `Bulk enrollment complete. Created: ${data.createdCount}, Skipped: ${data.skippedCount}`
      );

      setSelectedContactIds([]);
      setSelectedCampaignId("");
    } catch (err) {
      setError(err.message || "Bulk enrollment failed");
    } finally {
      setBulkEnrolling(false);
    }
  }

  function toggleContactSelection(contactId) {
    setSelectedContactIds((prev) =>
      prev.includes(contactId)
        ? prev.filter((id) => id !== contactId)
        : [...prev, contactId]
    );
  }

  function toggleSelectAllOnPage() {
    const pageIds = contacts.map((c) => c._id);
    const allSelected = pageIds.every((id) => selectedContactIds.includes(id));

    if (allSelected) {
      setSelectedContactIds((prev) =>
        prev.filter((id) => !pageIds.includes(id))
      );
    } else {
      setSelectedContactIds((prev) => [...new Set([...prev, ...pageIds])]);
    }
  }

  function handleSearchSubmit(e) {
    e.preventDefault();
    const nextSearch = search.trim();
    setAppliedSearch(nextSearch);
    setSelectedContactIds([]);
    fetchContacts(1, nextSearch, status, pagination.limit);
  }

  function handleStatusChange(e) {
    const nextStatus = e.target.value;
    setStatus(nextStatus);
    setSelectedContactIds([]);
    fetchContacts(1, appliedSearch, nextStatus, pagination.limit);
  }

  function handleLimitChange(e) {
    const nextLimit = Math.min(Number(e.target.value) || 10, 500);

    setPagination((prev) => ({
      ...prev,
      page: 1,
      limit: nextLimit,
    }));

    setSelectedContactIds([]);
    fetchContacts(1, appliedSearch, status, nextLimit);
  }

  function handlePrevPage() {
    if (pagination.hasPrevPage) {
      setSelectedContactIds([]);
      fetchContacts(
        pagination.page - 1,
        appliedSearch,
        status,
        pagination.limit
      );
    }
  }

  function handleNextPage() {
    if (pagination.hasNextPage) {
      setSelectedContactIds([]);
      fetchContacts(
        pagination.page + 1,
        appliedSearch,
        status,
        pagination.limit
      );
    }
  }

  useEffect(() => {
    fetchContacts(1, appliedSearch, status, pagination.limit);
    fetchCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <AppLayout>
      <div className="contacts-page">
        <div className="contacts-toolbar">
          <h1>Contacts</h1>

          <form className="contacts-filters" onSubmit={handleSearchSubmit}>
            <input
              type="text"
              placeholder="Search name, email, phone..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />

            <select value={status} onChange={handleStatusChange}>
              {STATUS_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>

            <select value={pagination.limit} onChange={handleLimitChange}>
              {PAGE_SIZE_OPTIONS.map((size) => (
                <option key={size} value={size}>
                  Show {size}
                </option>
              ))}
            </select>

            <button type="submit">Search</button>
          </form>
        </div>

        <div className="bulk-enroll-bar">
          <div className="bulk-enroll-count">
            {selectedContactIds.length} selected
          </div>

          <select
            value={selectedCampaignId}
            onChange={(e) => setSelectedCampaignId(e.target.value)}
          >
            <option value="">Select Campaign</option>
            {campaigns.map((campaign) => (
              <option key={campaign._id} value={campaign._id}>
                {campaign.name}
              </option>
            ))}
          </select>

          <button onClick={handleBulkEnroll} disabled={bulkEnrolling}>
            {bulkEnrolling ? "Enrolling..." : "Enroll Selected"}
          </button>
        </div>

        {error ? <p className="status-error">{error}</p> : null}
        {success ? <p className="status-success">{success}</p> : null}

        <div className="contacts-layout">
          <div className="contacts-list-card">
            {loading ? (
              <p>Loading contacts...</p>
            ) : (
              <>
                <table className="contacts-table">
                  <thead>
                    <tr>
                      <th>
                        <input
                          type="checkbox"
                          checked={
                            contacts.length > 0 &&
                            contacts.every((c) =>
                              selectedContactIds.includes(c._id)
                            )
                          }
                          onChange={toggleSelectAllOnPage}
                        />
                      </th>
                      <th>Name</th>
                      <th>Email</th>
                      <th>Phone</th>
                      <th>Status</th>
                      <th>Source</th>
                    </tr>
                  </thead>

                  <tbody>
                    {contacts.length ? (
                      contacts.map((contact) => (
                        <tr
                          key={contact._id}
                          onClick={() => handleSelectContact(contact._id)}
                          className={`contact-row ${
                            selectedContact?._id === contact._id
                              ? "contact-row-active"
                              : ""
                          }`}
                        >
                          <td onClick={(e) => e.stopPropagation()}>
                            <input
                              type="checkbox"
                              checked={selectedContactIds.includes(contact._id)}
                              onChange={() =>
                                toggleContactSelection(contact._id)
                              }
                            />
                          </td>

                          <td>{contact.fullName || "-"}</td>
                          <td>{contact.email || "-"}</td>
                          <td>{contact.phone || "-"}</td>
                          <td>
                            <span
                              className={`status-badge status-${contact.status}`}
                            >
                              {contact.status}
                            </span>
                          </td>
                          <td>{contact.source || "-"}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan="6">No contacts found</td>
                      </tr>
                    )}
                  </tbody>
                </table>

                <div className="pagination-bar">
                  <button
                    onClick={handlePrevPage}
                    disabled={!pagination.hasPrevPage}
                  >
                    Previous
                  </button>

                  <span>
                    Page {pagination.page} of {pagination.totalPages} | Total{" "}
                    {pagination.total}
                  </span>

                  <button
                    onClick={handleNextPage}
                    disabled={!pagination.hasNextPage}
                  >
                    Next
                  </button>
                </div>
              </>
            )}
          </div>

          <aside className="contact-detail-card">
            {loadingDetails ? (
              <p>Loading details...</p>
            ) : selectedContact ? (
              <>
                <h2>Contact Details</h2>

                <div className="detail-grid">
                  <div>
                    <strong>Full Name</strong>
                    <p>{selectedContact.fullName || "-"}</p>
                  </div>

                  <div>
                    <strong>Email</strong>
                    <p>{selectedContact.email || "-"}</p>
                  </div>

                  <div>
                    <strong>Phone</strong>
                    <p>{selectedContact.phone || "-"}</p>
                  </div>

                  <div>
                    <strong>Status</strong>
                    <p>{selectedContact.status || "-"}</p>
                  </div>
                </div>

                <div className="enroll-panel">
                  <h3>Enroll in Campaign</h3>

                  <select
                    value={selectedCampaignId}
                    onChange={(e) => setSelectedCampaignId(e.target.value)}
                  >
                    <option value="">Select Campaign</option>
                    {campaigns.map((campaign) => (
                      <option key={campaign._id} value={campaign._id}>
                        {campaign.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={() => handleSingleEnroll(selectedContact._id)}
                    disabled={bulkEnrolling}
                  >
                    Enroll Contact
                  </button>
                </div>

                <div className="messages-panel">
                  <div className="messages-panel-header">
                    <h3>Message Thread</h3>
                  </div>

                  <div className="messages-thread">
                    {loadingMessages ? (
                      <p>Loading messages...</p>
                    ) : messages.length ? (
                      messages.map((msg) => (
                        <div
                          key={msg._id}
                          className={`message-bubble ${
                            msg.direction === "outbound"
                              ? "message-bubble-outbound"
                              : "message-bubble-inbound"
                          }`}
                        >
                          <div className="message-body">{msg.body}</div>
                          <div className="message-meta">
                            <span>{msg.status}</span>
                            <span>
                              {new Date(msg.createdAt).toLocaleString()}
                            </span>
                          </div>
                        </div>
                      ))
                    ) : (
                      <p>No messages yet.</p>
                    )}
                  </div>

                  <form className="message-compose" onSubmit={handleSendMessage}>
                    <textarea
                      rows="3"
                      placeholder="Type your SMS message..."
                      value={messageText}
                      onChange={(e) => setMessageText(e.target.value)}
                    />

                    <button type="submit" disabled={sendingMessage}>
                      {sendingMessage ? "Sending..." : "Send Message"}
                    </button>
                  </form>
                </div>
              </>
            ) : (
              <>
                <h2>Contact Details</h2>
                <p>Select a contact to view details.</p>
              </>
            )}
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}