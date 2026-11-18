create or replace function public.approve_account_deletion(
  p_user_id uuid,
  p_actor_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.account_deletion_requests%rowtype;
begin
  if p_user_id is null or p_actor_id is null then
    raise exception 'A target user and owner actor are required' using errcode = '22023';
  end if;

  if not exists (
    select 1 from auth.users u
    where u.id = p_actor_id
      and u.raw_app_meta_data @> '{"owner": true}'::jsonb
  ) then
    raise exception 'Owner access required' using errcode = '42501';
  end if;

  update public.account_deletion_requests
  set status = 'approved',
      updated_at = now()
  where user_id = p_user_id
    and status = 'pending_review'
  returning * into v_request;

  if not found then
    return null;
  end if;

  insert into public.moderation_audit (actor_id, action, metadata)
  values (
    p_actor_id,
    'account_deletion_approved',
    jsonb_build_object('target_user_id', p_user_id)
  );

  return jsonb_build_object(
    'user_id', v_request.user_id,
    'status', v_request.status,
    'requested_at', v_request.requested_at,
    'updated_at', v_request.updated_at
  );
end;
$$;

revoke all on function public.approve_account_deletion(uuid, uuid)
from public, anon, authenticated;
grant execute on function public.approve_account_deletion(uuid, uuid)
to service_role;
