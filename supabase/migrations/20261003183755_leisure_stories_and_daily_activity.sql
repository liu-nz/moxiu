create table moxiu_private.player_activity (
 user_id uuid primary key references auth.users(id) on delete cascade,
 signin_day integer, signin_total integer not null default 0, signin_streak integer not null default 0,
 help_day integer
);
create table moxiu_private.player_help (
 id uuid primary key default gen_random_uuid(),
 author uuid not null references auth.users(id) on delete cascade,
 owner uuid not null references auth.users(id) on delete cascade,
 day integer not null, created_at timestamptz not null default now(), claimed_at timestamptz,
 check(author<>owner), unique(author,owner,day)
);
create index player_help_owner on moxiu_private.player_help(owner,created_at) where claimed_at is null;
create index player_help_author_day on moxiu_private.player_help(author,day);
alter table moxiu_private.player_activity enable row level security;
alter table moxiu_private.player_help enable row level security;
revoke all on moxiu_private.player_activity,moxiu_private.player_help from public,anon,authenticated;

create function moxiu_private.activity_context(p_user uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare a moxiu_private.player_activity; h jsonb;
 d int:=floor((extract(epoch from now())+10800)/86400)::int;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 select * into a from moxiu_private.player_activity where user_id=p_user;
 if a.help_day is distinct from d then
  select jsonb_build_object('id',x.id,'author_name',p.role_name) into h
  from moxiu_private.player_help x join public.moxiu_player_profiles p on p.user_id=x.author
  where x.owner=p_user and x.claimed_at is null and x.created_at>now()-interval '24 hours'
   and exists(select 1 from moxiu_private.player_links l where l.status='accepted' and
    ((l.requester=x.author and l.target=p_user) or (l.requester=p_user and l.target=x.author)))
  order by x.created_at,x.id limit 1;
 end if;
 return jsonb_build_object('signInDay',a.signin_day,'signInTotal',coalesce(a.signin_total,0),
  'signInStreak',coalesce(a.signin_streak,0),'helpClaimedDay',a.help_day,'help',h);
end; $$;

alter function moxiu_private.game_load(uuid,jsonb,uuid) rename to game_load_before_activity;
create function moxiu_private.game_load(p_user uuid,p_initial jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 return moxiu_private.game_load_before_activity(p_user,p_initial,p_request)||jsonb_build_object('activity',moxiu_private.activity_context(p_user));
end; $$;

alter function moxiu_private.community_normal_commit(uuid,bigint,uuid,text,jsonb,jsonb,jsonb,jsonb) rename to community_commit_before_activity;
create function moxiu_private.community_normal_commit(p_user uuid,p_revision bigint,p_request uuid,p_action text,p_args jsonb,p_state jsonb,p_result jsonb,p_projection jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c moxiu_private.game_characters; a moxiu_private.player_activity; h moxiu_private.player_help; saved jsonb;
 d int:=floor((extract(epoch from now())+10800)/86400)::int;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 select * into strict c from moxiu_private.game_characters where user_id=p_user for update;
 if c.revision<>p_revision or exists(select 1 from moxiu_private.game_requests where user_id=p_user and request_id=p_request) then
  return moxiu_private.community_commit_before_activity(p_user,p_revision,p_request,p_action,p_args,p_state,p_result,p_projection);
 end if;
 if p_action in ('daily.signIn','daily.claimHelp') and p_result->>'ok'='true' then
  insert into moxiu_private.player_activity(user_id) values(p_user) on conflict do nothing;
  select * into strict a from moxiu_private.player_activity where user_id=p_user for update;
  if p_args<>'[]'::jsonb or (p_result->>'day')::int is distinct from d then raise exception 'Daily reward expired' using errcode='22023'; end if;
  if p_action='daily.signIn' then
   if a.signin_day=d or (p_result->>'reward')::int is distinct from 20 or (p_state#>>'{daily,signInDay}')::int is distinct from d then raise exception 'Already signed in' using errcode='22023'; end if;
   update moxiu_private.player_activity set signin_day=d,signin_total=signin_total+1,
    signin_streak=case when signin_day=d-1 then signin_streak+1 else 1 end where user_id=p_user;
  else
   select * into h from moxiu_private.player_help where id=(p_result->>'helpId')::uuid and owner=p_user for update;
   if a.help_day=d or h.id is null or h.claimed_at is not null or h.created_at<=now()-interval '24 hours'
    or not exists(select 1 from moxiu_private.player_links l where l.status='accepted' and
      ((l.requester=h.author and l.target=p_user) or (l.requester=p_user and l.target=h.author))) then
    raise exception 'Care is unavailable or already claimed' using errcode='22023'; end if;
   update moxiu_private.player_help set claimed_at=now() where id=h.id;
   update moxiu_private.player_activity set help_day=d where user_id=p_user;
  end if;
 end if;
 saved:=moxiu_private.community_commit_before_activity(p_user,p_revision,p_request,p_action,p_args,p_state,p_result,p_projection);
 if saved->>'conflict'='true' then raise exception 'Unexpected activity conflict' using errcode='40001'; end if;
 if p_action='daily.claimHelp' and p_result->>'ok'='true' then
  perform moxiu_private.chat_notice(h.author,'你的同行照料已被领取。');
 end if;
 perform moxiu_private.refresh_titles(p_user);
 return saved;
end; $$;

-- Public social API keeps its existing surface; only friends can send care.
alter function moxiu_private.moxiu_social(text,jsonb) rename to social_before_activity;
revoke all on function moxiu_private.social_before_activity(text,jsonb) from public,anon,authenticated;
create function moxiu_private.moxiu_social(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); target_id uuid; v_help uuid; r jsonb; cards jsonb;
 d int:=floor((extract(epoch from now())+10800)/86400)::int;
begin
 if u is null then raise exception '请先登录账号' using errcode='28000'; end if;
 if p_action='help' then
  if jsonb_typeof(p_data) is distinct from 'object' or p_data-'uid'<>'{}'::jsonb then raise exception '照料参数无效' using errcode='22023'; end if;
  perform user_id from public.moxiu_player_profiles where user_id=u for update;
  select user_id into target_id from public.moxiu_player_profiles where uid=(p_data->>'uid')::bigint;
  if target_id is null or target_id=u or not exists(select 1 from moxiu_private.player_links l where status='accepted' and
   ((requester=u and target=target_id) or(requester=target_id and target=u))) then raise exception '仅能给已互为好友的行者照料' using errcode='42501'; end if;
  if not exists(select 1 from moxiu_private.player_help where author=u and owner=target_id and day=d) then
   if (select count(*) from moxiu_private.player_help where author=u and day=d)>=5 then raise exception '每日最多为五位好友送出照料' using errcode='22023'; end if;
   insert into moxiu_private.player_help(author,owner,day) values(u,target_id,d) returning id into v_help;
   perform moxiu_private.chat_notice(target_id,'好友送来一份同行照料，请在 24 小时内到首页领取。');
  end if;
  delete from moxiu_private.player_help where id in (select id from moxiu_private.player_help where author=u and created_at<now()-interval '30 days' limit 100);
  r:=moxiu_private.social_before_activity('read','{}');
 else r:=moxiu_private.social_before_activity(p_action,p_data); end if;
 select coalesce(jsonb_agg(x.card),'[]') into cards from (
  select f.value||jsonb_build_object('stage',g.stage,'power',g.power,'updated_at',g.updated_at,
    'title',case when t.sku is null then null else jsonb_build_object('name',t.name,'style',t.style,'symbol',t.symbol) end,
    'help_sent',exists(select 1 from moxiu_private.player_help where author=u and owner=p.user_id and day=d)) as card
  from jsonb_array_elements(r->'friends') f join public.moxiu_player_profiles p on p.uid=(f.value->>'uid')::bigint
  left join moxiu_private.player_records g on g.user_id=p.user_id
  left join moxiu_private.shard_wallets w on w.user_id=p.user_id
  left join moxiu_private.shard_catalog t on t.sku=w.equipped_title
 ) x;
 return jsonb_set(r,'{friends}',cards);
end; $$;
revoke all on function moxiu_private.moxiu_social(text,jsonb) from public,anon;
grant execute on function moxiu_private.moxiu_social(text,jsonb) to authenticated;

insert into moxiu_private.shard_catalog(sku,name,price,kind,description,availability,style,symbol) values
 ('title_messenger','两界信使',1,'title','免费：累计交付十份跨界委托。纯展示。','achievement','azure','✉'),
 ('title_all_trades','百业同行',1,'title','免费：完成种田、养殖和采购三类委托。纯展示。','achievement','gold','❖'),
 ('title_herbalist','百草识途',1,'title','免费：集齐五种作物图鉴。纯展示。','achievement','jade','❀'),
 ('title_beast_codex','御灵博闻',1,'title','免费：集齐五种战斗灵兽图鉴。纯展示。','achievement','violet','♧'),
 ('title_ranch_codex','牧野春风',1,'title','免费：集齐三种牧场灵兽图鉴。纯展示。','achievement','jade','♧'),
 ('title_gear_codex','藏器三十五',1,'title','免费：集齐三十五种装备部位与品阶图鉴。纯展示。','achievement','gold','⚒'),
 ('title_relay_aid','两界仁心',1,'title','免费：旧驿来信选择义诊路线并完结。纯展示。','achievement','jade','♡'),
 ('title_relay_search','寻迹行者',1,'title','免费：旧驿来信选择寻人路线并完结。纯展示。','achievement','azure','◇'),
 ('title_relay_keeper','驿路守望',1,'title','免费：旧驿来信选择驿站路线并完结。纯展示。','achievement','gold','✉'),
 ('title_clinic_care','灯火相传',1,'title','免费：两界灯火选择供货路线并完结。纯展示。','achievement','gold','☀'),
 ('title_clinic_study','灵科求真',1,'title','免费：两界灯火选择验证路线并完结。纯展示。','achievement','azure','✧'),
 ('title_signin','七日有约',1,'title','免费：累计签到七天。纯展示。','achievement','jade','☘');

alter function moxiu_private.refresh_titles(uuid) rename to refresh_titles_before_activity;
create function moxiu_private.refresh_titles(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 perform moxiu_private.refresh_titles_before_activity(p_user);
 select payload into s from moxiu_private.game_characters where user_id=p_user;
 if s is null then return; end if;
 insert into moxiu_private.shard_entitlements(user_id,sku,grant_source)
 select p_user,t.sku,'achievement' from (values
 ('title_messenger',coalesce((s#>>'{commissions,total}')::int,0)>=10),
 ('title_all_trades',coalesce(s#>'{commissions,sources}','[]') @> '["farm","ranch","market"]'),
 ('title_herbalist',coalesce(s#>'{collection,crops}','[]') @> '["lingmi","huangjing","bainian","binglian","jiuzhuan"]'),
 ('title_beast_codex',coalesce(s#>'{collection,beasts}','[]') @> '["linghu","canglang","xuangui","huofeng","pixiu"]'),
 ('title_ranch_codex',coalesce(s#>'{collection,ranch}','[]') @> '["lingji","lingyang","linglu"]'),
 ('title_gear_codex',jsonb_array_length(coalesce(s#>'{collection,equipment}','[]'))>=35),
 ('title_relay_aid',s#>>'{tales,flags,relay_complete}'='aid'),
 ('title_relay_search',s#>>'{tales,flags,relay_complete}'='search'),
 ('title_relay_keeper',s#>>'{tales,flags,relay_complete}' in ('carry','keep')),
 ('title_clinic_care',s#>>'{tales,flags,clinic_complete}'='care'),
 ('title_clinic_study',s#>>'{tales,flags,clinic_complete}'='study'),
 ('title_signin',coalesce((select signin_total from moxiu_private.player_activity where user_id=p_user),0)>=7)
 ) t(sku,earned) where earned on conflict(user_id,sku) do nothing;
end; $$;

-- Only verified Edge settlement may inspect reward context or mutate assets.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='moxiu_private' and p.proname in ('activity_context','game_load','game_load_before_activity','community_normal_commit','community_commit_before_activity','refresh_titles','refresh_titles_before_activity') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end; $$;
