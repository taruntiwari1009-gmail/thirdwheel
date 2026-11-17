const { initializeApp, applicationDefault } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

async function main() {
  const uid = process.env.THIRDWHEEL_OWNER_UID;
  if (!uid) throw new Error("Set THIRDWHEEL_OWNER_UID to the Firebase Auth UID of the project owner.");
  initializeApp({ credential: applicationDefault(), projectId: process.env.GCLOUD_PROJECT });
  const auth = getAuth();
  const user = await auth.getUser(uid);
  await auth.setCustomUserClaims(uid, { ...(user.customClaims || {}), owner: true, moderator: true });
  process.stdout.write("Owner and moderator claims assigned. Ask the owner to refresh their ID token before using privileged callables.\n");
}
main().catch(error => {
  process.stderr.write((error && error.message ? error.message : String(error)) + "\n");
  process.exitCode = 1;
});
