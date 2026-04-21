import Enrollment from "../models/Enrollment.js";
import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import SMSMessage from "../models/SMSMessage.js";
import AutomationSettings from "../models/AutomationSettings.js";

import { sendSMS } from "../services/twilioService.js";
import { createSystemLog } from "../services/systemLogService.js";
import { isValidNormalizedPhone } from "../utils/phone.js";
import { resolveContactSmsEligibility } from "../services/phoneIntelligenceService.js";

function getSortedSteps(campaign) {
  return [...(campaign?.steps || [])].sort(
    (a, b) => Number(a.stepNumber) - Number(b.stepNumber)
  );
}

function getCurrentStep(campaign, currentStepNumber) {
  return getSortedSteps(campaign).find(
    (step) => Number(step.stepNumber) === Number(currentStepNumber)
  );
}

function getNextStep(campaign, currentStepNumber) {
  return getSortedSteps(campaign).find(
    (step) => Number(step.stepNumber) > Number(currentStepNumber)
  );
}

function computeNextSendAtFromStep(step, baseDate = new Date()) {
  const delayHours = Number(step?.delayHours || 0);
  return new Date(baseDate.getTime() + delayHours * 60 * 60 * 1000);
}

function isWithinSendingWindow(now, sendingWindow) {
  const startHour = Number(sendingWindow?.startHour ?? 9);
  const endHour = Number(sendingWindow?.endHour ?? 18);

  if (
    Number.isNaN(startHour) ||
    Number.isNaN(endHour) ||
    startHour < 0 ||
    startHour > 23 ||
    endHour < 0 ||
    endHour > 23
  ) {
    return true;
  }

  if (startHour === endHour) {
    return true;
  }

  const currentHour = now.getHours();

  if (startHour < endHour) {
    return currentHour >= startHour && currentHour < endHour;
  }

  return currentHour >= startHour || currentHour < endHour;
}

async function getAutomationSettings() {
  let settings = await AutomationSettings.findOne({ key: "default" });

  if (!settings) {
    settings = await AutomationSettings.create({
      key: "default",
      enabled: true,
      sendingWindow: {
        startHour: 9,
        endHour: 18,
      },
      maxMessagesPerRun: 20,
    });
  }

  return settings;
}

export async function runAutomationCycle() {
  const now = new Date();

  try {
    const settings = await getAutomationSettings();

    if (!settings.enabled) {
      return;
    }

    if (!isWithinSendingWindow(now, settings.sendingWindow)) {
      return;
    }

    const limit = Math.max(Number(settings.maxMessagesPerRun) || 20, 1);

    const enrollments = await Enrollment.find({
      status: "active",
      nextSendAt: { $ne: null, $lte: now },
    })
      .sort({ nextSendAt: 1, createdAt: 1 })
      .limit(limit);

    for (const enrollment of enrollments) {
      try {
        const [campaign, contact] = await Promise.all([
          Campaign.findById(enrollment.campaignId),
          Contact.findById(enrollment.contactId),
        ]);

        if (!campaign || !contact) {
          enrollment.status = "stopped";
          enrollment.stopReason = !campaign
            ? "campaign_missing"
            : "contact_missing";
          enrollment.nextSendAt = null;

          await enrollment.save();

          await createSystemLog({
            level: "warn",
            category: "automation",
            event: "automation_stopped_missing_dependency",
            message: "Automation stopped due to missing contact or campaign",
            contactId: contact?._id || null,
            enrollmentId: enrollment._id,
            campaignId: campaign?._id || enrollment.campaignId,
          });

          continue;
        }

        if (!campaign.isActive) {
          enrollment.status = "stopped";
          enrollment.stopReason = "campaign_inactive";
          enrollment.nextSendAt = null;

          await enrollment.save();

          await createSystemLog({
            level: "warn",
            category: "automation",
            event: "automation_stopped_campaign_inactive",
            message: "Automation stopped because campaign is inactive",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
          });

          continue;
        }

        const currentStep = getCurrentStep(campaign, enrollment.currentStep);

        if (!currentStep) {
          enrollment.status = "completed";
          enrollment.completedAt = new Date();
          enrollment.nextSendAt = null;

          await enrollment.save();

          await createSystemLog({
            level: "info",
            category: "automation",
            event: "enrollment_completed",
            message: "Enrollment completed all steps",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
          });

          continue;
        }

        if (!contact.normalizedPhone) {
          enrollment.status = "stopped";
          enrollment.stopReason = "missing_phone";
          enrollment.nextSendAt = null;

          await enrollment.save();

          await createSystemLog({
            level: "warn",
            category: "automation",
            event: "automation_stopped_missing_phone",
            message: "Automation stopped due to missing phone",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
          });

          continue;
        }

        if (!isValidNormalizedPhone(contact.normalizedPhone)) {
          enrollment.failureCount = (enrollment.failureCount || 0) + 1;
          enrollment.lastError = "Invalid phone format";
          enrollment.status = "stopped";
          enrollment.stopReason = "invalid_phone";
          enrollment.nextSendAt = null;

          await enrollment.save();

          await createSystemLog({
            level: "warn",
            category: "automation",
            event: "automation_blocked_invalid_phone",
            message: "Automation blocked due to invalid phone format",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            metadata: {
              phone: contact.normalizedPhone,
            },
          });

          continue;
        }

        const eligibility = await resolveContactSmsEligibility(contact, {
          maxAgeDays: 30,
          allowStaleAllowedCacheOnLookupFailure: true,
        });

        if (!eligibility.allowSend) {
          if (eligibility.shouldRetryLookup) {
            enrollment.lastError =
              eligibility.lookupError ||
              "Lookup unavailable and no usable cached line type exists";
            enrollment.nextSendAt = new Date(Date.now() + 6 * 60 * 60 * 1000);

            await enrollment.save();

            await createSystemLog({
              level: "warn",
              category: "automation",
              event: "automation_lookup_retry_scheduled",
              message:
                "Lookup unavailable with no usable cache; enrollment rescheduled instead of sending blindly",
              contactId: contact._id,
              enrollmentId: enrollment._id,
              campaignId: campaign._id,
              metadata: {
                phone: contact.normalizedPhone,
                retryAt: enrollment.nextSendAt,
                lookupError: eligibility.lookupError || "",
              },
            });

            continue;
          }

          enrollment.failureCount = (enrollment.failureCount || 0) + 1;
          enrollment.lastError = `Blocked line type (${eligibility.normalizedLineType || "unknown"})`;
          enrollment.status = "stopped";
          enrollment.stopReason = "non_sms_number";
          enrollment.nextSendAt = null;

          await enrollment.save();

          await createSystemLog({
            level: "warn",
            category: "automation",
            event: "automation_blocked_line_type",
            message: "Automation stopped due to disallowed line type",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            metadata: {
              phone: contact.normalizedPhone,
              lineType: eligibility.rawLineType,
              normalizedLineType: eligibility.normalizedLineType,
              source: eligibility.source,
            },
          });

          continue;
        }

        try {
          const response = await sendSMS({
            to: contact.normalizedPhone,
            body: currentStep.body,
          });

          await SMSMessage.create({
            contactId: contact._id,
            phone: contact.phone,
            normalizedPhone: contact.normalizedPhone,
            direction: "outbound",
            body: currentStep.body,
            provider: "twilio",
            providerMessageSid: response.sid || "",
            status: response.status || "queued",
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            stepNumber: currentStep.stepNumber,
            messageType: "automation",
            metadata: {
              lookup: {
                source: eligibility.source,
                lineType: eligibility.rawLineType,
                normalizedLineType: eligibility.normalizedLineType,
                staleCacheFallback: Boolean(eligibility.staleCacheFallback),
              },
            },
          });

          enrollment.failureCount = 0;
          enrollment.lastError = "";
          enrollment.lastSentAt = new Date();

          const nextStep = getNextStep(campaign, currentStep.stepNumber);

          if (!nextStep) {
            enrollment.status = "completed";
            enrollment.completedAt = new Date();
            enrollment.nextSendAt = null;
          } else {
            enrollment.currentStep = Number(nextStep.stepNumber);
            enrollment.nextSendAt = computeNextSendAtFromStep(
              nextStep,
              enrollment.lastSentAt
            );
          }

          await enrollment.save();

          await createSystemLog({
            level: "info",
            category: "automation",
            event: "automation_step_sent",
            message: "Automation message sent",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            metadata: {
              sentStep: Number(currentStep.stepNumber),
              nextStep: nextStep ? Number(nextStep.stepNumber) : null,
              phone: contact.normalizedPhone,
              nextSendAt: enrollment.nextSendAt,
              lookupSource: eligibility.source,
              normalizedLineType: eligibility.normalizedLineType,
            },
          });
        } catch (sendError) {
          enrollment.failureCount = (enrollment.failureCount || 0) + 1;
          enrollment.lastError = sendError.message || "Send failed";

          await SMSMessage.create({
            contactId: contact._id,
            phone: contact.phone,
            normalizedPhone: contact.normalizedPhone,
            direction: "outbound",
            body: currentStep.body,
            provider: "twilio",
            providerMessageSid: "",
            status: "failed",
            errorCode: sendError.code ? String(sendError.code) : "",
            errorMessage: sendError.message || "",
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            stepNumber: currentStep.stepNumber,
            messageType: "automation",
            metadata: {
              lookup: {
                source: eligibility.source,
                lineType: eligibility.rawLineType,
                normalizedLineType: eligibility.normalizedLineType,
                staleCacheFallback: Boolean(eligibility.staleCacheFallback),
              },
            },
          });

          await createSystemLog({
            level: "error",
            category: "automation",
            event: "automation_send_failed",
            message: "Automation send failed",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            metadata: {
              error: sendError.message,
              errorCode: sendError.code,
              failureCount: enrollment.failureCount,
              stepNumber: currentStep.stepNumber,
              lookupSource: eligibility.source,
              normalizedLineType: eligibility.normalizedLineType,
            },
          });

          if (enrollment.failureCount >= 2) {
            enrollment.status = "stopped";
            enrollment.stopReason = "send_failed";
            enrollment.nextSendAt = null;
          } else {
            enrollment.nextSendAt = new Date(Date.now() + 60 * 60 * 1000);
          }

          await enrollment.save();
        }
      } catch (err) {
        console.error("Automation error:", err);

        await createSystemLog({
          level: "error",
          category: "automation",
          event: "automation_cycle_error",
          message: err.message || "Unexpected automation error",
          metadata: {
            enrollmentId: enrollment._id,
          },
        });
      }
    }
  } catch (error) {
    console.error("runAutomationCycle fatal error:", error);

    await createSystemLog({
      level: "error",
      category: "automation",
      event: "automation_cycle_fatal_error",
      message: error.message || "Fatal automation cycle error",
    });
  }
}