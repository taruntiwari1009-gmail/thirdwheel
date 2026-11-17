# Third Wheel — Production smoke-test checklist

Run only after the reviewed PR is merged and the application plus Firebase rules have been deliberately deployed. Do not use real personal data; use two disposable test accounts.

## Authentication
- [ ] Register account A and account B with distinct emails.
- [ ] Confirm registration works without an avatar / Storage upload.
- [ ] Confirm invalid email and weak password feedback is understandable.
- [ ] Sign out, sign back in, and confirm the correct account is restored.
- [ ] Request a password reset and verify the email flow.
- [ ] Confirm protected routes redirect signed-out visitors to login.

## Profiles and discovery
- [ ] Save a profile with display name, bio, interests, hobbies, languages, education, city and connection goals.
- [ ] Leave optional fields blank and save successfully.
- [ ] Confirm email and credentials are not present in public profile data.
- [ ] Search using upper-, lower- and mixed-case prefixes.
- [ ] Confirm the current account is excluded and multiple matches can be selected.
- [ ] Sign in an older account and confirm its normalized search field is backfilled.

## One-to-one conversations and messages
- [ ] Start a conversation from account A and verify it appears in both inboxes.
- [ ] Repeat selection from account B; verify the same conversation is reused.
- [ ] Send text in both directions and verify live delivery.
- [ ] Confirm the latest message and timestamp update in both chat lists.
- [ ] Reopen an existing conversation and confirm history is preserved.
- [ ] Verify empty, loading and listener-error states.

## Security checks
- [ ] Signed-in user can read profiles required for discovery; signed-out user cannot.
- [ ] Non-participant cannot read or write a chat document.
- [ ] User cannot write another user's profile or inbox entry.
- [ ] Message sender ID must match authenticated user.
- [ ] Oversized messages and invalid message shapes are rejected.
- [ ] Storage rejects non-image and files larger than 5 MB.
- [ ] Non-participant cannot access chat-image objects through authenticated Storage requests.
- [ ] Confirm deployed Firestore and Storage rules match the reviewed repository rules.

## Responsive and accessibility
- [ ] Check 360px mobile, tablet and desktop widths.
- [ ] Navigate search results and forms using keyboard only.
- [ ] Confirm every input has a visible label or accessible name.
- [ ] Confirm loading and errors are announced and focus remains visible.
- [ ] Confirm chat input and send action remain usable with the mobile keyboard open.

## Release sign-off
- [ ] GitHub Actions CI passes.
- [ ] Firebase rules tests pass in the emulator.
- [ ] Production app smoke tests pass with disposable accounts.
- [ ] No unexpected console errors or permission-denied loops.
- [ ] Owner approves merge and any Firebase rules deployment separately.
