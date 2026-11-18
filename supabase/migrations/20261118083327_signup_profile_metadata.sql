create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_name text;
  v_interests text[];
begin
  v_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'display_name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'New member'
  );

  if jsonb_typeof(new.raw_user_meta_data -> 'interests') = 'array' then
    select coalesce(array_agg(value), '{}'::text[])
    into v_interests
    from (
      select left(btrim(value), 80) as value
      from jsonb_array_elements_text(new.raw_user_meta_data -> 'interests')
      where btrim(value) <> ''
      limit 20
    ) values_limited;
  else
    v_interests := '{}'::text[];
  end if;

  insert into public.profiles (
    id, display_name, bio, interests, city, institution
  )
  values (
    new.id,
    left(v_name, 80),
    left(coalesce(new.raw_user_meta_data ->> 'bio', ''), 300),
    v_interests,
    left(coalesce(new.raw_user_meta_data ->> 'city', ''), 80),
    left(coalesce(new.raw_user_meta_data ->> 'institution', ''), 120)
  )
  on conflict (id) do nothing;
  return new;
end;
$$;
revoke all on function private.handle_new_auth_user() from public, anon, authenticated;
