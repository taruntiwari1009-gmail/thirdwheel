# Third Wheel

Third Wheel is a one-to-one messaging app focused on helping people start and maintain genuine conversations. Dating mechanics, likes, passes, matches and romantic-intent discovery are out of scope.

## Stack

- React 18 and React Router
- Supabase JavaScript SDK `2.119.0`
- Supabase Auth for email/password accounts and recovery
- PostgreSQL with Row Level Security (RLS)
- Supabase Realtime for inbox, messages and read receipts
- Private Supabase Storage buckets for avatars and chat images
- Supabase Edge Functions for moderation and account administration
- Sass

## Backend project

The fresh backend lives in Supabase project `thirdwheel`, ref `uvxvizndmacoqfrdyifr`, region `ap-northeast-1` (Tokyo).

**This is a clean start, not a Firebase data migration.** No Firebase users, profiles, conversations, messages or files are copied. People will create new accounts in Supabase Auth. The previous Firebase project and its data are left untouched and are not used by the active application.

The initial schema and security migrations have been applied to the new Supabase project. Six JWT-verified Edge Functions are deployed for moderation review, moderator administration and account-deletion operations. The Supabase project currently has no user accounts or application data.

## Local setup

Use Node.js 22 or later.

```bash
npm ci
cp .env.example .env
npm start
```

The app runs at [http://localhost:3000](http://localhost:3000). The example environment file points at the new, currently empty Supabase project.

For a local Supabase stack, install the Supabase CLI and Docker, then run:

```bash
supabase start
supabase status
```

The local API URL and publishable/anon key printed by `supabase status` can be used in your local `.env` file instead of the hosted project values. Apply the timestamped migrations to the local database with `supabase db reset`. The Edge Function config enables JWT verification for all six functions. For local function calls, copy `supabase/functions/.env.example` to `supabase/functions/.env` (ignored by Git) and set only local origins; never commit actual secret keys.

The rollback-only policy test is in `supabase/tests/rls_rollback_smoke.sql`. Run it only against a disposable development project in the Supabase SQL editor. Keep the `BEGIN` and `ROLLBACK` statements intact: the test creates temporary Auth users, conversation/message records and a mock avatar object, then rolls all of them back.

`.env.example` contains the public project URL and publishable key for browser use. The publishable key is protected by RLS. Never put a Supabase secret key, legacy `service_role` key or database password in a `REACT_APP_*` variable or in source control.

## Backend model

- `profiles`: one row per Supabase Auth user, created automatically on signup.
- `conversations`: one-to-one participant pair, canonicalized and unique.
- `conversation_reads`: per-user inbox visibility and read boundary.
- `messages`: append-only text/image messages with a stable client idempotency key.
- `user_blocks`: blocker/blocked relationships; creation also hides the blocker's inbox copy.
- `reports`: client-submitted report intake; moderation changes are server-only.
- `moderation_audit`: trusted audit events.
- `account_deletion_requests`: owner-reviewed deletion workflow.
- `private.message_rate_limits` and `private.report_rate_limits`: internal abuse-control state.

All application tables have RLS enabled. Avatar and chat-image buckets are private. Message and report throttles are enforced by database triggers rather than relying on browser-side controls.

## Trusted operator setup

The moderation and deletion Edge Functions require protected `app_metadata` claims. They do not trust user-editable profile metadata.

After you create your own first account, provision the initial owner claim from the Supabase SQL editor using that account's Auth user UUID:

```sql
update auth.users
set raw_app_meta_data =
  coalesce(raw_app_meta_data, '{}'::jsonb) || '{"owner": true}'::jsonb
where id = 'YOUR_SUPABASE_AUTH_USER_UUID';
```

Only run this as a trusted project owner, replacing the placeholder with your own Auth user UUID. Never expose an owner claim editor to the client. Sign out and back in after the claim is set so the updated claim is present in the session.

The Edge Functions allow only `http://localhost:3000` and `http://127.0.0.1:3000` by default. Before using them from a hosted frontend, set the Supabase Edge Function secret `ALLOWED_ORIGINS` to the exact comma-separated origin(s) for that environment. Do not use wildcard origins.

## Tests and build

```bash
npm test -- --watchAll=false
npm run test:supabase
npm run build
```

The hosted project also passed the rollback-only RLS smoke test in `supabase/tests/rls_rollback_smoke.sql`: member-only message reads, non-member denial, block enforcement, private profile/avatar access and stale-JWT denial after account deletion.

The Supabase source check verifies that the frontend has no Firebase SDK imports, no server-only Supabase credentials, and that the migration/function source includes key security invariants. The hosted database has also been checked with Supabase security, performance and health advisors. A clean advisor result does not replace end-to-end browser tests with disposable accounts.

## Release state

PR #14 was merged into `main`. The follow-up backend repair work is tracked only in draft PR #15 on branch `fix/pr15-auth-profile-backend`. PR #15 is not merged. Its profile-update permission migration has not been applied to the hosted Supabase project. Do not treat the backend foundation as a public launch: Auth email configuration, owner claim provisioning, exact hosted-origin allowlisting, real authenticated browser tests and release monitoring are still required. Netlify may create automatic Deploy Previews for pull requests; this is separate from a production deployment.

The Supabase project is currently on the Free plan. Check current quotas, backups, project pausing behavior and upgrade requirements before inviting real users.

## Project structure

```text
src/
  components/       Chat, inbox, search, profile and navigation UI
  context/          Supabase session and selected conversation state
  pages/            Auth, profile, moderation and app screens
  services/         Supabase data-access layer
  supabase.js       Browser-only Supabase client
  utils/            Validation and profile utilities
supabase/
  migrations/       Versioned SQL schema and security migrations
  functions/        Trusted Edge Functions
scripts/
  verify-supabase-setup.mjs
```
