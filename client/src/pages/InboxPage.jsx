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

const FAILED_STATUSES = ["failed", "undelivered"];

const FILTERS = [
  { key: "all", label: "All" },
  { key: "unread", label: "Unread" },
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

  const [templates, setTemplates] = useState([]);
  const [showTemplates, setShowTemplates] = useState(false);
  const [enrollBusy, setEnrollBusy] = useState(false);

  const [loadingConversations, setLoadingConversations] = useState(true);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");

  // AI reply controls + draft review (Phase 6)
  const [aiMode, setAiMode] = useState("default");
  const [takeover, setTakeover] = useState(false);
  const [aiBusy, setAiBusy] = useState(false);
  const [draft, setDraft] = useState(null);
  const [draftText, setDraftText] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);

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

  const markRead = useCallback(async (contactId) => {
    if (!contactId) return;
    setConversations((prev) =>
      prev.map((c) =>
        c.contactId === contactId ? { ...c, unreadCount: 0 } : c
      )
    );
    try {
      await apiFetch(`/conversations/${contactId}/read`, { method: "POST" });
    } catch {
      /* ignore — badge will re-sync on next poll */
    }
  }, []);

  const loadTemplates = useCallback(async () => {
    try {
      const data = await apiFetch("/templates");
      setTemplates(data.items || []);
    } catch {
      /* templates are optional */
    }
  }, []);

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

      if (active?.contact?.status === "opted_out") {
        setError("This contact has opted out. Sending is disabled.");
        return;
      }

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

  const handleRetry = useCallback(async (messageId) => {
    try {
      setError("");
      const data = await apiFetch(`/messages/${messageId}/retry`, {
        method: "POST",
      });
      if (data?.item) {
        setMessages((prev) =>
          prev.map((m) => (m._id === messageId ? data.item : m))
        );
      }
    } catch (err) {
      setError(err.message || "Retry failed");
    }
  }, []);

  const changeEnrollmentStatus = useCallback(
    async (status) => {
      if (!enrollment?._id) return;
      try {
        setEnrollBusy(true);
        setError("");
        const data = await apiFetch(`/enrollments/${enrollment._id}/status`, {
          method: "PATCH",
          body: JSON.stringify({ status }),
        });
        setEnrollment(data.item || null);
      } catch (err) {
        setError(err.message || "Failed to update automation");
      } finally {
        setEnrollBusy(false);
      }
    },
    [enrollment]
  );

  const loadDrafts = useCallback(async (contactId) => {
    if (!contactId) {
      setDraft(null);
      setDraftText("");
      return;
    }
    try {
      const data = await apiFetch("/ai/drafts?limit=100");
      const items = Array.isArray(data.items) ? data.items : [];
      const mine =
        items.find(
          (d) => String(d.contactId?._id || d.contactId) === String(contactId)
        ) || null;
      setDraft(mine);
      setDraftText(mine?.result?.text || "");
    } catch {
      /* drafts are optional — ignore */
    }
  }, []);

  const changeAiMode = useCallback(
    async (mode) => {
      if (!active?.contactId) return;
      try {
        setAiBusy(true);
        setError("");
        await apiFetch(`/ai/contacts/${active.contactId}/ai-mode`, {
          method: "PATCH",
          body: JSON.stringify({ aiMode: mode }),
        });
        setAiMode(mode);
      } catch (err) {
        setError(err.message || "Failed to update AI mode");
      } finally {
        setAiBusy(false);
      }
    },
    [active]
  );

  const claimTakeover = useCallback(async () => {
    if (!active?.contactId) return;
    try {
      setAiBusy(true);
      setError("");
      await apiFetch(`/ai/conversations/${active.contactId}/takeover`, {
        method: "POST",
      });
      setTakeover(true);
    } catch (err) {
      setError(err.message || "Failed to take over");
    } finally {
      setAiBusy(false);
    }
  }, [active]);

  const releaseTakeover = useCallback(
    async (keepAiOff) => {
      if (!active?.contactId) return;
      try {
        setAiBusy(true);
        setError("");
        await apiFetch(`/ai/conversations/${active.contactId}/release`, {
          method: "POST",
          body: JSON.stringify({ keepAiOff: Boolean(keepAiOff) }),
        });
        setTakeover(false);
        if (keepAiOff) setAiMode("forced_off");
      } catch (err) {
        setError(err.message || "Failed to release");
      } finally {
        setAiBusy(false);
      }
    },
    [active]
  );

  const approveDraft = useCallback(async () => {
    if (!draft?._id) return;
    try {
      setDraftBusy(true);
      setError("");
      await apiFetch(`/ai/drafts/${draft._id}/approve`, {
        method: "POST",
        body: JSON.stringify({ text: draftText.trim() }),
      });
      setDraft(null);
      setDraftText("");
      if (active?.contactId) {
        await loadMessages(active.contactId, { silent: true, forceScroll: true });
      }
    } catch (err) {
      setError(err.message || "Failed to send draft");
    } finally {
      setDraftBusy(false);
    }
  }, [draft, draftText, active, loadMessages]);

  const rejectDraft = useCallback(async () => {
    if (!draft?._id) return;
    try {
      setDraftBusy(true);
      setError("");
      await apiFetch(`/ai/drafts/${draft._id}/reject`, { method: "POST" });
      setDraft(null);
      setDraftText("");
    } catch (err) {
      setError(err.message || "Failed to reject draft");
    } finally {
      setDraftBusy(false);
    }
  }, [draft]);

  const applyTemplate = useCallback(
    (body) => {
      const first = (active?.contact?.fullName || "").split(/\s+/)[0] || "there";
      setText(String(body).replace(/\{\{\s*firstName\s*\}\}/g, first));
      setShowTemplates(false);
    },
    [active]
  );

  const saveTemplate = useCallback(async () => {
    const body = text.trim();
    if (!body) return;
    const name = window.prompt("Template name?");
    if (!name || !name.trim()) return;
    try {
      await apiFetch("/templates", {
        method: "POST",
        body: JSON.stringify({ name: name.trim(), body }),
      });
      await loadTemplates();
    } catch (err) {
      setError(err.message || "Failed to save template");
    }
  }, [text, loadTemplates]);

  const removeTemplate = useCallback(
    async (id) => {
      try {
        await apiFetch(`/templates/${id}`, { method: "DELETE" });
        await loadTemplates();
      } catch {
        /* ignore */
      }
    },
    [loadTemplates]
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

  const handleMessagesScroll = useCallback((e) => {
    setShowJump(!isNearBottom(e.currentTarget));
  }, []);

  useEffect(() => {
    loadConversations();
    loadTemplates();
  }, [loadConversations, loadTemplates]);

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
    loadDrafts(active.contactId);
    setAiMode(active.contact?.aiMode || "default");
    setTakeover(Boolean(active.humanTakeover?.active));
    markRead(active.contactId);
  }, [active?.contactId, loadMessages, markRead, loadDrafts]);

  useEffect(() => {
    const interval = setInterval(async () => {
      if (pollingLockRef.current) return;
      pollingLockRef.current = true;

      try {
        await loadConversations();

        if (active?.contactId) {
          await loadMessages(active.contactId, { silent: true });
          await loadEnrollment(active.contactId);
          await loadDrafts(active.contactId);
        }
      } catch (err) {
        console.error("Inbox polling error:", err);
      } finally {
        pollingLockRef.current = false;
      }
    }, 5000);

    return () => clearInterval(interval);
  }, [active?.contactId, loadConversations, loadMessages, loadDrafts]);

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
      if (filter === "unread" && !(c.unreadCount > 0)) return false;
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
  const optedOut = active?.contact?.status === "opted_out";

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
              const unread = c.unreadCount || 0;
              return (
                <button
                  key={c._id}
                  type="button"
                  className={`conversation ${active?._id === c._id ? "active" : ""} ${unread > 0 ? "is-unread" : ""}`}
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
                        {unread > 0 ? (
                          <span className="conv-unread">{unread}</span>
                        ) : null}
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
              {optedOut ? (
                <div className="optout-banner">
                  This contact has opted out — sending is disabled.
                </div>
              ) : null}

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
                          {item.message.direction === "outbound" && item.message.status ? (
                            <span
                              className={`msg-status ${FAILED_STATUSES.includes(item.message.status) ? "bad" : ""}`}
                            >
                              {item.message.status}
                            </span>
                          ) : null}
                          {item.message.direction === "outbound" &&
                          FAILED_STATUSES.includes(item.message.status) ? (
                            <button
                              type="button"
                              className="bubble-retry"
                              onClick={() => handleRetry(item.message._id)}
                            >
                              Retry
                            </button>
                          ) : null}
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

              {showTemplates ? (
                <div className="tmpl-popover">
                  <div className="tmpl-head">
                    <span className="ct">Templates</span>
                    <button type="button" className="tmpl-save" onClick={saveTemplate}>
                      + Save current
                    </button>
                  </div>
                  {templates.length ? (
                    templates.map((t) => (
                      <div key={t._id} className="tmpl-item">
                        <div
                          className="tm-main"
                          onClick={() => applyTemplate(t.body)}
                        >
                          <div className="tm-name">{t.name}</div>
                          <div className="tm-body">{t.body}</div>
                        </div>
                        <button
                          type="button"
                          className="tmpl-del"
                          title="Delete template"
                          onClick={() => removeTemplate(t._id)}
                        >
                          ×
                        </button>
                      </div>
                    ))
                  ) : (
                    <div className="tmpl-empty">
                      No templates yet. Type a message and "Save current".
                    </div>
                  )}
                </div>
              ) : null}

              {draft ? (
                <div className="ai-draft-bar">
                  <div className="ai-draft-head">
                    <span>
                      🤖 AI {draft.decision === "escalated" ? "escalation" : "draft"} — review before sending
                    </span>
                    {typeof draft.result?.confidence === "number" ? (
                      <span className="ai-draft-conf">
                        confidence {Math.round(draft.result.confidence * 100)}%
                      </span>
                    ) : null}
                  </div>
                  <textarea
                    value={draftText}
                    onChange={(e) => setDraftText(e.target.value)}
                    rows={2}
                  />
                  <div className="ai-draft-actions">
                    <button
                      type="button"
                      onClick={approveDraft}
                      disabled={draftBusy || optedOut || !draftText.trim()}
                    >
                      {draftBusy ? "Sending..." : "Approve & send"}
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      onClick={rejectDraft}
                      disabled={draftBusy}
                    >
                      Reject
                    </button>
                  </div>
                </div>
              ) : null}

              <form className="chat-input" onSubmit={handleSend}>
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  onKeyDown={handleComposerKeyDown}
                  placeholder={optedOut ? "Sending disabled — contact opted out" : "Type a message..."}
                  rows={2}
                  disabled={!active || sending || optedOut}
                />
                <button
                  type="submit"
                  disabled={!active || sending || optedOut || !text.trim()}
                >
                  {sending ? "Sending..." : "Send"}
                </button>
                <div className="composer-tools">
                  <button
                    type="button"
                    className="tmpl-btn"
                    onClick={() => setShowTemplates((v) => !v)}
                  >
                    Templates
                  </button>
                  <div className="composer-meta">
                    {composer.len} chars ·{" "}
                    <span className={composer.seg > 1 ? "warn" : ""}>
                      {composer.seg} segment{composer.seg === 1 ? "" : "s"}
                    </span>
                  </div>
                </div>
              </form>
            </>
          ) : (
            <div className="empty-chat empty-chat-centered">
              Select a conversation
            </div>
          )}
        </main>

        <aside className="inbox-context">
          {active ? (
            <>
              <div className="ctx-head">
                <span className="conv-avatar">
                  {getInitials(active.contact?.fullName)}
                </span>
                <div>
                  <div className="ctx-title">
                    {active.contact?.fullName || "Unknown"}
                  </div>
                  {optedOut ? <div className="ctx-sub">Opted out</div> : null}
                </div>
              </div>

              <div>
                <div className="ctx-section-label">Contact</div>
                <div className="ctx-field">
                  <span className="k">Phone</span>
                  <span className="v">
                    {active.contact?.normalizedPhone || active.contact?.phone || "-"}
                  </span>
                </div>
                <div className="ctx-field">
                  <span className="k">Email</span>
                  <span className="v">{active.contact?.email || "-"}</span>
                </div>
                <div className="ctx-field">
                  <span className="k">Status</span>
                  <span className="v">{active.contact?.status || "-"}</span>
                </div>
                <div className="ctx-field">
                  <span className="k">Line type</span>
                  <span className="v">{active.contact?.lineType || "unknown"}</span>
                </div>
              </div>

              <div>
                <div className="ctx-section-label">Automation</div>
                {enrollment ? (
                  <>
                    <div className="ctx-field">
                      <span className="k">Campaign</span>
                      <span className="v">{enrollment.campaignId?.name || "-"}</span>
                    </div>
                    <div className="ctx-field">
                      <span className="k">Status</span>
                      <span className="v">{enrollment.status || "-"}</span>
                    </div>
                    <div className="ctx-field">
                      <span className="k">Current step</span>
                      <span className="v">{enrollment.currentStep ?? "-"}</span>
                    </div>

                    <div className="ctx-actions">
                      {enrollment.status === "active" ? (
                        <button
                          type="button"
                          onClick={() => changeEnrollmentStatus("paused")}
                          disabled={enrollBusy}
                        >
                          Pause
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => changeEnrollmentStatus("active")}
                          disabled={enrollBusy}
                        >
                          Resume
                        </button>
                      )}
                      {enrollment.status !== "stopped" ? (
                        <button
                          type="button"
                          className="danger"
                          onClick={() => changeEnrollmentStatus("stopped")}
                          disabled={enrollBusy}
                        >
                          Stop
                        </button>
                      ) : null}
                    </div>
                  </>
                ) : (
                  <div className="ctx-empty">No active sequence</div>
                )}
              </div>

              <div>
                <div className="ctx-section-label">AI Assistant</div>
                <div className="ctx-field">
                  <span className="k">AI mode</span>
                  <select
                    value={aiMode}
                    onChange={(e) => changeAiMode(e.target.value)}
                    disabled={aiBusy}
                  >
                    <option value="default">Default</option>
                    <option value="forced_on">Always on</option>
                    <option value="forced_off">Off</option>
                  </select>
                </div>
                <div className="ctx-field">
                  <span className="k">Human takeover</span>
                  <span className="v">{takeover ? "Active — AI paused" : "Off"}</span>
                </div>
                <div className="ctx-actions">
                  {takeover ? (
                    <>
                      <button
                        type="button"
                        onClick={() => releaseTakeover(false)}
                        disabled={aiBusy}
                      >
                        Release to AI
                      </button>
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => releaseTakeover(true)}
                        disabled={aiBusy}
                      >
                        Keep AI off
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={claimTakeover}
                      disabled={aiBusy}
                    >
                      Take over
                    </button>
                  )}
                </div>
              </div>
            </>
          ) : (
            <div className="ctx-empty">Select a conversation to see contact details.</div>
          )}
        </aside>
      </div>
    </AppLayout>
  );
}
