# Chat data model and privacy contract

This document describes the current one-to-one chat data model and the privacy boundaries that future changes must preserve. It does not authorize a production migration or rules deployment.

## Collections and visibility

| Data | Location | Client visibility | Notes |
|---|---|---|---|
| Public profile | `publicProfiles/{uid}` | Signed-in users | Only deliberately shared profile fields |
| Username reservation | `usernames/{username}` | Signed-in users | Unique username ownership |
| Private inbox entry | `users/{uid}/userChats/{chatId}` | Owner and authorized conversation participant operations | Conversation preview and unread state |
| Block list | `users/{uid}/blockedUsers/{blockedUid}` | Owner only | Blocking overrides new contact and messaging |
| Conversation | `chats/{chatId}` | Participants only | Two immutable participant UIDs and current embedded messages array |
| Avatar media | `avatars/{uid}/{fileName}` | Signed-in users; writes owner-only | Current access model; review before treating as private |
| Chat media | `chat-images/{chatId}/{uid}/{fileName}` | Conversation participants | Upload constrained to participant/uploader |
| Reports | `reports/{reportId}` | Client create only | Client cannot read, update or delete |
| Moderation records | `moderationCases/{caseId}` | Trusted server/admin only | Never readable or writable by ordinary clients |
| Audit events | `moderationAudit/{eventId}` | Trusted server/admin only | Append-only operational audit |

## Profile field policy

- Public only when deliberately shared: display name, avatar, bio, interests, hobbies, languages, education and selected social links.
- Private by default: email, authentication credentials, private inbox state, block list, report history and moderation data.
- Do not place email, private conversation data, report history or moderation notes in public profiles.
- Do not expose exact location or derive distance from coordinates.

## Conversation invariants

- A conversation has exactly two distinct participants.
- The chat document ID is derived from the sorted participant UIDs.
- Participants are immutable after creation.
- Only participants can read a conversation.
- A message sender must be the authenticated participant.
- A block in either direction prevents new conversation creation and new message writes.
- Non-participants cannot read or alter inbox entries or conversation messages.

## Reporting and moderation

- A report is an allegation, not a finding.
- Ordinary clients may submit reports but cannot read or alter report records after submission.
- Moderation cases, moderator notes and audit events must be accessible only through trusted server-side authorization.
- Retention periods and escalation procedures require explicit operational and legal review; this document does not invent them.

## Compatibility and migration

- Existing chat documents remain on the embedded-message model until a migration is rehearsed and verified.
- Any message-subcollection migration requires backup, dry run, count reconciliation, ordering/timestamp verification, idempotency, rollback plan and explicit owner approval.
- Do not break existing conversations while introducing new message storage.

## Account deletion and retention

Account deletion must remove or de-identify user-owned profile, inbox, block and media data where appropriate. Conversation cleanup must account for the other participant's records and applicable safety/legal retention requirements. Implement deletion as a trusted, retryable workflow; do not perform partial destructive cleanup in the browser.
