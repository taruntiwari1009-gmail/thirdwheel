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
- **App Check:** The web client now supports optional reCAPTCHA v3 initialization through `REACT_APP_FIREBASE_APPCHECK_SITE_KEY`. The report callable still has enforcement disabled. Configure a real staging site key, validate token traffic and monitor errors before enabling server enforcement. Never commit the key or use a placeholder.
- **Rate limiting:** Report intake has a transactional daily submission cap. Message spam and broader account throttling need server-authoritative message writes or an approved migration from the embedded-message model.
- **Moderator provisioning:** Set the initial owner custom claim through a trusted administrative process outside the client. Never grant owner/moderator claims from a client-writable Firestore document.
- **Operations:** Define moderation staffing, response expectations, evidence retention, appeals and legal retention exceptions.

## Chat product scope

Third Wheel remains a one-to-one chat application. Dating profiles, likes, passes, matches, relationship-intent discovery and age-verification workflows are out of scope. Existing participant-based chats and embedded message arrays remain compatible.

## Release state

All changes are on PR #14, branch `fix/netlify-ci-lint-pr13`. Firestore and Storage rules are source-controlled and emulator-tested; they have not been deployed to production. No Netlify deployment, merge or production change is part of this work.

## Trusted backend setup (operator-only)

1. Review the Functions source and deploy to a dedicated staging Firebase project first.
2. Install backend dependencies from the `functions/` directory and run `npm test`.
3. Provision the initial owner custom claim from a trusted workstation with Application Default Credentials for the intended Firebase project:

   ```bash
   cd functions
   gcloud auth application-default login
   export GCLOUD_PROJECT="your-staging-project-id"
   export THIRDWHEEL_OWNER_UID="the-owner-firebase-auth-uid"
   npm run bootstrap-owner
   ```

4. Refresh the owner's Firebase ID token by signing out and back in. Use the owner-only callable to grant/revoke moderator claims to other accounts.
5. Configure the web App Check site key as a deployment environment variable. Observe staging traffic before enabling callable enforcement.
6. Do not deploy Functions or rules to the production project until the owner explicitly approves the target project, billing impact, rules diff and rollout plan.

The bootstrap script does not contain or download credentials. Never commit service-account keys or use a client-side owner flag.
