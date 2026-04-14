import Contact from "../models/Contact.js";
import UploadBatch from "../models/UploadBatch.js";
import { parseContactFile } from "../utils/parseContactFile.js";
import { normalizePhone, isValidNormalizedPhone } from "../utils/phone.js";
import { createSystemLog } from "../services/systemLogService.js";


function buildFullName(firstName, lastName, fullName) {
  if (fullName?.trim()) return fullName.trim();
  return `${firstName || ""} ${lastName || ""}`.trim();
}

export async function uploadPreview(req, res) {
  try {
    if (!req.file) {
      await createSystemLog({
        level: "warn",
        category: "upload",
        event: "upload_preview_missing_file",
        message: "Upload preview requested without a file",
      });

      return res.status(400).json({ message: "No file uploaded" });
    }

    const parsedRows = parseContactFile(req.file.path);

    const existingPhones = new Set(
      (
        await Contact.find(
          { isDeleted: false },
          { normalizedPhone: 1, _id: 0 }
        ).lean()
      ).map((item) => item.normalizedPhone)
    );

    const seenInFile = new Set();
    const validRows = [];
    const invalidRows = [];

    for (let i = 0; i < parsedRows.length; i += 1) {
      const raw = parsedRows[i];
      const normalizedPhone = normalizePhone(raw.phone);
      const fullName = buildFullName(
        raw.firstName,
        raw.lastName,
        raw.fullName
      );

      const rowData = {
        rowNumber: i + 2,
        firstName: raw.firstName || "",
        lastName: raw.lastName || "",
        fullName,
        email: String(raw.email || "").trim().toLowerCase(),
        phone: String(raw.phone || "").trim(),
        normalizedPhone,
      };

      const errors = [];

      if (!rowData.phone) {
        errors.push("Phone is required");
      }

      if (!normalizedPhone || !isValidNormalizedPhone(normalizedPhone)) {
        errors.push("Phone format is invalid");
      }

      if (existingPhones.has(normalizedPhone)) {
        errors.push("Phone already exists in database");
      }

      if (seenInFile.has(normalizedPhone)) {
        errors.push("Duplicate phone in uploaded file");
      }

      if (!fullName) {
        errors.push("Name is missing");
      }

      if (errors.length > 0) {
        invalidRows.push({
          ...rowData,
          errors,
        });
      } else {
        validRows.push(rowData);
        seenInFile.add(normalizedPhone);
      }
    }

    const duplicateRowsCount = invalidRows.filter((row) =>
      row.errors.some(
        (e) =>
          e.toLowerCase().includes("duplicate") ||
          e.toLowerCase().includes("already exists")
      )
    ).length;

    const batch = await UploadBatch.create({
      originalFileName: req.file.originalname,
      storedFileName: req.file.filename,
      mimeType: req.file.mimetype,
      totalRows: parsedRows.length,
      validRows: validRows.length,
      invalidRows: invalidRows.length,
      duplicateRows: duplicateRowsCount,
      status: "previewed",
    });

    await createSystemLog({
      level: "info",
      category: "upload",
      event: "upload_preview_generated",
      message: "Upload preview generated",
      metadata: {
        originalFileName: req.file.originalname,
        storedFileName: req.file.filename,
        mimeType: req.file.mimetype,
        totalRows: parsedRows.length,
        validRows: validRows.length,
        invalidRows: invalidRows.length,
        duplicateRows: duplicateRowsCount,
        batchId: batch._id,
      },
    });

    return res.status(200).json({
      message: "Preview generated successfully",
      batchId: batch._id,
      summary: {
        totalRows: parsedRows.length,
        validRows: validRows.length,
        invalidRows: invalidRows.length,
        duplicateRows: duplicateRowsCount,
      },
      validRows,
      invalidRows,
    });
  } catch (error) {
    console.error("Upload preview error:", error);

    await createSystemLog({
      level: "error",
      category: "upload",
      event: "upload_preview_failed",
      message: error.message || "Failed to generate upload preview",
      metadata: {
        fileName: req.file?.originalname || "",
        storedFileName: req.file?.filename || "",
      },
    });

    return res.status(500).json({
      message: error.message || "Failed to generate upload preview",
    });
  }
}

export async function importContacts(req, res) {
  try {
    const { batchId, validRows } = req.body;

    if (!batchId) {
      await createSystemLog({
        level: "warn",
        category: "upload",
        event: "contacts_import_missing_batch_id",
        message: "Contacts import requested without batchId",
      });

      return res.status(400).json({ message: "batchId is required" });
    }

    if (!Array.isArray(validRows) || validRows.length === 0) {
      await createSystemLog({
        level: "warn",
        category: "upload",
        event: "contacts_import_missing_rows",
        message: "Contacts import requested without validRows",
        metadata: {
          batchId,
        },
      });

      return res.status(400).json({
        message: "No valid rows provided for import",
      });
    }

    const batch = await UploadBatch.findById(batchId);

    if (!batch) {
      await createSystemLog({
        level: "warn",
        category: "upload",
        event: "contacts_import_batch_not_found",
        message: "Contacts import failed because upload batch was not found",
        metadata: {
          batchId,
        },
      });

      return res.status(404).json({ message: "Upload batch not found" });
    }

    const docs = validRows.map((row) => ({
      firstName: row.firstName || "",
      lastName: row.lastName || "",
      fullName: row.fullName || "",
      email: row.email || "",
      phone: row.phone || "",
      normalizedPhone: row.normalizedPhone || "",
      source: "upload",
      status: "new",
      uploadBatchId: batch._id,
    }));

    let insertedCount = 0;
    const failedRows = [];

    for (const doc of docs) {
      try {
        await Contact.create(doc);
        insertedCount += 1;
      } catch (error) {
        failedRows.push({
          phone: doc.phone,
          normalizedPhone: doc.normalizedPhone,
          reason: error.code === 11000 ? "Duplicate contact" : error.message,
        });
      }
    }

    batch.importedRows = insertedCount;
    batch.status = failedRows.length ? "failed" : "imported";
    await batch.save();

    await createSystemLog({
      level: failedRows.length ? "warn" : "info",
      category: "upload",
      event: "contacts_import_completed",
      message: "Contacts import completed",
      metadata: {
        batchId: batch._id,
        originalFileName: batch.originalFileName || "",
        importedCount: insertedCount,
        failedCount: failedRows.length,
        totalRequestedRows: validRows.length,
        batchStatus: batch.status,
        failedRows,
      },
    });

    return res.status(200).json({
      message: "Import completed",
      batchId: batch._id,
      importedCount: insertedCount,
      failedCount: failedRows.length,
      failedRows,
    });
  } catch (error) {
    console.error("Import contacts error:", error);

    await createSystemLog({
      level: "error",
      category: "upload",
      event: "contacts_import_failed",
      message: error.message || "Failed to import contacts",
      metadata: {
        batchId: req.body?.batchId || "",
      },
    });

    return res.status(500).json({
      message: error.message || "Failed to import contacts",
    });
  }
}