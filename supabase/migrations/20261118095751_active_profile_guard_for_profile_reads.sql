-- A deleted Auth account may still hold an unexpired JWT. Do not allow that
-- stale session to read discoverable or related profiles after its profile row is gone.
create or replace function private.can_view_profile(target_profile_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.profiles me
    where me.id = (select auth.uid())
  )
  and (
    target_profile_id = (select auth.uid())
    or exists (
      select 1 from public.profiles target
      where target.id = target_profile_id
        and target.discoverable = true
    )
    or exists (
      select 1 from public.conversations c
      where (c.participant_low = (select auth.uid()) and c.participant_high = target_profile_id)
         or (c.participant_high = (select auth.uid()) and c.participant_low = target_profile_id)
    )
    or exists (
      select 1 from public.user_blocks b
      where b.blocker_id = (select auth.uid())
        and b.blocked_id = target_profile_id
    )
  );
$$;

revoke all on function private.can_view_profile(uuid) from public, anon, authenticated;
grant execute on function private.can_view_profile(uuid) to authenticated;

drop policy if exists profiles_select_self_discoverable_or_related on public.profiles;
drop policy if exists profiles_select_self_or_discoverable on public.profiles;
create policy profiles_select_active_user_only
on public.profiles for select to authenticated
using ((select private.can_view_profile(id)));
