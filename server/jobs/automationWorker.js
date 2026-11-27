import Enrollment from "../models/Enrollment.js";
import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import SMSMessage from "../models/SMSMessage.js";
import AutomationSettings from "../models/AutomationSettings.js";

import { sendSMS } from "../services/twilioService.js";
import { createSystemLog } from "../services/systemLogService.js";
import { isValidNormalizedPhone } from "../utils/phone.js";
import {
  resolveContactSmsEligibility,
  isAllowedSmsLineType,
} from "../services/phoneIntelligenceService.js";
import { renderTemplate, buildContactTemplateVariables } from "../utils/template.js";
import { singleFlight } from "../utils/singleFlight.js";
import { describeTwilioError } from "../utils/twilioErrors.js";
import { findDoNotText, describeListing } from "../services/doNotTextService.js";
import {
  reconcileAwaitingEnrollments,
  excludeAfterFailure,
  countUndelivered,
  RECIPIENT_SEND_ERROR_CODES,
} from "../services/campaignDeliveryService.js";
import { isWithinSendingWindow } from "../utils/timezone.js";
import { effectiveGapMs } from "../utils/campaignGap.js";
import {
  hasStarted,
  isSendingDay,
  acceptsNewContacts,
  waitForStep,
} from "../utils/campaignSchedule.js";
import { updateCampaignStates } from "../services/campaignScheduleService.js";
import { backfillMessagePrices } from "../services/messagePriceService.js";
import {
  dayStart,
  platformLimitOf,
  countPlatformSentToday,
  countStep1Today,
  step1Room,
} from "../services/dailyLimitService.js";

// While a step is being sent, the enrollment's nextSendAt is pushed this far
// ahead so no other run (or server process) can pick the same step up. Every
// outcome of the send overwrites it; it only lingers if the process dies
// mid-send, and then the step is retried after the lock expires.
export const SEND_LOCK_MS = 10 * 60 * 1000;

// Atomically take the right to send the enrollment's current step. Matches on
// the values this run read, so if anyone else already advanced, rescheduled or
// stopped it, this returns null and the step is not sent again.
export async function claimEnrollmentStep(enrollment, now = new Date()) {
  return Enrollment.findOneAndUpdate(
    {
      _id: enrollment._id,
      status: "active",
      currentStep: enrollment.currentStep,
      nextSendAt: enrollment.nextSendAt,
    },
    { $set: { nextSendAt: new Date(now.getTime() + SEND_LOCK_MS) } },
    { returnDocument: "after" }
  );
}

// ---- campaign gap (campaign plan C2) ------------------------------------

// Contacts looked at per campaign per run, to get past ones that are stopped
// (opted out, invalid, on the do-not-text list…) before one is sent.
const PER_CAMPAIGN_SCAN = 25;
// The delivery sweep doesn't need to run on every few-second tick.
const SWEEP_EVERY_MS = 60 * 1000;
let lastSweepAt = 0;
let lastPlatformLimitLogDay = 0;

// Log "platform daily limit reached" once per day, not every 5 s.
async function logPlatformLimitOnce(since, limit) {
  if (lastPlatformLimitLogDay === since.getTime()) return;
  lastPlatformLimitLogDay = since.getTime();
  await createSystemLog({
    level: "warn",
    category: "automation",
    event: "platform_daily_limit_reached",
    message: `Platform daily SMS limit reached (${limit}). Campaign texts resume tomorrow; manual texts and AI replies still go out.`,
    metadata: { limit, dayStart: since },
  });
}

export function gapNotElapsed(campaign, gapMs, now = new Date()) {
  const last = campaign?.lastCampaignSendAt ? new Date(campaign.lastCampaignSendAt).getTime() : 0;
  return Boolean(last) && now.getTime() - last < gapMs;
}

// Atomically take the campaign's next send slot: succeeds only if its last
// text was at least gapMs ago, so two runs (or two servers) can never send
// within one gap. Returns { at, previous } or null.
export async function claimCampaignSendSlot(campaign, gapMs, now = new Date()) {
  const cutoff = new Date(now.getTime() - gapMs);
  const updated = await Campaign.findOneAndUpdate(
    {
      _id: campaign._id,
      $or: [{ lastCampaignSendAt: null }, { lastCampaignSendAt: { $lte: cutoff } }],
    },
    { $set: { lastCampaignSendAt: now } },
    { returnDocument: "before" }
  ).lean();
  if (!updated) return null;
  return { at: now, previous: updated.lastCampaignSendAt || null };
}

export async function releaseCampaignSendSlot(campaign, slot) {
  await Campaign.updateOne(
    { _id: campaign._id, lastCampaignSendAt: slot.at },
    { $set: { lastCampaignSendAt: slot.previous } }
  );
}

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

async function automationCycle() {
  const now = new Date();

  try {
    // Every cycle, even outside the sending window: release contacts whose
    // previous step was delivered, exclude failed ones, and cancel the steps of
    // contacts with no delivery report after 24 h (campaign plan C1).
    if (now.getTime() - lastSweepAt >= SWEEP_EVERY_MS) {
      lastSweepAt = now.getTime();
      await reconcileAwaitingEnrollments(now).catch((error) => {
        console.error("reconcileAwaitingEnrollments error:", error);
      });
      await updateCampaignStates(now).catch((error) => {
        console.error("updateCampaignStates error:", error);
      });
      // Campaign plan C6: Twilio prices for the campaign report's cost.
      await backfillMessagePrices(now).catch((error) => {
        console.error("backfillMessagePrices error:", error);
      });
    }

    const settings = await getAutomationSettings();

    if (!settings.enabled) {
      return;
    }

    // The window is read in the account timezone (Settings page), not the
    // server clock, which is UTC in Docker. AI replies are not limited by it.
    if (!isWithinSendingWindow(now, settings.sendingWindow, settings.timezone)) {
      return;
    }

    // Campaign plan C2: each campaign sends at most ONE text per gap (its own
    // gap, never under the Settings minimum). Campaigns are checked once per
    // run; only campaigns whose gap has passed look at their due contacts.
    const dueFilter = { status: "active", nextSendAt: { $ne: null, $lte: now } };
    const minGap = settings.minCampaignGap;
    const dueCampaignIds = await Enrollment.distinct("campaignId", dueFilter);
    if (!dueCampaignIds.length) return;

    // Campaign plan C3: platform daily SMS limit (all texts today count;
    // only campaign texts stop at it) and follow-ups-first near the limit.
    const since = dayStart(now, settings.timezone);
    const platformLimit = platformLimitOf(settings);
    let platformRemaining =
      platformLimit === null ? Infinity : platformLimit - (await countPlatformSentToday(since));
    if (platformRemaining <= 0) {
      await logPlatformLimitOnce(since, platformLimit);
      return;
    }
    // Keep enough of the day's remaining texts for follow-ups that are due,
    // so people already in a sequence aren't left hanging (Q4c).
    const followUpsDue =
      platformRemaining === Infinity
        ? 0
        : await Enrollment.countDocuments({ ...dueFilter, currentStep: { $gt: 1 } });
    const campaignsById = new Map(
      (await Campaign.find({ _id: { $in: dueCampaignIds } })).map((c) => [String(c._id), c])
    );

    for (const dueCampaignId of dueCampaignIds) {
      const campaignDoc = campaignsById.get(String(dueCampaignId)) || null;

      // Paused campaign (isActive=false): hold its contacts without touching
      // them, so they resume cleanly when the campaign is resumed.
      if (campaignDoc && !campaignDoc.isActive) continue;

      // Campaign plan C4: completed campaigns send nothing; nothing goes out
      // before the start or on a non-sending day (it waits for the next one).
      if (campaignDoc) {
        if (campaignDoc.state === "completed") continue;
        if (!hasStarted(campaignDoc, now)) continue;
        if (!isSendingDay(campaignDoc, now, settings.timezone)) continue;
      }

      const gapMs = campaignDoc ? effectiveGapMs(campaignDoc.gap, minGap) : 0;
      if (gapNotElapsed(campaignDoc, gapMs, now)) continue;

      if (platformRemaining <= 0) break;

      let enrollments;
      if (!campaignDoc) {
        // Deleted campaign: its contacts are stopped below.
        enrollments = await Enrollment.find({ ...dueFilter, campaignId: dueCampaignId }).limit(500);
      } else {
        const firstStepNumber = Number(getSortedSteps(campaignDoc)[0]?.stepNumber ?? 1);
        // Follow-ups first (Q4c), then new contacts (step 1).
        const followUps = await Enrollment.find({
          ...dueFilter,
          campaignId: dueCampaignId,
          currentStep: { $ne: firstStepNumber },
        })
          .sort({ nextSendAt: 1, createdAt: 1 })
          .limit(PER_CAMPAIGN_SCAN);

        // Step 1 only while the campaign's daily target has room and the
        // platform limit isn't needed for follow-ups.
        let newContacts = [];
        // After the campaign's end (date rules, or finishing) no new contacts.
        if (platformRemaining > followUpsDue && acceptsNewContacts(campaignDoc, now)) {
          const room = campaignDoc.dailyStep1Target
            ? step1Room(
                campaignDoc.dailyStep1Target,
                await countStep1Today(campaignDoc._id, firstStepNumber, since, now)
              )
            : Infinity;
          if (room > 0) {
            newContacts = await Enrollment.find({
              ...dueFilter,
              campaignId: dueCampaignId,
              currentStep: firstStepNumber,
            })
              .sort({ nextSendAt: 1, createdAt: 1 })
              .limit(PER_CAMPAIGN_SCAN);
          }
        }
        enrollments = [...followUps, ...newContacts];
      }

      // Becomes true once this campaign has used its slot (or lost it to
      // another run); the remaining contacts wait for the next gap.
      let campaignDone = false;

    for (const enrollment of enrollments) {
      if (campaignDone) break;
      try {
        const campaign = campaignDoc;
        const contact = await Contact.findById(enrollment.contactId);

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

        if (contact.optedOut) {
          enrollment.status = "stopped";
          enrollment.stopReason = "opted_out";
          enrollment.nextSendAt = null;

          await enrollment.save();

          await createSystemLog({
            level: "info",
            category: "automation",
            event: "automation_stopped_opted_out",
            message: "Automation stopped because contact opted out",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
          });

          continue;
        }

        // Do-not-text list: campaigns never text a number that was undelivered
        // in any campaign before (campaign plan C1, Q7).
        const listed = await findDoNotText(contact.normalizedPhone);
        if (listed) {
          enrollment.status = "stopped";
          enrollment.stopReason = "do_not_text_list";
          enrollment.lastError = describeListing(listed);
          enrollment.nextSendAt = null;
          await enrollment.save();

          await createSystemLog({
            level: "info",
            category: "automation",
            event: "automation_skipped_do_not_text",
            message: "Campaign step skipped: number is on the do-not-text list",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            metadata: { phone: contact.normalizedPhone, listedErrorCode: listed.errorCode },
          });
          continue;
        }

        // Paused campaign (isActive=false) — skip this cycle WITHOUT stopping the
        // enrollment, so it resumes cleanly when the campaign is reactivated.
        // (Reversible pause: stop → fix the message → resume.)
        if (!campaign.isActive) {
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
        // Re-evaluate any cached line type against the CURRENT allowed set so
        // that changing allowedLineTypes takes effect without waiting for the
        // per-contact lookup cache to expire.
        if (
          contact.lineTypeNormalized &&
          !isAllowedSmsLineType(
            contact.lineTypeNormalized,
            settings.allowedLineTypes
          )
        ) {
          enrollment.failureCount = (enrollment.failureCount || 0) + 1;
          enrollment.lastError = `Blocked line type (${contact.lineTypeNormalized || contact.lineTypeRaw || "unknown"})`;
          enrollment.status = "stopped";
          enrollment.stopReason = "non_sms_number";
          enrollment.nextSendAt = null;

          await enrollment.save();

          await createSystemLog({
            level: "warn",
            category: "automation",
            event: "automation_blocked_line_type_cached",
            message: "Automation stopped using cached blocked line type",
            contactId: contact._id,
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            metadata: {
              phone: contact.normalizedPhone,
              lineType: contact.lineTypeRaw || "",
              normalizedLineType: contact.lineTypeNormalized || "",
              source: "contact_cached_blocked_status",
            },
          });

          continue;
        }
        const eligibility = await resolveContactSmsEligibility(contact, {
          maxAgeDays: 30,
          allowStaleAllowedCacheOnLookupFailure: true,
          allowedLineTypes: settings.allowedLineTypes,
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

        // One text per campaign per gap: take the campaign's slot first.
        const slot = await claimCampaignSendSlot(campaign, gapMs);
        if (!slot) {
          campaignDone = true; // another run just used this campaign's slot
          continue;
        }
        campaignDone = true;

        const claimed = await claimEnrollmentStep(enrollment);
        if (!claimed) {
          // Another run already took (or changed) this step: give the slot back
          // so the next contact can use it.
          await releaseCampaignSendSlot(campaign, slot);
          campaignDone = false;
          continue;
        }
        enrollment.nextSendAt = claimed.nextSendAt;

        let renderedBody = currentStep.body;

        try {
          const templateVariables = buildContactTemplateVariables(contact);
          renderedBody = renderTemplate(currentStep.body, templateVariables);

          const response = await sendSMS({
            to: contact.normalizedPhone,
            body: renderedBody,
          });
          const sentMessage = await SMSMessage.create({
            contactId: contact._id,
            phone: contact.phone,
            normalizedPhone: contact.normalizedPhone,
            direction: "outbound",
            body: renderedBody,
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
            // The next step waits until THIS text is delivered; its delay then
            // counts from the delivery time (campaign plan C1, Q2). The status
            // webhook (or the reconcile sweep) sets nextSendAt.
            enrollment.currentStep = Number(nextStep.stepNumber);
            enrollment.nextSendAt = null;
            const wait = waitForStep(nextStep); // C4: after-previous or fixed date
            enrollment.awaitingDelivery = {
              messageId: sentMessage._id,
              stepNumber: Number(currentStep.stepNumber),
              sentAt: enrollment.lastSentAt,
              delayMs: wait.delayMs,
              notBefore: wait.notBefore,
            };
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
              waitingForDelivery: Boolean(nextStep),
              lookupSource: eligibility.source,
              normalizedLineType: eligibility.normalizedLineType,
            },
          });
        } catch (sendError) {
          enrollment.failureCount = (enrollment.failureCount || 0) + 1;
          enrollment.lastError = sendError.message || "Send failed";

          const sendErrorCode = sendError.code ? String(sendError.code) : "";
          const described = describeTwilioError(sendErrorCode);

          const failedMessage = await SMSMessage.create({
            contactId: contact._id,
            phone: contact.phone,
            normalizedPhone: contact.normalizedPhone,
            direction: "outbound",
            body: renderedBody,
            provider: "twilio",
            providerMessageSid: "",
            status: "failed",
            errorCode: sendErrorCode,
            errorMessage: described?.message || sendError.message || "",
            enrollmentId: enrollment._id,
            campaignId: campaign._id,
            stepNumber: currentStep.stepNumber,
            messageType: "automation",
            metadata: {
              ...(described
                ? { deliveryError: { code: described.code, permanent: described.permanent } }
                : {}),
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

          // A send-time error about the number itself (invalid, opted out at
          // Twilio, not reachable, not mobile) is treated like undelivered:
          // excluded + do-not-text list. Other errors (auth, config, network)
          // keep the retry-once rule. Both count towards the auto-pause run.
          if (RECIPIENT_SEND_ERROR_CODES.has(sendErrorCode)) {
            enrollment.status = "stopped";
            enrollment.stopReason = `undelivered_step_${currentStep.stepNumber}`;
            enrollment.nextSendAt = null;
            await enrollment.save();
            await excludeAfterFailure(failedMessage, described);
          } else {
            if (enrollment.failureCount >= 2) {
              enrollment.status = "stopped";
              enrollment.stopReason = "send_failed";
              enrollment.nextSendAt = null;
            } else {
              enrollment.nextSendAt = new Date(Date.now() + 60 * 60 * 1000);
            }
            await enrollment.save();
          }

          await countUndelivered(
            campaign._id,
            described?.message || sendError.message || ""
          );
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
      if (campaignDone) platformRemaining -= 1;
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

// Interval ticks that arrive while a cycle is still running are skipped.
export const runAutomationCycle = singleFlight(automationCycle);
