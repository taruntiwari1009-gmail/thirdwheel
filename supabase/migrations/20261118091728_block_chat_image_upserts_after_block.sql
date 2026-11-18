-- Prevent chat-image overwrite/upsert from bypassing a newly placed block.
drop policy if exists chat_images_update_owner_member on storage.objects;
create policy chat_images_update_owner_member
on storage.objects for update to authenticated
using (
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
)
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
