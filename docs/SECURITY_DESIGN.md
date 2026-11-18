# Third Wheel — Supabase security design

**Status:** Fresh schema and trusted functions are applied to the new Supabase project. The React client migration is in progress; this is not a production release.  
**Project:** `thirdwheel` / `uvxvizndmacoqfrdyifr` / `ap-northeast-1` (Tokyo).  
**Data policy:** No Firebase accounts, profiles, conversations, messages or media are imported. Firebase remains untouched and unused by the active application.

## Data model

- `public.profiles`: allowlisted profile fields, discoverability and unique lowercase username.
- `public.conversations`: one-to-one pair stored as sorted participant UUIDs; unique pair constraint. Participant IDs are deliberately retained when an account is deleted so the other participant's conversation history survives.
- `public.conversation_reads`: per-user last-read boundary and inbox-hidden state.
- `public.messages`: append-only text/image messages, unique client idempotency ID per conversation and sender; sender becomes null when the account is deleted.
- `public.user_blocks`: one-way block ownership; either direction prevents new conversations and message writes.
- `public.reports`: reporter, subject, optional conversation/message context, reason, details and status.
- `public.moderation_audit`: trusted append-only audit events.
- `public.account_deletion_requests`: user-initiated request; no client approval or processing privileges.
- `private.message_rate_limits` and `private.report_rate_limits`: RLS-protected internal counters, not exposed through the Data API.

## Authorization invariants

1. Authenticated access is required for application data.
2. RLS is enabled on every application table. Client grants are explicitly scoped to required operations and columns.
3. Public profile reads are limited to discoverable profiles. A user can also see their own profile, a profile they blocked, or a current conversation partner's profile. Hiding a profile removes it from search but does not erase it from an existing conversation.
4. Conversation reads are restricted to the two participant UUIDs and an active profile for the caller.
5. Conversation creation rejects self-conversations, duplicate pairs, undiscoverable targets and blocks in either direction.
6. Message creation binds `sender_id` to `auth.uid()`, requires conversation membership, blocks either-direction block relationships and validates attachment paths. Clients cannot set message IDs or timestamps, update messages or delete messages.
7. Message send rate limiting is enforced by a database trigger: at most eight messages per user per rolling minute window.
8. Report intake is authenticated and reporter-bound; a database trigger limits each user to five reports per rolling hour window.
9. Read receipts are per-user. Conversation members may read each other's read boundary, but a user may update only their own read state.
10. Avatar and chat-image buckets are private. Avatar reads require profile visibility; chat-image reads require conversation membership. Upload paths bind to the authenticated owner or conversation/uploader. Bucket limits restrict images to JPEG, PNG, WebP or GIF up to 5 MiB.
11. Reports, moderation audit records and account deletion processing are not directly manageable by ordinary clients.
12. Moderator and owner authorization uses protected Supabase `app_metadata` claims. User-editable `user_metadata` is never used for authorization.
13. Moderation status change plus audit event is performed by an atomic database function executable only by `service_role`.
14. Account deletion is owner-approved and owner-triggered. The Auth user/profile and personal inbox/read/block data are removed; message rows and shared conversation metadata are retained for the other participant. The deleted sender is rendered as “Deleted account.” Chat-image objects are retained with the shared conversation; the avatar bucket objects are deleted.
15. Edge Functions verify the caller's JWT and re-fetch the user with Supabase Auth. Elevated secret keys are used only server-side.

## Trusted Edge Functions

- `moderation-list-cases`: moderator/owner view of report cases.
- `moderation-review-case`: moderator/owner status change and atomic audit write.
- `moderation-set-role`: owner-only moderator grant/revoke; an owner cannot be modified by this operation.
- `account-deletion-list`: owner-only deletion request list.
- `account-deletion-approve`: owner-only approval of pending requests.
- `account-deletion-process`: owner-only deletion execution after approval.

All are deployed with JWT verification enabled. Browser calls additionally require the request origin to appear in the exact `ALLOWED_ORIGINS` Edge Function secret. The deployed default permits localhost development only.

## Verified backend state

- Seven versioned schema/security migrations have been applied after the initial function-access restriction migration.
- Nine application tables plus two private rate-limit tables have RLS enabled.
- Avatar and chat-image buckets are private.
- Storage policies cover owner/member access, uploader path validation and retry-safe updates.
- Realtime publication includes `messages`, `conversations` and `conversation_reads`.
- Supabase security and health advisors currently report no findings.
- The performance advisor reports unused indexes only; the project is empty and has no live query workload yet.
- No Supabase Auth users, profiles, conversations, messages or Storage objects have been seeded.

## Release gates

- Verify Auth email confirmation, password reset, redirect URLs and sender configuration.
- Provision the initial owner claim using a trusted operator process after creating the owner's Auth account.
- Set `ALLOWED_ORIGINS` to the exact development/staging/production origins before browser function calls.
- Complete authenticated browser tests with disposable accounts: non-member denial, blocks, image paths, upload retries, realtime delivery, pagination and read receipts.
- Verify account deletion end-to-end in disposable accounts, including partial failure/retry and retained counterpart history.
- Review legal retention, user-facing disclosures, moderator staffing, escalation, evidence retention and appeals.
- Configure backups/restore and monitoring appropriate to the intended launch tier.
- Do not deploy the frontend, change Netlify, retire Firebase or merge without separate explicit authorization.
