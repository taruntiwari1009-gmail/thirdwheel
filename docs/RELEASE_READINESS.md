# Third Wheel — release readiness and operations

This checklist is a gate, not an authorization to deploy. PR #14 remains open, draft and unmerged. No production Firebase, Netlify, or live-data operation is included.

## 1. Code and CI gate

- [ ] Confirm the reviewed PR head SHA and that all required GitHub Actions jobs pass for that exact SHA.
- [ ] Application unit tests and production build pass.
- [ ] Firestore and Storage Emulator allow/deny tests pass.
- [ ] Trusted Functions unit and emulator integration tests pass.
- [ ] Review dependency audit output and resolve high/critical findings or document accepted exceptions.
- [ ] Review Firestore indexes against every query used by discovery, inbox and moderation.
- [ ] Confirm no credentials, private user data, test tokens or environment-specific secrets are committed.

## 2. Product acceptance matrix

Test at desktop (1440px and 1280px), tablet (768px), and mobile (390px and 320px) widths.

### Authentication and profile
- [ ] Register, sign in, sign out, password reset, expired session and account error states.
- [ ] Profile edit validation, avatar upload failure, username collision and visibility toggle.
- [ ] Keyboard-only operation, visible focus, screen-reader labels, contrast and reduced-motion behavior.

### Discovery and blocking
- [ ] Search by display name and username, including empty, no-result, slow-network and pagination states.
- [ ] Hidden profiles are not visible to other users.
- [ ] Either-direction block excludes the account from discovery and prevents chat creation/message writes.
- [ ] Unblock removes both privacy-index records atomically.
- [ ] Verify behavior if either reciprocal index is missing or a transaction fails.

### Messaging and attachments
- [ ] Send text, image-only and mixed messages; verify ordering when timestamps collide.
- [ ] Retry after an ambiguous acknowledgement and confirm no duplicate message is created.
- [ ] Read receipts update when the recipient opens the conversation.
- [ ] Verify unread counts when a conversation is open, backgrounded, reopened and switched quickly.
- [ ] Load multiple older pages while new messages arrive; confirm scroll position is preserved.
- [ ] Verify offline/reconnect behavior and explicitly test that a pending message is not silently lost.
- [ ] Verify image progress, failed upload, failed message commit and orphan cleanup.
- [ ] Verify authenticated media reads, CORS and non-participant denial in a browser.

### Trust and safety
- [ ] Report submission, rate limiting, moderation queue filters, status changes and audit trail.
- [ ] Verify moderators cannot grant themselves roles and only an owner claim can grant/revoke moderator access.
- [ ] Test account deletion approval, repeated batches, partial failures, retry, already-deleted Auth user, username cleanup and retained counterpart history.
- [ ] Review retention, legal exceptions, support contact and user-facing deletion disclosures before enabling the workflow operationally.

## 3. Staging-only Firebase preparation

Requires explicit owner approval and a dedicated non-production Firebase project.

- [ ] Confirm project ID, billing, region, bucket and authorized origins.
- [ ] Deploy rules, indexes and Functions to staging only.
- [ ] Apply the exact-origin CORS configuration described in [CHAT_MEDIA_CORS.md](./CHAT_MEDIA_CORS.md).
- [ ] Verify Storage SDK reads with valid participant auth, non-participant auth and no auth.
- [ ] Configure App Check site key in staging; verify valid, missing and invalid token behavior.
- [ ] Enable callable enforcement only after staging verification and a documented rollback.
- [ ] Verify Functions secrets/configuration and owner custom-claim bootstrap using the documented operator process.
- [ ] Confirm logs exclude message bodies, report evidence and other unnecessary personal data.

## 4. Moderation operations

- [ ] Assign at least two trained moderators and one escalation owner before accepting live reports.
- [ ] Define review coverage, response targets, emergency escalation and handoff.
- [ ] Treat reports as allegations; record evidence reviewed and the rationale for each action.
- [ ] Restrict evidence access to authorized moderators; do not copy sensitive evidence into chat, email or public issue trackers.
- [ ] Define retention and deletion for report details and audit events.
- [ ] Define appeals, mistaken reports, moderator conflict-of-interest and moderator offboarding.
- [ ] Review abuse throttles and define a process for false positives and urgent exceptions.

## 5. Backup, migration and rollback

- [ ] Confirm current production schema before any migration; do not assume old embedded arrays or legacy inbox records are disposable.
- [ ] Produce and verify a restorable backup in a non-production environment.
- [ ] Write a migration inventory, dry-run report, idempotency strategy and reconciliation checks.
- [ ] Do not run the disposable chat reset script against any real-user project.
- [ ] Document rollback for rules, Functions, indexes, App Check and client release.
- [ ] Define an incident owner, escalation channel and stop/rollback criteria.
- [ ] Validate rollback by rehearsal in staging before release approval.

## 6. Launch decision

A release is not ready until all required product, security, accessibility, privacy, moderation and operational gates have an owner and evidence. A passing GitHub Actions run is necessary but not sufficient.

Production deployment, Netlify changes, production data migration/reset, and PR merge require separate explicit approval. This document does not grant that approval.
