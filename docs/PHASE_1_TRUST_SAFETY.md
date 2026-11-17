# Phase 1 — Trust, safety and account controls

## Implemented in PR #14

- Block management screen at `/settings/blocked`; owner-only list and unblock controls.
- Firestore rules prevent self-blocking, require an existing public profile, and prevent blocked participants from creating new chats or appending messages.
- Report submissions use a trusted callable function instead of direct client writes.
- The backend validates report target, reason and bounded details, applies a per-user daily submission cap, and atomically creates a private report, moderation case and audit event.
- Moderator queue and review callables require the Firebase custom claim `moderator: true`; case status changes and notes create audit events.
- Moderator role changes require an `owner: true` custom claim and are audited.
- Account deletion request intake is authenticated and prevents duplicate active requests. It records a pending request and audit event; it does not automatically destroy data.

## Remaining before production

- **Deletion execution:** Requests remain `pending_review`. Destructive cleanup is not automatic until retention policy and shared-conversation handling are approved. A deletion worker must preserve the other participant's records and handle Storage, Auth, usernames, profile and inbox data with retry/reconciliation.
- **App Check:** The report callable currently has enforcement disabled. Configure a real provider and validate staging traffic before enabling enforcement. Do not use a placeholder key.
- **Rate limiting:** Report intake has a transactional daily submission cap. Message spam and broader account throttling need server-authoritative message writes or an approved migration from the embedded-message model.
- **Moderator provisioning:** Set the initial owner custom claim through a trusted administrative process outside the client. Never grant owner/moderator claims from a client-writable Firestore document.
- **Operations:** Define moderation staffing, response expectations, evidence retention, appeals and legal retention exceptions.

## Chat product scope

Third Wheel remains a one-to-one chat application. Dating profiles, likes, passes, matches, relationship-intent discovery and age-verification workflows are out of scope. Existing participant-based chats and embedded message arrays remain compatible.

## Release state

All changes are on PR #14, branch `fix/netlify-ci-lint-pr13`. Firestore and Storage rules are source-controlled and emulator-tested; they have not been deployed to production. No Netlify deployment, merge or production change is part of this work.
