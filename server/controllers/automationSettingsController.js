import AutomationSettings from "../models/AutomationSettings.js";
import {
  SELECTABLE_LINE_TYPES,
  DEFAULT_ALLOWED_LINE_TYPES,
  normalizeLineType,
} from "../services/phoneIntelligenceService.js";

export async function getAutomationSettings(req, res) {
  try {
    let item = await AutomationSettings.findOne({ key: "default" });

    if (!item) {
      item = await AutomationSettings.create({
        key: "default",
        enabled: true,
        sendingWindow: {
          startHour: 9,
          endHour: 18,
        },
        maxMessagesPerRun: 20,
        allowedLineTypes: DEFAULT_ALLOWED_LINE_TYPES,
      });
    }

    return res.status(200).json(item);
  } catch (error) {
    console.error("getAutomationSettings error:", error);
    return res.status(500).json({
      message: "Failed to fetch automation settings",
    });
  }
}

export async function updateAutomationSettings(req, res) {
  try {
    const { enabled, sendingWindow, maxMessagesPerRun, allowedLineTypes } =
      req.body;

    let item = await AutomationSettings.findOne({ key: "default" });

    if (!item) {
      item = new AutomationSettings({ key: "default" });
    }

    if (enabled !== undefined) {
      item.enabled = Boolean(enabled);
    }

    if (sendingWindow) {
      const startHour = Number(sendingWindow.startHour);
      const endHour = Number(sendingWindow.endHour);

      if (
        Number.isNaN(startHour) ||
        Number.isNaN(endHour) ||
        startHour < 0 ||
        startHour > 23 ||
        endHour < 0 ||
        endHour > 23
      ) {
        return res.status(400).json({
          message: "sendingWindow hours must be between 0 and 23",
        });
      }

      item.sendingWindow = {
        startHour,
        endHour,
      };
    }

    if (maxMessagesPerRun !== undefined) {
      const parsed = Number(maxMessagesPerRun);

      if (Number.isNaN(parsed) || parsed < 1) {
        return res.status(400).json({
          message: "maxMessagesPerRun must be at least 1",
        });
      }

      item.maxMessagesPerRun = parsed;
    }

    if (allowedLineTypes !== undefined) {
      if (!Array.isArray(allowedLineTypes)) {
        return res.status(400).json({
          message: "allowedLineTypes must be an array",
        });
      }

      // Normalize, keep only recognized types, and de-duplicate.
      const sanitized = [
        ...new Set(
          allowedLineTypes
            .map((type) => normalizeLineType(type))
            .filter((type) => SELECTABLE_LINE_TYPES.includes(type))
        ),
      ];

      item.allowedLineTypes = sanitized;
    }

    await item.save();

    return res.status(200).json({
      message: "Automation settings updated successfully",
      item,
    });
  } catch (error) {
    console.error("updateAutomationSettings error:", error);
    return res.status(500).json({
      message: "Failed to update automation settings",
    });
  }
}