-- Explicitly document client-denied internal tables and index foreign keys.
create policy moderation_audit_deny_client_access
on public.moderation_audit
for all
to anon, authenticated
using (false)
with check (false);

create policy message_rate_limits_deny_client_access
on private.message_rate_limits
for all
to anon, authenticated
using (false)
with check (false);

create index if not exists conversations_created_by_idx
  on public.conversations (created_by);
create index if not exists moderation_audit_actor_idx
  on public.moderation_audit (actor_id);
create index if not exists moderation_audit_report_idx
  on public.moderation_audit (report_id);
create index if not exists reports_conversation_idx
  on public.reports (conversation_id);
create index if not exists reports_message_idx
  on public.reports (message_id);
create index if not exists reports_reporter_idx
  on public.reports (reporter_id);
create index if not exists reports_target_idx
  on public.reports (target_user_id);
