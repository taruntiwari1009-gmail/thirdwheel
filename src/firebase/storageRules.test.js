import { initializeApp, deleteApp } from "firebase/app";
import { getStorage, connectStorageEmulator, ref, uploadBytes, getBytes } from "firebase/storage";

describe("Firebase Storage emulator security rules", () => {
  if (!process.env.STORAGE_TEST_ALICE_UID || !process.env.STORAGE_TEST_BOB_UID
    || !process.env.STORAGE_TEST_MALLORY_UID || !process.env.STORAGE_TEST_CHAT_ID) {
    it.skip("runs in the Firebase Emulator security workflow", () => {});
    return;
  }

const projectId = "demo-thirdwheel";
const bucket = `gs://${projectId}.appspot.com`;
const aliceUid = process.env.STORAGE_TEST_ALICE_UID;
const bobUid = process.env.STORAGE_TEST_BOB_UID;
const malloryUid = process.env.STORAGE_TEST_MALLORY_UID;
const chatId = process.env.STORAGE_TEST_CHAT_ID;
const apps = [];

function storageFor(uid) {
  const app = initializeApp({
    apiKey: "demo-api-key",
    projectId,
    storageBucket: bucket.replace("gs://", ""),
    appId: `1:123456789:web:${uid}`,
  }, `storage-rules-${uid}`);
  apps.push(app);
  const storage = getStorage(app, bucket);
  connectStorageEmulator(storage, "127.0.0.1", 9199, {
    mockUserToken: {
      sub: uid,
      user_id: uid,
      firebase: { sign_in_provider: "custom" },
    },
  });
  return storage;
}

const aliceStorage = storageFor(aliceUid);
const bobStorage = storageFor(bobUid);
const malloryStorage = storageFor(malloryUid);
const image = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);

afterAll(async () => {
  await Promise.all(apps.map((app) => deleteApp(app)));
});

it("allows a user to upload their own avatar", async () => {
  await expect(uploadBytes(ref(aliceStorage, `avatars/${aliceUid}/avatar.png`), image, {
    contentType: "image/png",
  })).resolves.toBeDefined();
});

it("denies a user from uploading another user's avatar", async () => {
  await expect(uploadBytes(ref(aliceStorage, `avatars/${bobUid}/avatar.png`), image, {
    contentType: "image/png",
  })).rejects.toBeDefined();
});

it("allows a conversation participant to upload a chat image", async () => {
  await expect(uploadBytes(ref(aliceStorage, `chat-images/${chatId}/${aliceUid}/image.png`), image, {
    contentType: "image/png",
  })).resolves.toBeDefined();
});

it("denies a non-participant from reading or uploading chat images", async () => {
  await expect(uploadBytes(ref(malloryStorage, `chat-images/${chatId}/${malloryUid}/image.png`), image, {
    contentType: "image/png",
  })).rejects.toBeDefined();
  await expect(getBytes(ref(malloryStorage, `chat-images/${chatId}/${aliceUid}/image.png`))).rejects.toBeDefined();
});

it("rejects non-image and oversized uploads", async () => {
  await expect(uploadBytes(ref(aliceStorage, `avatars/${aliceUid}/not-image.txt`), image, {
    contentType: "text/plain",
  })).rejects.toBeDefined();
  await expect(uploadBytes(ref(aliceStorage, `avatars/${aliceUid}/oversized.png`), new Uint8Array(5 * 1024 * 1024 + 1), {
    contentType: "image/png",
  })).rejects.toBeDefined();
});

});
