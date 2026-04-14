import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { parse } from "csv-parse/sync";

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

function mapRow(rawRow) {
  const row = {};
  for (const key of Object.keys(rawRow || {})) {
    row[normalizeHeader(key)] = rawRow[key];
  }

  return {
    firstName: row.firstname || row.first || "",
    lastName: row.lastname || row.last || "",
    fullName: row.fullname || row.name || "",
    email: row.email || row.emailaddress || "",
    phone: row.phone || row.phonenumber || row.mobile || row.cell || "",
  };
}

export function parseContactFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") {
    const content = fs.readFileSync(filePath, "utf-8");
    const records = parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true,
    });

    return records.map(mapRow);
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const workbook = XLSX.readFile(filePath);
    const firstSheet = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheet];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "" });

    return rows.map(mapRow);
  }

  throw new Error("Unsupported file format");
}