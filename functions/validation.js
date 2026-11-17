const { HttpsError } = require("firebase-functions/v2/https");

const REPORT_REASONS = new Set(["spam", "scam", "harassment", "threats", "stalking", "sexual_harassment", "underage", "inappropriate", "impersonation", "other"]);

function parseReport(data, reporterUid) {
  if (!data || typeof data !== "object" || Array.isArray(data)) throw new HttpsError("invalid-argument", "A report is required.");
  const targetUid = typeof data.targetUid === "string" ? data.targetUid.trim() : "";
  const reason = typeof data.reason === "string" ? data.reason : "";
  const details = typeof data.details === "string" ? data.details.trim().slice(0, 500) : "";
  if (!targetUid || targetUid === reporterUid || targetUid.length > 128 || !REPORT_REASONS.has(reason)) {
    throw new HttpsError("invalid-argument", "The report details are invalid.");
  }
  return { targetUid, reason, ...(details ? { details } : {}) };
}

module.exports = { parseReport };
