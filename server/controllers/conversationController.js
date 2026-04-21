// conversationController.js → inbox conversation list

// Work: Manages chat/conversation-level data.

    // Usually does:
    // return conversation list
    // return latest message preview
    // sort by recent activity
    // return conversation thread by contact
    
// In FDGSMS:

// This powers the Inbox sidebar and helps show one thread per contact.


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