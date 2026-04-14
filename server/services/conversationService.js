import Conversation from "../models/Conversation.js";

export async function upsertConversation({
  contactId,
  normalizedPhone,
  message,
  direction,
}) {
  const update = {
    normalizedPhone,
    lastMessage: message,
    lastMessageAt: new Date(),
    lastDirection: direction,
  };

  const conversation = await Conversation.findOneAndUpdate(
    { contactId },
    { $set: update },
    {
      new: true,
      upsert: true,
    }
  );

  return conversation;
}