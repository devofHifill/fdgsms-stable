// campaignStopService.js → campaign plan C5: Stop (final) vs Pause (resume later).
//
// Stop ends the campaign for good: every contact still in it is stopped
// ("campaign_stopped"). With "remove pending numbers" (Q9–Q11), contacts that
// never received step 1 are soft-deleted (hidden like a deleted contact) and
// their enrollment in this campaign is removed, so a future import treats the
// number as new instead of "already in database". Kept, not removed:
// contacts that are also in another campaign, or have any message history
// (replies, manual texts). Numbers on the do-not-text list stay listed.
import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import Enrollment from "../models/Enrollment.js";
import SMSMessage from "../models/SMSMessage.js";
import { createSystemLog } from "./systemLogService.js";

function firstStepNumber(campaign) {
  return Number([...(campaign.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber)[0]?.stepNumber ?? 1);
}

// Contacts of this campaign that were never sent step 1, and which of them may
// be removed. Used for the Stop dialog's preview and for the stop itself.
export async function findPendingContacts(campaign) {
  const pending = await Enrollment.find({
    campaignId: campaign._id,
    status: "active",
    currentStep: firstStepNumber(campaign),
    lastSentAt: null,
  })
    .select("_id contactId")
    .lean();
  const contactIds = pending.map((e) => e.contactId);
  if (!contactIds.length) return { pending: [], removable: [], kept: { otherCampaign: 0, history: 0 } };

  const [inOther, withHistory] = await Promise.all([
    Enrollment.distinct("contactId", { contactId: { $in: contactIds }, campaignId: { $ne: campaign._id } }),
    SMSMessage.distinct("contactId", { contactId: { $in: contactIds } }),
  ]);
  const other = new Set(inOther.map(String));
  const history = new Set(withHistory.map(String));

  const removable = pending.filter((e) => !other.has(String(e.contactId)) && !history.has(String(e.contactId)));
  return {
    pending,
    removable,
    kept: {
      otherCampaign: pending.filter((e) => other.has(String(e.contactId))).length,
      history: pending.filter((e) => !other.has(String(e.contactId)) && history.has(String(e.contactId))).length,
    },
  };
}

export async function stopCampaign(campaignId, { removePending = false, by = "" } = {}) {
  const campaign = await Campaign.findById(campaignId);
  if (!campaign) return { ok: false, status: 404, message: "Campaign not found" };
  if (campaign.state === "stopped") return { ok: false, status: 400, message: "This campaign is already stopped" };

  const now = new Date();
  let removed = 0;
  let kept = { otherCampaign: 0, history: 0 };

  if (removePending) {
    const found = await findPendingContacts(campaign);
    kept = found.kept;
    if (found.removable.length) {
      const contactIds = found.removable.map((e) => e.contactId);
      const result = await Contact.updateMany(
        { _id: { $in: contactIds }, isDeleted: false },
        { $set: { isDeleted: true, deletedAt: now, deletedReason: `campaign_stopped:${campaign._id}` } }
      );
      removed = result.modifiedCount ?? 0;
      await Enrollment.deleteMany({ _id: { $in: found.removable.map((e) => e._id) } });
    }
  }

  const stopped = await Enrollment.updateMany(
    { campaignId: campaign._id, status: "active" },
    { $set: { status: "stopped", stopReason: "campaign_stopped", nextSendAt: null, "awaitingDelivery.messageId": null } }
  );

  campaign.state = "stopped";
  campaign.isActive = false;
  campaign.pausedReason = "";
  campaign.stoppedAt = now;
  campaign.stoppedRemovedContacts = removed;
  await campaign.save();

  const summary = {
    stoppedContacts: stopped.modifiedCount ?? 0,
    removedContacts: removed,
    keptInOtherCampaign: kept.otherCampaign,
    keptWithHistory: kept.history,
  };

  await createSystemLog({
    level: "info",
    category: "automation",
    event: "campaign_stopped",
    message: removePending
      ? `Campaign stopped; ${removed} contact(s) that never got step 1 removed`
      : "Campaign stopped",
    campaignId: campaign._id,
    metadata: { ...summary, removePending: Boolean(removePending), by },
  });

  return { ok: true, campaign, summary };
}
