# Third Wheel — release readiness

This checklist is a gate, not an authorization to deploy. PR #14 has been merged into `main`; the incident follow-up is tracked in draft PR #15 and remains unmerged. The Supabase database foundation and trusted functions are applied to the new project. PR #15's profile UPDATE grant migration has been applied to hosted Supabase and recorded as remote migration version `20261118133753`. The rollback-only RLS smoke test passed; no test data was retained. Netlify may create automatic Deploy Previews for pull requests; production deployment remains a separate decision.

## 1. Current backend status

- [x] Supabase project `thirdwheel` verified healthy in Tokyo (`ap-northeast-1`).
- [x] Fresh schema and RLS policies applied; no Firebase records were imported.
- [x] Private `avatars` and `chat-images` buckets and eight Storage policies applied.
- [x] Realtime enabled for messages, conversations and read receipts.
- [x] Server-side message/report throttles and block inbox trigger applied.
- [x] Atomic moderation review/audit database function applied and restricted to `service_role`.
- [x] Six JWT-verified Edge Functions deployed; account-deletion approval and processing are version 3.
- [x] Supabase security and health advisors return no findings.
- [x] Rollback-only RLS smoke test passed for participant/non-member reads, block enforcement, private profile/avatar visibility and stale deleted-user JWT denial.
- [x] No Supabase Auth accounts or application records have been seeded.
- [ ] Owner's Supabase Auth account created and protected `owner: true` app_metadata claim provisioned.
- [ ] Exact hosted frontend origin(s) configured in the Edge Function `ALLOWED_ORIGINS` secret.

## 2. Code and CI gate

- [x] Supabase client, auth context, pages and messaging flows pass the React test suite (33 tests).
- [x] Production build passes on Node.js 22+.
- [x] Supabase source/security checks pass on the verified head; rerun for the latest documentation-only commits is pending.
- [ ] All Firebase SDK imports and emulator workflows are removed from the active app pipeline.
- [ ] Review package lock and dependency audit output.
- [ ] Review schema migrations and deployed Edge Function source hashes against the PR branch.

## 3. Auth and profile acceptance

- [ ] Signup with email confirmation enabled; confirm profile metadata is retained before a session exists.
- [ ] Signup with confirmation disabled; verify profile and avatar upload.
- [ ] Sign in, sign out, session restoration, expired session and password recovery.
- [ ] Redirect URLs and email sender/template are configured for each environment.
- [ ] Profile edit validation, username collision, image upload failure and discoverability toggle.
- [ ] Hidden profiles disappear from search but remain viewable by existing conversation partners.

## 4. Discovery, conversation and messaging

- [ ] Search by display name and @username with empty, no-result, slow-network and pagination states.
- [ ] A user cannot start a conversation with themselves, a hidden profile or a user who blocked them.
- [ ] A unique one-to-one conversation is reused instead of duplicated.
- [ ] A block hides the blocker's inbox copy and prevents new messages/media in either direction.
- [ ] Unblock permits a future conversation; existing conversation is restored when reopened.
- [ ] Text, image-only and mixed message sends succeed.
- [ ] Ambiguous send acknowledgements can be retried without duplicate messages.
- [ ] Server ordering and older-message pagination work when timestamps collide.
- [ ] Read receipts update when the recipient opens the conversation; unread counts update correctly.
- [ ] Rapid chat switching does not allow stale listeners or older pages to contaminate the active conversation.
- [ ] Deleted-account messages remain in shared history and show “Deleted account.”

## 5. Storage, moderation and deletion

- [ ] Verify private bucket participant/owner allow and deny cases in a browser.
- [ ] Verify supported MIME types and the 5 MiB upload cap.
- [ ] Submit a report, verify the five-per-hour throttle, moderator queue and atomic audit record.
- [ ] Confirm ordinary users cannot read moderation records or change status/claims.
- [ ] Set initial owner claim with a trusted operator process; sign out and back in to refresh app metadata.
- [ ] Grant/revoke moderator access as owner and verify moderator access updates after token refresh.
- [ ] Submit a deletion request, approve it as owner and process it as owner.
- [ ] Test deletion retry/partial failure, avatar cleanup, blocks/read-state cleanup, sender anonymization and retained shared message/media history.
- [ ] Review user-facing deletion notice, legal retention requirements, support contact and moderator operating process.

## 6. Hosting and launch

- [ ] Confirm final frontend host and exact allowed origin(s); set Edge Function `ALLOWED_ORIGINS` to those origins only.
- [ ] Configure `REACT_APP_SUPABASE_URL` and `REACT_APP_SUPABASE_PUBLISHABLE_KEY` in that hosting environment.
- [ ] Never expose Supabase secret/service-role keys or database passwords in frontend settings.
- [ ] Verify auth redirect URLs and email settings for the hosted domain.
- [ ] Run smoke tests with disposable accounts after the frontend deploy.
- [ ] Check database/storage/function usage and Free-plan limits; decide on upgrade and backup/restore posture before public launch.
- [ ] Define monitoring, error handling, abuse response and incident owner.
- [ ] Keep Firebase resources untouched until the owner separately authorizes retirement.

A passing GitHub workflow or clean Supabase advisor result is necessary but not sufficient for release. Do not deploy the frontend, change Netlify, retire Firebase, merge PR #14 or operate on live user accounts without explicit authorization.
