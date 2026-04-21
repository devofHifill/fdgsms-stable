import { useCallback, useEffect, useRef, useState } from "react";
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

export default function InboxPage() {
  const [conversations, setConversations] = useState([]);
  const [active, setActive] = useState(null);
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [enrollment, setEnrollment] = useState(null);

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

  const handleComposerKeyDown = useCallback(
    (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        handleSend(e);
      }
    },
    [handleSend]
  );

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
  }, [messages, scrollToBottom]);

  return (
    <AppLayout>
      <div className="inbox">
        <aside className="inbox-sidebar">
          <div className="inbox-sidebar-header">
            <h1>Inbox</h1>
          </div>

          {loadingConversations ? (
            <div className="empty-sidebar">Loading conversations...</div>
          ) : conversations.length ? (
            conversations.map((c) => (
              <button
                key={c._id}
                type="button"
                className={`conversation ${active?._id === c._id ? "active" : ""}`}
                onClick={() => handleSelect(c)}
              >
                <div className="conversation-top">
                  <div className="conv-name">
                    {c.contact?.fullName || "Unknown"}
                  </div>
                  <div className="conv-time">
                    {c.lastMessageAt
                      ? new Date(c.lastMessageAt).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })
                      : ""}
                  </div>
                </div>

                <div className="conv-preview">
                  {c.lastMessage || "No messages yet"}
                </div>
              </button>
            ))
          ) : (
            <div className="empty-sidebar">No conversations yet</div>
          )}
        </aside>

        <main className="inbox-chat">
          {active ? (
            <>
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

              {error ? <div className="inbox-error-banner">{error}</div> : null}

              <div className="chat-messages" ref={messagesContainerRef}>
                {loadingMessages && !messages.length ? (
                  <div className="empty-chat">Loading messages...</div>
                ) : messages.length ? (
                  messages.map((m) => (
                    <div
                      key={m._id}
                      className={`bubble ${m.direction === "outbound" ? "outbound" : "inbound"}`}
                    >
                      <div className="bubble-body">{m.body}</div>

                      <div className="bubble-meta">
                        <span>{m.messageType || m.direction}</span>
                        {m.stepNumber ? <span>Step {m.stepNumber}</span> : null}
                        <span>{new Date(m.createdAt).toLocaleString()}</span>
                      </div>
                    </div>
                  ))
                ) : (
                  <div className="empty-chat">No messages yet</div>
                )}

                <div ref={messagesEndRef} />
              </div>

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