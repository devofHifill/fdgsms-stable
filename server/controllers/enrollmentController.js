import Enrollment from "../models/Enrollment.js";

export async function enrollContact(req, res) {
  try {
    const { contactId, campaignId } = req.body;

    if (!contactId) {
      return res.status(400).json({ message: "contactId is required" });
    }

    if (!campaignId) {
      return res.status(400).json({ message: "campaignId is required" });
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

    const enrollment = await Enrollment.create({
      contactId,
      campaignId,
      currentStep: 1,
      nextSendAt: new Date(),
      status: "active",
      stopReason: "",
    });

    return res.status(201).json({
      message: "Contact enrolled successfully",
      item: enrollment,
    });
  } catch (error) {
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

    const existing = await Enrollment.find({
      contactId: { $in: uniqueContactIds },
      campaignId,
      status: "active",
    })
      .select("contactId")
      .lean();

    const existingContactIds = new Set(existing.map((item) => String(item.contactId)));

    const docs = uniqueContactIds
      .filter((contactId) => !existingContactIds.has(String(contactId)))
      .map((contactId) => ({
        contactId,
        campaignId,
        currentStep: 1,
        nextSendAt: new Date(),
        status: "active",
        stopReason: "",
      }));

    let created = [];
    if (docs.length > 0) {
      created = await Enrollment.insertMany(docs);
    }

    return res.status(200).json({
      message: "Bulk enrollment completed",
      requestedCount: uniqueContactIds.length,
      createdCount: created.length,
      skippedCount: uniqueContactIds.length - created.length,
      skippedContactIds: uniqueContactIds.filter((id) =>
        existingContactIds.has(String(id))
      ),
      items: created,
    });
  } catch (error) {
    return res.status(500).json({
      message: "Bulk enrollment failed",
    });
  }
}

export async function getEnrollments(req, res) {
  try {
    const items = await Enrollment.find()
      .populate("contactId", "fullName phone normalizedPhone email")
      .populate("campaignId", "name steps")
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
      .populate("campaignId", "name steps")
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