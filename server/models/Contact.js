import mongoose from "mongoose";

const contactSchema = new mongoose.Schema(
  {
    firstName: {
      type: String,
      trim: true,
      default: "",
    },
    lastName: {
      type: String,
      trim: true,
      default: "",
    },
    fullName: {
      type: String,
      trim: true,
      default: "",
    },
    email: {
      type: String,
      trim: true,
      lowercase: true,
      default: "",
    },
    phone: {
      type: String,
      trim: true,
      required: true,
    },
    normalizedPhone: {
      type: String,
      trim: true,
      required: true,
      index: true,
    },
    status: {
      type: String,
      enum: ["new", "active", "replied", "opted_out", "invalid"],
      default: "new",
    },
    source: {
      type: String,
      enum: ["manual", "upload"],
      default: "upload",
    },
    uploadBatchId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "UploadBatch",
      default: null,
    },
    notes: {
      type: String,
      default: "",
    },
    tags: {
      type: [String],
      default: [],
    },
    isDeleted: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

contactSchema.index({ normalizedPhone: 1 }, { unique: true });

export default mongoose.model("Contact", contactSchema);