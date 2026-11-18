-- Require an active profile for sensitive reads/writes. Supabase Auth deletion does
-- not make an already-issued JWT disappear immediately, so Storage and read-state
-- policies must stop honoring deleted accounts while their old JWT is still valid.

drop policy if exists conversation_reads_select_members on public.conversation_reads;
create policy conversation_reads_select_active_members
on public.conversation_reads for select to authenticated
using (
  exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
  and exists (
    select 1 from public.conversations c
    where c.id = conversation_id
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
  )
);

drop policy if exists avatars_read_owner_or_related on storage.objects;
create policy avatars_read_visible_profiles
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
  and exists (
    select 1 from public.profiles target
    where target.id::text = (storage.foldername(name))[1]
      and (target.discoverable = true or (select private.can_view_profile(target.id)))
  )
);

drop policy if exists avatars_insert_owner on storage.objects;
create policy avatars_insert_active_owner
on storage.objects for insert to authenticated
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
);

drop policy if exists avatars_update_owner on storage.objects;
create policy avatars_update_active_owner
on storage.objects for update to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
)
with check (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
);

drop policy if exists avatars_delete_owner on storage.objects;
create policy avatars_delete_active_owner
on storage.objects for delete to authenticated
using (
  bucket_id = 'avatars'
  and (storage.foldername(name))[1] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
);

drop policy if exists chat_images_read_conversation_members on storage.objects;
create policy chat_images_read_active_conversation_members
on storage.objects for select to authenticated
using (
  bucket_id = 'chat-images'
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
  and exists (
    select 1 from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
  )
);

drop policy if exists chat_images_insert_member_sender_path on storage.objects;
create policy chat_images_insert_active_member_sender_path
on storage.objects for insert to authenticated
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
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

drop policy if exists chat_images_update_owner_member on storage.objects;
create policy chat_images_update_active_owner_member
on storage.objects for update to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
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
)
with check (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
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

drop policy if exists chat_images_delete_owner_member on storage.objects;
create policy chat_images_delete_active_owner_member
on storage.objects for delete to authenticated
using (
  bucket_id = 'chat-images'
  and (storage.foldername(name))[2] = (select auth.uid())::text
  and exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
  and exists (
    select 1 from public.conversations c
    where c.id::text = (storage.foldername(name))[1]
      and (c.participant_low = (select auth.uid()) or c.participant_high = (select auth.uid()))
  )
);
