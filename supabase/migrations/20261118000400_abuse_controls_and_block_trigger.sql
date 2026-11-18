-- Add a server-enforced report submission limit.
create table private.report_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  report_count integer not null check (report_count between 1 and 5)
);
alter table private.report_rate_limits enable row level security;
create policy report_rate_limits_deny_client_access
on private.report_rate_limits for all to anon, authenticated
using (false) with check (false);

create or replace function private.enforce_report_rate_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  if v_user is null or new.reporter_id is distinct from v_user then
    raise exception 'Report owner does not match authenticated user' using errcode = '42501';
  end if;

  insert into private.report_rate_limits (user_id, window_started_at, report_count)
  values (v_user, v_now, 1)
  on conflict (user_id) do update
  set window_started_at = case
        when private.report_rate_limits.window_started_at <= v_now - interval '1 hour' then v_now
        else private.report_rate_limits.window_started_at
      end,
      report_count = case
        when private.report_rate_limits.window_started_at <= v_now - interval '1 hour' then 1
        else private.report_rate_limits.report_count + 1
      end
  returning report_count into v_count;

  if v_count > 5 then
    raise exception 'Report rate limit exceeded' using errcode = 'P0001';
  end if;
  return new;
end;
$$;
revoke all on function private.enforce_report_rate_limit() from public, anon, authenticated;
create trigger reports_enforce_rate_limit
before insert on public.reports
for each row execute function private.enforce_report_rate_limit();

-- Hiding a conversation after a block is enforced even if the client disconnects
-- before its follow-up inbox update.
create or replace function private.hide_conversation_on_block()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversation_reads r
  set inbox_hidden = true, updated_at = now()
  from public.conversations c
  where r.conversation_id = c.id
    and r.user_id = new.blocker_id
    and (
      (c.participant_low = new.blocker_id and c.participant_high = new.blocked_id)
      or (c.participant_low = new.blocked_id and c.participant_high = new.blocker_id)
    );
  return new;
end;
$$;
revoke all on function private.hide_conversation_on_block() from public, anon, authenticated;
create trigger user_blocks_hide_inbox
after insert on public.user_blocks
for each row execute function private.hide_conversation_on_block();

-- Remove the extra guard check constraint so the trigger can return its own
-- rate-limit error on the ninth message instead of a generic CHECK violation.
alter table private.message_rate_limits
  drop constraint if exists message_rate_limits_message_count_check;
alter table private.message_rate_limits
  add constraint message_rate_limits_message_count_check check (message_count between 1 and 9);
