-- Allow a blocker to see only the blocked profile row needed for unblock controls.
drop policy profiles_select_self_or_discoverable on public.profiles;
create policy profiles_select_self_discoverable_or_blocked
on public.profiles for select to authenticated
using (
  id = (select auth.uid())
  or discoverable = true
  or exists (
    select 1 from public.user_blocks b
    where b.blocker_id = (select auth.uid())
      and b.blocked_id = profiles.id
  )
);

-- Retry-safe uploads may replace only the uploader's own object in a conversation.
create policy chat_images_update_owner_member
on storage.objects for update to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
  )
)
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
  )
);

-- Disallow attachment uploads after either participant blocks the other.
drop policy chat_images_insert_member_sender_path on storage.objects;
create policy chat_images_insert_member_sender_path
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
      and not exists (
        select 1 from public.user_blocks b
        where (b.blocker_id = c.participant_low and b.blocked_id = c.participant_high)
           or (b.blocker_id = c.participant_high and b.blocked_id = c.participant_low)
      )
  )
);
