import SystemLog from "../models/SystemLog.js";

export async function createSystemLog({
  level = "info",
  category = "system",
  event,
  message,
  contactId = null,
  enrollmentId = null,
  campaignId = null,
  metadata = {},
}) {
  try {
    if (!event || !message) return null;

    const log = await SystemLog.create({
      level,
      category,
      event,
      message,
      contactId,
      enrollmentId,
      campaignId,
      metadata,
    });

    return log;
  } catch (error) {
    console.error("Failed to write system log:", error.message);
    return null;
  }
}