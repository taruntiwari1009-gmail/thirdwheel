import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";

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
    unreadCount: { integerValue: 0 },
  };
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
const hiddenUser = await signUp("hidden-user");

await expectDenied(
  await fetch(`${FIRESTORE_URL}/users/not-authenticated`),
  "unauthenticated user cannot read profile"
);
await expectAllowed(await createProfile(alice, "Alice"), "owner creates public profile");
await expectAllowed(await createProfile(bob, "Bob"), "second user creates public profile");
await expectAllowed(await firestore("POST", "publicProfiles?documentId=" + hiddenUser.uid, hiddenUser.token, { fields: { ...profileFields(hiddenUser.uid, "Hidden User"), discoverable: { booleanValue: false } } }), "owner can create a hidden profile");

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
const invalidChat = await firestore("POST", "chats?documentId=not-the-sorted-chat-id", alice.token, {
  fields: { participants: { arrayValue: { values: [alice.uid, bob.uid].sort().map(uid => ({ stringValue: uid })) } } },
});
await expectDenied(invalidChat, "conversation ID must match its two participants");

const createChat = await firestore("POST", "chats?documentId=" + chatId, alice.token, {
  fields: { participants: { arrayValue: { values: [alice.uid, bob.uid].sort().map(uid => ({ stringValue: uid })) } } },
});
await expectAllowed(createChat, "participant creates a two-person conversation");
await expectAllowed(await firestore("GET", "chats/" + chatId, bob.token), "conversation participant reads conversation");
await expectDenied(await firestore("GET", "chats/" + chatId, mallory.token), "non-participant cannot read conversation");

async function createMessageWithLimit(id, count, token = alice.token, uid = alice.uid) {
  const messagePath = "chats/" + chatId + "/messages/" + id;
  const messageWrite = updateWrite(messagePath, {
    id: { stringValue: id }, text: { stringValue: "Message " + count },
    senderId: { stringValue: uid }, date: { timestampValue: new Date().toISOString() },
  }, null, { exists: false });
  const limitPath = "abuseLimits/messages_" + uid;
  const limitWrite = {
    update: { name: "projects/" + PROJECT_ID + "/databases/(default)/documents/" + limitPath, fields: { uid: { stringValue: uid }, count: { integerValue: count } } },
    updateTransforms: [{ fieldPath: "updatedAt", setToServerValue: "REQUEST_TIME" }, ...(count === 1 ? [{ fieldPath: "windowStart", setToServerValue: "REQUEST_TIME" }] : [])],
    ...(count === 1 ? { currentDocument: { exists: false } } : {}),
  };
  if (count > 1) {
    const prior = await (await firestore("GET", limitPath, token)).json();
    limitWrite.update.fields.windowStart = prior.fields.windowStart;
  }
  return commit([messageWrite, limitWrite], token);
}
await expectDenied(await firestore("POST", "chats/" + chatId + "/messages?documentId=unthrottled", alice.token, {
  fields: { id: { stringValue: "unthrottled" }, text: { stringValue: "No limiter" }, senderId: { stringValue: alice.uid }, date: { timestampValue: new Date().toISOString() } },
}), "message creation requires an atomic rate-limit update");
for (let count = 1; count <= 8; count++) {
  await expectAllowed(await createMessageWithLimit("message-" + count, count), "message " + count + " is allowed within the per-minute limit");
}
await expectDenied(await createMessageWithLimit("message-9", 9), "ninth message in the same minute is denied");
await expectDenied(
  await firestore("GET", "chats/" + chatId + "/messages/message-1", mallory.token),
  "non-participant cannot read a message document"
);
await expectDenied(
  await firestore("PATCH", "chats/" + chatId + "/messages/message-1", alice.token, {
    fields: { text: { stringValue: "Edited after send" } },
  }, "?updateMask.fieldPaths=text"),
  "messages are immutable after creation"
);
await expectDenied(
  await firestore("POST", "chats?documentId=" + [alice.uid, mallory.uid].sort().join(""), alice.token, {
    fields: {
      participants: { arrayValue: { values: [alice.uid, mallory.uid].sort().map(uid => ({ stringValue: uid })) } },
      messages: { arrayValue: { values: [] } },
    },
  }),
  "new conversations cannot contain an embedded messages array"
);
await expectDenied(await firestore("POST", "chats/" + chatId + "/messages?documentId=forged-message", alice.token, {
  fields: { id: { stringValue: "forged-message" }, text: { stringValue: "Spoofed sender" }, senderId: { stringValue: bob.uid }, date: { timestampValue: new Date().toISOString() } },
}), "participant cannot forge another sender UID");
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
  await firestore(
    "PATCH",
    `users/${bob.uid}/userChats/${chatId}`,
    alice.token,
    { fields: { unreadCount: { integerValue: 1 } } },
    "?updateMask.fieldPaths=unreadCount"
  ),
  "conversation participant can increment the other inbox unread count"
);
await expectAllowed(
  await firestore(
    "PATCH",
    `users/${bob.uid}/userChats/${chatId}`,
    bob.token,
    { fields: { unreadCount: { integerValue: 0 }, lastReadAt: { timestampValue: new Date().toISOString() } } },
    "?updateMask.fieldPaths=unreadCount&updateMask.fieldPaths=lastReadAt"
  ),
  "inbox owner can clear unread count and update read timestamp"
);
await expectDenied(
  await firestore(
    "PATCH",
    `users/${bob.uid}/userChats/${chatId}`,
    mallory.token,
    { fields: { unreadCount: { integerValue: 0 } } },
    "?updateMask.fieldPaths=unreadCount"
  ),
  "non-participant cannot alter another inbox unread count"
);


const blockEntry = await firestore(
  "PATCH",
  `users/${alice.uid}/blockedUsers/${bob.uid}`,
  alice.token,
  { fields: { createdAt: { timestampValue: new Date().toISOString() } } },
  "?currentDocument.exists=false"
);
await expectAllowed(blockEntry, "user can block another account in their own block list");

await expectDenied(
  await firestore("PATCH", `users/${alice.uid}/blockedUsers/${mallory.uid}`, alice.token, {
    fields: { createdAt: { timestampValue: new Date().toISOString() } },
  }, "?currentDocument.exists=false"),
  "user cannot block an account without a public profile"
);
await expectDenied(
  await firestore("PATCH", `users/${alice.uid}/blockedUsers/${alice.uid}`, alice.token, {
    fields: { createdAt: { timestampValue: new Date().toISOString() } },
  }, "?currentDocument.exists=false"),
  "user cannot block themselves"
);
await expectAllowed(
  await firestore("DELETE", `users/${alice.uid}/blockedUsers/${bob.uid}`, alice.token),
  "owner can unblock an account"
);
await expectAllowed(
  await firestore("PATCH", `users/${alice.uid}/blockedUsers/${bob.uid}`, alice.token, {
    fields: { createdAt: { timestampValue: new Date().toISOString() } },
  }, "?currentDocument.exists=false"),
  "owner can block the account again after unblocking"
);
await expectDenied(
  await firestore("GET", "moderationCases/case-1", alice.token),
  "ordinary client cannot read moderation cases"
);
await expectDenied(
  await firestore("POST", "moderationCases?documentId=case-1", alice.token, {
    fields: { status: { stringValue: "open" } },
  }),
  "ordinary client cannot create moderation cases"
);
await expectDenied(
  await firestore("POST", "moderationAudit?documentId=event-1", alice.token, {
    fields: { action: { stringValue: "reviewed" } },
  }),
  "ordinary client cannot write moderation audit events"
);
await expectDenied(
  await firestore("POST", "matches?documentId=match-1", alice.token, {
    fields: { participants: { arrayValue: { values: [{ stringValue: alice.uid }, { stringValue: bob.uid }] } } },
  }),
  "ordinary client cannot forge a mutual match"
);
await expectDenied(
  await firestore("PATCH", `users/${alice.uid}/likes/${bob.uid}`, alice.token, {
    fields: { createdAt: { timestampValue: new Date().toISOString() } },
  }, "?currentDocument.exists=false"),
  "likes remain server-authoritative until abuse controls exist"
);
await expectDenied(
  await firestore("POST", "chats/" + chatId + "/messages?documentId=blocked-message", bob.token, {
    fields: { id: { stringValue: "blocked-message" }, text: { stringValue: "This should not send" }, senderId: { stringValue: bob.uid }, date: { timestampValue: new Date().toISOString() } },
  }),
  "blocked participants cannot exchange new messages"
);
await expectDenied(
  await firestore("POST", "reports?documentId=report-1", alice.token, {
    fields: {
      reporterId: { stringValue: alice.uid },
      targetUid: { stringValue: bob.uid },
      reason: { stringValue: "spam" },
      details: { stringValue: "Direct client write must be denied" },
      createdAt: { timestampValue: new Date().toISOString() },
    },
  }),
  "ordinary clients cannot write reports directly; callable backend owns intake"
);



const storageTests = spawnSync(
  process.platform === "win32" ? "npm.cmd" : "npm",
  ["test", "--", "--watchAll=false", "--runInBand", "src/firebase/storageRules.test.js"],
  {
    stdio: "inherit",
    env: {
      ...process.env,
      CI: "true",
      STORAGE_TEST_ALICE_UID: alice.uid,
      STORAGE_TEST_BOB_UID: bob.uid,
      STORAGE_TEST_MALLORY_UID: mallory.uid,
      STORAGE_TEST_CHAT_ID: chatId,
    },
  }
);
if (storageTests.error) throw storageTests.error;
assert.equal(storageTests.status, 0, "Firebase Storage SDK security tests must pass");


await expectDenied(await firestore("GET", "publicProfiles/" + hiddenUser.uid, alice.token), "hidden profile cannot be read by another signed-in user");
await expectAllowed(await firestore("GET", "publicProfiles/" + hiddenUser.uid, hiddenUser.token), "profile owner can read their own hidden profile");
console.log("Firebase Emulator Security Tests: all allowed and denied cases passed.");
