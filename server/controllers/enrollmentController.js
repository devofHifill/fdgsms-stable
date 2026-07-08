// enrollmentController.js → campaign enrollment

// Work: Enrolls contacts into campaigns.

// Usually does:
// enroll one contact into a campaign
// bulk enroll many contacts
// fetch enrollments
// show enrollment status
// track current step / next send time
// In FDGSMS:

// This connects contacts to automation campaigns.

import mongoose from "mongoose";
import Campaign from "../models/Campaign.js";
import Contact from "../models/Contact.js";
import Enrollment from "../models/Enrollment.js";
import { createSystemLog } from "../services/systemLogService.js";

function getSortedSteps(campaign) {
  return [...(campaign?.steps || [])].sort(
    (a, b) => Number(a.stepNumber) - Number(b.stepNumber)
  );
}

function getFirstStep(campaign) {
  return getSortedSteps(campaign)[0] || null;
}

function computeNextSendAtFromStep(step, baseDate = new Date()) {
  const delayHours = Number(step?.delayHours || 0);
  return new Date(baseDate.getTime() + delayHours * 60 * 60 * 1000);
}

export async function enrollContact(req, res) {
  try {
    const { contactId, campaignId } = req.body;

    if (!contactId) {
      return res.status(400).json({ message: "contactId is required" });
    }

    if (!campaignId) {
      return res.status(400).json({ message: "campaignId is required" });
    }

    const [contact, campaign] = await Promise.all([
      Contact.findOne({ _id: contactId, isDeleted: false }).lean(),
      Campaign.findById(campaignId).lean(),
    ]);

    if (!contact) {
      return res.status(404).json({ message: "Contact not found" });
    }

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    if (!campaign.isActive) {
      return res.status(400).json({ message: "Campaign is inactive" });
    }

    const firstStep = getFirstStep(campaign);

    if (!firstStep) {
      return res.status(400).json({
        message: "Campaign must have at least one step",
      });
    }

    const existing = await Enrollment.findOne({
      contactId,
      campaignId,
      status: "active",
    }).lean();

    if (existing) {
      return res.status(400).json({
        message: "Contact is already actively enrolled in this campaign",
      });
    }

    const now = new Date();

    const enrollment = await Enrollment.create({
      contactId,
      campaignId,
      currentStep: Number(firstStep.stepNumber),
      nextSendAt: computeNextSendAtFromStep(firstStep, now),
      status: "active",
      stopReason: "",
      failureCount: 0,
      lastError: "",
      lastSentAt: null,
      completedAt: null,
      replyDetectedAt: null,
    });

    await createSystemLog({
      level: "info",
      category: "automation",
      event: "contact_enrolled",
      message: "Contact enrolled successfully",
      contactId: contact._id,
      enrollmentId: enrollment._id,
      campaignId: campaign._id,
      metadata: {
        firstStep: Number(firstStep.stepNumber),
        firstDelayHours: Number(firstStep.delayHours || 0),
        nextSendAt: enrollment.nextSendAt,
      },
    });

    return res.status(201).json({
      message: "Contact enrolled successfully",
      item: enrollment,
    });
  } catch (error) {
    await createSystemLog({
      level: "error",
      category: "automation",
      event: "contact_enrollment_failed",
      message: error.message || "Enrollment failed",
      metadata: {
        contactId: req.body?.contactId || "",
        campaignId: req.body?.campaignId || "",
      },
    });

    return res.status(500).json({
      message: "Enrollment failed",
    });
  }
}

export async function bulkEnrollContacts(req, res) {
  try {
    const { contactIds, campaignId } = req.body;

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ message: "contactIds is required" });
    }

    if (!campaignId) {
      return res.status(400).json({ message: "campaignId is required" });
    }

    const uniqueContactIds = [...new Set(contactIds.map(String))];

    const campaign = await Campaign.findById(campaignId).lean();

    if (!campaign) {
      return res.status(404).json({ message: "Campaign not found" });
    }

    if (!campaign.isActive) {
      return res.status(400).json({ message: "Campaign is inactive" });
    }

    const firstStep = getFirstStep(campaign);

    if (!firstStep) {
      return res.status(400).json({
        message: "Campaign must have at least one step",
      });
    }

    const contacts = await Contact.find({
      _id: { $in: uniqueContactIds },
      isDeleted: false,
    })
      .select("_id")
      .lean();

    const validContactIds = new Set(contacts.map((item) => String(item._id)));

    const existing = await Enrollment.find({
      contactId: { $in: uniqueContactIds },
      campaignId,
      status: "active",
    })
      .select("contactId")
      .lean();

    const existingContactIds = new Set(
      existing.map((item) => String(item.contactId))
    );

    const now = new Date();

    const docs = uniqueContactIds
      .filter((contactId) => validContactIds.has(String(contactId)))
      .filter((contactId) => !existingContactIds.has(String(contactId)))
      .map((contactId) => ({
        contactId,
        campaignId,
        currentStep: Number(firstStep.stepNumber),
        nextSendAt: computeNextSendAtFromStep(firstStep, now),
        status: "active",
        stopReason: "",
        failureCount: 0,
        lastError: "",
        lastSentAt: null,
        completedAt: null,
        replyDetectedAt: null,
      }));

    let created = [];
    if (docs.length > 0) {
      created = await Enrollment.insertMany(docs);
    }

    await createSystemLog({
      level: "info",
      category: "automation",
      event: "bulk_enrollment_completed",
      message: "Bulk enrollment completed",
      campaignId,
      metadata: {
        requestedCount: uniqueContactIds.length,
        validContactCount: validContactIds.size,
        createdCount: created.length,
        skippedCount:
          uniqueContactIds.length - created.length,
        firstStep: Number(firstStep.stepNumber),
        firstDelayHours: Number(firstStep.delayHours || 0),
      },
    });

    return res.status(200).json({
      message: "Bulk enrollment completed",
      requestedCount: uniqueContactIds.length,
      createdCount: created.length,
      skippedCount: uniqueContactIds.length - created.length,
      skippedContactIds: uniqueContactIds.filter(
        (id) =>
          existingContactIds.has(String(id)) ||
          !validContactIds.has(String(id))
      ),
      items: created,
    });
  } catch (error) {
    await createSystemLog({
      level: "error",
      category: "automation",
      event: "bulk_enrollment_failed",
      message: error.message || "Bulk enrollment failed",
      metadata: {
        campaignId: req.body?.campaignId || "",
      },
    });

    return res.status(500).json({
      message: "Bulk enrollment failed",
    });
  }
}

export async function getEnrollments(req, res) {
  try {
    const items = await Enrollment.find()
      .populate("contactId", "fullName phone normalizedPhone email")
      .populate("campaignId", "name steps isActive")
      .sort({ createdAt: -1 })
      .lean();

    return res.status(200).json({ items });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch enrollments",
    });
  }
}

export async function getEnrollmentByContact(req, res) {
  try {
    const { contactId } = req.params;

    const item = await Enrollment.findOne({ contactId })
      .populate("contactId", "fullName phone normalizedPhone email")
      .populate("campaignId", "name steps isActive")
      .sort({ createdAt: -1 })
      .lean();

    if (!item) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    return res.status(200).json(item);
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch enrollment",
    });
  }
}

// Manually pause / resume / stop an enrollment from the UI.
// - resume (active): re-arms nextSendAt so the worker picks it up
// - pause: clears nextSendAt (worker skips it) but keeps progress
// - stop: terminal manual stop
export async function updateEnrollmentStatus(req, res) {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid enrollment id" });
    }

    const allowed = ["active", "paused", "stopped"];
    if (!allowed.includes(status)) {
      return res.status(400).json({ message: "Invalid status" });
    }

    const update = { status };
    if (status === "active") {
      update.nextSendAt = new Date();
      update.stopReason = "";
    } else if (status === "paused") {
      update.nextSendAt = null;
      update.stopReason = "manual_pause";
    } else if (status === "stopped") {
      update.nextSendAt = null;
      update.stopReason = "manual";
    }

    const enrollment = await Enrollment.findByIdAndUpdate(
      id,
      { $set: update },
      { new: true }
    )
      .populate("contactId", "fullName phone normalizedPhone email")
      .populate("campaignId", "name steps isActive");

    if (!enrollment) {
      return res.status(404).json({ message: "Enrollment not found" });
    }

    await createSystemLog({
      level: "info",
      category: "automation",
      event: `enrollment_${status}`,
      message: `Enrollment manually set to ${status}`,
      enrollmentId: enrollment._id,
      contactId: enrollment.contactId?._id,
      campaignId: enrollment.campaignId?._id,
    });

    return res.status(200).json({ message: `Enrollment ${status}`, item: enrollment });
  } catch (error) {
    return res.status(500).json({ message: "Failed to update enrollment" });
  }
}