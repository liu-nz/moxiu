create table moxiu_private.player_records (
 user_id uuid primary key references auth.users(id) on delete cascade,
 stage integer not null default 0 check(stage between 0 and 41),
 power double precision not null default 0 check(power between 0 and 1e30),
 wealth double precision not null default 0 check(wealth between 0 and 9e15),
 speed double precision not null default 0 check(speed between 0 and 1e30),
 market_linked boolean not null default false,
 arena_joined boolean not null default false,
 season text not null default '', rating integer not null default 1000 check(rating>=0),
 games integer not null default 0, wins integer not null default 0, losses integer not null default 0, draws integer not null default 0,
 updated_at timestamptz not null default now()
);
create index player_records_power on moxiu_private.player_records(power desc,user_id);
create index player_records_rating on moxiu_private.player_records(season,rating desc,user_id) where arena_joined;
create table moxiu_private.player_orders (
 id uuid primary key default gen_random_uuid(), owner uuid not null references auth.users(id) on delete cascade,
 item jsonb not null, quantity integer not null check(quantity between 1 and 1000),
 remaining integer not null check(remaining between 0 and quantity),
 price bigint not null check(price between 1 and 1000000000), currency text not null check(currency in ('stone','cny')),
 status text not null default 'active' check(status in ('active','sold','cancelled')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '72 hours'
);
create index player_orders_market on moxiu_private.player_orders(created_at desc) where status='active';
create index player_orders_owner on moxiu_private.player_orders(owner,status);
create table moxiu_private.player_trades (
 id uuid primary key default gen_random_uuid(), request_id uuid not null,
 buyer uuid not null references auth.users(id) on delete cascade, seller uuid not null references auth.users(id) on delete cascade,
 order_id uuid not null references moxiu_private.player_orders(id),
 item jsonb not null, quantity integer not null, currency text not null,
 total bigint not null, fee bigint not null, created_at timestamptz not null default now(), unique(buyer,request_id)
);
create index player_trades_buyer on moxiu_private.player_trades(buyer,created_at desc);
create index player_trades_seller on moxiu_private.player_trades(seller,created_at desc);
create table moxiu_private.player_matches (
 id uuid primary key default gen_random_uuid(), request_id uuid not null,
 challenger uuid not null references auth.users(id) on delete cascade, defender uuid not null references auth.users(id) on delete cascade,
 day date not null, pair text not null, season text not null, score numeric not null check(score in (0,.5,1)),
 rating_before integer not null, rating_after integer not null, target_before integer not null, target_after integer not null,
 rounds integer not null, created_at timestamptz not null default now(), unique(challenger,request_id), unique(day,pair)
);
create index player_matches_challenger_day on moxiu_private.player_matches(challenger,day);
create index player_matches_defender on moxiu_private.player_matches(defender,created_at desc);
alter table moxiu_private.player_records enable row level security;
alter table moxiu_private.player_orders enable row level security;
alter table moxiu_private.player_trades enable row level security;
alter table moxiu_private.player_matches enable row level security;
revoke all on moxiu_private.player_records,moxiu_private.player_orders,moxiu_private.player_trades,moxiu_private.player_matches from public,anon,authenticated;

create function moxiu_private.community_publish(p_user uuid,p_projection jsonb)
returns void language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 insert into moxiu_private.player_records(user_id,stage,power,wealth,speed)
 values(p_user,(p_projection->>'stage')::int,(p_projection->>'power')::double precision,(p_projection->>'wealth')::double precision,(p_projection->>'speed')::double precision)
 on conflict(user_id) do update set stage=excluded.stage,power=excluded.power,wealth=excluded.wealth,speed=excluded.speed,updated_at=now();
end; $$;

create function moxiu_private.community_normal_commit(p_user uuid,p_revision bigint,p_request uuid,p_action text,p_args jsonb,p_state jsonb,p_result jsonb,p_projection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare saved jsonb; linked boolean; c moxiu_private.game_characters; v_projection jsonb:=p_projection;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 select * into strict c from moxiu_private.game_characters where user_id=p_user for update;
 select market_linked into linked from moxiu_private.player_records where user_id=p_user;
 if p_action in ('reset','reincarnation.ascend') and p_result->>'ok'='true' and not exists(select 1 from moxiu_private.game_requests where user_id=p_user and request_id=p_request) then
  if exists(select 1 from moxiu_private.player_orders where owner=p_user and status='active') then
   p_state:=c.payload; p_result:='{"ok":false,"reason":"请先撤回玩家挂单，再清档或轮回。"}'; v_projection:=null;
  elsif p_action='reset' and coalesce(linked,false) then
   p_state:=jsonb_set(p_state,'{currency}','{"stone":0,"cny":0}'); v_projection:=jsonb_set(v_projection,'{wealth}','0');
  end if;
 end if;
 saved:=moxiu_private.game_commit(p_user,p_revision,p_request,p_action,p_args,p_state,p_result);
 if saved->>'conflict'='false' and saved->>'replayed'='false' and v_projection is not null then perform moxiu_private.community_publish(p_user,v_projection); end if;
 return saved||jsonb_build_object('market_linked',coalesce(linked,false));
end; $$;
create function public.moxiu_game_commit_v2(p_user uuid,p_revision bigint,p_request uuid,p_action text,p_args jsonb,p_state jsonb,p_result jsonb,p_projection jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select moxiu_private.community_normal_commit(p_user,p_revision,p_request,p_action,p_args,p_state,p_result,p_projection); $$;

create function moxiu_private.community_context(p_user uuid,p_action text,p_args jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare o moxiu_private.player_orders; a moxiu_private.player_records; b moxiu_private.player_records;
 target_id uuid; t moxiu_private.game_characters; owned jsonb; s text:=to_char(now() at time zone 'Asia/Shanghai','YYYY-MM');
 d date:=(now() at time zone 'Asia/Shanghai'-interval '5 hours')::date; count_today int;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 select * into a from moxiu_private.player_records where user_id=p_user;
 if p_action in ('exchange.buy','exchange.cancel') then
  select * into o from moxiu_private.player_orders where id=(p_args->>0)::uuid; target_id:=o.owner;
 elsif p_action='arena.challenge' then select user_id into target_id from public.moxiu_player_profiles where uid=(p_args->>0)::bigint; end if;
 if target_id is not null and target_id<>p_user then
  select * into t from moxiu_private.game_characters where user_id=target_id;
  select coalesce(jsonb_agg(sku),'[]') into owned from moxiu_private.shard_entitlements where user_id=target_id;
 end if;
 select * into b from moxiu_private.player_records where user_id=target_id;
 select count(*) into count_today from moxiu_private.player_matches where challenger=p_user and day=d;
 return jsonb_build_object('order',case when o.id is null then null else to_jsonb(o) end,'mine',target_id=p_user,
 'target',case when t.user_id is null then null else jsonb_build_object('id',t.user_id,'state',t.payload,'revision',t.revision,'owned',owned) end,
 'active_orders',(select count(*) from moxiu_private.player_orders where owner=p_user and status='active'),
 'enrolled',coalesce(a.arena_joined,false),'target_enrolled',coalesce(b.arena_joined,false),
 'season',s,'rating',case when a.season=s then a.rating else 1000 end,'target_rating',case when b.season=s then b.rating else 1000 end,
 'challenges_today',count_today,'pair_used',exists(select 1 from moxiu_private.player_matches where day=d and pair=least(p_user,target_id)::text||':'||greatest(p_user,target_id)::text));
end; $$;
create function public.moxiu_shared_context(p_user uuid,p_action text,p_args jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select moxiu_private.community_context(p_user,p_action,p_args); $$;

create function moxiu_private.community_shared_commit(p_user uuid,p_revision bigint,p_request uuid,p_action text,p_args jsonb,p_state jsonb,p_result jsonb,p_projection jsonb,
 p_target uuid,p_target_revision bigint,p_target_state jsonb,p_target_projection jsonb,p_effect jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c moxiu_private.game_characters; t moxiu_private.game_characters; o moxiu_private.player_orders;
 a moxiu_private.player_records; b moxiu_private.player_records; saved jsonb; total bigint; fee bigint; qty int;
 s text:=to_char(now() at time zone 'Asia/Shanghai','YYYY-MM');d date:=(now() at time zone 'Asia/Shanghai'-interval '5 hours')::date;
 pair_id text:=least(p_user,p_target)::text||':'||greatest(p_user,p_target)::text; left_rating int; right_rating int;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 -- Both accounts always lock in UUID order. Normal commands also lock character before community rows.
 perform user_id from moxiu_private.game_characters where user_id=p_user or user_id=p_target order by user_id for update;
 select * into strict c from moxiu_private.game_characters where user_id=p_user;
 if exists(select 1 from moxiu_private.game_requests where user_id=p_user and request_id=p_request) then
  return moxiu_private.community_normal_commit(p_user,p_revision,p_request,p_action,p_args,p_state,p_result,p_projection);
 end if;
 if c.revision<>p_revision then return jsonb_build_object('state',c.payload,'revision',c.revision,'conflict',true); end if;
 if p_target is not null then
  select * into t from moxiu_private.game_characters where user_id=p_target;
  if t.user_id is null or t.revision<>p_target_revision then return jsonb_build_object('state',c.payload,'revision',c.revision,'conflict',true); end if;
  if p_target=p_user or jsonb_typeof(p_target_state->'inventory') is distinct from 'array' or p_target_state->'world'->>'mode' is distinct from 'standard' or
    jsonb_typeof(p_target_state->'currency'->'cny') is distinct from 'number' or jsonb_typeof(p_target_state->'currency'->'stone') is distinct from 'number' or
    (p_target_state->'currency'->>'cny')::numeric not between 0 and 9000000000000000 or (p_target_state->'currency'->>'stone')::numeric not between 0 and 9000000000000000 then raise exception 'Invalid counterpart settlement' using errcode='22023'; end if;
 end if;
 if p_result->>'ok' is distinct from 'true' then raise exception 'Shared commit requires valid operation' using errcode='22023'; end if;
 if p_action='exchange.list' then
  if (p_state->'player'->>'stage')::int<2 or (p_state->>'playMs')::bigint<1800000 then raise exception 'Market locked' using errcode='22023'; end if;
  if (select count(*) from moxiu_private.player_orders where owner=p_user and status='active') >= least(8,(p_effect->>'slots')::int) then raise exception 'Listing slots full' using errcode='22023'; end if;
  insert into moxiu_private.player_orders(id,owner,item,quantity,remaining,price,currency)
   values(p_request,p_user,p_effect->'entry',(p_args->>1)::int,(p_args->>1)::int,(p_args->>2)::bigint,p_args->>3);
  p_result:=p_result||jsonb_build_object('order_id',p_request);
 elsif p_action in ('exchange.buy','exchange.cancel') then
  select * into o from moxiu_private.player_orders where id=(p_args->>0)::uuid for update;
  if o.id is null or o.status<>'active' then return jsonb_build_object('state',c.payload,'revision',c.revision,'conflict',true); end if;
  if p_action='exchange.cancel' then
   if o.owner<>p_user then raise exception 'Not your listing' using errcode='42501'; end if;
   if (p_result->>'returned')::int<>o.remaining then return jsonb_build_object('state',c.payload,'revision',c.revision,'conflict',true); end if;
   update moxiu_private.player_orders set status='cancelled',remaining=0 where id=o.id;
  else
   qty:=(p_args->>1)::int; total:=qty*o.price; fee:=ceil(total*.02);
   if o.owner is distinct from p_target or qty<1 or qty>o.remaining or o.expires_at<=now() then return jsonb_build_object('state',c.payload,'revision',c.revision,'conflict',true); end if;
   if (p_effect->>'total')::bigint<>total or (p_effect->>'fee')::bigint<>fee then raise exception 'Price changed' using errcode='22023'; end if;
   update moxiu_private.player_orders set remaining=remaining-qty,status=case when remaining=qty then 'sold' else 'active' end where id=o.id;
   insert into moxiu_private.player_trades(request_id,buyer,seller,order_id,item,quantity,currency,total,fee) values(p_request,p_user,p_target,o.id,o.item,qty,o.currency,total,fee);
  end if;
 elsif p_action='arena.enroll' then
  if (p_state->'player'->>'stage')::int<2 then raise exception 'Arena locked' using errcode='22023'; end if;
 elsif p_action='arena.challenge' then
  if p_target is null or p_effect->>'season'<>s then return jsonb_build_object('state',c.payload,'revision',c.revision,'conflict',true); end if;
  select * into a from moxiu_private.player_records where user_id=p_user;
  select * into b from moxiu_private.player_records where user_id=p_target;
  left_rating:=case when a.season=s then a.rating else 1000 end; right_rating:=case when b.season=s then b.rating else 1000 end;
  if not coalesce(a.arena_joined,false) or not coalesce(b.arena_joined,false) then raise exception 'Arena enrollment required' using errcode='22023'; end if;
  if (select count(*) from moxiu_private.player_matches where challenger=p_user and day=d)>=5 or exists(select 1 from moxiu_private.player_matches where day=d and pair=pair_id) then
   return jsonb_build_object('state',c.payload,'revision',c.revision,'conflict',true);
  end if;
  if abs(left_rating-right_rating)>300 or abs((p_state->'player'->>'stage')::int-(p_target_state->'player'->>'stage')::int)>3 then raise exception 'Match outside band' using errcode='22023'; end if;
  insert into moxiu_private.player_matches(request_id,challenger,defender,day,pair,season,score,rating_before,rating_after,target_before,target_after,rounds)
   values(p_request,p_user,p_target,d,pair_id,s,(p_effect->'battle'->>'score')::numeric,left_rating,(p_effect->>'rating')::int,right_rating,(p_effect->>'target_rating')::int,(p_effect->'battle'->>'rounds')::int);
 else raise exception 'Unknown shared operation' using errcode='22023'; end if;
 saved:=moxiu_private.game_commit(p_user,p_revision,p_request,p_action,p_args,p_state,p_result);
 perform moxiu_private.community_publish(p_user,p_projection);
 if p_target is not null then
  update moxiu_private.game_characters set payload=p_target_state,revision=revision+1,updated_at=now() where user_id=p_target;
  perform moxiu_private.community_publish(p_target,p_target_projection);
 end if;
 if p_action in ('exchange.list','exchange.buy') then update moxiu_private.player_records set market_linked=true where user_id=p_user or user_id=p_target; end if;
 if p_action='arena.enroll' then update moxiu_private.player_records set arena_joined=true where user_id=p_user; end if;
 if p_action='arena.challenge' then
  update moxiu_private.player_records set season=s,rating=case when user_id=p_user then (p_effect->>'rating')::int else (p_effect->>'target_rating')::int end,
   games=case when season=s then games else 0 end+1,
   wins=case when season=s then wins else 0 end+case when (user_id=p_user and p_effect->'battle'->>'score'='1') or (user_id=p_target and p_effect->'battle'->>'score'='0') then 1 else 0 end,
   losses=case when season=s then losses else 0 end+case when (user_id=p_user and p_effect->'battle'->>'score'='0') or (user_id=p_target and p_effect->'battle'->>'score'='1') then 1 else 0 end,
   draws=case when season=s then draws else 0 end+case when (p_effect->'battle'->>'score')::numeric=.5 then 1 else 0 end where user_id=p_user or user_id=p_target;
 end if;
 return saved||jsonb_build_object('market_linked',coalesce((select market_linked from moxiu_private.player_records where user_id=p_user),false));
end; $$;
create function public.moxiu_shared_commit(p_user uuid,p_revision bigint,p_request uuid,p_action text,p_args jsonb,p_state jsonb,p_result jsonb,p_projection jsonb,
 p_target uuid,p_target_revision bigint,p_target_state jsonb,p_target_projection jsonb,p_effect jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select moxiu_private.community_shared_commit(p_user,p_revision,p_request,p_action,p_args,p_state,p_result,p_projection,p_target,p_target_revision,p_target_state,p_target_projection,p_effect); $$;

create function moxiu_private.community_read(p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_offers jsonb;v_mine jsonb;v_power jsonb;v_arena jsonb;v_opponents jsonb;v_history jsonb;v_trades jsonb;v_self jsonb;
 s text:=to_char(now() at time zone 'Asia/Shanghai','YYYY-MM');d date:=(now() at time zone 'Asia/Shanghai'-interval '5 hours')::date;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 select coalesce(jsonb_agg(x),'[]') into v_offers from(select o.id,o.item,o.remaining,o.price,o.currency,o.expires_at,p.uid,p.role_name,o.owner=p_user as mine from moxiu_private.player_orders o join public.moxiu_player_profiles p on p.user_id=o.owner where o.status='active' and o.expires_at>now() order by o.created_at desc limit 50)x;
 select coalesce(jsonb_agg(x),'[]') into v_mine from(select o.id,o.item,o.remaining,o.price,o.currency,o.expires_at from moxiu_private.player_orders o where o.owner=p_user and o.status='active' order by o.created_at desc limit 8)x;
 select coalesce(jsonb_agg(x),'[]') into v_power from(select p.uid,p.role_name,r.stage,r.power,r.updated_at,r.user_id=p_user as mine,row_number() over(order by r.power desc,p.uid) as rank from moxiu_private.player_records r join public.moxiu_player_profiles p on p.user_id=r.user_id order by r.power desc,p.uid limit 50)x;
 select coalesce(jsonb_agg(x),'[]') into v_arena from(select p.uid,p.role_name,r.stage,r.rating,r.games,r.wins,r.losses,r.draws,r.user_id=p_user as mine,row_number() over(order by r.rating desc,r.wins desc,p.uid) as rank from moxiu_private.player_records r join public.moxiu_player_profiles p on p.user_id=r.user_id where r.arena_joined and r.season=s and r.games>=3 order by r.rating desc,r.wins desc,p.uid limit 50)x;
 select coalesce(jsonb_agg(x),'[]') into v_opponents from(select p.uid,p.role_name,r.stage,r.power,case when r.season=s then r.rating else 1000 end as rating,
 exists(select 1 from moxiu_private.player_matches m where m.day=d and m.pair=least(p_user,r.user_id)::text||':'||greatest(p_user,r.user_id)::text) as used_today
 from moxiu_private.player_records r join public.moxiu_player_profiles p on p.user_id=r.user_id where r.arena_joined and r.stage>=2 and r.user_id<>p_user order by abs(r.stage-coalesce((select stage from moxiu_private.player_records where user_id=p_user),0)),r.power desc limit 20)x;
 select jsonb_build_object('joined',r.arena_joined,'market_linked',r.market_linked,'rating',case when r.season=s then r.rating else 1000 end,'games',case when r.season=s then r.games else 0 end,
 'power_rank',1+(select count(*) from moxiu_private.player_records r2 join public.moxiu_player_profiles p2 on p2.user_id=r2.user_id where r2.power>r.power or(r2.power=r.power and p2.uid<p.uid)),
 'arena_rank',case when r.season=s and r.games>=3 then 1+(select count(*) from moxiu_private.player_records r2 join public.moxiu_player_profiles p2 on p2.user_id=r2.user_id where r2.arena_joined and r2.season=s and r2.games>=3 and (r2.rating>r.rating or(r2.rating=r.rating and (r2.wins>r.wins or(r2.wins=r.wins and p2.uid<p.uid))))) else null end)
 into v_self from moxiu_private.player_records r join public.moxiu_player_profiles p on p.user_id=r.user_id where r.user_id=p_user;
 select coalesce(jsonb_agg(x),'[]') into v_history from(select a.uid as challenger_uid,a.role_name as challenger_name,b.uid as defender_uid,b.role_name as defender_name,m.score,m.rounds,m.season,m.created_at,m.challenger=p_user as initiated,
 case when m.challenger=p_user then m.rating_after-m.rating_before else m.target_after-m.target_before end as delta
 from moxiu_private.player_matches m join public.moxiu_player_profiles a on a.user_id=m.challenger join public.moxiu_player_profiles b on b.user_id=m.defender where m.challenger=p_user or m.defender=p_user order by m.created_at desc limit 20)x;
 select coalesce(jsonb_agg(x),'[]') into v_trades from(select t.item,t.quantity,t.currency,t.total,t.fee,t.created_at,t.seller=p_user as sold,a.uid as buyer_uid,b.uid as seller_uid from moxiu_private.player_trades t join public.moxiu_player_profiles a on a.user_id=t.buyer join public.moxiu_player_profiles b on b.user_id=t.seller where t.buyer=p_user or t.seller=p_user order by t.created_at desc limit 20)x;
 return jsonb_build_object('season',s,'self',v_self,'offers',v_offers,'mine',v_mine,'power_board',v_power,'arena_board',v_arena,'opponents',v_opponents,'matches',v_history,'trades',v_trades,
 'challenges_today',(select count(*) from moxiu_private.player_matches where challenger=p_user and day=d),'player_count',(select count(*) from moxiu_private.player_records),'server_time',now());
end; $$;
create function public.moxiu_community_read(p_user uuid)
returns jsonb language sql security invoker set search_path='' as $$ select moxiu_private.community_read(p_user); $$;

-- Every new RPC is service-only. Private tables deliberately have no client policies.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace where
 (n.nspname='moxiu_private' and p.proname in ('community_publish','community_normal_commit','community_context','community_shared_commit','community_read')) or
 (n.nspname='public' and p.proname in ('moxiu_game_commit_v2','moxiu_shared_context','moxiu_shared_commit','moxiu_community_read')) loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end; $$;
