// campaignReportController.js → campaign plan C6: one campaign's report.
//
// GET /api/campaigns/:id/report?days=14
//   contacts by status, delivery per step and per day (account timezone),
//   top Twilio error codes, estimated finish, and cost from Twilio prices.
import mongoose from "mongoose";
import Campaign from "../models/Campaign.js";
import Enrollment from "../models/Enrollment.js";
import SMSMessage from "../models/SMSMessage.js";
import AutomationSettings from "../models/AutomationSettings.js";
import { NO_REPORT_AFTER_MS } from "../services/campaignDeliveryService.js";
import { describeTwilioError } from "../utils/twilioErrors.js";
import { effectiveGapMs, textsPerDay } from "../utils/campaignGap.js";
import { computeEndsAt, ALL_DAYS } from "../utils/campaignSchedule.js";
import { startOfDayInTimeZone, dayOfWeekInTimeZone } from "../utils/timezone.js";
import { windowHours, lastDayKeys, estimateFinish } from "../utils/campaignReport.js";

const DAY_MS = 24 * 60 * 60 * 1000;
const RECENT_DAYS = 7;

const round = (n, places = 4) => Math.round(n * 10 ** places) / 10 ** places;

function outcomeExpr(noReportBefore) {
  return {
    $switch: {
      branches: [
        { case: { $eq: ["$status", "delivered"] }, then: "delivered" },
        { case: { $in: ["$status", ["undelivered", "failed"]] }, then: "undelivered" },
        { case: { $lt: ["$createdAt", noReportBefore] }, then: "noReport" },
      ],
      default: "waiting",
    },
  };
}

export async function getCampaignReport(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.isValidObjectId(id)) return res.status(400).json({ message: "Invalid campaign id" });
    const campaign = await Campaign.findById(id).lean();
    if (!campaign) return res.status(404).json({ message: "Campaign not found" });

    const days = Math.min(Math.max(parseInt(req.query.days, 10) || 14, 1), 90);
    const now = new Date();
    const settings = (await AutomationSettings.findOne({ key: "default" }).lean()) || {};
    const tz = settings.timezone || "America/New_York";
    const campaignId = campaign._id;
    const steps = [...(campaign.steps || [])].sort((a, b) => a.stepNumber - b.stepNumber);
    const firstStep = Number(steps[0]?.stepNumber ?? 1);
    const noReportBefore = new Date(now.getTime() - NO_REPORT_AFTER_MS);
    const since = startOfDayInTimeZone(new Date(now.getTime() - (days - 1) * DAY_MS), tz);
    const recentSince = startOfDayInTimeZone(new Date(now.getTime() - (RECENT_DAYS - 1) * DAY_MS), tz);
    const outbound = { direction: "outbound", campaignId };

    const [contactAgg, stepAgg, dayAgg, errorAgg, recentStep1] = await Promise.all([
      Enrollment.aggregate([
        { $match: { campaignId } },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            notStarted: {
              $sum: {
                $cond: [
                  { $and: [{ $eq: ["$status", "active"] }, { $eq: ["$currentStep", firstStep] }, { $eq: [{ $ifNull: ["$lastSentAt", null] }, null] }] },
                  1,
                  0,
                ],
              },
            },
            active: { $sum: { $cond: [{ $eq: ["$status", "active"] }, 1, 0] } },
            completed: { $sum: { $cond: [{ $eq: ["$status", "completed"] }, 1, 0] } },
            replied: { $sum: { $cond: [{ $eq: ["$stopReason", "replied"] }, 1, 0] } },
            optedOut: { $sum: { $cond: [{ $in: ["$stopReason", ["opted_out", "opt_out", "unsubscribed"]] }, 1, 0] } },
            excludedUndelivered: {
              $sum: { $cond: [{ $regexMatch: { input: { $ifNull: ["$stopReason", ""] }, regex: "^undelivered_step_" } }, 1, 0] },
            },
            skippedDoNotText: { $sum: { $cond: [{ $eq: ["$stopReason", "do_not_text_list"] }, 1, 0] } },
            noDeliveryReport: { $sum: { $cond: [{ $eq: ["$stopReason", "no_delivery_report"] }, 1, 0] } },
            campaignStopped: { $sum: { $cond: [{ $eq: ["$stopReason", "campaign_stopped"] }, 1, 0] } },
            stopped: { $sum: { $cond: [{ $eq: ["$status", "stopped"] }, 1, 0] } },
          },
        },
      ]),
      SMSMessage.aggregate([
        { $match: outbound },
        { $project: { stepNumber: 1, price: 1, outcome: outcomeExpr(noReportBefore) } },
        {
          $group: {
            _id: { step: "$stepNumber", outcome: "$outcome" },
            count: { $sum: 1 },
            cost: { $sum: { $ifNull: ["$price", 0] } },
            priced: { $sum: { $cond: [{ $ne: [{ $ifNull: ["$price", null] }, null] }, 1, 0] } },
          },
        },
      ]),
      SMSMessage.aggregate([
        { $match: { ...outbound, createdAt: { $gte: since } } },
        {
          $project: {
            day: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt", timezone: tz } },
            stepNumber: 1,
            price: 1,
            outcome: outcomeExpr(noReportBefore),
          },
        },
        {
          $group: {
            _id: { day: "$day", outcome: "$outcome" },
            count: { $sum: 1 },
            step1Delivered: {
              $sum: { $cond: [{ $and: [{ $eq: ["$stepNumber", firstStep] }, { $eq: ["$outcome", "delivered"] }] }, 1, 0] },
            },
            cost: { $sum: { $ifNull: ["$price", 0] } },
          },
        },
      ]),
      SMSMessage.aggregate([
        { $match: { ...outbound, status: { $in: ["undelivered", "failed"] } } },
        { $group: { _id: { $ifNull: ["$errorCode", ""] }, count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 8 },
      ]),
      SMSMessage.countDocuments({ ...outbound, stepNumber: firstStep, status: "delivered", createdAt: { $gte: recentSince } }),
    ]);

    // ---- contacts
    const c = contactAgg[0] || {};
    const contacts = {
      total: c.total || 0,
      notStarted: c.notStarted || 0,
      inProgress: Math.max((c.active || 0) - (c.notStarted || 0), 0),
      completed: c.completed || 0,
      replied: c.replied || 0,
      optedOut: c.optedOut || 0,
      excludedUndelivered: c.excludedUndelivered || 0,
      skippedDoNotText: c.skippedDoNotText || 0,
      noDeliveryReport: c.noDeliveryReport || 0,
      campaignStopped: c.campaignStopped || 0,
    };
    contacts.otherStopped = Math.max(
      (c.stopped || 0) - contacts.replied - contacts.optedOut - contacts.excludedUndelivered -
        contacts.skippedDoNotText - contacts.noDeliveryReport - contacts.campaignStopped,
      0
    );

    // ---- per step + totals + cost
    const blank = () => ({ sent: 0, delivered: 0, undelivered: 0, waiting: 0, noReport: 0, cost: 0, priced: 0 });
    const byStep = new Map(steps.map((s) => [Number(s.stepNumber), blank()]));
    const totals = blank();
    for (const row of stepAgg) {
      const n = Number(row._id.step ?? 0);
      if (!byStep.has(n)) byStep.set(n, blank());
      for (const t of [byStep.get(n), totals]) {
        t.sent += row.count;
        t[row._id.outcome] += row.count;
        t.cost += row.cost;
        t.priced += row.priced;
      }
    }
    const rate = (t) => (t.delivered + t.undelivered ? Math.round((t.delivered / (t.delivered + t.undelivered)) * 100) : null);
    const stepRows = [...byStep.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([stepNumber, t]) => {
        const step = steps.find((s) => Number(s.stepNumber) === stepNumber);
        return {
          stepNumber,
          body: step?.body || "",
          sent: t.sent,
          delivered: t.delivered,
          undelivered: t.undelivered,
          waiting: t.waiting,
          noReport: t.noReport,
          deliveryRate: rate(t),
          cost: round(t.cost),
        };
      });

    // ---- per day (every day shown, empty ones as zero)
    const dayMap = new Map(lastDayKeys(now, days, tz).map((k) => [k, { day: k, ...blank(), step1Delivered: 0 }]));
    for (const row of dayAgg) {
      const d = dayMap.get(row._id.day);
      if (!d) continue;
      d.sent += row.count;
      d[row._id.outcome] += row.count;
      d.step1Delivered += row.step1Delivered;
      d.cost += row.cost;
    }
    const perDay = [...dayMap.values()].map(({ priced, ...d }) => ({ ...d, cost: round(d.cost) }));

    // ---- errors
    const failedTotal = totals.undelivered;
    const errors = errorAgg.map((row) => {
      const info = describeTwilioError(row._id);
      return {
        code: row._id || "",
        label: info?.label || "No error code",
        count: row.count,
        share: failedTotal ? Math.round((row.count / failedTotal) * 100) : 0,
      };
    });

    // ---- estimated finish
    const gapMs = effectiveGapMs(campaign.gap, settings.minCampaignGap);
    const capacityPerDay = textsPerDay(gapMs, windowHours(settings.sendingWindow));
    const sendDays = campaign.schedule?.sendDays?.length ? campaign.schedule.sendDays : ALL_DAYS;
    const started = new Date(campaign.schedule?.startAt || campaign.createdAt || now);
    let recentSendingDays = 0;
    for (let i = 0; i < RECENT_DAYS; i++) {
      const d = new Date(now.getTime() - i * DAY_MS);
      if (d.getTime() + DAY_MS < started.getTime()) continue;
      if (sendDays.includes(dayOfWeekInTimeZone(d, tz))) recentSendingDays += 1;
    }
    const recentPerDay = recentSendingDays ? recentStep1 / recentSendingDays : 0;
    const endsAt = computeEndsAt(campaign);
    const estimate = estimateFinish({
      now,
      state: campaign.state || "running",
      isActive: campaign.isActive !== false,
      notStarted: contacts.notStarted,
      inProgress: contacts.inProgress,
      target: campaign.dailyStep1Target || null,
      recentPerDay,
      capacityPerDay,
      sendDays,
      timeZone: tz,
      steps,
      endsAt,
    });

    // ---- cost
    const unit = (await SMSMessage.findOne({ ...outbound, priceUnit: { $gt: "" } }, { priceUnit: 1 }).lean())?.priceUnit || "USD";
    const cost = {
      total: round(totals.cost),
      unit,
      pricedTexts: totals.priced,
      unpricedTexts: totals.sent - totals.priced,
      perDelivered: totals.delivered && totals.priced ? round(totals.cost / totals.delivered) : null,
      perSent: totals.priced ? round(totals.cost / totals.priced) : null,
    };

    return res.json({
      campaign: {
        _id: campaign._id,
        name: campaign.name,
        isActive: campaign.isActive !== false,
        state: campaign.state || "running",
        pausedReason: campaign.pausedReason || "",
        createdAt: campaign.createdAt,
        stoppedAt: campaign.stoppedAt || null,
        completedAt: campaign.completedAt || null,
        dailyStep1Target: campaign.dailyStep1Target ?? null,
        gapMs,
        schedule: campaign.schedule || null,
        endsAt,
        stepCount: steps.length,
      },
      timezone: tz,
      generatedAt: now,
      days,
      contacts,
      totals: {
        sent: totals.sent,
        delivered: totals.delivered,
        undelivered: totals.undelivered,
        waiting: totals.waiting,
        noReport: totals.noReport,
        deliveryRate: rate(totals),
      },
      steps: stepRows,
      perDay,
      errors,
      estimate: { ...estimate, capacityPerDay, recentPerDay: round(recentPerDay, 1) },
      cost,
    });
  } catch (error) {
    console.error("getCampaignReport error:", error);
    return res.status(500).json({ message: "Failed to load campaign report" });
  }
}
