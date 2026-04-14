import Campaign from "../models/Campaign.js";

export async function createCampaign(req, res) {
  try {
    const { name, steps } = req.body;

    if (!name || !Array.isArray(steps) || !steps.length) {
      return res.status(400).json({ message: "Invalid campaign data" });
    }

    const campaign = await Campaign.create({
      name,
      steps,
    });

    res.json(campaign);
  } catch (error) {
    res.status(500).json({ message: "Failed to create campaign" });
  }
}

export async function getCampaigns(req, res) {
  const items = await Campaign.find().lean();
  res.json({ items });
}