import { useEffect, useRef, useState } from "react";
import { apiFetch } from "../services/api";

export default function InboxPage() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [enrollment, setEnrollment] = useState(null);

  const messagesEndRef = useRef(null);


  async function loadEnrollment(contactId) {
    try {
      const data = await apiFetch(`/api/enrollments/contact/${contactId}`);
      setEnrollment(data);
    } catch {
      setEnrollment(null);
    }
  }
  // Load conversations
  async function loadConversations() {
    const data = await apiFetch("/api/conversations");
    setConversations(data.items || []);
  }

  // Load messages
  async function loadMessages(contactId) {
    const data = await apiFetch(`/api/conversations/${contactId}/messages`);
    setMessages(data.items || []);
  }

  // Select conversation
  async function handleSelect(conv) {
    setActive(conv);
    await Promise.all([
      loadMessages(conv.contactId),
      loadEnrollment(conv.contactId),
    ]);
  }

  // Send message
  async function handleSend(e) {
    e.preventDefault();
    if (!text.trim() || !active) return;

    const res = await apiFetch("/api/messages/send", {
      method: "POST",
      body: JSON.stringify({
        contactId: active.contactId,
        body: text,
      }),
    });

    setMessages((prev) => [...prev, res.item]);
    setText("");
  }

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Initial load
  useEffect(() => {
    loadConversations();
  }, []);

  // Polling (every 5 sec)
  useEffect(() => {
    const interval = setInterval(() => {
      loadConversations();
      if (active) loadMessages(active.contactId);
    }, 5000);

    return () => clearInterval(interval);
  }, [active]);

  return (
    <div className="inbox">
      {/* SIDEBAR */}
      <aside className="inbox-sidebar">
        {conversations.map((c) => (
          <div
            key={c._id}
            className={`conversation ${active?._id === c._id ? "active" : ""
              }`}
            onClick={() => handleSelect(c)}
          >
            <div className="conv-name">
              {c.contact?.fullName || "Unknown"}
            </div>
            <div className="conv-preview">{c.lastMessage}</div>
          </div>
        ))}
      </aside>

      {/* CHAT PANEL */}
      <main className="inbox-chat">
        {active ? (
          <>
            {/* HEADER */}
            <div className="chat-header">
              <div>
                <div className="chat-title">{active.contact?.fullName}</div>
                <div className="chat-subtitle">
                  {enrollment
                    ? `${enrollment.campaignId?.name || "Campaign"} • Status: ${enrollment.status} • Current Step: ${enrollment.currentStep || "-"}`
                    : "No active sequence"}
                </div>
              </div>
            </div>

            {/* MESSAGES */}
            <div className="chat-messages">
              {messages.map((m) => (
                <div
                  key={m._id}
                  className={`bubble ${m.direction === "outbound" ? "outbound" : "inbound"}`}
                >
                  <div className="bubble-body">{m.body}</div>

                  <div className="bubble-meta">
                    <span>{m.messageType}</span>
                    {m.stepNumber ? <span>Step {m.stepNumber}</span> : null}
                    <span>{new Date(m.createdAt).toLocaleString()}</span>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>

            {/* INPUT */}
            <form className="chat-input" onSubmit={handleSend}>
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Type a message..."
              />
              <button type="submit">Send</button>
            </form>
          </>
        ) : (
          <div className="empty-chat">Select a conversation</div>
        )}
      </main>
    </div>
  );
}