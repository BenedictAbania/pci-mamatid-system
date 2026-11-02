-- Match the Review backend's tested grants. The role helper remains callable
-- by signed-in users because existing policies depend on it. Trigger helpers
-- run through their triggers; clients need no direct EXECUTE permission.
begin;

revoke execute on function public.get_my_role() from public, anon;
grant execute on function public.get_my_role() to authenticated, service_role;

revoke execute on function public.handle_new_user() from public, anon, authenticated;
revoke execute on function public.set_updated_at() from public, anon, authenticated;
revoke execute on function public.validate_distress_severity() from public, anon, authenticated;

grant execute on function public.handle_new_user() to service_role;
grant execute on function public.set_updated_at() to service_role;
grant execute on function public.validate_distress_severity() to service_role;

commit;
