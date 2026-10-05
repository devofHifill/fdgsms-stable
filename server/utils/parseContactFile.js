import fs from "fs";
import path from "path";
import XLSX from "xlsx";
import { parse } from "csv-parse/sync";

// Contact fields a file column can be mapped to.
export const MAPPABLE_FIELDS = [
  "firstName",
  "lastName",
  "email",
  "phone",
  "domainName",
];

// Header names (normalized) recognised automatically for each field.
// A full-name column falls back to firstName so its value still forms the name.
const HEADER_ALIASES = {
  firstName: ["firstname", "first", "fullname", "name"],
  lastName: ["lastname", "last"],
  email: ["email", "emailaddress"],
  phone: ["phone", "phonenumber", "mobile", "cell"],
  domainName: ["domainname", "domain", "website", "url"],
};

function normalizeHeader(header) {
  return String(header || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "")
    .replace(/[^a-z0-9]/g, "");
}

// Reads the file into row objects keyed by the file's own header names.
function readRawRows(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === ".csv") {
    const content = fs.readFileSync(filePath, "utf-8");
    return parse(content, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      relax_column_count: true,
      trim: true,
    });
  }

  if (ext === ".xlsx" || ext === ".xls") {
    const workbook = XLSX.readFile(filePath);
    const firstSheet = workbook.SheetNames[0];
    const sheet = workbook.Sheets[firstSheet];
    return XLSX.utils.sheet_to_json(sheet, { defval: "" });
  }

  throw new Error("Unsupported file format");
}

function collectHeaders(rows) {
  const headers = [];
  const seen = new Set();

  for (const row of rows) {
    for (const key of Object.keys(row || {})) {
      if (!seen.has(key)) {
        seen.add(key);
        headers.push(key);
      }
    }
  }

  return headers;
}

// Picks a column for each field from the header names, never using a column twice.
export function suggestMapping(headers) {
  const mapping = {};
  const used = new Set();

  for (const field of MAPPABLE_FIELDS) {
    mapping[field] = "";

    for (const alias of HEADER_ALIASES[field]) {
      const match = headers.find(
        (h) => !used.has(h) && normalizeHeader(h) === alias
      );

      if (match) {
        mapping[field] = match;
        used.add(match);
        break;
      }
    }
  }

  return mapping;
}

// Returns an error message, or "" when the mapping is usable for these headers.
export function validateMapping(mapping, headers) {
  if (!mapping || typeof mapping !== "object") {
    return "Column mapping is invalid";
  }

  const used = new Set();

  for (const field of MAPPABLE_FIELDS) {
    const column = mapping[field] || "";
    if (!column) continue;

    if (!headers.includes(column)) {
      return `Column "${column}" was not found in the file`;
    }

    if (used.has(column)) {
      return `Column "${column}" is mapped to more than one field`;
    }

    used.add(column);
  }

  if (!mapping.phone) {
    return "Choose which column holds the phone number";
  }

  return "";
}

function applyMapping(rawRow, mapping) {
  const value = (field) =>
    mapping[field] ? String(rawRow[mapping[field]] ?? "").trim() : "";

  return {
    firstName: value("firstName"),
    lastName: value("lastName"),
    fullName: "",
    email: value("email"),
    phone: value("phone"),
    domainName: value("domainName"),
  };
}

// Headers, a few example values per column, and the suggested mapping.
export function readContactFileColumns(filePath, sampleSize = 3) {
  const rows = readRawRows(filePath);
  const headers = collectHeaders(rows);

  const samples = {};
  for (const header of headers) {
    samples[header] = rows
      .map((row) => String(row[header] ?? "").trim())
      .filter(Boolean)
      .slice(0, sampleSize);
  }

  return {
    headers,
    samples,
    totalRows: rows.length,
    suggestedMapping: suggestMapping(headers),
  };
}

// Parses the file into contact rows. Without a mapping, columns are matched
// automatically by header name.
export function parseContactFile(filePath, mapping = null) {
  const rows = readRawRows(filePath);
  const headers = collectHeaders(rows);
  const effectiveMapping = mapping || suggestMapping(headers);

  const error = validateMapping(effectiveMapping, headers);
  if (mapping && error) {
    const err = new Error(error);
    err.statusCode = 400;
    throw err;
  }

  return rows.map((row) => applyMapping(row, effectiveMapping));
}
