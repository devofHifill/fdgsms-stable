import SystemLog from "../models/SystemLog.js";

export async function getSystemLogs(req, res) {
  try {
    const page = Math.max(Number(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(Number(req.query.limit) || 20, 1), 100);
    const skip = (page - 1) * limit;

    const level = String(req.query.level || "").trim();
    const category = String(req.query.category || "").trim();
    const search = String(req.query.search || "").trim();

    const query = {};

    if (level && level !== "all") {
      query.level = level;
    }

    if (category && category !== "all") {
      query.category = category;
    }

    if (search) {
      query.$or = [
        { event: { $regex: search, $options: "i" } },
        { message: { $regex: search, $options: "i" } },
      ];
    }

    const [items, total] = await Promise.all([
      SystemLog.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate("contactId", "fullName normalizedPhone")
        .populate("campaignId", "name")
        .populate("enrollmentId", "status currentStep")
        .lean(),
      SystemLog.countDocuments(query),
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
    });
  } catch (error) {
    return res.status(500).json({
      message: "Failed to fetch system logs",
    });
  }
}