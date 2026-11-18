begin;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
  is_sso_user, is_anonymous
) values
(
  '10000000-0000-4000-8000-000000000001',
  'authenticated','authenticated','rls-a@thirdwheel.invalid','',now(),
  '{}'::jsonb,'{"display_name":"RLS Test A"}'::jsonb,now(),now(),false,false
),
(
  '10000000-0000-4000-8000-000000000002',
  'authenticated','authenticated','rls-b@thirdwheel.invalid','',now(),
  '{}'::jsonb,'{"display_name":"RLS Test B"}'::jsonb,now(),now(),false,false
),
(
  '10000000-0000-4000-8000-000000000003',
  'authenticated','authenticated','rls-c@thirdwheel.invalid','',now(),
  '{}'::jsonb,'{"display_name":"RLS Test C"}'::jsonb,now(),now(),false,false
);

-- A creates the conversation and sends a message in separate statements.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

insert into public.conversations (participant_low, participant_high, created_by)
values (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001'
);

select set_config(
  'test.conversation_id',
  (select id::text from public.conversations
   where participant_low='10000000-0000-4000-8000-000000000001'
     and participant_high='10000000-0000-4000-8000-000000000002'),
  true
);

insert into public.messages (conversation_id, sender_id, client_message_id, body)
values (
  current_setting('test.conversation_id')::uuid,
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'RLS rollback test'
);

-- An authenticated user can update the allowed fields on their own profile.
update public.profiles
set bio = 'RLS owner profile update passed'
where id = auth.uid();

do $
declare n integer;
begin
  select count(*) into n
  from public.profiles
  where id = auth.uid()
    and bio = 'RLS owner profile update passed';
  if n <> 1 then raise exception 'OWNER_PROFILE_UPDATE_CHECK_FAILED'; end if;
end $;

-- B makes the profile private; A is still connected through the existing chat.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
update public.profiles set discoverable=false where id=auth.uid();

-- Insert a temporary avatar object as the database owner for Storage policy tests.
reset role;
insert into storage.objects (bucket_id, name, owner, owner_id, metadata)
values (
  'avatars',
  '10000000-0000-4000-8000-000000000002/profile.png',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000002',
  '{"mimetype":"image/png","size":1}'::jsonb
);

-- C is not a participant and cannot see B's private profile or avatar.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $
declare n_profile integer; n_avatar integer;
begin
  select count(*) into n_profile from public.profiles
  where id='10000000-0000-4000-8000-000000000002';
  select count(*) into n_avatar from storage.objects
  where bucket_id='avatars' and name='10000000-0000-4000-8000-000000000002/profile.png';
  if n_profile <> 0 then raise exception 'PRIVATE_PROFILE_READ_CHECK_FAILED'; end if;
  if n_avatar <> 0 then raise exception 'PRIVATE_AVATAR_READ_CHECK_FAILED'; end if;
end $;

-- A non-member cannot update another user's profile, even though UPDATE is
-- granted to authenticated users at the SQL privilege layer.
do $
declare affected integer;
begin
  update public.profiles
  set bio = 'unauthorized profile update'
  where id = '10000000-0000-4000-8000-000000000002';
  get diagnostics affected = row_count;
  if affected <> 0 then raise exception 'NON_MEMBER_PROFILE_UPDATE_CHECK_FAILED'; end if;
end $;

-- A remains permitted to view B's private profile and avatar through the existing conversation.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
do $$
declare n_profile integer; n_avatar integer;
begin
  select count(*) into n_profile from public.profiles
  where id='10000000-0000-4000-8000-000000000002';
  select count(*) into n_avatar from storage.objects
  where bucket_id='avatars' and name='10000000-0000-4000-8000-000000000002/profile.png';
  if n_profile <> 1 then raise exception 'RELATED_PROFILE_READ_CHECK_FAILED'; end if;
  if n_avatar <> 1 then raise exception 'RELATED_AVATAR_READ_CHECK_FAILED'; end if;
end $$;

-- A conversation participant sees the message; an unrelated active user sees none.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare n integer;
begin
  select count(*) into n from public.messages where body='RLS rollback test';
  if n <> 1 then raise exception 'PARTICIPANT_READ_CHECK_FAILED: expected 1, got %', n; end if;
end $$;

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare n integer;
begin
  select count(*) into n from public.messages where body='RLS rollback test';
  if n <> 0 then raise exception 'NON_MEMBER_READ_CHECK_FAILED: expected 0, got %', n; end if;
end $$;

-- A block denies subsequent message writes for the existing conversation.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
insert into public.user_blocks (blocker_id, blocked_id)
values (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002'
);

do $$
declare denied boolean := false;
begin
  begin
    insert into public.messages (conversation_id, sender_id, client_message_id, body)
    values (
      current_setting('test.conversation_id')::uuid,
      '10000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002',
      'This must be denied after block'
    );
  exception when insufficient_privilege then
    denied := true;
  end;
  if not denied then raise exception 'BLOCK_WRITE_CHECK_FAILED'; end if;
end $$;

-- Delete C's Auth user but retain its issued JWT claims; the stale token must
-- no longer read profiles, messages, conversation read state, or private media.
reset role;
delete from auth.users where id='10000000-0000-4000-8000-000000000003';
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare n_profile integer; n_message integer; n_read integer; n_avatar integer;
begin
  select count(*) into n_profile from public.profiles;
  select count(*) into n_message from public.messages;
  select count(*) into n_read from public.conversation_reads;
  select count(*) into n_avatar from storage.objects;
  if n_profile <> 0 then raise exception 'DELETED_SESSION_PROFILE_READ_CHECK_FAILED'; end if;
  if n_message <> 0 then raise exception 'DELETED_SESSION_MESSAGE_READ_CHECK_FAILED'; end if;
  if n_read <> 0 then raise exception 'DELETED_SESSION_READ_STATE_CHECK_FAILED'; end if;
  if n_avatar <> 0 then raise exception 'DELETED_SESSION_STORAGE_READ_CHECK_FAILED'; end if;
end $$;

select 'RLS_ROLLBACK_TEST_PASSED' as result;
rollback;