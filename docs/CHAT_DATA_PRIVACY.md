# Chat Data Model and Privacy Contract

This contract describes the existing one-to-one chat model and privacy boundaries. It does not authorize production migration or deployment.

| Data | Location | Client visibility | Notes |
|---|---|---|---|
| Public profile | `publicProfiles/{uid}` | Signed-in users | Deliberately shared profile fields only |
| Username reservation | `usernames/{username}` | Signed-in users | Unique username ownership |
| Private inbox entry | `users/{uid}/userChats/{chatId}` | Owner and authorized participant operations | Preview and unread state |
| Block list | `users/{uid}/blockedUsers/{blockedUid}` | Owner only | Blocking overrides new contact and messages |
| Conversation | `chats/{chatId}` | Participants only | Two immutable UIDs and current embedded messages |
| Avatar media | `avatars/{uid}/{fileName}` | Signed-in users; owner writes | Review before treating as private |
| Chat media | `chat-images/{chatId}/{uid}/{fileName}` | Participants | Upload scoped to participant/uploader |
| Reports | `reports/{reportId}` | Trusted server/admin only | Created through callable backend |
| Moderation cases/audit | `moderationCases`, `moderationAudit` | Trusted server/admin only | Moderator access via custom claims |

## Conversation invariants
- Exactly two distinct participants; chat ID derives from sorted participant UIDs.
- Participants are immutable.
- Only participants can read a conversation.
- Message sender must be the authenticated participant.
- A block in either direction prevents new conversation creation and message writes.
- Non-participants cannot read or alter inbox entries or conversation messages.

## Reporting and moderation
A report is an allegation, not a finding. Ordinary clients cannot read or alter reports, cases, notes or audit events. Trusted functions validate reports, throttle submissions and create a case/audit record atomically. Moderator roles are custom claims, not client-writable Firestore fields.

## Deletion and migration
Deletion must preserve the other participant's data and follow approved retention policy. Do not automatically delete shared chats or media in a client-only workflow. Message migration requires backup, dry run, count reconciliation, ordering/timestamp verification, idempotency, rollback and explicit approval.


Approved account deletion behavior:
- Remove the deleted user’s public profile, username reservation, own inbox entries, own block list, message throttle, avatar files and Firebase Authentication account.
- Preserve shared conversation documents, messages and chat attachments for the remaining participant.
- Mark the deleted participant in the conversation and replace the remaining participant’s cached inbox identity with “Deleted account.”
- Deletion is owner-approved and processed in resumable batches; the trusted backend retains a completion record and audit trail.
