const assert = require("node:assert/strict");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore } = require("firebase-admin/firestore");

const projectId = process.env.GCLOUD_PROJECT || "demo-thirdwheel";
process.env.GCLOUD_PROJECT = projectId;
const app = initializeApp({ projectId });
const auth = getAuth(app);
const db = getFirestore(app);
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const functionsHost = process.env.FUNCTIONS_EMULATOR_HOST || "127.0.0.1:5001";
const authBase = `http://${authHost}/identitytoolkit.googleapis.com/v1`;
const functionBase = `http://${functionsHost}/${projectId}/us-central1`;

async function signUp(label) {
  const response = await fetch(`${authBase}/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: `${label}@thirdwheel.test`, password: "Thirdwheel-test-123!", returnSecureToken: true }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return { uid: payload.localId, token: payload.idToken };
}

async function signInWithCustomToken(token) {
  const response = await fetch(`${authBase}/accounts:signInWithCustomToken?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ token, returnSecureToken: true }),
  });
  const payload = await response.json();
  assert.equal(response.status, 200, JSON.stringify(payload));
  return payload.idToken;
}

async function call(name, token, data = {}) {
  const response = await fetch(`${functionBase}/${name}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ data }),
  });
  return { status: response.status, body: await response.json() };
}

function expectCallableError(result, status) {
  assert.equal(result.status, 200, JSON.stringify(result.body));
  assert.equal(result.body.error?.status, status, JSON.stringify(result.body));
}

async function main() {
  const reporter = await signUp("reporter");
  const target = await signUp("target");
  const owner = await signUp("owner");
  await db.doc(`publicProfiles/${reporter.uid}`).set({ uid: reporter.uid, displayName: "Reporter" });
  await db.doc(`publicProfiles/${target.uid}`).set({ uid: target.uid, displayName: "Target" });

  expectCallableError(await call("submitReport", null, { targetUid: target.uid, reason: "spam" }), "UNAUTHENTICATED");
  expectCallableError(await call("submitReport", reporter.token, { targetUid: reporter.uid, reason: "spam" }), "INVALID_ARGUMENT");
  expectCallableError(await call("submitReport", reporter.token, { targetUid: target.uid, reason: "made_up" }), "INVALID_ARGUMENT");

  let submitted = await call("submitReport", reporter.token, { targetUid: target.uid, reason: "spam", details: "  Repeated unsolicited messages  " });
  assert.equal(submitted.body.result?.submitted, true, JSON.stringify(submitted.body));
  const reportId = submitted.body.result.reference;
  const report = await db.doc(`reports/${reportId}`).get();
  const moderationCase = await db.doc(`moderationCases/${reportId}`).get();
  assert.equal(report.exists, true);
  assert.equal(report.get("reporterId"), reporter.uid);
  assert.equal(report.get("details"), "Repeated unsolicited messages");
  assert.equal(moderationCase.exists, true);
  assert.equal(moderationCase.get("status"), "open");
  const audit = await db.collection("moderationAudit").where("caseId", "==", reportId).get();
  assert.equal(audit.size, 1, "report, case and audit record should be created together");

  for (let i = 0; i < 4; i++) {
    const result = await call("submitReport", reporter.token, { targetUid: target.uid, reason: "spam" });
    assert.equal(result.body.result?.submitted, true, JSON.stringify(result.body));
  }
  expectCallableError(await call("submitReport", reporter.token, { targetUid: target.uid, reason: "spam" }), "RESOURCE_EXHAUSTED");

  expectCallableError(await call("listModerationCases", reporter.token), "PERMISSION_DENIED");
  await auth.setCustomUserClaims(owner.uid, { owner: true, moderator: true });
  const ownerToken = await signInWithPassword("owner@thirdwheel.test");
  const queue = await call("listModerationCases", ownerToken, { status: "open" });
  assert.equal(queue.body.result?.cases?.length, 5, JSON.stringify(queue.body));
  const reviewed = await call("reviewModerationCase", ownerToken, { caseId: reportId, status: "reviewing", note: "Evidence reviewed" });
  assert.equal(reviewed.body.result?.updated, true, JSON.stringify(reviewed.body));
  assert.equal((await db.doc(`moderationCases/${reportId}`).get()).get("moderatorNote"), "Evidence reviewed");

  const deletion = await call("requestAccountDeletion", reporter.token);
  assert.equal(deletion.body.result?.status, "pending_review", JSON.stringify(deletion.body));
  expectCallableError(await call("requestAccountDeletion", reporter.token), "ALREADY_EXISTS");

  const granted = await call("setModeratorRole", ownerToken, { uid: target.uid, enabled: true });
  assert.equal(granted.body.result?.updated, true, JSON.stringify(granted.body));
  assert.equal((await auth.getUser(target.uid)).customClaims.moderator, true);
  expectCallableError(await call("setModeratorRole", reporter.token, { uid: target.uid, enabled: false }), "PERMISSION_DENIED");

  console.log("Trusted Functions emulator integration tests passed.");
}

main().catch(error => {
  console.error(error);
  process.exitCode = 1;
});
