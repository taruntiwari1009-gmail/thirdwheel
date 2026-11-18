# Supabase migration plan

**Status:** Fresh backend foundation applied; React client replacement in progress.  
**Target:** Existing Supabase project `thirdwheel` (`uvxvizndmacoqfrdyifr`), Free plan, region `ap-northeast-1` (Tokyo, Asia-Pacific).  
**Git workflow:** Continue only on `fix/netlify-ci-lint-pr13` / PR #14. Keep PR #14 open, draft and unmerged. No direct pushes to `main`.  
**Deployment boundary:** Supabase schema foundation applied to the new empty project only. No frontend production deployment, secrets, Firebase changes, Netlify changes or public release.

## Decision

Supabase replaces Firebase as the intended application backend. The existing Supabase project will be retained; do not recreate it solely to change region. The project API confirms the database region is `ap-northeast-1` (Tokyo). This is the region already created; we are proceeding with it.

This is a fresh start, not a data migration. Do not copy Firebase Auth users, Firestore documents, messages, profile records or Storage objects into Supabase. New users will register again in Supabase Auth. Firebase is not to be extended for new functionality and remains untouched; do not delete the Firebase project or its data unless the owner separately authorizes that cleanup.

## Target architecture

- React client: Supabase JS client, using only the project URL and publishable/anon key in browser configuration.
- Authentication: Supabase Auth; never expose the service-role key to the browser.
- Relational data: PostgreSQL with explicit SQL migrations.
- Authorization: Row Level Security enabled on every exposed table, with explicit policies and least-privilege grants.
- Realtime: Supabase Realtime for conversation/message updates; database state remains authoritative.
- Files: private Supabase Storage buckets with policies scoped to the authenticated owner or conversation participants.
- Trusted operations: Edge Functions or carefully scoped Postgres functions for moderation, moderator administration and account deletion. Elevated credentials remain server-side.

## Proposed relational model

1. `profiles`: one row per `auth.users.id`; username, display name, profile fields, discoverability and timestamps.
2. `username_reservations`: unique normalized username mapped to a profile; changes handled transactionally.
3. `conversations`: one-to-one conversation metadata, created by a trusted transaction/function; enforce two distinct participants and unique canonical participant pair.
4. `conversation_members`: conversation/user membership, read boundary and unread state. Unique (conversation_id, user_id).
5. `messages`: conversation, sender, client-generated stable ID, text, optional storage object path, created timestamp; unique idempotency key per sender/conversation.
6. `user_blocks`: blocker and blocked user, unique pair, no self-blocking. Queries must hide both directions where required by product policy.
7. `reports`: reporter, subject, conversation/message context where applicable, reason, evidence metadata and status; client submission only, moderator reads/writes restricted.
8. `moderation_audit`: append-only trusted audit events.
9. `account_deletion_requests`: requester, status, timestamps and trusted processing metadata; no client ability to approve or execute deletion.
10. Optional rate-limit state only if a database-enforced or trusted-server-enforced rate limit cannot be implemented safely with transaction/advisory locking.

Final column types, constraints, indexes, retention behavior and RLS policies must be authored as versioned migrations and tested before applying to the hosted project.

## Security requirements

- Enable RLS on every table exposed through the Data API; default deny.
- Users can read/update only their own private profile fields. Public profile reads require discoverability and must expose only intended fields.
- Users cannot insert messages as another sender, alter message authorship/timestamps, or update/delete another user's messages.
- Only conversation members can read messages and conversation metadata.
- Conversation creation must reject self-conversations, duplicate pairs and either-direction blocks.
- Blocking must take effect for both directions according to the product's privacy rules.
- Storage buckets remain private. Object paths bind uploads to authenticated user and conversation; reads require membership. Enforce MIME type and size limits.
- Moderation, moderator role assignment, audit writes and account deletion execution are trusted-server-only.
- Never ship service-role keys, database passwords or other secrets in client code or Git.
- Add abuse controls for message sending and report submission; client-side throttling is not a security boundary.

## Fresh-build sequence

### Phase 0 — repository inventory
- Enumerate every Firebase Auth, Firestore, Storage and callable Functions import/use.
- Map each existing UI operation to its Supabase table, query, storage action or trusted function.
- Inventory Firebase-specific tests, emulator workflows, CI secrets and documentation.
- Preserve current product behavior and the lavender/rose UI; this is a backend migration, not a visual redesign.

### Phase 1 — schema and policy foundation
- Add SQL migrations for extensions (only if needed), tables, constraints, indexes, triggers and RLS policies.
- Add deterministic SQL tests or local Supabase tests for authorization boundaries.
- Add generated TypeScript types if the repository's build setup supports them.
- Do not apply migrations to the hosted project until reviewed and explicitly approved.

### Phase 2 — client infrastructure
- Add a single Supabase client module driven by environment variables.
- Replace Firebase Auth context with Supabase Auth session handling.
- Add a typed data-access layer so components do not issue ad hoc database calls.
- Keep local development functional without production credentials.

### Phase 3 — feature migration
- Registration/login/password reset/profile management.
- Discoverability-aware profile search and username uniqueness.
- One-to-one conversation creation, inbox listing and pagination.
- Realtime message delivery, stable retry/idempotency, read receipts and unread state.
- Private avatar/chat-image upload and authorized retrieval.
- Blocking, reporting, moderation and account deletion.

### Phase 4 — verification
- Unit tests for data-access and validation logic.
- RLS tests for owner, participant, nonparticipant, blocked user and unauthenticated cases.
- Storage policy tests for owner/member/nonmember access and invalid MIME/oversize files.
- Realtime tests for message delivery and conversation switching.
- Account deletion and moderation authorization tests.
- Full React test suite and production build.
- Manual browser acceptance before release.

### Phase 5 — cutover
- Configure Supabase Auth URLs, email templates and allowed redirect URLs.
- Configure environment variables in the eventual hosting environment.
- Apply reviewed migrations to the existing Supabase project.
- Run smoke tests using disposable accounts.
- Cut the frontend over only after compatibility and rollback plans are verified.
- Keep Firebase available but unused until the owner explicitly approves retirement.

## Free-tier and operational constraints

- Treat the Free plan as development/early evaluation, not a production uptime guarantee.
- Verify current quotas, project pausing behavior, storage limits and backup/restore options before public launch.
- Add usage monitoring and document the upgrade threshold before inviting real users.
- Do not promise zero operating cost or uninterrupted production availability on the Free plan.

## Current implementation status\n\n- Supabase project verified healthy, empty before schema creation, and retained in Tokyo (`ap-northeast-1`).\n- `public.rls_auto_enable()` direct execution revoked from `anon` and `authenticated`; its `ensure_rls` event trigger remains enabled. Security advisor warning cleared.\n- Applied migration `initial_thirdwheel_schema`: profiles, conversations, read state, blocks, messages, reports, moderation audit, account-deletion requests; private rate-limit table; auth/profile and message triggers; private avatar/chat-image buckets; Storage policies; chat Realtime publication.\n- Applied migration `fk_indexes_and_explicit_denies`: explicit deny policies for internal tables and foreign-key indexes.\n- Post-apply verification: 9/9 application tables have RLS enabled, both Storage buckets private, 7 Storage policies present, 3 Realtime tables registered, security advisor clear, health advisor clear. Performance advisor only reports unused indexes because the new database has no workload yet.\n- No Supabase Auth users or application data have been seeded.\n\n## Acceptance criteria

- No Firebase SDK imports or Firebase runtime dependency remain in the active application path.
- No service-role key or database password is present in client bundles or repository history.
- All exposed tables have RLS enabled and tests demonstrate deny-by-default behavior.
- Messaging, search, profiles, blocking, media, moderation and deletion workflows pass automated tests.
- Existing UI and one-to-one chat product direction are preserved.
- CI passes on the PR #14 head.
- PR #14 remains open, draft and unmerged; no Netlify changes and no production release without explicit authorization.
