# Thirdwheel — implementation plan

**Status:** Proposal for review; no product code or Firebase data changed.  
**Baseline:** `main` at `e37cef223bb4f2bfd9bf87cc884c9613313da0b4`  
**Product:** React + Firebase one-to-one chat application.

## 1. Product direction

Evolve Thirdwheel from a college chat-app project into a dependable, demonstrable real-time messaging product. The work should show:

- Front-end engineering: accessible, responsive, predictable React UI.
- Application engineering: clear state boundaries, validation, failure recovery and maintainable components.
- Data engineering: deliberate Firestore schema, bounded reads, indexes and safe migrations.
- Cloud/security awareness: Firebase Authentication, Firestore and Storage rules, least-privilege access and emulator-based tests.
- Product ownership: clear scope, user-facing states, documentation, deployment and honest limitations.

**Non-goal for this iteration:** rewriting the app in a new framework or replacing Firebase merely for novelty. Retain React and Firebase unless an evidence-based technical constraint justifies a change.

## 2. Current baseline and findings

The current repository has a small Create React App structure: pages for login/register/home, chat/search/sidebar components, AuthContext and ChatContext, Firebase initialization, Sass styling, a README, Netlify configuration and a GitHub Actions build workflow.

The prior cleanup PR (#2) is merged. It introduced auth-loading protection, listener cleanup, guarded chat selection, batched message/preview writes, improved login/register/search error handling, documentation and a production-build CI workflow. The current `main` build workflow has a successful run.

### Findings from the current source

| Area | Observed state | Consequence / proposed response |
|---|---|---|
| Message persistence | All messages are stored in a `messages` array on one `chats/{chatId}` document using `arrayUnion`. | Unbounded document growth, no natural pagination and increasingly expensive conversation reads. Design a subcollection migration as a separate, gated change. |
| Message rendering | Each message displays “just now”; message components scroll themselves into view. | Misleading timestamps and potentially excessive/unwanted scrolling. Render actual timestamps and scroll only when appropriate. |
| Chat header | Camera, add and more icons are rendered as images without actions. | Controls imply functionality that does not exist. Implement meaningful actions or remove them. |
| Chat list | Rows use clickable `div` elements and have no keyboard interaction or explicit selected state. | Accessibility and navigation gaps. Use semantic buttons and visible focus/selection states. |
| Message input | File input accepts images but does not enforce size/type constraints in code, preview selected media or expose upload progress. | Poor feedback and avoidable upload failures. Validate client-side and enforce authoritative constraints in Storage Rules. |
| Registration | Auth account creation, avatar upload, profile update and Firestore writes happen sequentially. | Partial failure can leave an Auth account or uploaded object without a complete profile. Add recoverable states and a deliberate cleanup/retry strategy. |
| User search | Exact display-name lookup; no loading state for search and no clear empty/ambiguous-result experience. | Limited discoverability and weak feedback. Improve state handling without exposing private user data. |
| Firebase policy | No Firestore Rules, Storage Rules or indexes file is present in the repository tree. | Authorization and storage constraints cannot be reviewed or tested from source control. Add versioned rules and emulator tests before treating the app as production-ready. |
| Automated tests | The current workflow runs a production build; no application test suite is present in the repository tree. | Regressions in auth, chat selection and message flows can pass CI. Add unit/component tests and emulator-backed policy tests. |
| Dependencies/tooling | React 18, Firebase 9 and Create React App 5; Node is pinned to 22. CI uses `npm install`. | Keep the current stack stable initially; use reproducible `npm ci`. Evaluate dependency upgrades separately with compatibility checks. |

### Important security clarification

The Firebase web configuration in `src/firebase.js` is client configuration, not a service-account credential. It must not be treated as an authorization boundary. Restrict the API key where appropriate, but the essential protection is restrictive Firestore and Storage Security Rules. The live Firebase Console configuration has not been inspected, so current production permissions are unknown.

## 3. Proposed delivery sequence

Each phase should be a small pull request against `main`, with a clear scope, tests, screenshots or verification notes where relevant. Do not merge a phase until its acceptance criteria are met.

### Phase 0 — Baseline and product contract

**Scope**
- Confirm the app can be installed and built from a clean checkout using the pinned Node version.
- Record current user journeys: register, sign in, search for a user, open/create a one-to-one chat, send text, send image, sign out.
- Confirm whether the Firebase project contains real user/chat data and whether the current deployment is actively used.
- Capture current behaviour and known limitations before schema changes.

**Acceptance**
- Clean install and production build pass.
- A concise manual test checklist is committed.
- No production data, Firebase settings or existing deployment is changed.

### Phase 1 — Test foundation and CI quality gate

**Scope**
- Add tests for AuthContext loading/authenticated/unauthenticated states.
- Add tests for protected routes and login/register form states.
- Add tests for chat ID derivation, empty selection handling, message validation and chat-list rendering.
- Add Firebase Emulator Suite tests for Firestore and Storage rules once rules are introduced.
- Change CI installation to `npm ci`; run tests in CI and retain the production build.
- Keep tests deterministic; mock Firebase for component tests and use emulators for policy/integration tests.

**Acceptance**
- Tests run in CI on pull requests.
- CI fails on test or build failure.
- No live Firebase project is required to run automated tests.

### Phase 2 — Security and data access boundaries

**Scope**
- Add version-controlled `firestore.rules`, `storage.rules` and required Firestore indexes.
- Define and test ownership rules: users can update only their own profile fields; only chat participants can read/write their conversation; message authorship is tied to authenticated UID; only permitted users can access their own avatar and chat media.
- Validate allowed fields, data types, participant membership, message size and upload content/size constraints.
- Review user search/profile discovery so it returns only fields intended to be public.
- Add emulator tests for both allowed and denied cases.

**Acceptance**
- Rules are reviewed and tests cover cross-user access denial.
- A non-participant cannot read or write another conversation.
- Storage rejects disallowed file types and oversized uploads.
- No permissive catch-all rule is used.
- Deployment of rules is a separate, explicitly approved action; tests do not deploy to production.

### Phase 3 — Messaging reliability and UX

**Scope**
- Replace misleading “just now” labels with formatted timestamps and accessible time metadata.
- Improve scroll behaviour: scroll on initial conversation load and when the user is already near the bottom; do not forcibly pull users away from older messages.
- Add image preview, file-size/type validation, upload progress, cancel/reset behaviour where supported, and clear retryable errors.
- Add disabled/loading states to prevent duplicate sends.
- Improve empty conversation, no selection, loading, offline/error and empty-search states.
- Replace inert header icons with working, scoped actions or remove them until implemented.
- Make chat list/search/message controls keyboard accessible and responsive.

**Acceptance**
- Text and image send flows provide clear success/failure feedback.
- No inert control is presented as an active button.
- Keyboard-only navigation works through core flows.
- Mobile layout is usable at narrow viewport widths.

### Phase 4 — Firestore message model and pagination (gated migration)

**Current constraint**
Messages are currently embedded in an array on `chats/{chatId}`. Moving to `chats/{chatId}/messages/{messageId}` is the recommended target because it supports bounded queries, pagination and independent message documents.

**Scope**
- Design the new message schema, ordering, indexes, read strategy and rules.
- Determine whether existing chats contain data that must be retained.
- If data exists, write and test a one-time Admin SDK migration/backfill with idempotency, verification counts and rollback/backup instructions. Never run an Admin SDK migration from the browser.
- Consider a temporary compatibility reader or a planned maintenance cutover; do not silently switch the client while legacy messages remain unreadable.
- Implement paginated real-time message loading, with newest messages loaded first and older messages fetched on demand.

**Acceptance**
- Migration is rehearsed against an emulator or export/restore copy.
- Message counts and representative records are verified before/after.
- Existing history remains accessible.
- Queries are bounded and pagination is tested.
- Production cutover requires explicit approval and a backup/rollback plan.

### Phase 5 — Account lifecycle and product completeness

**Scope**
- Improve registration recovery for failures after Auth account creation.
- Add password reset and email verification if these are desired product requirements and Firebase provider settings support them.
- Add profile editing with strict field-level authorization.
- Add message deletion/editing only after defining expected behaviour for both participants and audit/history implications.
- Add conversation search or user discovery improvements only after privacy rules and data model are settled.

**Acceptance**
- Account lifecycle states are explicit and recoverable.
- Profile updates cannot alter protected fields or another user's profile.
- Any new feature has tests, rules and user-facing error states.

### Phase 6 — Portfolio and release readiness

**Scope**
- Refresh README with architecture, setup, environment configuration, Firebase emulator instructions, data model, security model, screenshots and known limitations.
- Add an architecture/data-flow diagram and a short engineering decision record for the message schema.
- Provide a safe demo path: seeded demo accounts/data or a controlled walkthrough; do not expose real user conversations.
- Verify deployment configuration, responsive behaviour and accessibility.
- Add a short case study describing the problem, design choices, trade-offs, tests and what was learned.

**Acceptance**
- A reviewer can run the app locally without private credentials.
- The README distinguishes implemented features from planned features.
- Screenshots/demo data contain no personal information.
- Build, automated tests and rules tests pass.

## 4. Priority order

1. **Must do first:** baseline, test foundation, Firebase rules review and emulator coverage.
2. **High value:** message UX, accessibility, registration recovery and upload validation.
3. **Major engineering milestone:** safe message subcollection migration and pagination.
4. **Product/portfolio polish:** password reset/email verification (if selected), architecture documentation, demo and case study.

## 5. Risks and decisions to resolve before implementation

- **Existing Firebase data:** Is the configured project used by anyone, and must existing accounts/conversations be preserved? This determines whether migration/backfill is mandatory.
- **Firebase access:** Can the owner review and deploy Firestore/Storage Rules in the Firebase Console? Repository changes alone cannot secure the live project.
- **Product scope:** Is Thirdwheel intended as a private demo/portfolio app or a public service for real users? Public launch would require a stronger privacy, abuse-prevention, monitoring and operational plan.
- **Identity/discovery:** Exact display-name search can be ambiguous. Decide whether usernames should be unique and searchable, or whether discovery should use invite links.
- **Message semantics:** Decide whether edits/deletes, read receipts, typing indicators and online status are truly needed. Avoid feature bloat before reliability and security.

## 6. Pull-request discipline

- Keep `main` stable; work on short-lived branches.
- One coherent phase per PR; do not bundle a framework migration with product features.
- Include a summary, risk notes, test evidence and manual verification steps in every PR.
- Do not merge, deploy Firebase rules, alter production configuration or migrate live data without explicit approval.
- Prefer reversible, observable changes and preserve existing user data.

## 7. Proposed first implementation PR

After this plan is approved, start with **Phase 1: test foundation and CI quality gate**, plus the Phase 0 manual journey checklist. This creates a safety net before touching security policy or the Firestore message schema.
