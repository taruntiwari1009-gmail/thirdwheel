# Third Wheel — Chat Product Roadmap

**Direction:** A polished, privacy-conscious one-to-one chatting app.  
**Quality bar:** Reliability, safety, privacy, accessibility and a coherent user experience.  
**Working branch:** `fix/netlify-ci-lint-pr13`. PR #14 remains open and draft. Netlify, production deployment and merging are not authorized.

## Product principles

1. Conversation first: make it easy to find people, start conversations and keep up with them.
2. User control: people control who can contact them and which conversations remain visible.
3. Safety by design: blocking, reporting, moderation, account controls and abuse prevention are core features.
4. Privacy by default: do not expose email, exact location, private activity or conversation content unnecessarily.
5. Reliable communication: messages should send predictably, recover from failures and remain ordered.
6. No manipulative engagement: no streaks, pressure timers or artificial urgency.
7. Quality before breadth: tests, accessibility, responsive review and security verification gate each phase.

## Current verified baseline

React 18, React Router, Firebase Authentication, Firestore and Storage. The client supports profiles, paginated people search, real-time one-to-one chat, image attachments, unread counts, block management and report submission. Messages are individual documents under `chats/{chatId}/messages/{messageId}`; the UI listens to the latest 50 and can retrieve older pages using a timestamp/document-ID cursor.

The PR head has passing CI at the time of this roadmap update. This is emulator/CI evidence only, not production validation.

## Workstreams

### 1. Product foundation and visual experience
- Complete screen-by-screen review of login, registration, chat list, active conversation, discovery, profile, edit profile, blocked users, moderator dashboard, empty/error/loading states and navigation.
- Bring ordinary application screens to the visual quality of the account-creation screen while retaining the lavender/pink identity.
- Verify desktop, tablet and narrow mobile layouts; remove inert controls and inconsistent components.

**Status:** Shared styling and several screens have been improved. A complete visual audit and responsive acceptance pass remain.

### 2. Discovery
- Name/username search, cursor pagination and bounded result sets are implemented.
- Search reads both `blockedUsers` and `blockedBy` indexes and filters either direction.
- Block/unblock operations maintain reciprocal index documents transactionally; Firestore rules enforce the relationship for protected actions.

**Remaining:** Verify profile visibility changes, blocked-user edge cases, pagination under concurrent profile changes, and screen-reader/keyboard behavior.

### 3. Messaging
- Implemented: separate message documents, latest-50 real-time listener, older-history cursor pagination, stable timestamp/document-ID ordering, deduplication, and scroll-position preservation.
- Implemented: inbox unread count reset on opening a conversation and live read receipts for the latest outgoing message using the recipient's inbox `lastReadAt` boundary.
- Implemented: stable message IDs retained across in-session retries; image upload progress; message documents store Storage object paths rather than bearer download URLs; attachment display uses authenticated Storage SDK reads and temporary object URLs.
- Implemented: Firestore message validation binds attachment paths to the chat and authenticated sender.

**Remaining:** Durable offline outbox/recovery across reloads; cancel/retry/cleanup of partially uploaded attachments; browser CORS configuration and authenticated-media end-to-end verification in staging; and end-to-end verification of message ordering and unread boundaries.

### 4. Profiles and settings
- Profile editing, discovery visibility, block management and profile presentation exist.

**Remaining:** Audit all settings and privacy paths, account security flows, notification preferences if supported, validation/error states, data export expectations and account lifecycle UX.

### 5. Trust and safety
- Implemented in trusted Functions: report intake, validation, daily throttling, moderation case creation, moderator case listing/review, audit records and owner-controlled moderator claims.
- Implemented: block enforcement in chat creation/message writes and a reciprocal discovery index.
- Implemented in backend code and emulator integration tests: owner-approved, resumable account deletion. It removes the account's own inbox entries, public profile, username reservation, own block list, message throttle, avatar files and Auth account; it retains shared chat history/media and labels the deleted participant.

**Remaining:** Review deletion edge cases and partial failures; specify retention/legal exceptions and support process; inspect moderator dashboard end-to-end; establish moderator staffing/runbooks; validate rate limits and abuse scenarios. Deletion has not been run against a live account.

### 6. Security and infrastructure
- Firestore and Storage rules, indexes, Functions and emulator tests are version-controlled.
- Rules/Functions are not deployed to the live Firebase project.
- App Check initialization is optional; callable enforcement is controlled by `ENFORCE_APPCHECK`.

**Remaining:** Staging bucket CORS configuration and authenticated-media browser verification (see [media CORS setup](./CHAT_MEDIA_CORS.md)), App Check staging configuration/verification, review of every callable and Storage path, secrets/configuration review, index/query review, and deployment documentation. Production enforcement is a separately approved owner action.

### 7. Quality
- CI currently runs application tests/build, trusted Functions unit/integration tests, and Firebase Emulator security tests.
- CI evidence does not replace manual visual review, real-device accessibility review or a production-like staging assessment.

**Remaining:** Full accessibility audit (keyboard, focus, contrast, screen reader, reduced motion), responsive viewport matrix, security threat review, offline/online recovery tests, attachment edge cases and expanded integration coverage.

### 8. Release readiness
- Prepare data-model/reset and migration implications, staging runbooks, backup/restore and incident response, privacy/retention decisions, monitoring, cost/index review, release checklist and rollback plan.
- Any staging or production operation must be explicitly scoped and approved. No production testing, Firebase deployment, Netlify access or merge is included in this completion effort.

## Priority execution order

1. Complete visual redesign and audit all primary screens.
2. Close core messaging reliability gaps, then secure media delivery.
3. Complete settings/privacy/account lifecycle review and deletion edge-case tests.
4. Harden moderation operations and App Check readiness.
5. Run accessibility, responsive and security reviews.
6. Produce release and rollback documentation.

## Release acceptance

The full product acceptance matrix, staging-only Firebase gates, moderation operations, backup/rollback rehearsal and launch decision checklist are maintained in [RELEASE_READINESS.md](./RELEASE_READINESS.md). These are not production authorization.

## Explicitly out of scope

Dating profiles, likes, passes, matches, relationship-intent discovery, dating verification, Netlify, production deployment, live data reset/migration, direct `main` pushes and PR merge.
