-- Keep SECURITY DEFINER internals out of the exposed public schema. The public
-- API is an invoker wrapper; the private routine still validates auth.uid().
alter function public.moxiu_social(text,jsonb) set schema moxiu_private;
grant usage on schema moxiu_private to authenticated;
revoke all on function moxiu_private.moxiu_social(text,jsonb) from public,anon;
grant execute on function moxiu_private.moxiu_social(text,jsonb) to authenticated;

create function public.moxiu_social(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select moxiu_private.moxiu_social(p_action,p_data);
$$;
revoke all on function public.moxiu_social(text,jsonb) from public,anon;
grant execute on function public.moxiu_social(text,jsonb) to authenticated;
