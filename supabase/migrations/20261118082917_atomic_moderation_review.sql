create or replace function public.review_moderation_report(
  p_report_id uuid,
  p_status text,
  p_actor uuid,
  p_note text default ''
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_report public.reports%rowtype;
  v_status text := p_status;
  v_note text := left(coalesce(p_note, ''), 1000);
begin
  if v_status not in ('reviewing', 'actioned', 'dismissed') then
    raise exception 'Invalid moderation status' using errcode = '22023';
  end if;

  update public.reports
  set status = v_status
  where id = p_report_id
  returning * into v_report;

  if not found then
    return null;
  end if;

  insert into public.moderation_audit (actor_id, report_id, action, metadata)
  values (
    p_actor,
    p_report_id,
    'status_changed',
    jsonb_build_object('status', v_status, 'note', v_note)
  );

  return jsonb_build_object(
    'id', v_report.id,
    'status', v_report.status,
    'reason', v_report.reason,
    'reporter_id', v_report.reporter_id,
    'target_user_id', v_report.target_user_id,
    'details', v_report.details,
    'created_at', v_report.created_at
  );
end;
$$;

revoke all on function public.review_moderation_report(uuid, text, uuid, text)
from public, anon, authenticated;
grant execute on function public.review_moderation_report(uuid, text, uuid, text)
to service_role;
