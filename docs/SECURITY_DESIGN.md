# Thirdwheel — Firebase security design

**Status:** Implemented and extended in PR #14; emulator verification is part of CI. Rules are not deployed to the live Firebase project.  
**Scope:** Firestore and Storage authorization for the current React/Firebase application.

## 1. Why a design step is required

The current client data model does not contain enough explicit authorization metadata for safe, maintainable rules. Writing rules against the current shape without first changing the client would either break existing chat flows or require overly broad permissions.

The current source uses:

- Before the security implementation, `users/{uid}` documents contained `uid`, `displayName`, `email` and `photoURL`; the old `userChats/{uid}` document stored chat entries in a dynamic map.
- The new client uses `publicProfiles/{uid}` for discoverable profile fields and `users/{uid}/userChats/{chatId}` for per-user conversation entries.
- `chats/{chatId}` documents containing immutable participant metadata only; messages live under `chats/{chatId}/messages/{messageId}`.
- Chat IDs formed by concatenating the two UIDs in sorted order.
- The chat creation flow writes only a sorted two-UID `participants` array.
- A message-send flow that updates both participants' `userChats` documents.
- Avatar objects at `avatars/{uid}/{fileName}`.
- New chat image objects are stored under `chat-images/{chatId}/{uid}/{fileName}`.
- Firestore Rules, Storage Rules, Firebase Emulator configuration and a REST-based emulator test runner are now version-controlled. The emulator tests run in CI; no live rules have been deployed.

## 2. Security objectives

1. Require Firebase Authentication for application data access.
2. Allow a user to create and update only their own profile, with a strict public-profile field allowlist.
3. Avoid storing email addresses in publicly discoverable profile documents. Firestore Rules are document-level, not field-redaction rules; the current search reads whole user documents.
4. Allow only the two explicit participants to read or write a conversation.
5. Tie message authorship to the authenticated UID, validate message shape and size, and make message documents immutable after creation.
6. Restrict avatar writes to the owning UID; allow authenticated reads because avatars are shown in user search and chat lists.
7. Restrict chat-image uploads and reads to authenticated conversation participants; enforce image MIME type and a maximum size of 5 MiB.
8. Test both allowed and denied cases with Firebase Emulator Suite.
9. Keep rule deployment separate from repository changes and require explicit owner approval before any production deployment.
10. Let users block another account; block state is private to the blocking user and prevents new conversations and message writes in either direction.
11. Let authenticated users submit structured profile reports; reports are write-only from the client and must be reviewed through a trusted administrative process.

## 3. Proposed minimal schema changes

### User profiles

The implemented client uses a separate `publicProfiles/{uid}` collection for discoverable profile documents, and keeps per-user chat-list entries under `users/{uid}/userChats/{chatId}`. This prevents legacy private user fields from being exposed through public profile queries. Store only:

```json
{
  "uid": "auth uid",
  "displayName": "public display name",
  "photoURL": "avatar URL"
}
```

The email remains in Firebase Authentication and is not copied into the discoverable Firestore document. Search currently needs only UID, display name and avatar URL.

### Conversation metadata

Add a `participants` array to every new `chats/{chatId}` document:

```json
{
  "participants": ["uid-a", "uid-b"]
}
```

The participant list must contain exactly two distinct UIDs, including the authenticated creator. The deterministic chat ID is derived from the sorted UIDs. Message documents are stored separately under the chat.

### Blocking and reporting

- `users/{uid}/blockedUsers/{blockedUid}` stores a private block relationship. Only the owner can read, create or delete entries.
- Chat creation and message creation check both participants' block lists. A block therefore prevents new conversations and further message exchange even if a chat document already exists.
- `reports/{reportId}` accepts a constrained report payload. Client reads, updates and deletes are denied. Reports are not yet connected to an in-app moderation dashboard or notification workflow; an operator must review them through a trusted administrative channel.

### Chat image paths

Change new chat image uploads to:

```
chat-images/{chatId}/{uploaderUid}/{fileName}
```

This gives Storage Rules enough path context to verify conversation membership and uploader identity. Existing flat-path demo objects are not migrated; they may be cleared as demo data after explicit approval.

### Existing userChats behavior

The current app updates both participants' chat-list documents from the client. Rules must allow a participant to update only the single chat entry associated with a conversation in which they participate, not arbitrary entries in another user's chat list. The emulator tests must explicitly cover attempted cross-chat injection and updates by non-participants.

## 4. Rule policy matrix

| Resource | Read | Create | Update | Delete |
|---|---|---|---|---|
| `publicProfiles/{uid}` | Authenticated users | Owner, allowlisted public fields | Owner, allowlisted public fields | Owner only |
| `users/{uid}/userChats/{chatId}` | Owner or conversation participant | Conversation participant, with counterpart profile verified | Conversation participant, only `lastMessage` and `date` | Owner who is a participant |
| `chats/{chatId}` | Listed participants only | Authenticated creator, exactly two valid participants, neither participant has blocked the other | Disabled for clients | Disabled |
| `chats/{chatId}/messages/{messageId}` | Listed participants only | Participant, message ID matches document ID, authenticated authorship, valid payload, rate limit and no block | Disabled (immutable) | Disabled (immutable) |
| `users/{uid}/blockedUsers/{blockedUid}` | Owner only | Owner, distinct target UID | Disabled | Owner |
| `reports/{reportId}` | Client denied | Authenticated reporter, constrained target/reason/details | Client denied | Client denied |
| `avatars/{uid}/{fileName}` | Authenticated users | Owner, image, <= 5 MiB | Owner, image, <= 5 MiB | Owner |
| `chat-images/{chatId}/{uid}/{fileName}` | Listed chat participants | Authenticated uploader who is a participant, image, <= 5 MiB | Same constraints | Uploader who is a participant |

The exact rules expressions and allowed field changes are implemented in `firestore.rules` and `storage.rules`; the emulator test runner verifies the positive and negative cases before any deployment.

## 5. Required client changes

- Write discoverable profiles to `publicProfiles/{uid}` without email.
- Add the two participant UIDs when creating a conversation.
- Store each message as an immutable document in the chat's `messages` subcollection; use the message UUID as the document ID.
- Store per-user chat list entries at `users/{uid}/userChats/{chatId}`.
- Change chat image storage paths to include chat ID and uploader UID.
- The embedded-message array and legacy root-level `userChats/{uid}` schema are intentionally unsupported.
- Keep the two per-user chat-list writes, constrained to the matching participant conversation entry in rules.
- Handle permission-denied errors with user-facing messages rather than silently retrying.

## 6. Emulator test matrix

### Firestore — allowed

- Authenticated user can create their own valid public profile.
- Authenticated user can search/read public profiles.
- User can read their own `userChats` document.
- A participant can read the conversation they belong to.
- A participant can create a valid message document whose ID and `senderId` match the request.
- A participant can update only the corresponding chat entry in the other participant's `userChats` document.

### Firestore — denied

- Unauthenticated reads and writes.
- User A creating or modifying User B's profile.
- Public profile containing forbidden fields such as `email`.
- Non-participant reading or writing a conversation.
- Message authored with another UID or a mismatched document ID.
- Message document updates or deletes by clients.
- Conversation documents containing the obsolete embedded `messages` field.
- Message with invalid types, missing required fields or excessive text length.
- A participant modifying an unrelated chat entry in another user's chat list.
- A third user adding themselves to an existing conversation or changing its participants.
- A user sending a message after either participant has blocked the other.
- A user creating a block entry for themselves or modifying another user's block list.
- A user submitting a report for themselves or spoofing another reporter UID.

### Storage — allowed

- Authenticated user reads avatar images.
- Owner uploads an image to their own avatar path.
- Participant uploads a permitted image to their own uploader path within a conversation.

### Storage — denied

- Unauthenticated reads/writes.
- User uploads to another user's avatar path.
- Non-participant reads or uploads chat media.
- User uploads media under another participant's UID path.
- Non-image content types and files larger than 5 MiB.

## 7. Delivery and safety gates

1. Implement the schema/client changes and rules in a dedicated PR.
2. Add Firebase Emulator Suite configuration and deterministic rules tests.
3. Run unit tests, rules tests and production build in GitHub Actions.
4. Review the complete rule diff and test matrix.
5. Do not deploy rules, alter Firebase Console settings, delete demo data or migrate any live data as part of the PR.
6. Before deployment, inspect the actual Firebase project state and confirm the target project ID with the owner. A passing emulator suite does not prove the live project is configured correctly.

## 8. Known limitation: download URLs

The current client uses Firebase Storage download URLs. A download URL containing a Firebase token is a bearer link: anyone who obtains the URL may be able to access the object even if they are not a chat participant. Storage Rules still protect normal authenticated SDK reads and writes, but they do not make a leaked bearer URL private.

Before treating chat media as confidential, replace tokenized download-URL usage with authenticated Storage SDK reads (or another authenticated media-delivery design), and test that access path. This is a release-readiness requirement, not something to conceal behind the rules.

## 9. Out of scope

- Firestore message-array to subcollection migration and pagination.
- Production Firebase rules deployment.
- Production data deletion or migration.
- End-to-end encryption, moderation dashboard/workflow, rate limiting and operational monitoring.
- Public launch approval.

