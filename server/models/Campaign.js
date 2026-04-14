import mongoose from "mongoose";

const campaignStepSchema = new mongoose.Schema(
  {
    stepNumber: {
      type: Number,
      required: true,
    },
    body: {
      type: String,
      required: true,
    },
    delayHours: {
      type: Number,
      default: 24, // delay after previous step
    },
  },
  { _id: false }
);

const campaignSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    steps: {
      type: [campaignStepSchema],
      default: [],
    },
  },
  { timestamps: true }
);

export default mongoose.model("Campaign", campaignSchema);