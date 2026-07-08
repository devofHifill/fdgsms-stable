// optOut.js → SMS compliance keyword handling (TCPA / 10DLC / CTIA)
//
// Detects STOP / START keywords in inbound SMS and applies the resulting
// contact + enrollment state changes. Kept separate from the webhook
// controller so the keyword rules are isolated and easy to reason about.
//
// The app itself never sends a confirmation reply — at the carrier level
// Twilio's Advanced Opt-Out sends the legally mandated STOP/START responses.

import Contact from "../models/Contact.js";
import Enrollment from "../models/Enrollment.js";

// CTIA standard opt-out keywords (carrier-recognized).
const STOP_KEYWORDS = new Set([
  "stop",
  "stopall",
  "unsubscribe",
  "cancel",
  "end",
  "quit",
  "optout",
]);

// CTIA standard opt-in / resume keywords.
const START_KEYWORDS = new Set([
  "start",
  "unstop",
  "yes",
  "optin",
]);

// Carriers match opt-out keywords case-insensitively when the keyword is the
// entire message. We mirror that: trim, lowercase, drop surrounding whitespace
// and trailing punctuation, then require an exact single-token match. This is
// deliberately strict so phrases like "stop by later" are NOT treated as opt-outs.
function normalizeKeyword(body) {
  return String(body || "")
    .trim()
    .toLowerCase()
    .replace(/[\s]+/g, " ")
    .replace(/[.!?,;:]+$/g, "")
    .trim();
}

/**
 * Classify an inbound message body as a compliance keyword.
 * @returns {"stop" | "start" | "none"}
 */
export function classifyInboundKeyword(body) {
  const keyword = normalizeKeyword(body);
  if (!keyword) return "none";
  if (STOP_KEYWORDS.has(keyword)) return "stop";
  if (START_KEYWORDS.has(keyword)) return "start";
  return "none";
}

/**
 * Apply an opt-out: mark the contact opted out and stop any active enrollments.
 * @returns {Promise<{ stoppedEnrollments: number }>}
 */
export async function applyOptOut(contact) {
  const now = new Date();

  await Contact.findByIdAndUpdate(contact._id, {
    $set: {
      status: "opted_out",
      optedOut: true,
      optedOutAt: now,
    },
  });

  const result = await Enrollment.updateMany(
    {
      contactId: contact._id,
      status: "active",
    },
    {
      $set: {
        status: "stopped",
        stopReason: "opted_out",
        nextSendAt: null,
      },
    }
  );

  return {
    stoppedEnrollments: result.modifiedCount ?? result.nModified ?? 0,
  };
}

/**
 * Apply an opt-in / resume: clear the opted-out flag so the contact can be
 * messaged again. Does not automatically re-enroll them into any campaign.
 */
export async function applyOptIn(contact) {
  const now = new Date();

  await Contact.findByIdAndUpdate(contact._id, {
    $set: {
      status: "active",
      optedOut: false,
      optedInAt: now,
    },
  });
}
