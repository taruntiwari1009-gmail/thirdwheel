-- Restrict the Supabase-installed RLS helper to database roles only.
-- The event trigger continues to call this function as its owner; API roles do not need EXECUTE.
do $$
begin
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke all on function public.rls_auto_enable() from public, anon, authenticated';
  end if;
end
$$;
