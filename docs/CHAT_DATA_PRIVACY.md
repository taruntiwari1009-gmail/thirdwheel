# Chat Data Model and Privacy Contract

This contract describes the active one-to-one chat model and privacy boundaries. It does not authorize production deployment.

| Data | Location | Client visibility | Notes |
|---|---|---|---|
| Public profile | `publicProfiles/{uid}` | Signed-in users | Deliberately shared profile fields only |
| Username reservation | `usernames/{username}` | Signed-in users | Unique username ownership |
| Private inbox entry | `users/{uid}/userChats/{chatId}` | Owner and authorized participant operations | Preview and unread state |
| Block list | `users/{uid}/blockedUsers/{blockedUid}` | Owner only | Blocking overrides new contact and messages |
| Conversation | `chats/{chatId}` | Participants only | Two immutable UIDs; message documents live in a dedicated subcollection |
| Avatar media | `avatars/{uid}/{fileName}` | Signed-in users; owner writes | Review before treating as private |
| Chat media | `chat-images/{chatId}/{uid}/{fileName}` | Participants | Upload scoped to participant/uploader |
| Reports | `reports/{reportId}` | Trusted server/admin only | Created through callable backend |
| Moderation cases/audit | `moderationCases`, `moderationAudit` | Trusted server/admin only | Moderator access via custom claims |

## Conversation invariants
- Exactly two distinct participants; chat ID derives from sorted participant UIDs.
- Participants are immutable.
- Only participants can read a conversation and its message subcollection.
- Each message is a separate immutable document at `chats/{chatId}/messages/{messageId}`; clients cannot edit or delete message documents.
- Message sender must be the authenticated participant.
- A block in either direction prevents new conversation creation and message writes.
- Non-participants cannot read or alter inbox entries or conversation messages.

## Reporting and moderation
A report is an allegation, not a finding. Ordinary clients cannot read or alter reports, cases, notes or audit events. Trusted functions validate reports, throttle submissions and create a case/audit record atomically. Moderator roles are custom claims, not client-writable Firestore fields.

## Deletion and migration
Deletion must preserve the other participant's data and follow approved retention policy. Do not automatically delete shared chats or media in a client-only workflow. The embedded-message array and legacy `userChats/{uid}` layout are obsolete and intentionally unsupported. Disposable test data may be reset; production data must never be bulk-deleted without confirming the exact project and records.


Proposed account deletion behavior — pending owner approval:
- Remove the deleted user’s public profile, username reservation, own inbox entries, own block list, message throttle, avatar files and Firebase Authentication account.
- Proposed retention: preserve shared conversation documents, messages and chat attachments for the remaining participant.
- Proposed identity handling: mark the deleted participant in the conversation and replace the remaining participant’s cached inbox identity with “Deleted account.”
- If approved, deletion is owner-authorized and processed in resumable batches; the trusted backend retains a completion record and audit trail.


## Disposable chat-data reset

For the explicitly disposable test project only, the repository includes a guarded cleanup command. It deletes all conversation documents and their message subcollections, both the obsolete root `userChats` layout and per-user inbox entries, message-rate-limit documents, and objects under `chat-images/`. It intentionally leaves Firebase Auth users, public profiles, usernames, block lists and moderation records intact.

Run only after confirming the exact Firebase project and that its chat data is disposable:

```bash
cd functions
GCLOUD_PROJECT="your-test-project-id" THIRDWHEEL_CONFIRM_TEST_DATA_RESET="your-test-project-id" npm run reset:test-chat-data -- --project=your-test-project-id
```

This is a destructive operator command. It has not been run by this change. Never point it at production or a project containing user conversations.
