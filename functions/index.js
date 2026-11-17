const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");

initializeApp();
const db = getFirestore();
const statuses = new Set(["open", "reviewing", "actioned", "dismissed", "escalated"]);
const dailyReportLimit = 5;
const { parseReport } = require("./validation");

function authenticated(request) {
  if (!request.auth?.uid) throw new HttpsError("unauthenticated", "Sign in to continue.");
  return request.auth.uid;
}
function moderator(request) {
  const uid = authenticated(request);
  if (request.auth.token.moderator !== true) throw new HttpsError("permission-denied", "Moderator access is required.");
  return uid;
}

exports.submitReport = onCall({ enforceAppCheck: false }, async request => {
  const reporterUid = authenticated(request);
  const report = parseReport(request.data, reporterUid);
  const target = await db.doc("publicProfiles/" + report.targetUid).get();
  if (!target.exists) throw new HttpsError("not-found", "This profile is unavailable.");

  const day = new Date().toISOString().slice(0, 10);
  const throttleRef = db.doc("abuseLimits/reports_" + reporterUid + "_" + day);
  const reportRef = db.collection("reports").doc();
  const caseRef = db.collection("moderationCases").doc(reportRef.id);
  await db.runTransaction(async transaction => {
    const throttle = await transaction.get(throttleRef);
    const count = throttle.exists ? Number(throttle.get("count") || 0) : 0;
    if (count >= dailyReportLimit) throw new HttpsError("resource-exhausted", "Daily report limit reached. Please try again tomorrow.");
    transaction.set(throttleRef, { uid: reporterUid, count: count + 1, day, updatedAt: FieldValue.serverTimestamp() });
    transaction.create(reportRef, { reporterId: reporterUid, targetUid: report.targetUid, reason: report.reason, ...(report.details ? { details: report.details } : {}), createdAt: FieldValue.serverTimestamp() });
    transaction.create(caseRef, { reportId: reportRef.id, reporterId: reporterUid, targetUid: report.targetUid, reason: report.reason, status: "open", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.create(db.collection("moderationAudit").doc(), { caseId: caseRef.id, actorUid: reporterUid, action: "report_submitted", createdAt: FieldValue.serverTimestamp() });
  });
  return { submitted: true, reference: reportRef.id };
});

exports.listModerationCases = onCall(async request => {
  moderator(request);
  const status = request.data?.status;
  if (status && !statuses.has(status)) throw new HttpsError("invalid-argument", "Invalid case status.");
  let query = db.collection("moderationCases").orderBy("createdAt", "desc").limit(50);
  if (status) query = db.collection("moderationCases").where("status", "==", status).orderBy("createdAt", "desc").limit(50);
  const snapshot = await query.get();
  return { cases: snapshot.docs.map(item => ({ id: item.id, ...item.data() })) };
});

exports.reviewModerationCase = onCall(async request => {
  const moderatorUid = moderator(request);
  const { caseId, status } = request.data || {};
  const note = typeof request.data?.note === "string" ? request.data.note.trim().slice(0, 1000) : "";
  if (typeof caseId !== "string" || !caseId || !statuses.has(status)) throw new HttpsError("invalid-argument", "A valid case ID and status are required.");
  const caseRef = db.doc("moderationCases/" + caseId);
  const auditRef = db.collection("moderationAudit").doc();
  await db.runTransaction(async transaction => {
    const current = await transaction.get(caseRef);
    if (!current.exists) throw new HttpsError("not-found", "Moderation case not found.");
    transaction.update(caseRef, { status, moderatorUid, ...(note ? { moderatorNote: note } : {}), updatedAt: FieldValue.serverTimestamp() });
    transaction.create(auditRef, { caseId, actorUid: moderatorUid, action: "case_status_changed", status, ...(note ? { note } : {}), createdAt: FieldValue.serverTimestamp() });
  });
  return { updated: true };
});

exports.requestAccountDeletion = onCall(async request => {
  const uid = authenticated(request);
  const requestRef = db.doc("accountDeletionRequests/" + uid);
  await db.runTransaction(async transaction => {
    const existing = await transaction.get(requestRef);
    if (existing.exists && existing.get("status") !== "cancelled") throw new HttpsError("already-exists", "A deletion request is already active.");
    transaction.set(requestRef, { uid, status: "pending_review", requestedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.create(db.collection("moderationAudit").doc(), { actorUid: uid, action: "account_deletion_requested", createdAt: FieldValue.serverTimestamp() });
  });
  return { requested: true, status: "pending_review" };
});

exports.setModeratorRole = onCall(async request => {
  const ownerUid = authenticated(request);
  if (request.auth.token.owner !== true) throw new HttpsError("permission-denied", "Project owner access is required.");
  const { uid, enabled } = request.data || {};
  if (typeof uid !== "string" || typeof enabled !== "boolean") throw new HttpsError("invalid-argument", "A user ID and boolean enabled value are required.");
  const user = await getAuth().getUser(uid);
  const claims = { ...(user.customClaims || {}) };
  if (enabled) claims.moderator = true;
  else delete claims.moderator;
  await getAuth().setCustomUserClaims(uid, claims);
  await db.collection("moderationAudit").add({ actorUid: ownerUid, targetUid: uid, action: enabled ? "moderator_role_granted" : "moderator_role_revoked", createdAt: FieldValue.serverTimestamp() });
  return { updated: true };
});
