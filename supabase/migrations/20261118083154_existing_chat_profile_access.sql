create or replace function private.can_view_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select
    target_profile_id = (select auth.uid())
    or exists (
      select 1 from public.conversations c
      where (c.participant_low = (select auth.uid()) and c.participant_high = target_profile_id)
         or (c.participant_high = (select auth.uid()) and c.participant_low = target_profile_id)
    )
    or exists (
      select 1 from public.user_blocks b
      where b.blocker_id = (select auth.uid())
        and b.blocked_id = target_profile_id
    );
$$;

revoke all on function private.can_view_profile(uuid) from public, anon, authenticated;
grant usage on schema private to authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

drop policy profiles_select_self_discoverable_or_blocked on public.profiles;
create policy profiles_select_self_discoverable_or_related
on public.profiles for select to authenticated
using (
  discoverable = true
  or (select private.can_view_profile(id))
);

drop policy avatars_read_owner_or_discoverable on storage.objects;
create policy avatars_read_owner_or_related
on storage.objects for select to authenticated
using (
  bucket_id = 'avatars'
  and exists (
    select 1 from public.profiles p
    where p.id::text = (storage.foldername(name))[1]
  )
);
