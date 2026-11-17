# Thirdwheel — Firebase security design

**Status:** Design proposal; not deployed.  
**Scope:** Firestore and Storage authorization for the current React/Firebase application.

## 1. Why a design step is required

The current client data model does not contain enough explicit authorization metadata for safe, maintainable rules. Writing rules against the current shape without first changing the client would either break existing chat flows or require overly broad permissions.

The current source uses:

- `users/{uid}` documents containing `uid`, `displayName`, `email` and `photoURL`.
- `userChats/{uid}` documents whose top-level keys are deterministic chat IDs. Each entry contains `userInfo`, `date` and optionally `lastMessage`.
- `chats/{chatId}` documents containing a `messages` array.
- Chat IDs formed by concatenating the two UIDs in sorted order.
- A chat creation flow that currently writes `{ messages: [] }`, without a participant list.
- A message-send flow that updates both participants' `userChats` documents.
- Avatar objects at `avatars/{uid}/{fileName}`.
- Chat image objects currently stored under a flat `chat-images/` path, which does not encode the conversation ID or uploader UID.

There are currently no version-controlled Firestore Rules, Storage Rules, Firebase CLI configuration or emulator rules tests in the repository.

## 2. Security objectives

1. Require Firebase Authentication for application data access.
2. Allow a user to create and update only their own profile, with a strict public-profile field allowlist.
3. Avoid storing email addresses in publicly discoverable profile documents. Firestore Rules are document-level, not field-redaction rules; the current search reads whole user documents.
4. Allow only the two explicit participants to read or write a conversation.
5. Tie message authorship to the authenticated UID and validate message shape and size.
6. Restrict avatar writes to the owning UID; allow authenticated reads because avatars are shown in user search and chat lists.
7. Restrict chat-image uploads and reads to authenticated conversation participants; enforce image MIME type and a maximum size of 5 MiB.
8. Test both allowed and denied cases with Firebase Emulator Suite.
9. Keep rule deployment separate from repository changes and require explicit owner approval before any production deployment.

## 3. Proposed minimal schema changes

### User profiles

Keep `users/{uid}` as the discoverable profile document, but store only:

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
  "participants": ["uid-a", "uid-b"],
  "messages": []
}
```

The participant list must contain exactly two distinct UIDs, including the authenticated creator. The existing deterministic chat ID remains for now to avoid combining this security phase with the later message-subcollection migration.

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
| `users/{uid}` | Authenticated users (public profile only) | Owner, valid public fields | Owner, valid public fields | Owner only or disabled by product decision |
| `userChats/{uid}` | Owner only | Owner, empty initial map | Owner or participant updating only the corresponding chat entry | Owner only |
| `chats/{chatId}` | Listed participants only | Authenticated creator, exactly two valid participants | Listed participants; only valid message append / approved metadata changes | Disabled in this phase |
| `avatars/{uid}/{fileName}` | Authenticated users | Owner, image, <= 5 MiB | Owner, image, <= 5 MiB | Owner |
| `chat-images/{chatId}/{uid}/{fileName}` | Listed chat participants | Authenticated uploader who is a participant, image, <= 5 MiB | Same constraints | Uploader who is a participant |

The exact rules expressions and allowed field changes will be implemented and verified in the emulator test suite before any deployment.

## 5. Required client changes

- Stop writing `email` to public `users/{uid}` documents.
- Add the two participant UIDs when creating a conversation.
- Change chat image storage paths to include chat ID and uploader UID.
- Preserve the current message-array model in this phase; moving messages to a subcollection remains a separate, gated Phase 4 change.
- Keep the two userChats updates, but constrain them to the matching participant conversation entry in rules.
- Handle permission-denied errors with user-facing messages rather than silently retrying.

## 6. Emulator test matrix

### Firestore — allowed

- Authenticated user can create their own valid public profile.
- Authenticated user can search/read public profiles.
- User can read their own `userChats` document.
- A participant can read the conversation they belong to.
- A participant can append a valid message whose `senderId` is their auth UID.
- A participant can update only the corresponding chat entry in the other participant's `userChats` document.

### Firestore — denied

- Unauthenticated reads and writes.
- User A creating or modifying User B's profile.
- Public profile containing forbidden fields such as `email`.
- Non-participant reading or writing a conversation.
- Message authored with another UID.
- Message with invalid types, missing required fields or excessive text length.
- A participant modifying an unrelated chat entry in another user's chat list.
- A third user adding themselves to an existing conversation or changing its participants.

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
- End-to-end encryption, abuse reporting, moderation, rate limiting and operational monitoring.
- Public launch approval.

