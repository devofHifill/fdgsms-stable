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