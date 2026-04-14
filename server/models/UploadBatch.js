import mongoose from "mongoose";

const uploadBatchSchema = new mongoose.Schema(
  {
    originalFileName: {
      type: String,
      required: true,
      trim: true,
    },
    storedFileName: {
      type: String,
      required: true,
      trim: true,
    },
    mimeType: {
      type: String,
      default: "",
    },
    totalRows: {
      type: Number,
      default: 0,
    },
    validRows: {
      type: Number,
      default: 0,
    },
    invalidRows: {
      type: Number,
      default: 0,
    },
    duplicateRows: {
      type: Number,
      default: 0,
    },
    importedRows: {
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ["previewed", "imported", "failed"],
      default: "previewed",
    },
  },
  {
    timestamps: true,
  }
);

export default mongoose.model("UploadBatch", uploadBatchSchema);