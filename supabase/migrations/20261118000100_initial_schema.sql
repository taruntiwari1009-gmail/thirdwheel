-- Third Wheel: fresh Supabase backend (no Firebase data is imported).
-- This migration is intentionally explicit about grants, RLS and private storage.

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  display_name_lower text generated always as (lower(display_name)) stored,
  photo_path text,
  pronouns text not null default '' check (char_length(pronouns) <= 40),
  bio text not null default '' check (char_length(bio) <= 300),
  interests text[] not null default '{}' check (cardinality(interests) <= 20),
  hobbies text[] not null default '{}' check (cardinality(hobbies) <= 20),
  languages text[] not null default '{}' check (cardinality(languages) <= 20),
  education text not null default '' check (char_length(education) <= 100),
  institution text not null default '' check (char_length(institution) <= 120),
  graduation_year text not null default '' check (char_length(graduation_year) <= 4),
  city text not null default '' check (char_length(city) <= 80),
  connection_goals text[] not null default '{}' check (cardinality(connection_goals) <= 20),
  website text not null default '',
  instagram text not null default '',
  linkedin text not null default '',
  discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_.]{3,24}$')
);

-- Participant UUIDs intentionally do not FK to auth.users: deleting an account must
-- not erase the shared conversation. RLS also requires a live profiles row for access.
create table public.conversations (
  id uuid primary key default gen_random_uuid(),
  participant_low uuid not null,
  participant_high uuid not null,
  created_by uuid references auth.users(id) on delete set null,
  last_message_at timestamptz,
  last_message_preview text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint conversations_distinct_participants check (participant_low < participant_high),
  constraint conversations_unique_pair unique (participant_low, participant_high)
);

create table public.conversation_reads (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  inbox_hidden boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (conversation_id, user_id),
);

create table public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid references auth.users(id) on delete set null,
  client_message_id uuid not null,
  body text not null default '' check (char_length(body) <= 4000),
  attachment_path text,
  created_at timestamptz not null default now(),
  unique (conversation_id, sender_id, client_message_id),
  constraint messages_require_content check (char_length(btrim(body)) > 0 or attachment_path is not null),
  constraint messages_attachment_path_format check (
    attachment_path is null or
    attachment_path ~ '^[0-9a-fA-F-]{36}/[0-9a-fA-F-]{36}/[A-Za-z0-9_.-]{1,180}$'
  )
);

create table public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid references auth.users(id) on delete set null,
  target_user_id uuid references auth.users(id) on delete set null,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null check (reason in ('spam','scam','harassment','threats','stalking','sexual_harassment','underage','inappropriate','impersonation','other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewing','actioned','dismissed')),
  created_at timestamptz not null default now(),
  constraint reports_no_self check (reporter_id is null or target_user_id is null or reporter_id <> target_user_id)
);

create table public.moderation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending_review' check (status in ('pending_review','approved','processing','completed','rejected')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index profiles_discovery_name_idx on public.profiles (display_name_lower, id) where discoverable;
create index profiles_discovery_username_idx on public.profiles (username, id) where discoverable and username is not null;
create index conversations_low_inbox_idx on public.conversations (participant_low, last_message_at desc nulls last);
create index conversations_high_inbox_idx on public.conversations (participant_high, last_message_at desc nulls last);
create index conversation_reads_user_idx on public.conversation_reads (user_id, updated_at desc);
create index messages_conversation_created_idx on public.messages (conversation_id, created_at desc, id desc);
create index messages_sender_created_idx on public.messages (sender_id, created_at desc);
create index user_blocks_blocked_idx on public.user_blocks (blocked_id, blocker_id);
create index reports_status_created_idx on public.reports (status, created_at desc);

-- Internal trigger state. This schema is not exposed through the Data API.
create table private.message_rate_limits (
  user_id uuid primary key references auth.users(id) on delete cascade,
  window_started_at timestamptz not null,
  message_count integer not null check (message_count between 1 and 8)
);

create or replace function private.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'New member'
  );
  insert into public.profiles (id, display_name)
  values (new.id, left(v_name, 80))
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function private.create_conversation_reads()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.conversation_reads (conversation_id, user_id)
  values (new.id, new.participant_low), (new.id, new.participant_high)
  on conflict (conversation_id, user_id) do nothing;
  return new;
end;
$$;

create or replace function private.enforce_message_rate_limit()
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
  if v_user is null or new.sender_id is distinct from v_user then
    raise exception 'Message sender does not match authenticated user' using errcode = '42501';
  end if;

  insert into private.message_rate_limits (user_id, window_started_at, message_count)
  values (v_user, v_now, 1)
  on conflict (user_id) do update
  set window_started_at = case
        when private.message_rate_limits.window_started_at <= v_now - interval '1 minute' then v_now
        else private.message_rate_limits.window_started_at
      end,
      message_count = case
        when private.message_rate_limits.window_started_at <= v_now - interval '1 minute' then 1
        else private.message_rate_limits.message_count + 1
      end
  returning message_count into v_count;

  if v_count > 8 then
    raise exception 'Message rate limit exceeded' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

create or replace function private.after_message_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.conversations
  set last_message_at = new.created_at,
      last_message_preview = case
        when new.body <> '' then left(new.body, 160)
        else 'Image'
      end,
      updated_at = now()
  where id = new.conversation_id;

  insert into public.conversation_reads (conversation_id, user_id, last_read_at, updated_at)
  values (new.conversation_id, new.sender_id, new.created_at, now())
  on conflict (conversation_id, user_id) do update
  set last_read_at = greatest(
        coalesce(public.conversation_reads.last_read_at, '-infinity'::timestamptz),
        excluded.last_read_at
      ),
      updated_at = now();

  return new;
end;
$$;

revoke all on all functions in schema private from public, anon, authenticated;

create trigger auth_user_profile_created
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create trigger profiles_touch_updated_at
before update on public.profiles
for each row execute function private.set_updated_at();

create trigger conversation_created_read_rows
after insert on public.conversations
for each row execute function private.create_conversation_reads();

create trigger messages_enforce_rate_limit
before insert on public.messages
for each row execute function private.enforce_message_rate_limit();

create trigger messages_after_insert
after insert on public.messages
for each row execute function private.after_message_insert();

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_reads enable row level security;
alter table public.user_blocks enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_audit enable row level security;
alter table public.account_deletion_requests enable row level security;
alter table private.message_rate_limits enable row level security;

-- Profiles: one public/discoverable field set, all controlled by the owner.
create policy profiles_select_self_or_discoverable
on public.profiles for select to authenticated
using (id = (select auth.uid()) or discoverable = true);

create policy profiles_update_self
on public.profiles for update to authenticated
using (id = (select auth.uid()))
with check (id = (select auth.uid()));

-- Conversation rows are visible only to their two current members.
create policy conversations_select_members
on public.conversations for select to authenticated
using (
  (participant_low = (select auth.uid()) or participant_high = (select auth.uid()))
  and exists (select 1 from public.profiles me where me.id = (select auth.uid()))
);

create policy conversations_insert_discoverable_unblocked_pair
on public.conversations for insert to authenticated
with check (
  created_by = (select auth.uid())
  and (participant_low = (select auth.uid()) or participant_high = (select auth.uid()))
  and exists (
    select 1 from public.profiles target
    where target.id = case
      when participant_low = (select auth.uid()) then participant_high
      else participant_low
    end
    and target.discoverable = true
  )
  and not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = participant_low and b.blocked_id = participant_high)
       or (b.blocker_id = participant_high and b.blocked_id = participant_low)
  )
);

-- Read state is per-user, but conversation members may inspect one another's
-- last_read_at for the existing sent/seen receipt behavior.
create policy conversation_reads_select_members
on public.conversation_reads for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and ((c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid())))
  )
);

create policy conversation_reads_insert_self
on public.conversation_reads for insert to authenticated
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and ((c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid())))
  )
);

create policy conversation_reads_update_self
on public.conversation_reads for update to authenticated
using (user_id = (select auth.uid()))
with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and ((c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid())))
  )
);

-- Block records can be discovered from either side so search can suppress both.
create policy user_blocks_select_involved
on public.user_blocks for select to authenticated
using (blocker_id = (select auth.uid()) or blocked_id = (select auth.uid()));

create policy user_blocks_insert_self
on public.user_blocks for insert to authenticated
with check (
  blocker_id = (select auth.uid())
  and exists (select 1 from public.profiles target where target.id = blocked_id)
);

create policy user_blocks_delete_self
on public.user_blocks for delete to authenticated
using (blocker_id = (select auth.uid()));

create policy messages_select_conversation_members
on public.messages for select to authenticated
using (
  exists (
    select 1 from public.conversations c
    join public.profiles me on me.id = (select auth.uid())
    where c.id = conversation_id
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
  )
);

create policy messages_insert_member_unblocked
on public.messages for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
  )
  and (
    attachment_path is null
    or attachment_path like conversation_id::text || '/' || (select auth.uid())::text || '/%'
  )
  and not exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = (select auth.uid()) and b.blocked_id in (
      select case when c.participant_low = (select auth.uid()) then c.participant_high else c.participant_low end
      from public.conversations c where c.id = conversation_id
    ))
    or (b.blocked_id = (select auth.uid()) and b.blocker_id in (
      select case when c.participant_low = (select auth.uid()) then c.participant_high else c.participant_low end
      from public.conversations c where c.id = conversation_id
    ))
  )
);

-- Reporters can submit and inspect their own reports. Moderation is server-only.
create policy reports_insert_own
on public.reports for insert to authenticated
with check (
  reporter_id = (select auth.uid())
  and target_user_id is not null
  and target_user_id <> (select auth.uid())
);

create policy reports_select_own
on public.reports for select to authenticated
using (reporter_id = (select auth.uid()));

create policy account_deletion_requests_insert_self
on public.account_deletion_requests for insert to authenticated
with check (user_id = (select auth.uid()));

create policy account_deletion_requests_select_self
on public.account_deletion_requests for select to authenticated
using (user_id = (select auth.uid()));

-- Explicit least-privilege grants: RLS is still evaluated for every row.
revoke all on table
  public.profiles, public.conversations, public.conversation_reads, public.user_blocks,
  public.messages, public.reports, public.moderation_audit, public.account_deletion_requests
from public, anon, authenticated;

grant usage on schema public to authenticated;
grant select on public.profiles to authenticated;
grant update (
  username, display_name, photo_path, pronouns, bio, interests, hobbies, languages,
  education, institution, graduation_year, city, connection_goals, website, instagram,
  linkedin, discoverable
) on public.profiles to authenticated;

grant select on public.conversations to authenticated;
grant insert (participant_low, participant_high, created_by) on public.conversations to authenticated;

grant select on public.conversation_reads to authenticated;
grant insert (conversation_id, user_id) on public.conversation_reads to authenticated;
grant update (last_read_at, inbox_hidden) on public.conversation_reads to authenticated;

grant select, delete on public.user_blocks to authenticated;
grant insert (blocker_id, blocked_id) on public.user_blocks to authenticated;

grant select on public.messages to authenticated;
grant insert (conversation_id, sender_id, client_message_id, body, attachment_path) on public.messages to authenticated;

grant select on public.reports to authenticated;
grant insert (reporter_id, target_user_id, conversation_id, message_id, reason, details) on public.reports to authenticated;

grant select on public.account_deletion_requests to authenticated;
grant insert (user_id) on public.account_deletion_requests to authenticated;

-- Future public tables/functions created as postgres default to no client API access.
alter default privileges for role postgres in schema public
  revoke all on tables from public, anon, authenticated;
alter default privileges for role postgres in schema public
  revoke execute on functions from public, anon, authenticated;

-- Private image buckets. Upload size and MIME restrictions are enforced by bucket config.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('avatars', 'avatars', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif']),
  ('chat-images', 'chat-images', false, 5242880, array['image/jpeg','image/png','image/webp','image/gif'])
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy avatars_read_owner_or_discoverable
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and (
    (storage.foldername(name))[1] = (select auth.uid())::text
    or exists (
      select 1 from public.profiles p
      where p.id::text = (storage.foldername(name))[1]
        and p.discoverable = true
    )
  )
);

create policy avatars_insert_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy avatars_update_owner
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy avatars_delete_owner
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
);

create policy chat_images_read_conversation_members
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images'
  and exists (
    select 1 from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
  )
);

create policy chat_images_insert_member_sender_path
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
  )
);

create policy chat_images_delete_owner_member
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
  )
);

-- Enable Postgres Changes for the three tables used by the chat client.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'messages'
  ) then
    alter publication supabase_realtime add table public.messages;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversations'
  ) then
    alter publication supabase_realtime add table public.conversations;
  end if;
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'conversation_reads'
  ) then
    alter publication supabase_realtime add table public.conversation_reads;
  end if;
end;
$$;
