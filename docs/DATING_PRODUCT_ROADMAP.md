# Third Wheel — Chat Product Roadmap

**Product direction:** A polished, privacy-conscious one-to-one chatting app  
**Primary quality bar:** Reliability, safety, privacy, accessibility and a coherent user experience  
**Working location:** Existing PR #14 branch, `fix/netlify-ci-lint-pr13`  
**Release constraint:** Netlify remains disabled. No production deployment, Firebase production-rule deployment, merge or push to `main` is part of this roadmap.

## Product principles

1. **Conversation first.** Make it easy to find people, start conversations and keep up with them.
2. **User control.** People control who can contact them, what they share and which conversations remain visible.
3. **Safety by design.** Blocking, reporting, moderation, account controls and abuse prevention are core features.
4. **Privacy by default.** Do not expose email addresses, exact location, private activity or conversation content unnecessarily.
5. **Reliable communication.** Messages should send predictably, recover from failures and remain ordered and accessible.
6. **No manipulative engagement.** Avoid streaks, pressure timers, read-receipt coercion or artificial urgency.
7. **Quality before breadth.** Each phase must pass tests, accessibility checks, responsive review and security-rule verification.

## Current baseline and constraints

The application is a React 18 / React Router / Firebase Authentication / Cloud Firestore / Firebase Storage one-to-one chat app. Existing capabilities include profiles, people search, real-time chat, image attachments, unread counts, blocking and report submission. Messages are currently stored in an embedded array in each chat document. Firestore and Storage rules are version-controlled and emulator-tested, but production rules have not been deployed.

Known limitations:
- Reports are client-submitted and client-inaccessible after submission; there is not yet an operational trusted moderation queue.
- Messages remain embedded in chat documents; pagination and a subcollection migration remain future work.
- Firebase Storage download URLs are bearer links and must not be treated as confidential media authorization.
- Production App Check configuration/enforcement and production rules deployment require separate review and owner approval.
- Account deletion and complete data cleanup are not yet implemented.
- No trusted backend currently exists in this repository.

## Delivery phases

### Phase 0 — Chat product and data foundations

**Goal:** Establish clear contracts for profiles, conversations, privacy and data changes.

- Document the existing profile, chat, inbox and media collections.
- Define public profile fields separately from private account and inbox data.
- Define conversation membership and message authorship invariants.
- Document blocking behavior across discovery, inbox, new chat creation and message sending.
- Define report intake, moderator-only access, audit and retention requirements.
- Define account deletion and data export expectations before implementing destructive workflows.
- Preserve compatibility with existing chat documents; any schema migration needs a backup, dry run, reconciliation, rollback plan and explicit approval.

**Exit criteria:** Field-level privacy matrix, documented chat access model, rules tests and a migration plan. No existing user data is silently rewritten.

### Phase 1 — Trust, safety and account controls

**Goal:** Give users practical controls and establish a real process for abuse reports.

- Maintain block and unblock controls with clear consequences.
- Ensure blocked users cannot create new conversations or send new messages to one another.
- Keep reports private from ordinary clients and implement a trusted moderation review workflow with role-protected access, status, notes, escalation and audit history.
- Add safe report categories and bounded evidence handling.
- Implement account deletion as a trusted, retryable workflow covering Auth, profile, inbox, conversations and stored media, subject to documented safety/legal retention.
- Add server-side abuse controls for report spam, message spam and repeated account actions.
- Add privacy settings for discoverability, activity visibility and read receipts where those features exist.
- Prepare App Check in development/staging; production enforcement remains a separately approved operation.

**Exit criteria:** Emulator/integration tests cover allowed and denied paths; moderator operations are server-only and audited; deletion and recovery are tested; blocked users cannot resume contact through alternate client paths.

**Current implementation status (PR #14):** Block management, block validation, block enforcement for chat operations, expanded report categories and client-deny rules for moderation records are implemented and emulator-tested. The trusted moderation queue, account deletion, server-side throttling and App Check setup remain outstanding. See [Phase 1 implementation notes](./PHASE_1_TRUST_SAFETY.md).

### Phase 2 — Profiles and people discovery

**Goal:** Make finding people and starting a conversation intuitive.

- Improve profile editing and preview so users understand what is visible.
- Improve people search, matching query behavior, empty states, loading and error handling.
- Add useful filters based only on fields users intentionally share.
- Add pagination and bounded queries as the user base grows.
- Make block and discoverability preferences consistently affect search results.
- Improve responsive layouts, keyboard navigation, labels, focus states, contrast and reduced-motion support.

**Exit criteria:** Search works reliably across supported inputs; hidden/blocked accounts are handled consistently; profile visibility is tested; mobile and desktop accessibility checks pass.

### Phase 3 — Reliable messaging

**Goal:** Make conversations dependable, scalable and easy to manage.

- Design a backwards-compatible migration from embedded message arrays to `chats/{chatId}/messages/{messageId}`.
- Rehearse migration on a representative copy and verify counts, ordering, timestamps and attachment references before cutover.
- Add cursor-based message pagination and bounded reads.
- Improve unread boundaries and conversation list synchronization.
- Add resilient optimistic sending, retry/error states, offline behavior and duplicate-send protection.
- Consider replies, reactions, edit/delete and conversation search with clear authorization and audit semantics.
- Add mute/archive controls.
- Improve attachment authorization; replace bearer-link assumptions with authenticated media delivery before treating media as private.
- Add notification preferences and secure push delivery only after consent and platform configuration are defined.

**Exit criteria:** Migration rehearsal succeeds without message loss or duplication; rules tests cover membership and message authorship; pagination and failure recovery tests pass.

### Phase 4 — Conversation experience

**Goal:** Make the app feel thoughtful and polished without pressuring users.

- Refine chat layout, composer, attachment previews and message grouping.
- Add optional conversation organization and user-controlled notification settings.
- Improve accessibility for message announcements, keyboard use and screen readers.
- Add clear delivery, retry and offline states without exposing unnecessary activity signals.
- Review performance for long conversations and media-heavy chats.

**Exit criteria:** Core chat flows are accessible, responsive and robust under slow/offline network conditions.

### Phase 5 — Community and optional enhancements

**Goal:** Add useful features only when they support the core chat experience.

- Consider opt-in group conversations or interest-based spaces as a separate product decision.
- Consider user-controlled conversation prompts or shared-interest context.
- Keep all optional social features dismissible and privacy-aware.
- Do not add engagement mechanics that pressure users to respond.

**Exit criteria:** New features have clear user value, access rules, moderation requirements and opt-out controls.

### Phase 6 — Launch readiness and operations

**Goal:** Establish operational confidence before public release.

- Add error monitoring, structured non-sensitive logs, crash reporting and service health checks.
- Add backup/restore and incident response runbooks.
- Review Firestore and Storage costs, indexes, quotas and query patterns.
- Complete security, privacy, accessibility and abuse-case reviews.
- Validate account deletion, retention and support escalation workflows.
- Run staged rollout with internal test accounts, then a limited beta and measured expansion.
- Keep production Firebase deployment and Netlify reactivation as explicit owner-approved release actions.

**Exit criteria:** Release checklist signed off; rollback plan tested; no critical/high security or privacy issues remain; support and moderation operations are staffed and documented.

## Cross-cutting quality gates

- **Correctness:** Unit/component and integration tests for success, failure, empty and boundary states.
- **Security:** Firestore/Storage Emulator tests for authorized and unauthorized users, including blocked users and non-participants.
- **Privacy:** No accidental exposure of email, exact location, private inbox data, moderation records or message bodies.
- **Accessibility:** Keyboard operation, semantic labels, focus visibility, contrast and reduced motion.
- **Responsive UX:** Mobile, tablet and desktop layouts; loading, empty, offline and error states.
- **Performance:** Bounded queries, pagination, indexes and image optimization.
- **Data integrity:** Idempotent writes, migration checks and recovery plans.
- **Observability:** Useful error signals without logging message bodies or sensitive personal data.
- **Release discipline:** CI only while Netlify is disabled; never merge, deploy or deploy Firebase rules without explicit owner approval.

## Explicitly out of scope

- Dating profiles, likes, passes, matches or relationship-intent discovery.
- Match-only messaging or age-verification workflows for dating.
- Production Firebase rules deployment.
- Production Netlify reactivation or deployment.
- Direct pushes to `main`, PR merge or creation of another PR.
