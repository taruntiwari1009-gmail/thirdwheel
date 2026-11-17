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

exports.submitReport = onCall({ enforceAppCheck: process.env.ENFORCE_APPCHECK === "true" }, async request => {
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
    transaction.create(caseRef, { reportId: reportRef.id, reporterId: reporterUid, targetUid: report.targetUid, reason: report.reason, ...(report.details ? { details: report.details } : {}), status: "open", createdAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
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


// Account deletion is an owner-approved, resumable server-side workflow.
// Shared chat documents and message attachments are retained; only the deleted
// participant's identity and inbox copy are removed.
exports.approveAccountDeletion = onCall(async request => {
  const ownerUid = authenticated(request);
  if (request.auth.token.owner !== true) throw new HttpsError("permission-denied", "Project owner access is required.");
  const uid = request.data?.uid;
  if (typeof uid !== "string" || !uid || uid === ownerUid) throw new HttpsError("invalid-argument", "A valid account UID is required.");
  const ref = db.doc("accountDeletionRequests/" + uid);
  await db.runTransaction(async transaction => {
    const snapshot = await transaction.get(ref);
    if (!snapshot.exists || snapshot.get("status") !== "pending_review") throw new HttpsError("failed-precondition", "Only pending deletion requests can be approved.");
    transaction.update(ref, { status: "approved", approvedBy: ownerUid, approvedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() });
    transaction.create(db.collection("moderationAudit").doc(), { actorUid: ownerUid, targetUid: uid, action: "account_deletion_approved", createdAt: FieldValue.serverTimestamp() });
  });
  return { approved: true, uid };
});

exports.processAccountDeletion = onCall(async request => {
  const ownerUid = authenticated(request);
  if (request.auth.token.owner !== true) throw new HttpsError("permission-denied", "Project owner access is required.");
  const uid = request.data?.uid;
  if (typeof uid !== "string" || !uid || uid === ownerUid) throw new HttpsError("invalid-argument", "A valid account UID is required.");
  const requestRef = db.doc("accountDeletionRequests/" + uid);
  const state = await requestRef.get();
  if (!state.exists || !["approved", "processing"].includes(state.get("status"))) throw new HttpsError("failed-precondition", "This account deletion has not been approved.");
  await requestRef.set({ status: "processing", startedAt: state.get("startedAt") || FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });

  const cursor = state.get("chatCursor") || null;
  let query = db.collection("users").doc(uid).collection("userChats").orderBy("__name__").limit(100);
  if (cursor) query = query.startAfter(db.doc("users/" + uid + "/userChats/" + cursor));
  const inbox = await query.get();
  if (inbox.empty) {
    // Finalization is idempotent. Keep shared chat records/media so the other
    // participant retains their history; replace their cached identity label.
    const ownBlocks = await db.collection("users").doc(uid).collection("blockedUsers").get();
    const batch = db.batch();
    ownBlocks.docs.forEach(item => batch.delete(item.ref));
    const profileRef = db.doc("publicProfiles/" + uid);
    const profile = await profileRef.get();
    if (profile.exists && profile.get("username")) batch.delete(db.doc("usernames/" + profile.get("username")));
    batch.delete(profileRef);
    batch.delete(db.doc("abuseLimits/messages_" + uid));
    await batch.commit();
    try { await getAuth().deleteUser(uid); } catch (error) { if (error.code !== "auth/user-not-found") throw error; }
    await db.collection("moderationAudit").add({ actorUid: ownerUid, targetUid: uid, action: "account_deletion_completed", createdAt: FieldValue.serverTimestamp() });
    await requestRef.set({ status: "completed", completedAt: FieldValue.serverTimestamp(), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
    try { await getAuth().app.options.credential; } catch (_) { /* no-op: Storage cleanup is performed below through the default bucket */ }
    const { getStorage } = require("firebase-admin/storage");
    await getStorage().bucket().deleteFiles({ prefix: "avatars/" + uid + "/" });
    return { completed: true, processed: inbox.size };
  }

  const batch = db.batch();
  for (const entry of inbox.docs) {
    const chatRef = db.doc("chats/" + entry.id);
    const chat = await chatRef.get();
    if (chat.exists) {
      const participants = chat.get("participants") || [];
      const otherUid = participants.find(participant => participant !== uid);
      if (otherUid) {
        batch.set(chatRef, { deletedParticipants: FieldValue.arrayUnion(uid) }, { merge: true });
        const otherInboxRef = db.doc("users/" + otherUid + "/userChats/" + entry.id);
        const otherInbox = await otherInboxRef.get();
        if (otherInbox.exists) batch.update(otherInboxRef, { userInfo: { uid, displayName: "Deleted account", photoURL: "" } });
      }
    }
    batch.delete(entry.ref);
  }
  await batch.commit();
  const nextCursor = inbox.docs[inbox.docs.length - 1].id;
  await requestRef.set({ status: "processing", chatCursor: nextCursor, chatsProcessed: FieldValue.increment(inbox.size), updatedAt: FieldValue.serverTimestamp() }, { merge: true });
  return { completed: false, processed: inbox.size, next: true };
});
