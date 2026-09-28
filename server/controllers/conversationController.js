// conversationController.js → inbox conversation list

// Work: Manages chat/conversation-level data.

    // Usually does:
    // return conversation list
    // return latest message preview
    // sort by recent activity
    // return conversation thread by contact
    
// In FDGSMS:

// This powers the Inbox sidebar and helps show one thread per contact.


import mongoose from "mongoose";
import Conversation from "../models/Conversation.js";
import SMSMessage from "../models/SMSMessage.js";
import Contact from "../models/Contact.js";

export async function getConversations(req, res) {
  try {
    const items = await Conversation.find()
      .sort({ lastMessageAt: -1 })
      .lean();

    const contactIds = items.map((c) => c.contactId);

    const contacts = await Contact.find({
      _id: { $in: contactIds },
    }).lean();

    const contactMap = new Map(
      contacts.map((c) => [String(c._id), c])
    );

    const enriched = items.map((conv) => {
      const contact = contactMap.get(String(conv.contactId));

      return {
        ...conv,
        contact: contact
          ? {
              fullName: contact.fullName,
              phone: contact.phone,
              email: contact.email,
              status: contact.status,
              normalizedPhone: contact.normalizedPhone,
              lineType: contact.lineTypeNormalized || contact.lineTypeRaw || "",
              aiMode: contact.aiMode || "default",
              tags: contact.tags || [],
            }
          : null,
      };
    });

    return res.json({ items: enriched });
  } catch (error) {
    console.error("getConversations error:", error);
    res.status(500).json({ message: "Failed to fetch conversations" });
  }
}

// Total number of conversations with unread inbound messages (for the nav badge).
export async function getUnreadCount(req, res) {
  try {
    const total = await Conversation.countDocuments({ unreadCount: { $gt: 0 } });
    return res.json({ total });
  } catch (error) {
    console.error("getUnreadCount error:", error);
    res.status(500).json({ message: "Failed to fetch unread count" });
  }
}

// Mark a conversation as read (clears its unread counter) when the user opens it.
export async function markConversationRead(req, res) {
  try {
    const { contactId } = req.params;

    if (!mongoose.isValidObjectId(contactId)) {
      return res.status(400).json({ message: "Invalid contact id" });
    }

    await Conversation.findOneAndUpdate(
      { contactId },
      { $set: { unreadCount: 0 } }
    );

    return res.json({ message: "Marked as read" });
  } catch (error) {
    console.error("markConversationRead error:", error);
    res.status(500).json({ message: "Failed to mark as read" });
  }
}

export async function getConversationMessages(req, res) {
  try {
    const { contactId } = req.params;

    const messages = await SMSMessage.find({ contactId })
      .sort({ createdAt: 1 })
      .lean();

    return res.json({ items: messages });
  } catch (error) {
    console.error("getConversationMessages error:", error);
    res.status(500).json({ message: "Failed to fetch messages" });
  }
}

// Delete a single message from a conversation thread.
// After removal, refresh the parent conversation preview so the sidebar stays in sync.
export async function deleteMessage(req, res) {
  try {
    const { messageId } = req.params;

    if (!mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({ message: "Invalid message id" });
    }

    const message = await SMSMessage.findByIdAndDelete(messageId);

    if (!message) {
      return res.status(404).json({ message: "Message not found" });
    }

    const latest = await SMSMessage.findOne({ contactId: message.contactId })
      .sort({ createdAt: -1 })
      .lean();

    if (latest) {
      await Conversation.findOneAndUpdate(
        { contactId: message.contactId },
        {
          $set: {
            lastMessage: latest.body,
            lastMessageAt: latest.createdAt,
            lastDirection: latest.direction,
          },
        }
      );
    } else {
      await Conversation.findOneAndUpdate(
        { contactId: message.contactId },
        { $set: { lastMessage: "", lastMessageAt: null } }
      );
    }

    return res.json({ message: "Message deleted", id: messageId });
  } catch (error) {
    console.error("deleteMessage error:", error);
    res.status(500).json({ message: "Failed to delete message" });
  }
}

// Mark multiple conversations read or unread at once (bulk select in the inbox).
export async function bulkMarkRead(req, res) {
  try {
    const { contactIds, read } = req.body || {};

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ message: "contactIds is required" });
    }

    const validIds = contactIds.filter((id) => mongoose.isValidObjectId(id));

    if (!validIds.length) {
      return res.status(400).json({ message: "No valid contact ids provided" });
    }

    const unreadCount = read === false ? 1 : 0;

    const result = await Conversation.updateMany(
      { contactId: { $in: validIds } },
      { $set: { unreadCount } }
    );

    return res.json({
      message: "Conversations updated",
      modified: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error("bulkMarkRead error:", error);
    res.status(500).json({ message: "Failed to update conversations" });
  }
}

// Delete multiple conversation threads at once (bulk select in the inbox).
export async function bulkDeleteConversations(req, res) {
  try {
    const { contactIds } = req.body || {};

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ message: "contactIds is required" });
    }

    const validIds = contactIds.filter((id) => mongoose.isValidObjectId(id));

    if (!validIds.length) {
      return res.status(400).json({ message: "No valid contact ids provided" });
    }

    const [messageResult, conversationResult] = await Promise.all([
      SMSMessage.deleteMany({ contactId: { $in: validIds } }),
      Conversation.deleteMany({ contactId: { $in: validIds } }),
    ]);

    return res.json({
      message: "Conversations deleted",
      deletedMessages: messageResult.deletedCount || 0,
      deletedConversations: conversationResult.deletedCount || 0,
    });
  } catch (error) {
    console.error("bulkDeleteConversations error:", error);
    res.status(500).json({ message: "Failed to delete conversations" });
  }
}

// Delete an entire conversation thread: the conversation record plus all its messages.
export async function deleteConversation(req, res) {
  try {
    const { contactId } = req.params;

    if (!mongoose.isValidObjectId(contactId)) {
      return res.status(400).json({ message: "Invalid contact id" });
    }

    const [messageResult, conversation] = await Promise.all([
      SMSMessage.deleteMany({ contactId }),
      Conversation.findOneAndDelete({ contactId }),
    ]);

    if (!conversation && (messageResult.deletedCount || 0) === 0) {
      return res.status(404).json({ message: "Conversation not found" });
    }

    return res.json({
      message: "Conversation deleted",
      deletedMessages: messageResult.deletedCount || 0,
      deletedConversation: Boolean(conversation),
    });
  } catch (error) {
    console.error("deleteConversation error:", error);
    res.status(500).json({ message: "Failed to delete conversation" });
  }
}
// CSV EXPORT (bulk select in the inbox)
//
// The browser only holds each conversation's last message, so the full
// transcript is assembled here and handed back as a ready-made CSV string.

function toCsvValue(value) {
  const text = value == null ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

// "2026-09-28 14:03" in the server's local time.
function formatTimestamp(date) {
  if (!date) return "";
  const d = new Date(date);
  const pad = (n) => String(n).padStart(2, "0");
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}`
  );
}

function speakerLabel(message) {
  if (message.direction === "inbound") return "Them";
  return ["failed", "undelivered"].includes(message.status)
    ? "Us (failed)"
    : "Us";
}

export async function exportConversationsCsv(req, res) {
  try {
    const { contactIds } = req.body || {};

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ message: "contactIds is required" });
    }

    const validIds = contactIds.filter((id) => mongoose.isValidObjectId(id));

    if (!validIds.length) {
      return res.status(400).json({ message: "No valid contact ids provided" });
    }

    const [contacts, conversations, messages] = await Promise.all([
      Contact.find({ _id: { $in: validIds } }).lean(),
      Conversation.find({ contactId: { $in: validIds } }).lean(),
      // Every stored message was already handed to the provider, so the
      // transcript keeps all of them whatever status they carry.
      SMSMessage.find({ contactId: { $in: validIds } })
        .sort({ createdAt: 1 })
        .lean(),
    ]);

    const conversationMap = new Map(
      conversations.map((c) => [String(c.contactId), c])
    );

    // Oldest message first, so each transcript reads top to bottom.
    const threads = new Map();
    for (const message of messages) {
      const key = String(message.contactId);
      const line = `${formatTimestamp(message.createdAt)} | ${speakerLabel(
        message
      )}: ${message.body || ""}`;
      threads.set(key, threads.has(key) ? `${threads.get(key)}\n${line}` : line);
    }

    // Same order as the inbox: most recent activity first.
    const rows = contacts.sort((a, b) => {
      const aAt = conversationMap.get(String(a._id))?.lastMessageAt || 0;
      const bAt = conversationMap.get(String(b._id))?.lastMessageAt || 0;
      return new Date(bAt) - new Date(aAt);
    });

    const header = [
      "Name",
      "Phone",
      "Email",
      "Status",
      "Line type",
      "Tags",
      "Full conversation",
      "Last message at",
    ];

    const lines = [header.map(toCsvValue).join(",")];

    for (const contact of rows) {
      const conversation = conversationMap.get(String(contact._id));

      lines.push(
        [
          contact.fullName || "",
          contact.normalizedPhone || contact.phone || "",
          contact.email || "",
          contact.status || "",
          contact.lineTypeNormalized || contact.lineTypeRaw || "",
          (contact.tags || []).join("; "),
          threads.get(String(contact._id)) || "",
          conversation?.lastMessageAt
            ? new Date(conversation.lastMessageAt).toISOString()
            : "",
        ]
          .map(toCsvValue)
          .join(",")
      );
    }

    return res.json({
      csv: lines.join("\n"),
      contacts: rows.length,
      messages: messages.length,
    });
  } catch (error) {
    console.error("exportConversationsCsv error:", error);
    res.status(500).json({ message: "Failed to export conversations" });
  }
}
