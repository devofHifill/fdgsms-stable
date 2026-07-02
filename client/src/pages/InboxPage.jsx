import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Trash2 } from "lucide-react";
import { apiFetch } from "../services/api";
import AppLayout from "../components/AppLayout";

function isNearBottom(element, threshold = 120) {
  if (!element) return true;

  const distanceFromBottom =
    element.scrollHeight - element.scrollTop - element.clientHeight;

  return distanceFromBottom <= threshold;
}

function sortMessages(items = []) {
  return [...items].sort(
    (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
  );
}

function mergeMessages(prev = [], next = []) {
  const map = new Map();

  for (const item of prev) {
    if (item?._id) map.set(item._id, item);
  }

  for (const item of next) {
    if (item?._id) map.set(item._id, item);
  }

  return sortMessages(Array.from(map.values()));
}

function getInitials(name) {
  const s = String(name || "").trim();
  if (!s) return "?";
  const p = s.split(/\s+/);
  return ((p[0]?.[0] || "") + (p[1]?.[0] || "")).toUpperCase() || "?";
}

function dayLabel(value) {
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return "";
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  const same = (a, b) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, yesterday)) return "Yesterday";
  return d.toLocaleDateString([], { day: "2-digit", month: "short", year: "numeric" });
}

// Rough SMS segmentation (GSM-7: 160 single / 153 concatenated).
function smsInfo(text) {
  const len = text.length;
  if (len === 0) return { len: 0, seg: 0 };
  const seg = len <= 160 ? 1 : Math.ceil(len / 153);
  return { len, seg };
}

const FILTERS = [
  { key: "all", label: "All" },
  { key: "needs", label: "Needs reply" },
  { key: "replied", label: "Replied" },
];

export default function InboxPage() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [enrollment, setEnrollment] = useState(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("all");
  const [showJump, setShowJump] = useState(false);

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  const messagesContainerRef = useRef(null);
  const messagesEndRef = useRef(null);
  const pollingLockRef = useRef(false);
  const shouldScrollToBottomRef = useRef(false);

  const scrollToBottom = useCallback((behavior = "smooth") => {
    messagesEndRef.current?.scrollIntoView({
      behavior,
      block: "end",
    });
  }, []);

  async function loadEnrollment(contactId) {
    try {
      const data = await apiFetch(`/enrollments/contact/${contactId}`);
      setEnrollment(data || null);
    } catch {
      setEnrollment(null);
    }
  }

  const loadConversations = useCallback(async () => {
    try {
      const data = await apiFetch("/conversations");
      const items = Array.isArray(data.items) ? data.items : [];

      setConversations(items);

      setActive((prev) => {
        if (!items.length) return null;
        if (!prev) return items[0];

        const matched = items.find((item) => item._id === prev._id);
        return matched || items[0];
      });
    } catch (err) {
      setError(err.message || "Failed to load conversations");
    } finally {
      setLoadingConversations(false);
    }
  }, []);

  const loadMessages = useCallback(
    async (contactId, options = {}) => {
      if (!contactId) {
        setMessages([]);
        return;
      }

      const { silent = false, forceScroll = false } = options;

      try {
        if (!silent) {
          setLoadingMessages(true);
        }

        const nearBottomBeforeUpdate = isNearBottom(messagesContainerRef.current);

        const data = await apiFetch(`/conversations/${contactId}/messages`);
        const items = Array.isArray(data.items) ? data.items : [];

        setMessages((prev) => {
          const merged = silent ? mergeMessages(prev, items) : sortMessages(items);

          const hadMessages = prev.length;
          const hasNewerCount = merged.length > hadMessages;

          if (forceScroll || nearBottomBeforeUpdate || hasNewerCount) {
            shouldScrollToBottomRef.current = true;
          }

          return merged;
        });
      } catch (err) {
        if (!silent) {
          setError(err.message || "Failed to load messages");
        }
      } finally {
        if (!silent) {
          setLoadingMessages(false);
        }
      }
    },
    []
  );

  const handleSelect = useCallback(
    async (conv) => {
      if (!conv?.contactId) return;

      setError("");
      setActive(conv);
      shouldScrollToBottomRef.current = true;

      await Promise.all([
        loadMessages(conv.contactId, { silent: false, forceScroll: true }),
        loadEnrollment(conv.contactId),
      ]);
    },
    [loadMessages]
  );

  const handleSend = useCallback(
    async (e) => {
      e.preventDefault();

      if (!text.trim() || !active || sending) return;

      try {
        setSending(true);
        setError("");

        const res = await apiFetch("/messages/send", {
          method: "POST",
          body: JSON.stringify({
            contactId: active.contactId,
            body: text.trim(),
          }),
        });

        if (res?.item) {
          setMessages((prev) => mergeMessages(prev, [res.item]));
          shouldScrollToBottomRef.current = true;
        }

        setText("");

        await loadConversations();
      } catch (err) {
        setError(err.message || "Failed to send message");
      } finally {
        setSending(false);
      }
    },
    [active, sending, text, loadConversations]
  );

  const handleDeleteMessage = useCallback(
    async (messageId) => {
      if (!messageId) return;
      if (!window.confirm("Delete this message? This cannot be undone.")) return;

      try {
        setError("");
        await apiFetch(`/conversations/messages/${messageId}`, {
          method: "DELETE",
        });

        setMessages((prev) => prev.filter((m) => m._id !== messageId));
        await loadConversations();
      } catch (err) {
        setError(err.message || "Failed to delete message");
      }
    },
    [loadConversations]
  );

  const handleDeleteConversation = useCallback(async () => {
    if (!active?.contactId) return;

    const name = active.contact?.fullName || "this contact";
    if (
      !window.confirm(
        `Delete the entire conversation with ${name}? This removes all messages and cannot be undone.`
      )
    ) {
      return;
    }

    try {
      setError("");
      await apiFetch(`/conversations/${active.contactId}`, {
        method: "DELETE",
      });

      setActive(null);
      setMessages([]);
      setEnrollment(null);
      await loadConversations();
    } catch (err) {
      setError(err.message || "Failed to delete conversation");
    }
  }, [active, loadConversations]);

  const handleComposerKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend(e);
      }
    },
    [handleSend]
  );

  const handleMessagesScroll = useCallback((e) => {
    setShowJump(!isNearBottom(e.currentTarget));
  }, []);

  useEffect(() => {
    loadConversations();
  }, [loadConversations]);

  useEffect(() => {
    if (!active?.contactId) {
      setMessages([]);
      setEnrollment(null);
      return;
    }

    loadMessages(active.contactId, {
      silent: false,
      forceScroll: true,
    });
    loadEnrollment(active.contactId);
  }, [active?.contactId, loadMessages]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (pollingLockRef.current) return;
      pollingLockRef.current = true;

      try {
        await loadConversations();

        if (active?.contactId) {
          await loadMessages(active.contactId, { silent: true });
          await loadEnrollment(active.contactId);
        }
      } catch (err) {
        console.error("Inbox polling error:", err);
      } finally {
        pollingLockRef.current = false;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [active?.contactId, loadConversations, loadMessages]);

  useEffect(() => {
    if (!shouldScrollToBottomRef.current) return;

    const behavior = messages.length <= 1 ? "auto" : "smooth";
    scrollToBottom(behavior);
    shouldScrollToBottomRef.current = false;
    setShowJump(false);
  }, [messages, scrollToBottom]);

  // Derived: search + filter applied to the conversation list (view only).
  const visibleConversations = useMemo(() => {
    const q = search.trim().toLowerCase();
    return conversations.filter((c) => {
      if (filter === "needs" && c.lastDirection !== "inbound") return false;
      if (filter === "replied" && c.lastDirection !== "outbound") return false;

      if (!q) return true;
      const haystack = [
        c.contact?.fullName,
        c.contact?.phone,
        c.normalizedPhone,
        c.lastMessage,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(q);
    });
  }, [conversations, search, filter]);

  // Decorate messages with day separators.
  const messageItems = useMemo(() => {
    const out = [];
    let lastDay = null;
    for (const m of messages) {
      const label = dayLabel(m.createdAt);
      if (label && label !== lastDay) {
        out.push({ type: "sep", key: `sep-${label}-${m._id}`, label });
        lastDay = label;
      }
      out.push({ type: "msg", key: m._id, message: m });
    }
    return out;
  }, [messages]);

  const composer = smsInfo(text);

  return (
    <AppLayout>
      <div className="inbox">
        <aside className="inbox-sidebar">
          <div className="inbox-sidebar-header">
            <h1>Inbox</h1>

            <div className="inbox-search">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.3-4.3"/></svg>
              <input
                type="text"
                placeholder="Search name, phone, message"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </div>

            <div className="inbox-filters">
              {FILTERS.map((f) => (
                <button
                  key={f.key}
                  type="button"
                  className={`inbox-filter ${filter === f.key ? "active" : ""}`}
                  onClick={() => setFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {loadingConversations ? (
            <div className="empty-sidebar">Loading conversations...</div>
          ) : visibleConversations.length ? (
            visibleConversations.map((c) => {
              const needsReply = c.lastDirection === "inbound";
              return (
                <button
                  key={c._id}
                  type="button"
                  className={`conversation ${active?._id === c._id ? "active" : ""}`}
                  onClick={() => handleSelect(c)}
                >
                  <span className="conv-avatar">
                    {getInitials(c.contact?.fullName)}
                  </span>
                  <span className="conv-main">
                    <span className="conversation-top">
                      <span className="conv-name">
                        {c.contact?.fullName || "Unknown"}
                      </span>
                      <span className="conv-time">
                        {needsReply ? <span className="conv-dot" title="Awaiting your reply" /> : null}
                        {c.lastMessageAt
                          ? new Date(c.lastMessageAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })
                          : ""}
                      </span>
                    </span>
                    <span className="conv-preview">
                      {c.lastMessage || "No messages yet"}
                    </span>
                  </span>
                </button>
              );
            })
          ) : (
            <div className="empty-sidebar">
              {conversations.length ? "No conversations match." : "No conversations yet"}
            </div>
          )}
        </aside>

        <main className="inbox-chat">
          {active ? (
            <>
              <div className="chat-header">
                <div className="chat-id-group">
                  <span className="conv-avatar">
                    {getInitials(active.contact?.fullName)}
                  </span>
                  <div className="chat-header-main">
                    <div className="chat-title">{active.contact?.fullName}</div>
                    <div className="chat-subtitle">
                      {enrollment
                        ? `${enrollment.campaignId?.name || "Campaign"} • Status: ${enrollment.status} • Current Step: ${enrollment.currentStep || "-"}`
                        : "No active sequence"}
                    </div>
                  </div>
                </div>

                <button
                  type="button"
                  className="chat-delete-btn"
                  onClick={handleDeleteConversation}
                  title="Delete this conversation"
                >
                  <Trash2 size={16} />
                  <span>Delete chat</span>
                </button>
              </div>

              {error ? <div className="inbox-error-banner">{error}</div> : null}

              <div
                className="chat-messages"
                ref={messagesContainerRef}
                onScroll={handleMessagesScroll}
              >
                {loadingMessages && !messages.length ? (
                  <div className="empty-chat">Loading messages...</div>
                ) : messages.length ? (
                  messageItems.map((item) =>
                    item.type === "sep" ? (
                      <div key={item.key} className="day-sep">
                        {item.label}
                      </div>
                    ) : (
                      <div
                        key={item.key}
                        className={`bubble ${item.message.direction === "outbound" ? "outbound" : "inbound"}`}
                      >
                        <button
                          type="button"
                          className="bubble-delete-btn"
                          onClick={() => handleDeleteMessage(item.message._id)}
                          title="Delete this message"
                          aria-label="Delete this message"
                        >
                          <Trash2 size={14} />
                        </button>

                        <div className="bubble-body">{item.message.body}</div>

                        <div className="bubble-meta">
                          <span>{item.message.messageType || item.message.direction}</span>
                          {item.message.stepNumber ? (
                            <span>Step {item.message.stepNumber}</span>
                          ) : null}
                          <span>
                            {new Date(item.message.createdAt).toLocaleTimeString([], {
                              hour: "2-digit",
                              minute: "2-digit",
                            })}
                          </span>
                        </div>
                      </div>
                    )
                  )
                ) : (
                  <div className="empty-chat">No messages yet</div>
                )}

                <div ref={messagesEndRef} />
              </div>

              {showJump && messages.length ? (
                <button
                  type="button"
                  className="jump-latest"
                  onClick={() => scrollToBottom("smooth")}
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
                  Jump to latest
                </button>
              ) : null}

              <form className="chat-input" onSubmit={handleSend}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder="Type a message..."
                  rows={2}
                  disabled={!active || sending}
                />
                <button
                  type="submit"
                  disabled={!active || sending || !text.trim()}
                >
                  {sending ? "Sending..." : "Send"}
                </button>
                <div className="composer-meta">
                  {composer.len} chars ·{" "}
                  <span className={composer.seg > 1 ? "warn" : ""}>
                    {composer.seg} segment{composer.seg === 1 ? "" : "s"}
                  </span>
                </div>
              </form>
            </>
          ) : (
            <div className="empty-chat empty-chat-centered">
              Select a conversation
            </div>
          )}
        </main>
      </div>
    </AppLayout>
  );
}
