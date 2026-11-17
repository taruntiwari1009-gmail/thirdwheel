const { initializeApp } = require("firebase-admin/app");
const { getFirestore } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");

const expectedProject = process.env.THIRDWHEEL_CONFIRM_TEST_DATA_RESET;
const projectArg = process.argv.find(value => value.startsWith("--project="))?.split("=")[1];

if (!projectArg || expectedProject !== projectArg) {
  throw new Error(
    "Refusing to delete data. Pass --project=<exact-project-id> and set THIRDWHEEL_CONFIRM_TEST_DATA_RESET to the same value."
  );
}

initializeApp({ projectId: projectArg, storageBucket: projectArg + ".appspot.com" });
const db = getFirestore();
const bucket = getStorage().bucket();

async function main() {
  const actualProject = process.env.GCLOUD_PROJECT || process.env.GOOGLE_CLOUD_PROJECT || projectArg;
  if (actualProject !== projectArg) throw new Error("Authenticated project does not match the explicit confirmation.");

  console.log("Deleting chat test data from project:", projectArg);
  console.log("This removes every conversation, all inbox entries, legacy root userChats records, message documents and chat-image objects.");
  console.log("It does not delete Firebase Auth users, public profiles, usernames, block lists or moderation records.");

  await db.recursiveDelete(db.collection("chats"));
  await db.recursiveDelete(db.collection("userChats"));

  const users = await db.collection("users").get();
  for (const user of users.docs) {
    await db.recursiveDelete(user.ref.collection("userChats"));
  }

  const limits = await db.collection("abuseLimits").get();
  const messageLimits = limits.docs.filter(item => item.id.startsWith("messages_"));
  for (let index = 0; index < messageLimits.length; index += 400) {
    const batch = db.batch();
    messageLimits.slice(index, index + 400).forEach(item => batch.delete(item.ref));
    await batch.commit();
  }

  await bucket.deleteFiles({ prefix: "chat-images/" });
  console.log("Chat test-data reset completed.");
}

main().catch(error => {
  console.error("Chat test-data reset failed:", error);
  process.exitCode = 1;
});
