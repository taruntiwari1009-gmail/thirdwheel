# PR #15 — Backend repair investigation

## Symptoms reported

- Sign-in fails with a generic message.
- Registration says the Auth login was created but the profile could not be saved.
- The Supabase dashboard appears to contain no user profiles.
- The supplied screenshots show an auth layout and copy that do not match the current `src/pages/Login.jsx` and `src/pages/Register.jsx` on `main`. This is evidence to check the deployed Netlify commit before attributing every symptom to the current source.

## Confirmed findings from the connected Supabase project

Project reference: `uvxvizndmacoqfrdyifr`.

1. The project is healthy and its `auth_user_profile_created` AFTER INSERT trigger exists on `auth.users`.
2. The trigger calls `private.handle_new_auth_user()`, a SECURITY DEFINER function. It derives `display_name` from `raw_user_meta_data.display_name` (falling back to the email prefix) and inserts the profile row, including bio/interests/city/institution, with `ON CONFLICT (id) DO NOTHING`.
3. `public.profiles` has RLS enabled. The current policies allow signed-in users to select allowed profiles and update only their own row (`id = auth.uid()` in both USING and WITH CHECK).
4. **The `authenticated` database role has SELECT privilege on `public.profiles`, but does not have UPDATE privilege.** The current frontend's `saveProfile()` calls `UPDATE public.profiles ... RETURNING id`. The self-only RLS policy cannot compensate for the missing SQL table/column privilege. This is a confirmed defect and can explain the post-signup profile-save failure when signup returns a session.
5. At investigation time, `auth.users` and `public.profiles` both contained zero rows. Auth logs for the screenshot timeframe had no signup/sign-in requests. This project therefore has not received the tested requests we expected to see, or the deployed client is pointed at a different backend.
6. The Supabase URL in the repository's `.env.example` and the repository's current source must be compared against Netlify's deployed build configuration. The value of Netlify environment variables is not available from this repository connection, so the deployed project's URL is not yet verified.

## Firebase authentication report from the live site

The owner has now confirmed by inspecting the deployed registration/login flow that the live site is still using Firebase Authentication.

This differs from the GitHub source:
- `package.json` on `main` has `@supabase/supabase-js` and no Firebase dependencies.
- The repository tree on `main` has no `src/firebase.js` or Firebase auth module.
- `src/pages/Login.jsx` calls `supabase.auth.signInWithPassword()`.
- `src/pages/Register.jsx` calls `supabase.auth.signUp()`.
- `src/context/AuthContext.js` restores/listens to sessions with `supabase.auth.getSession()` and `supabase.auth.onAuthStateChange()`.
- The checked-in auth source and app routes therefore point to Supabase, not Firebase.

**Working diagnosis:** the production URL being tested is not serving the current repository `main` build. Likely causes include a Netlify site still connected to an older branch/repository, a production deploy pinned to an older commit, or the user opening a different Netlify site. This has not yet been narrowed down because Netlify site configuration and production deploy metadata are not available through the current GitHub/Supabase connections.

The PR #15 Netlify Deploy Preview status is reported by GitHub as ready at `https://deploy-preview-15--thirdwheel.netlify.app`. Direct browser access from this investigation environment was unavailable, so the rendered preview's network calls have not been independently inspected.

Do not attempt to fix this by reintroducing or migrating Firebase authentication in source. Verify the Netlify production site's connected repository, production branch and deployed commit. Keep all required repository fixes on PR #15; do not merge or trigger a production deployment.

## Required fixes in this PR

- [x] Add a versioned database migration (`20261118125611_profile_self_update_grant.sql`) that grants `UPDATE` only on the profile fields used by `saveProfile()` to `authenticated`. Keep the existing self-only RLS `USING` and `WITH CHECK` policy; do not grant INSERT or DELETE to browser users. The migration is committed to this PR only and has **not** been applied to the hosted Supabase project.
- [x] Add a source check for the least-privilege UPDATE grant and a rollback-only RLS smoke test covering owner profile update success and non-member update denial.
- [ ] Verify the Auth trigger and profile metadata mapping remain aligned with the registration form.
- [ ] Make auth failures diagnosable in the UI/console without exposing passwords, tokens, publishable keys, or server secrets.
- [ ] Confirm whether the deployed Netlify build is from the current `main` commit and whether its `REACT_APP_SUPABASE_URL` points to project `uvxvizndmacoqfrdyifr`. Do not change Netlify remotely in this PR.
- [ ] Add disposable-account browser acceptance coverage: signup (confirmation on/off), email confirmation, login, session restore, profile read/update, password reset, discovery, and text/image messaging.
- [ ] Update release-readiness documentation with actual verified results.

## Profile UPDATE grant committed in PR #15

This grant is intentionally limited to the mutable fields written by `saveProfile()`. It is committed as a timestamped Supabase migration on this PR branch only. It has not been applied to the hosted project. The CI source check and rollback-only RLS smoke test cover the intended privilege boundary.

```sql
grant update (
  username,
  display_name,
  photo_path,
  pronouns,
  bio,
  interests,
  hobbies,
  languages,
  education,
  institution,
  graduation_year,
  city,
  connection_goals,
  website,
  instagram,
  linkedin,
  discoverable
) on table public.profiles to authenticated;
```

Do not add an unrestricted policy or grant INSERT/DELETE. Existing RLS must remain the row-level boundary.

## Signup confirmation redirect

The registration client now passes `emailRedirectTo: window.location.origin`, avoiding fallback to the Supabase project's configured Site URL when signup begins on a Netlify origin. The checked-in `supabase/config.toml` now includes both `https://thirdwheel.netlify.app/**` and the Netlify deploy-preview pattern `https://**--thirdwheel.netlify.app/**`.

This only updates source-controlled/local CLI configuration. The hosted Supabase Auth URL Configuration and email template still need to be checked against the actual Netlify site URL. The project's current Site URL in source is `https://thechaichapters.com`; it has deliberately not been changed until the exact production Netlify URL is confirmed. If a custom confirmation email template is used, verify it respects the supplied `RedirectTo` value rather than hard-coding `SiteURL`.

## Safety / workflow constraints

- All source changes and migrations for this incident belong on `fix/pr15-auth-profile-backend` and PR #15 only.
- Never push this work to `main`.
- Keep PR #15 open and draft until all acceptance gates pass and the user explicitly authorizes a later merge.
- No Netlify deployment or Netlify configuration changes.
- No production Supabase migration, Auth setting, secret, Edge Function or data mutation during this investigation.
- Use disposable test accounts only; never ask the user to share a password, access token, or secret key.
