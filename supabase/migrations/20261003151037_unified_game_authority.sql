create table moxiu_private.game_characters (
 user_id uuid primary key references auth.users(id) on delete cascade,
 payload jsonb not null,
 revision bigint not null default 1,
 updated_at timestamptz not null default now()
);
create table moxiu_private.game_requests (
 user_id uuid not null references moxiu_private.game_characters(user_id) on delete cascade,
 request_id uuid not null,
 action text not null,
 args jsonb not null,
 result jsonb not null,
 before_currency jsonb not null,
 after_currency jsonb not null,
 created_at timestamptz not null default now(),
 primary key(user_id,request_id)
);
create index game_requests_user_created on moxiu_private.game_requests(user_id,created_at desc);
alter table moxiu_private.game_characters enable row level security;
alter table moxiu_private.game_requests enable row level security;
revoke all on moxiu_private.game_characters,moxiu_private.game_requests from public,anon,authenticated;
grant usage on schema moxiu_private to service_role;

create function moxiu_private.game_load(p_user uuid,p_initial jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c moxiu_private.game_characters; r moxiu_private.game_requests; v_owned jsonb;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 insert into moxiu_private.game_characters(user_id,payload) values(p_user,p_initial) on conflict(user_id) do nothing;
 select * into strict c from moxiu_private.game_characters where user_id=p_user;
 select * into r from moxiu_private.game_requests where user_id=p_user and request_id=p_request;
 select coalesce(jsonb_agg(sku),'[]'::jsonb) into v_owned from moxiu_private.shard_entitlements where user_id=p_user;
 return jsonb_build_object('state',c.payload,'revision',c.revision,'owned',v_owned,
 'known',r.request_id is not null,'previous_action',r.action,'previous_args',r.args,'result',r.result);
end;
$$;
create function moxiu_private.game_commit(p_user uuid,p_revision bigint,p_request uuid,p_action text,p_args jsonb,p_state jsonb,p_result jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c moxiu_private.game_characters; r moxiu_private.game_requests;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 select * into strict c from moxiu_private.game_characters where user_id=p_user for update;
 if p_action<>'sync' then
  select * into r from moxiu_private.game_requests where user_id=p_user and request_id=p_request;
  if found then
   if r.action<>p_action or r.args<>p_args then raise exception 'Request reused with different intent' using errcode='22023'; end if;
   return jsonb_build_object('state',c.payload,'revision',c.revision,'result',r.result,'replayed',true,'conflict',false);
  end if;
 end if;
 if c.revision<>p_revision then
  return jsonb_build_object('state',c.payload,'revision',c.revision,'conflict',true);
 end if;
 if jsonb_typeof(p_state->'currency') is distinct from 'object' or
  jsonb_typeof(p_state->'currency'->'stone') is distinct from 'number' or
  jsonb_typeof(p_state->'currency'->'cny') is distinct from 'number' or
  (p_state->'currency'->>'stone')::numeric not between 0 and 9000000000000000 or
  (p_state->'currency'->>'cny')::numeric not between 0 and 9000000000000000 or
  jsonb_typeof(p_state->'inventory') is distinct from 'array' or
  p_state->'world'->>'mode'<>'standard' or octet_length(p_state::text)>2000000 then
  raise exception 'Invalid server settlement' using errcode='22023';
 end if;
 if p_action<>'sync' then
  insert into moxiu_private.game_requests(user_id,request_id,action,args,result,before_currency,after_currency)
   values(p_user,p_request,p_action,p_args,p_result,c.payload->'currency',p_state->'currency');
 end if;
 update moxiu_private.game_characters set payload=p_state,revision=revision+1,updated_at=now() where user_id=p_user;
 return jsonb_build_object('state',p_state,'revision',c.revision+1,'result',p_result,'replayed',false,'conflict',false);
end;
$$;
revoke all on function moxiu_private.game_load(uuid,jsonb,uuid),moxiu_private.game_commit(uuid,bigint,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function moxiu_private.game_load(uuid,jsonb,uuid),moxiu_private.game_commit(uuid,bigint,uuid,text,jsonb,jsonb,jsonb) to service_role;
create function public.moxiu_game_load(p_user uuid,p_initial jsonb,p_request uuid default null)
returns jsonb language sql security invoker set search_path='' as $$
 select moxiu_private.game_load(p_user,p_initial,p_request);
$$;
create function public.moxiu_game_commit(p_user uuid,p_revision bigint,p_request uuid,p_action text,p_args jsonb,p_state jsonb,p_result jsonb)
returns jsonb language sql security invoker set search_path='' as $$
 select moxiu_private.game_commit(p_user,p_revision,p_request,p_action,p_args,p_state,p_result);
$$;
revoke all on function public.moxiu_game_load(uuid,jsonb,uuid),public.moxiu_game_commit(uuid,bigint,uuid,text,jsonb,jsonb,jsonb) from public,anon,authenticated;
grant execute on function public.moxiu_game_load(uuid,jsonb,uuid),public.moxiu_game_commit(uuid,bigint,uuid,text,jsonb,jsonb,jsonb) to service_role;
-- Retire the experimental wallet API so it cannot become a second spendable wallet.
revoke execute on function public.moxiu_online(text,jsonb),moxiu_private.moxiu_online(text,jsonb) from authenticated;
