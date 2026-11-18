-- Third Wheel initial Supabase schema.
-- Apply only through a reviewed migration after local security tests pass.
create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 80),
  display_name_lower text generated always as (lower(display_name)) stored,
  photo_path text,
  pronouns text not null default '' check (char_length(pronouns) <= 40),
  bio text not null default '' check (char_length(bio) <= 300),
  interests text[] not null default '{}',
  hobbies text[] not null default '{}',
  languages text[] not null default '{}',
  education text not null default '' check (char_length(education) <= 100),
  institution text not null default '' check (char_length(institution) <= 120),
  graduation_year text not null default '' check (char_length(graduation_year) <= 4),
  city text not null default '' check (char_length(city) <= 80),
  connection_goals text[] not null default '{}',
  website text not null default '',
  instagram text not null default '',
  linkedin text not null default '',
  discoverable boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint profiles_username_format check (username is null or username ~ '^[a-z0-9_.]{3,24}$')
);

create table if not exists public.conversations (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.conversation_members (
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  last_read_at timestamptz,
  inbox_hidden boolean not null default false,
  joined_at timestamptz not null default now(),
  primary key (conversation_id, user_id)
);

create table if not exists public.user_blocks (
  blocker_id uuid not null references auth.users(id) on delete cascade,
  blocked_id uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (blocker_id, blocked_id),
  constraint user_blocks_no_self check (blocker_id <> blocked_id)
);

create table if not exists public.messages (
  id uuid primary key default gen_random_uuid(),
  conversation_id uuid not null references public.conversations(id) on delete cascade,
  sender_id uuid not null references auth.users(id) on delete cascade,
  client_message_id uuid not null,
  body text not null default '' check (char_length(body) <= 4000),
  attachment_path text,
  created_at timestamptz not null default now(),
  unique (conversation_id, sender_id, client_message_id),
  constraint messages_require_content check (char_length(btrim(body)) > 0 or attachment_path is not null)
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references auth.users(id) on delete cascade,
  target_user_id uuid not null references auth.users(id) on delete cascade,
  conversation_id uuid references public.conversations(id) on delete set null,
  message_id uuid references public.messages(id) on delete set null,
  reason text not null check (reason in ('spam','scam','harassment','threats','stalking','sexual_harassment','underage','inappropriate','impersonation','other')),
  details text not null default '' check (char_length(details) <= 500),
  status text not null default 'pending' check (status in ('pending','reviewing','actioned','dismissed')),
  created_at timestamptz not null default now(),
  constraint reports_no_self check (reporter_id <> target_user_id)
);

create table if not exists public.moderation_audit (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  report_id uuid references public.reports(id) on delete set null,
  action text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.account_deletion_requests (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending_review' check (status in ('pending_review','approved','processing','completed','rejected')),
  requested_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists profiles_discovery_name_idx on public.profiles (display_name_lower) where discoverable;
create index if not exists profiles_discovery_username_idx on public.profiles (username) where discoverable and username is not null;
create index if not exists conversation_members_user_inbox_idx on public.conversation_members (user_id, joined_at desc) where inbox_hidden = false;
create index if not exists messages_conversation_created_idx on public.messages (conversation_id, created_at desc, id desc);
create index if not exists reports_status_created_idx on public.reports (status, created_at desc);

-- Security-definer predicates avoid recursive RLS evaluation on membership/block tables.
create or replace function public.is_conversation_member(target_conversation uuid, target_user uuid default auth.uid())
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = target_conversation and cm.user_id = target_user
  );
$$;

create or replace function public.is_blocked_either_way(first_user uuid, second_user uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.user_blocks b
    where (b.blocker_id = first_user and b.blocked_id = second_user)
       or (b.blocker_id = second_user and b.blocked_id = first_user)
  );
$$;

alter table public.profiles enable row level security;
alter table public.conversations enable row level security;
alter table public.conversation_members enable row level security;
alter table public.user_blocks enable row level security;
alter table public.messages enable row level security;
alter table public.reports enable row level security;
alter table public.moderation_audit enable row level security;
alter table public.account_deletion_requests enable row level security;

-- Profiles: owners can manage their own row; other signed-in users see discoverable profiles only.
create policy "profiles_read_self_or_discoverable" on public.profiles
for select to authenticated using (id = (select auth.uid()) or discoverable = true);
create policy "profiles_insert_self" on public.profiles
for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles_update_self" on public.profiles
for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));
create policy "profiles_delete_self" on public.profiles
for delete to authenticated using (id = (select auth.uid()));

-- Conversation metadata and members are visible only to members.
create policy "conversations_read_members" on public.conversations
for select to authenticated using (public.is_conversation_member(id));
create policy "conversation_members_read_members" on public.conversation_members
for select to authenticated using (public.is_conversation_member(conversation_id));
create policy "conversation_members_update_self" on public.conversation_members
for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

-- Blocks are private to the blocker.
create policy "blocks_read_own" on public.user_blocks
for select to authenticated using (blocker_id = (select auth.uid()));
create policy "blocks_insert_own" on public.user_blocks
for insert to authenticated with check (blocker_id = (select auth.uid()));
create policy "blocks_delete_own" on public.user_blocks
for delete to authenticated using (blocker_id = (select auth.uid()));

-- Messages: members only; inserts must be authored by caller and neither party may have blocked the other.
create policy "messages_read_members" on public.messages
for select to authenticated using (
  public.is_conversation_member(conversation_id)
  and not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id
      and public.is_blocked_either_way(cm.user_id, (select auth.uid()))
  )
);
create policy "messages_insert_as_member" on public.messages
for insert to authenticated with check (
  sender_id = (select auth.uid())
  and public.is_conversation_member(conversation_id)
  and not exists (
    select 1 from public.conversation_members cm
    where cm.conversation_id = messages.conversation_id
      and cm.user_id <> (select auth.uid())
      and public.is_blocked_either_way(cm.user_id, (select auth.uid()))
  )
);
-- Message edits/deletes are intentionally unavailable to clients in v1.

-- Reports can be submitted/read by their reporter. Moderation writes are server-only.
create policy "reports_insert_own" on public.reports
for insert to authenticated with check (reporter_id = (select auth.uid()));
create policy "reports_read_own" on public.reports
for select to authenticated using (reporter_id = (select auth.uid()));
-- No client policies for moderation_audit or account_deletion_requests.

revoke all on public.moderation_audit from anon, authenticated;
revoke all on public.account_deletion_requests from anon, authenticated;
grant select, insert, update, delete on public.profiles to authenticated;
grant select on public.conversations to authenticated;
grant select, update on public.conversation_members to authenticated;
grant select, insert, delete on public.user_blocks to authenticated;
grant select, insert on public.messages to authenticated;
grant select, insert on public.reports to authenticated;

-- Realtime publication membership is configured in a later reviewed migration
-- after client subscription behavior and publication state are verified.
