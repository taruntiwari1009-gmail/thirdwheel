# Phase 1 — Trust, safety and account controls

## Implemented in the application branch

- Added a protected **Blocked accounts** screen at `/settings/blocked`, linked from the main navigation.
- The screen reads only the signed-in user's block list, resolves display labels from public profiles, supports unblocking, and includes loading, empty, error and success states.
- Tightened block creation so users cannot block themselves or create a block entry for an account without a public profile. Existing block deletion remains owner-only.
- Expanded report reasons to include scams, threats, stalking, sexual harassment and suspected underage accounts. Report details remain optional and capped at 500 characters.
- Added explicit client-deny rules for matches, likes, moderation cases and moderation audit records. Private preference documents are owner-readable and client writes are denied until a trusted settings/backend contract is implemented.
- Added emulator assertions for block/unblock behavior and client denial of server-authoritative dating records.

## Deliberately not represented as complete

This repository is currently a client-side React/Firebase application. It does not yet contain a trusted Cloud Functions/Admin SDK service or a moderation operator identity system. Therefore:

- **Moderation queue:** report submissions are accepted but reports are intentionally unreadable to clients. A real queue, review actions, notes, escalation and audit trail require a trusted backend and role provisioning. The current UI confirmation should not be interpreted as proof that a human moderator has reviewed a report.
- **Match-only messaging:** existing chat creation is still a legacy direct-chat flow. It cannot be safely converted to match-only until mutual matching, server-authoritative match creation and a backwards-compatible chat migration are implemented. Do not enable dating discovery against the legacy chat path.
- **Likes and abuse throttling:** client writes to likes are denied. Duplicate-like prevention, rate limits, cooldowns and suspicious-activity signals require trusted server enforcement; client-side timers are not security controls.
- **Account deletion:** no destructive client-only deletion is provided. Complete deletion must clean up Auth, profiles, usernames, block lists, likes, matches, messages, reports where policy permits, and Storage objects through a trusted, retryable workflow with an audit trail and legal retention rules.
- **Age assurance:** the product must remain adult-only, but there is no age verification provider or trusted age-eligibility workflow in this branch. A self-attested date of birth is not verification.
- **App Check:** no production enforcement is enabled. Provider configuration, staging validation and abuse monitoring must be completed before staged enforcement.
- **Privacy defaults:** legacy profile discoverability and messaging behavior have not been silently changed. Dating eligibility must fail closed until the dedicated onboarding and trusted eligibility model exist.

## Required backend work before Phase 1 can be called launch-ready

1. Add a trusted backend (Cloud Functions or equivalent) using Admin SDK with least-privilege service accounts.
2. Provision moderator roles outside client-writable Firestore documents; implement queue queries, review transitions and append-only audit events.
3. Implement abuse throttles and idempotency on trusted endpoints.
4. Implement a deletion request state machine and complete recursive cleanup, including Storage.
5. Select and integrate an age-assurance provider; document appeals and suspected-underage handling.
6. Configure App Check in development/staging, observe metrics, then seek explicit approval for production enforcement.
7. Add end-to-end emulator/integration tests for the trusted backend and deletion recovery.

## Release state

All changes are intended for PR #14 only. Firestore rules are edited in source control and tested through the Emulator workflow; they have **not** been deployed to production. No Netlify deployment, merge or production change is part of this phase.
