// aiHistoryService.js → the conversation context handed to the AI.
import SMSMessage from "../models/SMSMessage.js";

export const AI_HISTORY_LIMIT = 50;

// The most recent `limit` messages for a contact, returned oldest → newest
// (the order the prompt builder expects). Sorting oldest-first before the
// limit would drop the newest messages — including the one being answered —
// once a thread grows past the limit. _id breaks ties between messages saved
// in the same millisecond.
export async function getRecentAiHistory(contactId, limit = AI_HISTORY_LIMIT) {
  const newestFirst = await SMSMessage.find({ contactId })
    .sort({ createdAt: -1, _id: -1 })
    .limit(limit)
    .select("direction body createdAt")
    .lean();

  return newestFirst.reverse();
}
