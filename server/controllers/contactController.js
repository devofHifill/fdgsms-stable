// contactController.js → contact listing and detail

// Work: Manages stored contacts.

    // Usually does:
    // get all contacts
    // search contacts
    // filter contacts
    // paginate contacts
    // get one contact by ID
// In FDGSMS:

// This powers the Contacts page where you browse, search, and inspect contacts.


import mongoose from "mongoose";
import Contact from "../models/Contact.js";

function escapeRegex(value = "") {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export async function getContacts(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 10, 1), 500);
    const skip = (page - 1) * limit;

    const search = String(req.query.search || "").trim();
    const status = String(req.query.status || "").trim();

    const query = { isDeleted: false };

    if (status && status !== "all") {
      query.status = status;
    }

    if (search) {
      const regex = new RegExp(escapeRegex(search), "i");
      query.$or = [
        { firstName: regex },
        { lastName: regex },
        { fullName: regex },
        { email: regex },
        { phone: regex },
        { normalizedPhone: regex },
      ];
    }

    const [items, total] = await Promise.all([
      Contact.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean(),
      Contact.countDocuments(query),
    ]);

    return res.status(200).json({
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: page * limit < total,
        hasPrevPage: page > 1,
      },
      filters: {
        search,
        status: status || "all",
      },
    });
  } catch (error) {
    console.error("Get contacts error:", error);
    return res.status(500).json({
      message: "Failed to fetch contacts",
    });
  }
}

// Add, remove, or replace tags on multiple contacts at once (bulk select in the inbox).
export async function bulkUpdateTags(req, res) {
  try {
    const { contactIds, tags, mode = "add" } = req.body || {};

    if (!Array.isArray(contactIds) || contactIds.length === 0) {
      return res.status(400).json({ message: "contactIds is required" });
    }

    if (!Array.isArray(tags) || tags.length === 0) {
      return res.status(400).json({ message: "tags is required" });
    }

    const validIds = contactIds.filter((id) => mongoose.isValidObjectId(id));
    const cleanTags = [
      ...new Set(tags.map((t) => String(t).trim()).filter(Boolean)),
    ];

    if (!validIds.length) {
      return res.status(400).json({ message: "No valid contact ids provided" });
    }

    if (!cleanTags.length) {
      return res.status(400).json({ message: "No valid tags provided" });
    }

    let update;
    if (mode === "remove") {
      update = { $pull: { tags: { $in: cleanTags } } };
    } else if (mode === "set") {
      update = { $set: { tags: cleanTags } };
    } else {
      update = { $addToSet: { tags: { $each: cleanTags } } };
    }

    const result = await Contact.updateMany(
      { _id: { $in: validIds } },
      update
    );

    return res.json({
      message: "Tags updated",
      modified: result.modifiedCount || 0,
    });
  } catch (error) {
    console.error("bulkUpdateTags error:", error);
    res.status(500).json({ message: "Failed to update tags" });
  }
}

export async function getContactById(req, res) {
  try {
    const { id } = req.params;

    const contact = await Contact.findOne({
      _id: id,
      isDeleted: false,
    }).lean();

    if (!contact) {
      return res.status(404).json({
        message: "Contact not found",
      });
    }

    return res.status(200).json(contact);
  } catch (error) {
    console.error("Get contact by id error:", error);
    return res.status(500).json({
      message: "Failed to fetch contact details",
    });
  }
}