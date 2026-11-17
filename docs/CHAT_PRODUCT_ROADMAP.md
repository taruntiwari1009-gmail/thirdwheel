# Third Wheel — Chat Product Roadmap

**Direction:** A polished, privacy-conscious one-to-one chatting app.  
**Quality bar:** Reliability, safety, privacy, accessibility and a coherent user experience.  
**Working branch:** `fix/netlify-ci-lint-pr13`. Netlify remains disabled; no production deployment or merge is authorized.

## Product principles

1. Conversation first: make it easy to find people, start conversations and keep up with them.
2. User control: people control who can contact them and which conversations remain visible.
3. Safety by design: blocking, reporting, moderation, account controls and abuse prevention are core features.
4. Privacy by default: do not expose email, exact location, private activity or conversation content unnecessarily.
5. Reliable communication: messages should send predictably, recover from failures and remain ordered.
6. No manipulative engagement: no streaks, pressure timers or artificial urgency.
7. Quality before breadth: tests, accessibility, responsive review and security verification gate each phase.

## Baseline

React 18, React Router, Firebase Authentication, Firestore and Storage. Existing capabilities include profiles, people search, real-time one-to-one chat, image attachments, unread counts, blocking and report submission. Messages currently live in an embedded array in each chat document.

Known gaps: no operational moderation queue yet; no complete account deletion workflow; messages need a future backwards-compatible subcollection migration; Storage download URLs are bearer links; production App Check and Firebase rule deployment require separate owner review.

## Phases

### Phase 0 — Data and privacy foundations
- Document profile, inbox, conversation and media collections.
- Separate public profile fields from private account/inbox data.
- Define participant, authorship and block invariants.
- Document report access, moderation audit and retention.
- Define account deletion/export expectations before destructive workflows.
- Preserve current chat data; migrations require backup, dry run, reconciliation, rollback and approval.

### Phase 1 — Trust, safety and account controls
- Maintain block/unblock controls and enforce blocks in both directions.
- Route reports through trusted server functions; keep reports private from ordinary clients.
- Provide moderator-only queue, status changes, notes, escalation and audit history.
- Add abuse throttles and idempotency to sensitive actions.
- Implement account deletion as a trusted, retryable workflow that preserves the other participant's data and follows approved retention rules.
- Prepare App Check in staging; production enforcement is a separate approved action.

**Status:** Block management and Firestore block enforcement are implemented. Trusted report intake, moderation queue/review, role checks and deletion-request intake have been added to the branch. Deletion execution, message-spam throttling, App Check provider configuration and operational staffing remain outstanding. See [Phase 1 notes](./PHASE_1_TRUST_SAFETY.md).

### Phase 2 — Profiles and people discovery
- Improve profile editing/preview, people search, query behavior and empty/loading/error states.
- Add filters only for fields users intentionally share.
- Add pagination and bounded queries.
- Apply block and discoverability preferences consistently.
- Improve responsive layouts and accessibility.

### Phase 3 — Reliable messaging
- Rehearse migration from embedded arrays to `chats/{chatId}/messages/{messageId}`.
- Verify counts, ordering, timestamps and attachment references before cutover.
- Add cursor pagination, unread boundaries, retry/offline handling and duplicate-send protection.
- Consider replies, reactions, edit/delete, search, mute and archive with clear rules.
- Replace bearer-link assumptions before treating media as private.
- Add push notifications only with consent and platform configuration.

### Phase 4 — Conversation experience
- Refine chat layout, composer, attachment previews and message grouping.
- Improve keyboard, screen-reader and reduced-motion support.
- Add user-controlled notification settings and clear delivery/offline states.
- Review long-chat and media-heavy performance.

### Phase 5 — Optional community enhancements
- Consider group conversations or interest spaces as separate product decisions.
- Keep optional features dismissible, privacy-aware and non-manipulative.

### Phase 6 — Launch readiness
- Add error monitoring and non-sensitive logs.
- Add backup/restore and incident runbooks.
- Review costs, indexes, quotas and query patterns.
- Complete security, privacy, accessibility and abuse-case reviews.
- Validate deletion, retention and support escalation.
- Use staged rollout and a tested rollback plan.

## Explicitly out of scope
Dating profiles, likes, passes, matches, relationship-intent discovery and dating age-verification workflows. Production Firebase deployment, Netlify reactivation, direct `main` pushes and PR merge remain explicit owner-approved actions.
