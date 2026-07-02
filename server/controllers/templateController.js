import mongoose from "mongoose";
import Template from "../models/Template.js";

export async function getTemplates(req, res) {
  try {
    const items = await Template.find().sort({ createdAt: -1 }).lean();
    return res.json({ items });
  } catch (error) {
    return res.status(500).json({ message: "Failed to load templates" });
  }
}

export async function createTemplate(req, res) {
  try {
    const { name, body } = req.body;

    if (!name || !String(name).trim() || !body || !String(body).trim()) {
      return res.status(400).json({ message: "Name and body are required" });
    }

    const template = await Template.create({
      name: String(name).trim(),
      body: String(body).trim(),
    });

    return res.json(template);
  } catch (error) {
    return res.status(500).json({ message: "Failed to create template" });
  }
}

export async function deleteTemplate(req, res) {
  try {
    const { id } = req.params;

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ message: "Invalid template id" });
    }

    const template = await Template.findByIdAndDelete(id);
    if (!template) {
      return res.status(404).json({ message: "Template not found" });
    }

    return res.json({ message: "Template deleted", id });
  } catch (error) {
    return res.status(500).json({ message: "Failed to delete template" });
  }
}
