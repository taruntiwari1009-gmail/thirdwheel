import assert from "node:assert/strict";

const PROJECT_ID = "demo-thirdwheel";
const BUCKET = `${PROJECT_ID}.appspot.com`;
const AUTH_URL = "http://127.0.0.1:9099/identitytoolkit.googleapis.com/v1";
const FIRESTORE_URL = `http://127.0.0.1:8080/v1/projects/${PROJECT_ID}/databases/(default)/documents`;
const STORAGE_URL = `http://127.0.0.1:9199/v0/b/${BUCKET}/o`;

async function signUp(label) {
  const response = await fetch(`${AUTH_URL}/accounts:signUp?key=fake-api-key`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: `${label}@thirdwheel.test`,
      password: "Thirdwheel-test-123!",
      returnSecureToken: true,
    }),
  });
  const payload = await response.json();
  assert.equal(
    response.status,
    200,
    `Auth emulator sign-up failed: ${JSON.stringify(payload)}`
  );
  return { uid: payload.localId, token: payload.idToken };
}

function authHeaders(token) {
  return {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  };
}

function profileFields(uid, displayName) {
  return {
    uid: { stringValue: uid },
    displayName: { stringValue: displayName },
    displayNameLower: { stringValue: displayName.toLowerCase() },
    discoverable: { booleanValue: true },
    pronouns: { stringValue: "" },
    photoURL: { stringValue: "https://example.test/avatar.png" },
  };
}

async function firestore(method, path, token, body, query = "") {
  return fetch(`${FIRESTORE_URL}/${path}${query}`, {
    method,
    headers: authHeaders(token),
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
}

async function createProfile(user, displayName) {
  return firestore("POST", `publicProfiles?documentId=${user.uid}`, user.token, {
    fields: profileFields(user.uid, displayName),
  });
}

function chatListFields(other, displayName) {
  return {
    userInfo: {
      mapValue: {
        fields: {
          uid: { stringValue: other.uid },
          displayName: { stringValue: displayName },
          photoURL: { stringValue: "https://example.test/avatar.png" },
        },
      },
    },
    date: { timestampValue: new Date().toISOString() },
  };
}

async function upload(path, token, contentType = "image/png", bytes = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) {
  return fetch(`${STORAGE_URL}?uploadType=media&name=${encodeURIComponent(path)}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": contentType,
    },
    body: bytes,
  });
}

async function download(path, token) {
  return fetch(`${STORAGE_URL}/${encodeURIComponent(path)}?alt=media`, {
    headers: { Authorization: `Bearer ${token}` },
  });
}

async function expectAllowed(response, label) {
  assert.equal(response.ok, true, `${label} should be allowed, got ${response.status}: ${await response.text()}`);
}

async function expectDenied(response, label) {
  assert.equal(response.ok, false, `${label} should be denied, got ${response.status}`);
}

const alice = await signUp("alice");
const bob = await signUp("bob");
const mallory = await signUp("mallory");

await expectDenied(
  await fetch(`${FIRESTORE_URL}/users/not-authenticated`),
  "unauthenticated user cannot read profile"
);
await expectAllowed(await createProfile(alice, "Alice"), "owner creates public profile");
await expectAllowed(await createProfile(bob, "Bob"), "second user creates public profile");

const usernameReservation = (uid) => ({
  uid: { stringValue: uid },
  createdAt: { timestampValue: new Date().toISOString() },
});
async function commit(writes, token = alice.token) {
  return fetch(`${FIRESTORE_URL}:commit`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ writes }),
  });
}
function updateWrite(path, fields, updateMask, currentDocument) {
  return {
    update: {
      name: `projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
      fields,
    },
    ...(updateMask ? { updateMask: { fieldPaths: updateMask } } : {}),
    ...(currentDocument ? { currentDocument } : {}),
  };
}
const usernamePath = (username) => `usernames/${username}`;
const profilePath = (uid) => `publicProfiles/${uid}`;
const usernameFields = (uid) => usernameReservation(uid);
const aliceUsername = "alice_unique";
const aliceUsernameRef = updateWrite(usernamePath(aliceUsername), usernameFields(alice.uid), null, { exists: false });
const aliceProfileUsername = updateWrite(profilePath(alice.uid), {
  username: { stringValue: aliceUsername },
}, ["username"]);
await expectAllowed(
  await commit([aliceUsernameRef, aliceProfileUsername]),
  "username reservation and profile claim succeed atomically"
);
await expectDenied(
  await firestore("PATCH", usernamePath(aliceUsername), bob.token, {
    fields: usernameFields(bob.uid),
  }),
  "another user cannot reserve an already claimed username"
);
await expectDenied(
  await firestore("POST", "usernames", bob.token, {
    fields: usernameFields(bob.uid),
  }, "?documentId=Invalid_Name"),
  "username reservation IDs must be lowercase and valid"
);
await expectDenied(
  await commit([updateWrite(profilePath(bob.uid), {
    username: { stringValue: "unreserved_name" },
  }, ["username"])]),
  "profile cannot claim a username without a reservation"
);
await expectDenied(
  await commit([updateWrite("usernames/bob_spoof", usernameFields(alice.uid), null, { exists: false }),
    updateWrite(profilePath(bob.uid), { username: { stringValue: "bob_spoof" } }, ["username"])], bob.token),
  "username reservation cannot be attached to a different user's profile"
);
await expectDenied(
  await firestore("DELETE", usernamePath(aliceUsername), alice.token),
  "owner cannot release a username while profile still claims it"
);
const renamedUsername = "alice_renamed";
await expectAllowed(
  await commit([
    { delete: `projects/${PROJECT_ID}/databases/(default)/documents/${usernamePath(aliceUsername)}` },
    updateWrite(usernamePath(renamedUsername), usernameFields(alice.uid), null, { exists: false }),
    updateWrite(profilePath(alice.uid), { username: { stringValue: renamedUsername } }, ["username"]),
  ]),
  "username change atomically releases old reservation and claims new one"
);
await expectDenied(
  await firestore("GET", usernamePath(aliceUsername), alice.token),
  "released username reservation no longer exists"
);
await expectDenied(
  await firestore("PATCH", `publicProfiles/${alice.uid}`, alice.token, {
    fields: {
      ...profileFields(alice.uid, "Alice Updated"),
      displayNameLower: { stringValue: "not-alice" },
    },
  }, "?updateMask.fieldPaths=displayName&updateMask.fieldPaths=displayNameLower"),
  "normalized display name must match the public display name"
);
await expectAllowed(
  await firestore("GET", `publicProfiles/${bob.uid}`, alice.token),
  "authenticated user reads public profile"
);
await expectDenied(
  await firestore("POST", `publicProfiles?documentId=${bob.uid}-impostor`, alice.token, {
    fields: profileFields(bob.uid, "Impersonated"),
  }),
  "user cannot create another user's profile"
);
await expectDenied(
  await firestore("POST", `publicProfiles?documentId=${alice.uid}-private`, alice.token, {
    fields: {
      ...profileFields(alice.uid, "Alice Private"),
      email: { stringValue: "alice@thirdwheel.test" },
    },
  }),
  "public profile cannot include email"
);

const chatId = [alice.uid, bob.uid].sort().join("");
const invalidChat = await firestore("POST", `chats?documentId=not-the-sorted-chat-id`, alice.token, {
  fields: {
    participants: {
      arrayValue: { values: [alice.uid, bob.uid].sort().map((uid) => ({ stringValue: uid })) },
    },
    messages: { arrayValue: { values: [] } },
  },
});
await expectDenied(invalidChat, "conversation ID must match its two participants");

const createChat = await firestore("POST", `chats?documentId=${chatId}`, alice.token, {
  fields: {
    participants: {
      arrayValue: { values: [alice.uid, bob.uid].sort().map((uid) => ({ stringValue: uid })) },
    },
    messages: { arrayValue: { values: [] } },
  },
});
await expectAllowed(createChat, "participant creates a two-person conversation");

await expectAllowed(
  await firestore("GET", `chats/${chatId}`, bob.token),
  "conversation participant reads conversation"
);
await expectDenied(
  await firestore("GET", `chats/${chatId}`, mallory.token),
  "non-participant cannot read conversation"
);

const timestamp = new Date().toISOString();
const message = {
  mapValue: {
    fields: {
      id: { stringValue: "message-1" },
      text: { stringValue: "Hello from Alice" },
      senderId: { stringValue: alice.uid },
      date: { timestampValue: timestamp },
    },
  },
};
const appendMessage = await firestore(
  "PATCH",
  `chats/${chatId}`,
  alice.token,
  { fields: { messages: { arrayValue: { values: [message] } } } },
  "?updateMask.fieldPaths=messages"
);
await expectAllowed(appendMessage, "participant appends a message as themselves");

const forgedMessage = {
  mapValue: {
    fields: {
      id: { stringValue: "forged-message" },
      text: { stringValue: "I am Alice" },
      senderId: { stringValue: bob.uid },
      date: { timestampValue: new Date().toISOString() },
    },
  },
};
await expectDenied(
  await firestore(
    "PATCH",
    `chats/${chatId}`,
    alice.token,
    { fields: { messages: { arrayValue: { values: [message, forgedMessage] } } } },
    "?updateMask.fieldPaths=messages"
  ),
  "participant cannot forge another sender's UID"
);

await expectAllowed(
  await firestore(
    "POST",
    `users/${alice.uid}/userChats?documentId=${chatId}`,
    alice.token,
    { fields: chatListFields(bob, "Bob") }
  ),
  "participant creates own conversation-list entry"
);
await expectAllowed(
  await firestore(
    "POST",
    `users/${bob.uid}/userChats?documentId=${chatId}`,
    alice.token,
    { fields: chatListFields(alice, "Alice") }
  ),
  "participant creates the other participant's conversation-list entry"
);
await expectDenied(
  await firestore(
    "GET",
    `users/${bob.uid}/userChats/${chatId}`,
    mallory.token
  ),
  "non-participant cannot read another user's conversation-list entry"
);

await expectAllowed(
  await upload(`avatars/${alice.uid}/avatar.png`, alice.token),
  "owner uploads own avatar"
);
await expectDenied(
  await upload(`avatars/${bob.uid}/avatar.png`, alice.token),
  "user cannot upload another user's avatar"
);
await expectAllowed(
  await upload(`chat-images/${chatId}/${alice.uid}/image.png`, alice.token),
  "participant uploads chat image"
);
await expectDenied(
  await download(`chat-images/${chatId}/${alice.uid}/image.png`, mallory.token),
  "non-participant cannot download chat image"
);
await expectDenied(
  await upload(`chat-images/${chatId}/${mallory.uid}/image.png`, mallory.token),
  "non-participant cannot upload chat image"
);
await expectDenied(
  await upload(`avatars/${alice.uid}/not-an-image.txt`, alice.token, "text/plain"),
  "non-image upload is rejected"
);
await expectDenied(
  await upload(`avatars/${alice.uid}/oversized.png`, alice.token, "image/png", Buffer.alloc(5 * 1024 * 1024 + 1)),
  "oversized image upload is rejected"
);

console.log("Firebase Emulator Security Tests: all allowed and denied cases passed.");
