# Third Wheel — Dating Product Roadmap

**Product direction:** Dating and relationship discovery  
**Primary quality bar:** Safety, reliability, privacy, accessibility and a coherent user experience  
**Working location:** Existing PR #14 branch, `fix/netlify-ci-lint-pr13`  
**Release constraint:** Netlify remains disabled. No production deployment, Firebase production-rule deployment, merge or push to `main` is part of this roadmap.

## Product principles

1. **Intentional dating, not swipe mechanics for their own sake.** Help people find compatible connections and start thoughtful conversations.
2. **Mutual consent before contact.** A match is created only after both people express interest. Non-matches cannot bypass this through chat creation.
3. **Safety is foundational.** Blocking, reporting, moderation, age controls, privacy settings and abuse prevention are core product requirements, not post-launch extras.
4. **Explain recommendations.** Show the profile details and shared interests that informed a recommendation. Do not present an opaque or scientifically unsupported compatibility percentage.
5. **User control and dignity.** Preferences are optional where possible, editable, and never inferred from private messages. Avoid engagement mechanics that pressure users to respond.
6. **Privacy by default.** Do not expose exact location, contact details, private activity or sensitive profile data in discovery.
7. **Quality before breadth.** Each phase must pass tests, accessibility checks, responsive review and security-rule verification before the next phase is considered complete.

## Current baseline and constraints

The current application is a React 18 / React Router / Firebase Authentication / Cloud Firestore / Firebase Storage one-to-one chat product. Existing capabilities include profiles, people search, chat, image attachments, unread counts, blocking and report submission. The current chat model stores messages in an embedded array. Firestore and Storage rules are version-controlled and emulator-tested, but production rules have not been deployed.

The following are known gaps, not assumed completed features:
- There is no mutual-like/match lifecycle or dating recommendation system yet.
- Reports are write-only from the client; a trusted moderation review workflow is not yet present.
- Messages remain embedded in chat documents; pagination and a subcollection migration remain future work.
- Firebase Storage download URLs are bearer links and should not be treated as confidential media authorization.
- Production App Check configuration/enforcement and production rules deployment require separate review and owner approval.

## Delivery phases

### Phase 0 — Product and data foundations

**Goal:** Establish explicit dating semantics and safe data contracts before building discovery.

- Define profile fields: dating intent, relationship goals, age/date-of-birth handling, city-level location, interests, languages, prompts and optional preferences.
- Separate public discovery fields from private account and preference data.
- Define who can see each field and whether it is optional, hidden, or shown only after a match.
- Define eligibility and age policy: the product is for adults 18+; do not expose a profile in discovery until age eligibility has been established. Select an age-assurance approach before launch; do not claim identity verification unless a real verification provider is integrated.
- Define match lifecycle states and invariants: pending interest, mutual match, unmatched, blocked, reported, suspended and deleted.
- Document retention, deletion, export and moderation access requirements.
- Add schema versioning and migration strategy before changing existing user/profile/chat documents.

**Exit criteria:** Approved field-level privacy matrix, documented state machine, security-rule design, migration plan and test cases. No new dating UI should rely on undocumented fields.

### Phase 1 — Trust, safety and account controls

**Goal:** Make dating interactions safe before scaling discovery.

- Build a block-management screen with unblock controls and clear consequences.
- Build a trusted moderation queue for reports with role-protected access, audit trail, review status, notes and escalation actions. Client users must never read or modify moderation records.
- Add report categories and evidence handling with strict access controls and retention limits.
- Add account deletion and a documented cleanup process for profile, likes, matches, messages and stored media, with clear user confirmation.
- Add message-request / match-only messaging enforcement in both UI and Firestore rules.
- Add abuse controls: rate limits, duplicate-like prevention, spam throttling, account cooldowns and suspicious-activity signals.
- Prepare Firebase App Check with development/staging validation and staged production enforcement.
- Add safe defaults for discoverability, online/activity visibility, read receipts and profile field visibility.
- Add an adult-only eligibility gate and a documented process for handling suspected underage accounts.

**Exit criteria:** Emulator tests cover allowed and denied paths for every new collection and transition; moderation access is server/admin-only; account deletion and block behavior are tested end-to-end.

### Phase 2 — Dating profiles and onboarding

**Goal:** Give people enough meaningful context to make informed choices.

- Introduce dating-focused onboarding with clear explanation of what is public, private and optional.
- Add profile prompts (for example: ideal weekend, a topic I can talk about for hours, and what I value in a relationship).
- Add relationship intent and connection goals using a controlled, documented vocabulary.
- Add optional preferences and dealbreakers with transparent visibility controls.
- Add profile completeness guidance without making users disclose sensitive information.
- Add profile preview so users can see exactly what others will see.
- Improve image upload UX, compression, validation and deletion behavior.
- Add accessibility labels, keyboard navigation, focus states, reduced-motion support and responsive layouts.

**Exit criteria:** Onboarding can be completed, resumed and edited; public/private fields are tested; profile preview matches discovery rendering; accessibility and mobile checks pass.

### Phase 3 — Discovery and mutual matching

**Goal:** Create a fair, explainable and privacy-aware discovery loop.

- Replace generic people search as the primary experience with a curated discovery feed.
- Add filters for mutually relevant, non-sensitive attributes such as city/region, interests, languages and relationship intent where users choose to share them.
- Use a transparent recommendation baseline: eligibility, user-selected preferences, shared interests, recency/fair exposure and diversity. Document ranking inputs and avoid sensitive-trait inference.
- Explain each recommendation with grounded reasons such as shared interests or compatible stated goals.
- Add like / pass actions with undo where safe and clear controls.
- Create a match only when interest is mutual; prevent duplicate or conflicting match records transactionally.
- Add a matches inbox and clear unmatched/blocked behavior.
- Add discovery pause, hide profile and preference reset controls.
- Add pagination, query indexes, caching and deterministic test fixtures.

**Exit criteria:** Mutual-match invariants are enforced server-side; blocked/suspended/ineligible accounts never appear; users can pause discovery; ranking is testable and explainable; no fabricated compatibility score is displayed.

### Phase 4 — Reliable messaging for matches

**Goal:** Make conversations dependable and scalable.

- Migrate embedded message arrays to a `chats/{chatId}/messages/{messageId}` subcollection through a backwards-compatible, rehearsed migration.
- Preserve old conversations during migration and verify message counts, ordering, timestamps and attachment references before cutover.
- Add cursor-based pagination and unread boundaries.
- Add reply-to-message and reactions, then edit/delete with clear rules and audit semantics.
- Add typing indicators and read receipts as opt-in privacy settings.
- Add conversation search, mute/archive and media gallery.
- Improve attachment authorization; replace bearer-link assumptions with an authenticated delivery design before treating media as private.
- Add resilient optimistic sending, retry/error states, offline behavior and duplicate-send protection.
- Add notification preferences and secure push delivery only after consent and platform configuration are defined.

**Exit criteria:** Migration rehearsal on a representative copy succeeds; no message loss/duplication; rules tests cover reads/writes and membership changes; pagination and failure recovery tests pass.

### Phase 5 — Conversation quality and community features

**Goal:** Help matches start and sustain meaningful conversations.

- Add optional icebreakers grounded in shared interests and profile prompts.
- Add user-controlled conversation prompts and question cards.
- Add date-planning suggestions only as optional, non-location-invasive prompts.
- Consider interest-based events or group activities as a later product extension, separate from the core dating loop.
- Do not add streaks, pressure timers or manipulative response nudges.

**Exit criteria:** Features are optional, dismissible, accessible and do not expose private profile data or message content to recommendation systems without explicit consent.

### Phase 6 — Launch readiness and operations

**Goal:** Establish operational confidence before public release.

- Add error monitoring, structured non-sensitive logs, crash reporting and service health checks.
- Add backup/restore and incident response runbooks.
- Review Firestore and Storage costs, indexes, quotas and query patterns.
- Complete security review, privacy review, accessibility review and abuse-case testing.
- Validate account deletion, data retention and support escalation workflows.
- Run staged rollout with internal test accounts, then a limited beta and measured expansion.
- Keep production Firebase deployment and Netlify reactivation as explicit owner-approved release actions.

**Exit criteria:** Release checklist signed off; rollback plan tested; no critical/high security or privacy issues remain; support and moderation operations are staffed and documented.

## Cross-cutting quality gates

Every implementation batch must satisfy all applicable gates:

- **Correctness:** Unit/component tests and integration tests for success, failure, empty and boundary states.
- **Security:** Firestore/Storage Emulator tests for authorized and unauthorized users, including blocked, unmatched, suspended and deleted states.
- **Privacy:** Field-level read/write matrix; no accidental exposure of email, exact location, private preferences, moderation data or activity.
- **Accessibility:** Keyboard operation, semantic labels, focus visibility, contrast and reduced motion.
- **Responsive UX:** Mobile, tablet and desktop layouts; loading, empty, offline and error states.
- **Performance:** Bounded queries, pagination, indexes, image optimization and no unbounded message/profile reads.
- **Data integrity:** Idempotent writes, transactions for match creation, migration checks and recovery plan.
- **Observability:** Useful error signals without logging message bodies or sensitive personal data.
- **Release discipline:** CI only while Netlify is disabled; never merge, deploy or deploy Firebase rules without explicit owner approval.

## Recommended implementation order

1. Phase 0 foundations and Phase 1 safety design.
2. Complete Phase 1 trust/safety and account controls.
3. Phase 2 dating profiles and onboarding.
4. Phase 3 mutual discovery and matching.
5. Phase 4 message migration and match-only messaging.
6. Phase 5 conversation quality.
7. Phase 6 launch readiness.

This ordering deliberately puts safety and data contracts ahead of growth features. It also avoids building a matching UI on top of an authorization model that still permits arbitrary chat creation.

## Decisions to resolve before coding the dating system

- Age assurance: self-attestation alone or a vetted third-party age-assurance provider.
- Geographic scope: city-only discovery initially, with no exact-distance display.
- Relationship-intent taxonomy and which fields are optional/public.
- Whether likes are private until a mutual match (recommended).
- Whether messaging is strictly match-only (recommended).
- Which moderation roles and review actions are supported.
- Which data is retained after unmatch, block or account deletion, subject to applicable legal requirements.
- Whether push notifications are in scope for the first beta.

## Explicitly out of scope until separately approved

- Production Firebase rules deployment.
- Production Netlify reactivation or deployment.
- Direct pushes to `main`, PR merge or creation of another PR.
- Third-party identity/age verification integration before provider and privacy review.
- AI-based face analysis, attractiveness scoring, inferred sensitive traits or opaque compatibility scores.
- Location tracking or displaying exact user locations.
