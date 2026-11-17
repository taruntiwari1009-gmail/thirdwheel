# Thirdwheel — Firebase security design

**Status:** Firestore and Storage rules are version-controlled and emulator-tested in PR #14. They have not been deployed to the live Firebase project.  
**Scope:** Authorization for the current React/Firebase one-to-one chat application.

## Current data model

- `publicProfiles/{uid}`: allowlisted discoverable profile fields; no email.
- `usernames/{username}`: username reservation.
- `users/{uid}/userChats/{chatId}`: per-user inbox entry and unread metadata.
- `users/{uid}/blockedUsers/{targetUid}`: the user's block list.
- `users/{uid}/blockedBy/{blockerUid}`: reciprocal index used to hide users who blocked the signed-in account from discovery.
- `chats/{chatId}`: exactly two sorted participant UIDs and conversation metadata.
- `chats/{chatId}/messages/{messageId}`: immutable message documents.
- `avatars/{uid}/{fileName}`: avatar objects.
- `chat-images/{chatId}/{uid}/{fileName}`: conversation media scoped to chat and uploader.
- `reports`, `moderationCases`, `moderationAudit`: trusted backend-owned report and moderation records.
- `accountDeletionRequests/{uid}`: owner-reviewed account deletion workflow state.

## Authorization invariants

1. Authenticated access is required for application data.
2. Users can write only their own public profile, and profile fields are allowlisted.
3. Only the two explicit conversation participants can read conversation/message data.
4. Message authorship is tied to the authenticated UID; messages are immutable to clients.
5. Either direction of a block prevents new conversations and message writes.
6. Reciprocal block-index records are maintained atomically by the trusted client workflow and are checked in discovery; Firestore rules protect block ownership and protected chat operations.
7. Chat media writes are limited to participants/uploader, image MIME types and the 5 MiB cap.
8. Reports, cases and audit records are not readable or mutable by ordinary clients; trusted Functions own their lifecycle.
9. Moderator access is based on Firebase custom claims. Grant/revoke requires an owner custom claim.
10. Account deletion requires an authenticated request, owner approval and owner-triggered resumable processing. Shared chat history is retained for the other participant under the currently implemented policy.
11. New message attachment references must match `chat-images/{chatId}/{authenticatedSenderUid}/{fileName}`; the filename is normalized to a restricted safe character set, and a message cannot persist an arbitrary or tokenized download URL.

## Known limitations and release gates

- **Media privacy:** New messages store Storage object paths, and the client loads them through authenticated Storage SDK `getBlob()` reads; Firestore rules bind new image references to the sender's chat-image path. The browser receives a temporary object URL which is revoked on unmount. Bucket CORS and end-to-end browser verification remain staging requirements. Historical messages may still contain tokenized download URLs; the client resolves them as Storage references and does not render the bearer URL directly. See [media CORS setup](./CHAT_MEDIA_CORS.md).
- **App Check:** Web initialization can use a configured site key; callable enforcement remains optional via `ENFORCE_APPCHECK`. Verify valid/invalid token behavior in a dedicated staging project before enabling enforcement. Do not commit keys.
- **Deletion policy:** The owner-approved executor is implemented and emulator-tested, but the retention policy, legal exceptions, support process and real operational runbook still require review. It has not been executed on production accounts.
- **Operations:** Define moderator staffing, escalation, evidence retention, appeals, incident handling and service-level expectations.
- **Production:** No Firebase rules/functions deployment or live data operation is authorized by PR #14. A passing emulator suite does not prove live project configuration.

## Verification

CI runs application tests/build, Functions unit and emulator integration tests, and Firestore/Storage emulator security tests. Review the workflows and test logs for the exact head SHA before considering a change verified. Manual UI, accessibility, responsive and staging checks remain separate acceptance activities.

## Deployment safety

1. Confirm the exact Firebase project ID and its ownership.
2. Review rules, indexes, functions, Storage paths and environment variables.
3. Verify backups/restore and migration/reset implications.
4. Use a dedicated staging project first, with explicit approval.
5. Observe App Check and function behavior before any enforcement decision.
6. Prepare rollback steps and an incident owner.
7. Do not deploy, reset data, migrate production records, access Netlify or merge without explicit authorization.
