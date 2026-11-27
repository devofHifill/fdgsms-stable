// campaignScheduleService.js → campaign plan C4: Running → Finishing → Completed.
//
// Finishing: the campaign stops starting new contacts (end date/days/weeks
// reached, or — with "until contacts run out" — every contact has had step 1);
// contacts already in the sequence finish their remaining steps.
// Completed: nobody is left in the sequence. Checked once a minute.
import Campaign from "../models/Campaign.js";
import Enrollment from "../models/Enrollment.js";
import { createSystemLog } from "./systemLogService.js";
import { computeEndsAt } from "../utils/campaignSchedule.js";

function firstStepNumber(campaign) {
  return Number([...(campaign.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber)[0]?.stepNumber ?? 1);
}

async function setState(campaign, to, extra, message) {
  const result = await Campaign.updateOne(
    { _id: campaign._id, state: campaign.state || "running" },
    { $set: { state: to, ...extra } }
  );
  if (result.modifiedCount) {
    await createSystemLog({
      level: "info",
      category: "automation",
      event: to === "completed" ? "campaign_completed" : "campaign_finishing",
      message,
      campaignId: campaign._id,
      metadata: { from: campaign.state || "running", to, ...extra },
    });
  }
  return Boolean(result.modifiedCount);
}

// Why a running campaign should start finishing now, or "" if it shouldn't.
export async function finishingReasonFor(campaign, now = new Date()) {
  const endsAt = computeEndsAt(campaign);
  if (endsAt && now.getTime() >= endsAt.getTime()) return "end_date";

  if (campaign.schedule?.untilContactsRunOut) {
    const total = await Enrollment.countDocuments({ campaignId: campaign._id });
    if (total > 0) {
      const waitingForStep1 = await Enrollment.countDocuments({
        campaignId: campaign._id,
        status: "active",
        currentStep: firstStepNumber(campaign),
      });
      if (waitingForStep1 === 0) return "contacts_ran_out";
    }
  }
  return "";
}

export async function updateCampaignStates(now = new Date()) {
  const campaigns = await Campaign.find({ state: { $in: [null, "running", "finishing"] } }).lean();
  let finishing = 0;
  let completed = 0;

  for (const campaign of campaigns) {
    const state = campaign.state || "running";

    if (state === "running") {
      const reason = await finishingReasonFor(campaign, now);
      if (reason) {
        const text =
          reason === "end_date"
            ? "Campaign reached its end: no new contacts; contacts already in it finish their steps"
            : "Every contact has had step 1: no new contacts; the rest finish their steps";
        if (await setState(campaign, "finishing", { finishingReason: reason, finishingAt: now }, text)) {
          finishing += 1;
          campaign.state = "finishing";
        }
      }
    }

    if ((campaign.state || "running") === "finishing") {
      const active = await Enrollment.countDocuments({ campaignId: campaign._id, status: "active" });
      if (active === 0 && (await setState(campaign, "completed", { completedAt: now }, "Campaign completed: every contact has finished"))) {
        completed += 1;
      }
    }
  }

  return { finishing, completed };
}

// Enrolling into a campaign that is finishing / completed (campaign plan Q15).
// A campaign that only finished because its contacts ran out re-opens when new
// contacts are added, as long as its date rules still allow new contacts.
export async function prepareForNewContacts(campaign, now = new Date()) {
  const state = campaign.state || "running";
  if (state === "running") return { ok: true };

  const endsAt = computeEndsAt(campaign);
  const datesAllow = !endsAt || now.getTime() < endsAt.getTime();
  if (state === "finishing" && campaign.finishingReason === "contacts_ran_out" && datesAllow) {
    await Campaign.updateOne(
      { _id: campaign._id, state: "finishing" },
      { $set: { state: "running", finishingReason: "", finishingAt: null } }
    );
    await createSystemLog({
      level: "info",
      category: "automation",
      event: "campaign_reopened",
      message: "New contacts added: campaign running again",
      campaignId: campaign._id,
    });
    return { ok: true, reopened: true };
  }

  if (state === "stopped") {
    return { ok: false, message: "This campaign was stopped and no longer takes new contacts. Clone it to run it again." };
  }

  return {
    ok: false,
    message:
      state === "completed"
        ? "This campaign has completed and no longer takes new contacts. Clone it to run it again."
        : "This campaign has reached its end and no longer takes new contacts; contacts already in it are finishing their steps.",
  };
}
