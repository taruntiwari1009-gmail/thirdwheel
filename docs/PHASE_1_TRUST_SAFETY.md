# Trust, safety and account controls — Supabase

## Implemented backend controls

- Block relationships are stored in `public.user_blocks`; only the blocker can add/remove their row. Either direction is checked for new conversations and message writes.
- A database trigger hides the blocker's inbox copy of an existing conversation when a block is created.
- Report submissions are bound to the authenticated reporter and limited to five per user per rolling hour by a database trigger.
- Reports are written to `public.reports`. Ordinary clients can submit and inspect only their own reports; status changes are server-only.
- Moderator queue and review operations use JWT-verified Supabase Edge Functions and protected `app_metadata.moderator` or `app_metadata.owner` claims.
- Moderator grant/revoke is owner-only and preserves the immutable owner claim.
- Review status changes and audit writes use the atomic `public.review_moderation_report` function; its execute permission is limited to `service_role`.
- Account deletion intake requires an authenticated request and prevents duplicate active requests by primary key.
- Account deletion listing, approval and processing are owner-only Edge Functions.
- Account deletion removes the user's Auth record and profile, personal read state, blocks, avatar objects and rate-limit rows. Shared conversation rows and messages remain for the other participant; deleted sender IDs become null and the UI labels them “Deleted account.” Shared chat attachments are retained with the conversation.

## Operator setup required

1. Create the owner's Supabase Auth account through the registration page.
2. In the Supabase SQL editor, set the protected owner claim on that account using its Auth UUID:

   ```sql
   update auth.users
   set raw_app_meta_data =
     coalesce(raw_app_meta_data, '{}'::jsonb) || '{"owner": true}'::jsonb
   where id = 'YOUR_SUPABASE_AUTH_USER_UUID';
   ```

3. Sign out and back in so the session contains the new app metadata.
4. Set the Edge Function secret `ALLOWED_ORIGINS` to exact browser origins. The deployed default is localhost-only.
5. Use the owner-only UI to review deletion requests and Edge Functions to assign moderators.
6. Establish moderator staffing, response time expectations, incident escalation, evidence retention and appeals before accepting reports from real users.

Never use user-editable profile metadata for authorization. Never expose secret/service-role keys in the browser. Do not make an owner-claim change from an ordinary client.

## Current release state

The Supabase foundation is deployed to the empty project, but end-to-end browser verification, owner claim provisioning, exact hosted-origin configuration and operational runbooks are still outstanding. The app is not yet ready for public release.
