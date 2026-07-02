import mongoose from "mongoose";

// Quick-reply / message templates used in the inbox composer.
const templateSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    body: {
      type: String,
      required: true,
      trim: true,
    },
  },
  { timestamps: true }
);

export default mongoose.model("Template", templateSchema);
