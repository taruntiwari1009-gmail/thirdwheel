-- Rollback-only Supabase RLS smoke test.
-- Run in a disposable Supabase development project using the SQL Editor.
-- Do not remove BEGIN/ROLLBACK. The three temporary Auth users and all rows
-- created by this test are rolled back and never become persistent accounts.

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

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000001","role":"authenticated"}',true);

-- Conversation creation and message creation are separate statements, matching
-- the app's two-request flow so the message policy sees the committed conversation
-- within the current SQL transaction snapshot.
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

-- A conversation participant must see the message.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
do $$
declare n integer;
begin
  select count(*) into n from public.messages where body='RLS rollback test';
  if n <> 1 then
    raise exception 'PARTICIPANT_READ_CHECK_FAILED: expected 1, got %', n;
  end if;
end $$;

-- A signed-in non-member must see no messages.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select set_config('request.jwt.claims','{"sub":"10000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
do $$
declare n integer;
begin
  select count(*) into n from public.messages where body='RLS rollback test';
  if n <> 0 then
    raise exception 'NON_MEMBER_READ_CHECK_FAILED: expected 0, got %', n;
  end if;
end $$;

-- A block must deny subsequent message writes, even for an existing conversation.
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
  if not denied then
    raise exception 'BLOCK_WRITE_CHECK_FAILED';
  end if;
end $$;

select 'RLS_ROLLBACK_TEST_PASSED' as result;
rollback;
