# Phase 1 — Trust, safety and account controls

## Implemented in PR #14

- Block management screen at `/settings/blocked`; owner-only list and unblock controls.
- Firestore rules prevent self-blocking, require an existing public profile, and prevent blocked participants from creating new chats or appending messages.
- Report submissions use a trusted callable function instead of direct client writes.
- The backend validates report target, reason and bounded details, applies a per-user daily submission cap, and atomically creates a private report, moderation case and audit event. Unit tests and Firebase Auth/Firestore/Functions/Storage emulator integration tests cover report validation, authentication, throttling, atomic records, moderator authorization/review and the account-deletion workflow.
- Moderator queue and review callables require the Firebase custom claim `moderator: true`; case status changes and notes create audit events.
- Moderator role changes require an `owner: true` custom claim and are audited.
- Account deletion request intake is authenticated and prevents duplicate active requests. It records a pending request and audit event; it does not automatically destroy data.

## Remaining before production

- **Deletion execution:** Implemented and emulator-tested. Owner approval is required. The trusted `approveAccountDeletion` callable moves a pending request to approved; `processAccountDeletion` processes inbox entries in resumable batches, labels retained chat history as “Deleted account,” deletes the requesting user’s inbox copies, username reservation, public profile, own block list, message throttle, avatar files and Firebase Auth account. Shared chat documents, messages and chat attachments are retained. The owner repeats the processing callable until it returns `completed: true`. Staging verification and a support runbook are still required before production use.
- **App Check:** The web client now supports optional reCAPTCHA v3 initialization through `REACT_APP_FIREBASE_APPCHECK_SITE_KEY`. The report callable reads `ENFORCE_APPCHECK` at runtime. Keep it unset/false for local emulator work; set it to `true` only after a real staging site key is configured, valid tokens are observed and failure behavior is tested. Never commit the key or use a placeholder.
- **Rate limiting:** Report intake has a transactional daily submission cap. Message writes enforce an atomic per-user cap of eight messages per 60-second window through a Firestore transaction and security rules. Broader account-level throttling remains a future enhancement.
- **Moderator provisioning:** Set the initial owner custom claim through a trusted administrative process outside the client. Never grant owner/moderator claims from a client-writable Firestore document.
- **Operations:** Define moderation staffing, response expectations, evidence retention, appeals and legal retention exceptions.\n- **Indexes:** The moderation queue status/date query has a composite index definition in `firestore.indexes.json`; deploy it only to the approved staging/production project as part of a separately reviewed release.

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
