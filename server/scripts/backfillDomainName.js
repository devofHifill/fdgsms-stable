// One-time backfill: contacts imported before the domainName field existed
// had their domain stored in lastName. Copies lastName -> domainName where
// lastName looks like a domain and domainName is still empty.
//
// Dry run (default, changes nothing):  node scripts/backfillDomainName.js
// Apply the changes:                   node scripts/backfillDomainName.js --apply
//
// lastName is left as it is.

import mongoose from "mongoose";
import dotenv from "dotenv";
import Contact from "../models/Contact.js";

dotenv.config();

const APPLY = process.argv.includes("--apply");
const DOMAIN_RE = /^(?!-)[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i;

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not set");
  }

  await mongoose.connect(process.env.MONGO_URI);

  const candidates = await Contact.find(
    {
      $or: [{ domainName: { $exists: false } }, { domainName: "" }],
      lastName: { $nin: [null, ""] },
    },
    { lastName: 1 }
  ).lean();

  const matches = candidates.filter((c) =>
    DOMAIN_RE.test(String(c.lastName).trim())
  );
  const skipped = candidates.length - matches.length;

  console.log(`Contacts with an empty domainName and a lastName: ${candidates.length}`);
  console.log(`  lastName looks like a domain (will copy): ${matches.length}`);
  console.log(`  lastName is not a domain (left alone):    ${skipped}`);
  console.log(
    "Examples:",
    matches.slice(0, 5).map((c) => String(c.lastName).trim().toLowerCase())
  );

  if (!APPLY) {
    console.log("\nDry run - nothing changed. Re-run with --apply to write.");
    return;
  }

  const ops = matches.map((c) => ({
    updateOne: {
      filter: { _id: c._id },
      update: { $set: { domainName: String(c.lastName).trim().toLowerCase() } },
    },
  }));

  const result = ops.length ? await Contact.bulkWrite(ops) : { modifiedCount: 0 };
  console.log(`\nUpdated ${result.modifiedCount} contacts.`);
}

main()
  .catch((error) => {
    console.error("Backfill failed:", error.message);
    process.exitCode = 1;
  })
  .finally(() => mongoose.disconnect());
