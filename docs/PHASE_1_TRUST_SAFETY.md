# Phase 1 — Trust, safety and account controls

## Implemented in PR #14

- Added a protected **Blocked accounts** screen at `/settings/blocked`, linked from the main navigation.
- The screen reads only the signed-in user's block list, resolves display labels from public profiles, supports unblocking, and includes loading, empty, error and success states.
- Tightened block creation so users cannot block themselves or create a block entry for an account without a public profile. Block deletion remains owner-only.
- Firestore rules prevent blocked participants from creating a new conversation or appending new messages to an existing conversation.
- Expanded report reasons to include scams, threats, stalking, sexual harassment and suspected underage accounts. Report details remain optional and capped at 500 characters.
- Reports are client-create-only. Ordinary clients cannot read, update or delete report records.
- Added explicit client-deny rules for moderation cases and moderation audit records.
- Added emulator assertions for block/unblock behavior, blocked messaging denial, report submission and client denial of moderation records.

## Remaining Phase 1 work

The repository currently contains a client-side React/Firebase application and does not yet include a trusted Cloud Functions/Admin SDK service or moderator identity provisioning. The following are not complete:

- **Moderation operations:** Build a trusted review queue with role-protected access, case status transitions, moderator notes, escalation and append-only audit events. Do not expose report records to ordinary clients.
- **Account deletion:** Implement a deletion request state machine and trusted, retryable cleanup across Firebase Auth, public profile, usernames, inbox entries, conversations and Storage. Define retention exceptions before implementation.
- **Abuse throttling:** Add server-side rate limits and idempotency for report submission and high-risk actions. Client timers are not security controls.
- **App Check:** Configure a provider in development/staging, validate traffic and observe metrics. Production enforcement requires a separate owner-approved rollout.
- **Operational process:** Define who reviews reports, response expectations, escalation and retention. A successful client submission is not evidence that a moderator has reviewed it.

## Chat-specific behavior

- This product remains a one-to-one chatting app. There is no dating match system or match-only messaging requirement.
- Existing chat creation remains participant-based and compatible with the current application.
- Blocking must prevent new contact and messages in both directions; it must not silently delete the other participant's historical data.
- Existing embedded message arrays remain unchanged until a separately rehearsed migration is approved.

## Release state

All changes are intended for PR #14 on `fix/netlify-ci-lint-pr13`. Firestore and Storage rules are version-controlled and emulator-tested; they have **not** been deployed to production. No Netlify deployment, merge or production change is part of this phase.
