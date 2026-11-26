// twilioErrors.js → plain-language meaning of Twilio SMS error codes, and
// whether retrying can ever help. Full list: https://www.twilio.com/docs/api/errors
//
// "permanent" = the number itself can't take texts (or blocked us): stop
// campaigns for that contact instead of paying to send again.
// "contactInvalid" = the number is dead / can't receive SMS at all.

const ERRORS = {
  "30001": { label: "Queue overflow — sent too fast", permanent: false },
  "30002": { label: "Twilio account suspended", permanent: false },
  "30003": { label: "Phone unreachable (off, no signal or roaming)", permanent: false },
  "30004": { label: "Blocked by the recipient or their carrier", permanent: true },
  "30005": { label: "Unknown or inactive number", permanent: true, contactInvalid: true },
  "30006": { label: "Landline or carrier can't receive texts", permanent: true, contactInvalid: true },
  "30007": { label: "Blocked by carrier spam filter (check wording, links, 10DLC)", permanent: false },
  "30008": { label: "Unknown carrier error", permanent: false },
  "30010": { label: "Message price above the set limit", permanent: false },
  "30019": { label: "Content size exceeds carrier limit", permanent: false },
  "30022": { label: "US carrier sending limit exceeded (10DLC throughput)", permanent: false },
  "30032": { label: "Toll-free number not verified", permanent: false },
  "30034": { label: "Sender not registered for US 10DLC", permanent: false },
  "21211": { label: "Invalid phone number", permanent: true, contactInvalid: true },
  "21408": { label: "Sending to this country isn't enabled", permanent: false },
  "21610": { label: "Recipient has opted out (texted STOP)", permanent: true },
  "21614": { label: "Number is not a mobile number", permanent: true, contactInvalid: true },
};

export function describeTwilioError(code) {
  const key = code == null ? "" : String(code).trim();
  if (!key) return null;
  const known = ERRORS[key];
  return {
    code: key,
    label: known?.label || "Twilio error",
    permanent: Boolean(known?.permanent),
    contactInvalid: Boolean(known?.contactInvalid),
    message: `${key} — ${known?.label || "Twilio error (see twilio.com/docs/api/errors)"}`,
  };
}

// Twilio status callbacks can arrive out of order ("sent" after "delivered").
// Only move a message forward, never back from a final state.
const STATUS_RANK = {
  queued: 0,
  accepted: 0,
  sending: 1,
  sent: 2,
  delivered: 3,
  undelivered: 3,
  failed: 3,
  received: 3,
};

export function shouldApplyStatus(currentStatus, nextStatus) {
  if (!(nextStatus in STATUS_RANK)) return false;
  const current = STATUS_RANK[currentStatus] ?? -1;
  return STATUS_RANK[nextStatus] >= current;
}
