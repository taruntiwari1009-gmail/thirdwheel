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

## Required fixes in this PR

- [ ] Add a versioned database migration that grants `UPDATE` only on the profile fields used by `saveProfile()` to `authenticated`. Keep the existing self-only RLS `USING` and `WITH CHECK` policy; do not grant INSERT or DELETE to browser users.
- [ ] Add a regression test/static verification that the profile update grant exists in the migration source and the self-only RLS predicate remains present.
- [ ] Verify the Auth trigger and profile metadata mapping remain aligned with the registration form.
- [ ] Make auth failures diagnosable in the UI/console without exposing passwords, tokens, publishable keys, or server secrets.
- [ ] Confirm whether the deployed Netlify build is from the current `main` commit and whether its `REACT_APP_SUPABASE_URL` points to project `uvxvizndmacoqfrdyifr`. Do not change Netlify remotely in this PR.
- [ ] Add disposable-account browser acceptance coverage: signup (confirmation on/off), email confirmation, login, session restore, profile read/update, password reset, discovery, and text/image messaging.
- [ ] Update release-readiness documentation with actual verified results.

## Proposed profile UPDATE grant

This grant is intentionally limited to the mutable fields written by `saveProfile()`. It must be committed as a new timestamped Supabase migration and tested before anyone applies it to the hosted project.

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

## Safety / workflow constraints

- All source changes and migrations for this incident belong on `fix/pr15-auth-profile-backend` and PR #15 only.
- Never push this work to `main`.
- Keep PR #15 open and draft until all acceptance gates pass and the user explicitly authorizes a later merge.
- No Netlify deployment or Netlify configuration changes.
- No production Supabase migration, Auth setting, secret, Edge Function or data mutation during this investigation.
- Use disposable test accounts only; never ask the user to share a password, access token, or secret key.
