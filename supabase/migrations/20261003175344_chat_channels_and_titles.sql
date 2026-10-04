alter table moxiu_private.shard_catalog
 add column availability text not null default 'shop' check(availability in ('shop','achievement','exclusive')),
 add column style text not null default 'ink' check(style in ('ink','jade','azure','violet','gold','rainbow')),
 add column symbol text not null default '◇';
alter table moxiu_private.shard_entitlements add column grant_source text not null default 'purchase';
update moxiu_private.shard_catalog set style='jade',symbol='☁' where sku='title_cloud';
update moxiu_private.shard_catalog set style='azure',symbol='◇' where sku='title_gate';
update moxiu_private.shard_catalog set style='violet',symbol='✦' where sku='title_ink';
insert into moxiu_private.shard_catalog(sku,name,price,kind,description,availability,style,symbol) values
 ('title_newcomer','初入红尘',1,'title','免费：创建服务器角色。纯展示。','achievement','ink','·'),
 ('title_first_cross','界门初开',1,'title','免费：完成一次穿越。纯展示。','achievement','azure','◇'),
 ('title_gardener','灵田行者',1,'title','免费：收集三种作物图鉴。纯展示。','achievement','jade','❀'),
 ('title_beastmaster','御灵使',1,'title','免费：拥有两只战斗灵兽。纯展示。','achievement','jade','♧'),
 ('title_foundation','筑基道友',1,'title','免费：达到筑基期。纯展示。','achievement','azure','✧'),
 ('title_core','金丹真人',1,'title','免费：达到金丹期。纯展示。','achievement','gold','☀'),
 ('title_veteran','百战修士',1,'title','免费：赢得一百次秘境战斗。纯展示。','achievement','violet','⚔'),
 ('title_reborn','轮回见证',1,'title','免费：完成一次飞升轮回。纯展示。','achievement','gold','∞'),
 ('title_star','星河拾梦',300,'title','星蓝称号与星芒符号。纯展示，不增加属性。','shop','azure','✦'),
 ('title_lotus','紫莲道心',400,'title','紫色称号与莲纹符号。纯展示，不增加属性。','shop','violet','❀'),
 ('title_dragon','御龙听风',500,'title','金色称号与龙鳞符号。纯展示，不增加属性。','shop','gold','❖'),
 ('title_sword','剑映九霄',600,'title','紫色称号与剑锋符号。纯展示，不增加属性。','shop','violet','⚔'),
 ('title_moon','月下仙君',800,'title','金色称号与月轮符号。纯展示，不增加属性。','shop','gold','☾'),
 ('title_heaven','天道共鸣',1000,'title','流动彩虹称号与冠冕符号。纯展示，不增加属性。','shop','rainbow','♛'),
 ('title_creator','创世神',1,'title','作者专属：五项基础属性及修炼速度×100。论道和实力榜不应用专属加成；不可购买。','exclusive','rainbow','✺');

create table moxiu_private.chat_messages (
 id bigint generated always as identity primary key,
 sender_id uuid references auth.users(id) on delete cascade,
 receiver_id uuid references auth.users(id) on delete cascade,
 request_id uuid,
 channel text not null check(channel in ('public','private','broadcast','system')),
 kind text not null default 'message' check(kind in ('message','shout','announcement','notice')),
 content text not null check(length(content) between 1 and 300),
 author_uid bigint,
 author_name text not null,
 author_title jsonb,
 created_at timestamptz not null default clock_timestamp(),
 deleted_at timestamptz,
 unique(sender_id,request_id),
 check((channel='private' and sender_id is not null and receiver_id is not null and sender_id<>receiver_id)
    or (channel in ('public','broadcast') and sender_id is not null and receiver_id is null)
    or (channel='system' and sender_id is null and receiver_id is not null))
);
create index chat_public_recent on moxiu_private.chat_messages(channel,id desc) where channel in ('public','broadcast') and deleted_at is null;
create index chat_receiver_recent on moxiu_private.chat_messages(receiver_id,id desc) where receiver_id is not null;
create index chat_sender_recent on moxiu_private.chat_messages(sender_id,created_at desc);
create index chat_retention on moxiu_private.chat_messages(created_at);
alter table moxiu_private.chat_messages enable row level security;
revoke all on moxiu_private.chat_messages from public,anon,authenticated;

create function moxiu_private.chat_notice(p_user uuid,p_text text)
returns void language sql security definer set search_path='' as $$
 insert into moxiu_private.chat_messages(receiver_id,channel,kind,content,author_name)
 values(p_user,'system','notice',left(p_text,300),'天道');
$$;
create function moxiu_private.title_notice()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if exists(select 1 from moxiu_private.shard_catalog where sku=new.sku and kind='title') then
  perform moxiu_private.chat_notice(new.user_id,'获得称号「'||(select name from moxiu_private.shard_catalog where sku=new.sku)||'」。在称号收藏中佩戴后，发言会展示称号。');
 end if;
 return new;
end; $$;
create trigger title_granted_chat after insert on moxiu_private.shard_entitlements for each row execute function moxiu_private.title_notice();

create function moxiu_private.refresh_titles(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 select payload into s from moxiu_private.game_characters where user_id=p_user;
 if s is null then return; end if;
 insert into moxiu_private.shard_entitlements(user_id,sku,grant_source)
 select p_user,t.sku,'achievement' from (values
  ('title_newcomer',true),
  ('title_first_cross',coalesce((s#>>'{stats,crossings}')::numeric,0)>=1),
  ('title_gardener',jsonb_array_length(coalesce(s#>'{collection,crops}','[]'))>=3),
  ('title_beastmaster',jsonb_array_length(coalesce(s#>'{beasts,owned}','[]'))>=2),
  ('title_foundation',coalesce((s#>>'{player,stage}')::int,0)>=10),
  ('title_core',coalesce((s#>>'{player,stage}')::int,0)>=14),
  ('title_veteran',coalesce((s#>>'{stats,wins}')::numeric,0)>=100),
  ('title_reborn',coalesce((s#>>'{reincarnation,count}')::int,0)>=1)
 ) t(sku,earned) where earned on conflict(user_id,sku) do nothing;
end; $$;

-- Keep the original audited recharge implementation behind a title-aware wrapper.
alter function moxiu_private.shards(text,jsonb) rename to shards_recharge;
revoke all on function moxiu_private.shards_recharge(text,jsonb) from public,anon,authenticated;
create function moxiu_private.shards(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
begin
 if auth.uid() is null then raise exception '请先登录账号' using errcode='28000'; end if;
 perform moxiu_private.refresh_titles(auth.uid());
 if p_action='purchase' and exists(select 1 from moxiu_private.shard_catalog where sku=p_data->>'sku' and availability<>'shop') then
  raise exception '这个称号通过成就或专属授予获得，不能购买' using errcode='22023';
 end if;
 return moxiu_private.shards_recharge(p_action,p_data);
end; $$;
revoke all on function moxiu_private.shards(text,jsonb) from public,anon;
grant execute on function moxiu_private.shards(text,jsonb) to authenticated;

create function moxiu_private.chat_read(p_user uuid)
returns jsonb language sql security definer set search_path='' as $$
 with public_rows as (select * from moxiu_private.chat_messages where channel='public' and deleted_at is null order by id desc limit 50),
 shout_rows as (select * from moxiu_private.chat_messages where channel='broadcast' and deleted_at is null order by id desc limit 50),
 private_rows as (select * from moxiu_private.chat_messages where channel='private' and (sender_id=p_user or receiver_id=p_user) and deleted_at is null order by id desc limit 100),
 system_rows as (select * from moxiu_private.chat_messages where channel='system' and receiver_id=p_user order by id desc limit 50),
 visible as (select * from public_rows union all select * from shout_rows union all select * from private_rows union all select * from system_rows)
 select jsonb_build_object(
 'messages',coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'channel',m.channel,'kind',m.kind,'content',m.content,
  'uid',m.author_uid,'role_name',m.author_name,'title',m.author_title,'mine',m.sender_id=p_user,
  'peer_uid',case when m.channel='private' then pp.uid end,'peer_name',case when m.channel='private' then pp.role_name end,
  'created_at',m.created_at) order by m.id) from visible m left join public.moxiu_player_profiles pp
  on pp.user_id=case when m.sender_id=p_user then m.receiver_id else m.sender_id end),'[]'::jsonb),
 'self',(select jsonb_build_object('uid',uid,'role_name',role_name) from public.moxiu_player_profiles where user_id=p_user),
 'admin',exists(select 1 from moxiu_private.shard_admins where user_id=p_user),
 'server_time',clock_timestamp());
$$;

create function moxiu_private.chat(p_action text,p_data jsonb)
returns jsonb language plpgsql security definer set search_path='' as $$
declare u uuid:=auth.uid(); a boolean; p public.moxiu_player_profiles; c moxiu_private.chat_messages;
 target uuid; v_id uuid; ch text; txt text; k text; v_title jsonb; v_uid bigint;
begin
 if u is null or not exists(select 1 from auth.users where id=u) then raise exception '请先登录账号' using errcode='28000'; end if;
 if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception '请求格式无效' using errcode='22023'; end if;
 select * into p from public.moxiu_player_profiles where user_id=u for update;
 if p.user_id is null then raise exception '请先完成账号档案' using errcode='22023'; end if;
 select exists(select 1 from moxiu_private.shard_admins where user_id=u) into a;
 perform moxiu_private.refresh_titles(u);
 if p_action='send' then
  if exists(select 1 from jsonb_object_keys(p_data) x where x not in ('id','channel','content','uid','announcement')) then
   raise exception '不接受客户端称号或身份' using errcode='22023'; end if;
  ch:=p_data->>'channel';txt:=btrim(p_data->>'content');v_id:=(p_data->>'id')::uuid;
  if ch is null or ch not in ('public','private','broadcast') or txt is null or length(txt) not between 1 and 300 or v_id is null then
   raise exception '请选择频道并输入1–300字消息' using errcode='22023'; end if;
  if coalesce((p_data->>'announcement')::boolean,false) and (not a or ch<>'broadcast') then
   raise exception '只有管理员可发布公告' using errcode='42501'; end if;
  k:=case when ch='broadcast' then case when coalesce((p_data->>'announcement')::boolean,false) then 'announcement' else 'shout' end else 'message' end;
  if ch='private' then
   v_uid:=(p_data->>'uid')::bigint;
   select user_id into target from public.moxiu_player_profiles where uid=v_uid;
   if target is null or target=u then raise exception '请输入其他玩家的有效UID' using errcode='22023'; end if;
  elsif p_data ? 'uid' then raise exception '这个频道无需收件人' using errcode='22023'; end if;
  select * into c from moxiu_private.chat_messages where sender_id=u and request_id=v_id;
  if c.id is not null then
   if c.channel<>ch or c.content<>txt or c.receiver_id is distinct from target or c.kind<>k then
    raise exception '同一编号不能发送不同消息' using errcode='22023'; end if;
   return moxiu_private.chat_read(u);
  end if;
  if exists(select 1 from moxiu_private.chat_messages where sender_id=u and created_at>clock_timestamp()-interval '5 seconds') then
   raise exception '请等待5秒再发言' using errcode='22023'; end if;
  if ch='broadcast' and exists(select 1 from moxiu_private.chat_messages where sender_id=u and channel=ch and created_at>clock_timestamp()-interval '60 seconds') then
   raise exception '喊话每60秒一次' using errcode='22023'; end if;
  if (select count(*) from moxiu_private.chat_messages where sender_id=u and created_at>clock_timestamp()-interval '24 hours')>=500 then
   raise exception '今日发言已达500条，请明日再来' using errcode='22023'; end if;
  select jsonb_build_object('sku',cat.sku,'name',cat.name,'style',cat.style,'symbol',cat.symbol) into v_title
   from moxiu_private.shard_wallets w join moxiu_private.shard_catalog cat on cat.sku=w.equipped_title
   join moxiu_private.shard_entitlements e on e.user_id=w.user_id and e.sku=cat.sku
   where w.user_id=u and cat.kind='title';
  insert into moxiu_private.chat_messages(sender_id,receiver_id,request_id,channel,kind,content,author_uid,author_name,author_title)
   values(u,target,v_id,ch,k,txt,p.uid,p.role_name,v_title);
 elsif p_action='delete' then
  if exists(select 1 from jsonb_object_keys(p_data) x where x<>'id') then raise exception '参数无效' using errcode='22023'; end if;
  update moxiu_private.chat_messages set deleted_at=clock_timestamp() where id=(p_data->>'id')::bigint and (sender_id=u or a) and channel<>'system';
  if not found then raise exception '不能撤回这条消息' using errcode='42501'; end if;
 elsif p_action<>'read' then raise exception '操作不存在' using errcode='22023';
 end if;
 -- Bounded opportunistic retention; never deletes more than 200 rows per call.
 delete from moxiu_private.chat_messages where id in (select id from moxiu_private.chat_messages where created_at<clock_timestamp()-interval '30 days' order by created_at limit 200);
 return moxiu_private.chat_read(u);
end; $$;
create function public.moxiu_chat(p_action text,p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path='' as $$ select moxiu_private.chat(p_action,p_data); $$;
revoke all on function public.moxiu_chat(text,jsonb),moxiu_private.chat(text,jsonb) from public,anon;
grant execute on function public.moxiu_chat(text,jsonb),moxiu_private.chat(text,jsonb) to authenticated;

create function moxiu_private.community_chat_notice()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if tg_table_name='player_trades' then
  perform moxiu_private.chat_notice(new.buyer,'玩家交易成交：买入'||new.quantity||'件，支付'||new.total||case when new.currency='cny' then '游戏人民币。' else '灵石。' end);
  perform moxiu_private.chat_notice(new.seller,'玩家交易成交：售出'||new.quantity||'件，扣手续费'||new.fee||'，到账'||(new.total-new.fee)||case when new.currency='cny' then '游戏人民币。' else '灵石。' end);
 elsif tg_table_name='player_matches' then
  perform moxiu_private.chat_notice(new.challenger,'论道已结算：'||new.rounds||'回合，积分'||new.rating_before||'→'||new.rating_after||'。');
  perform moxiu_private.chat_notice(new.defender,'收到一次论道挑战：'||new.rounds||'回合，积分'||new.target_before||'→'||new.target_after||'。');
 elsif tg_table_name='shard_orders' and new.status is distinct from old.status then
  perform moxiu_private.chat_notice(new.user_id,'赞赏申请状态更新：'||case new.status when 'approved' then '已到账 '||(new.amount*10)||'天道碎片' when 'refunded' then '已登记退款并冲回碎片' when 'cancelled' then '未付款申请已取消' when 'rejected' then '已驳回，请查看充值记录' else new.status end||'。');
 end if;
 return new;
end; $$;
create trigger trade_chat_notice after insert on moxiu_private.player_trades for each row execute function moxiu_private.community_chat_notice();
create trigger duel_chat_notice after insert on moxiu_private.player_matches for each row execute function moxiu_private.community_chat_notice();
create trigger recharge_chat_notice after update on moxiu_private.shard_orders for each row execute function moxiu_private.community_chat_notice();

create or replace function moxiu_private.game_load(p_user uuid,p_initial jsonb,p_request uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare c moxiu_private.game_characters; r moxiu_private.game_requests; v_owned jsonb; v_title text;
begin
 if auth.jwt()->>'role' is distinct from 'service_role' then raise exception 'Trusted server required' using errcode='42501'; end if;
 insert into moxiu_private.game_characters(user_id,payload) values(p_user,p_initial) on conflict(user_id) do nothing;
 select * into strict c from moxiu_private.game_characters where user_id=p_user;
 select * into r from moxiu_private.game_requests where user_id=p_user and request_id=p_request;
 perform moxiu_private.refresh_titles(p_user);
 select coalesce(jsonb_agg(sku),'[]'::jsonb) into v_owned from moxiu_private.shard_entitlements where user_id=p_user;
 select equipped_title into v_title from moxiu_private.shard_wallets where user_id=p_user;
 return jsonb_build_object('state',c.payload,'revision',c.revision,'owned',v_owned,'title',v_title,
 'known',r.request_id is not null,'previous_action',r.action,'previous_args',r.args,'result',r.result);
end; $$;

create function moxiu_private.equipped_title_notice()
returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.equipped_title is distinct from old.equipped_title then
  if new.equipped_title is not null then
   perform moxiu_private.chat_notice(new.user_id,'已佩戴「'||(select name from moxiu_private.shard_catalog where sku=new.equipped_title)||'」，接下来的聊天消息将展示此称号。');
  end if;
  if new.equipped_title='title_creator' or old.equipped_title='title_creator' then
   update moxiu_private.game_characters set payload=jsonb_set(jsonb_set(payload,'{player,hp}','null'),'{player,mp}','null'),revision=revision+1,updated_at=now() where user_id=new.user_id;
  end if;
 end if;
 return new;
end; $$;
create trigger equipped_title_chat after update of equipped_title on moxiu_private.shard_wallets for each row execute function moxiu_private.equipped_title_notice();

-- Internal helpers remain unavailable to ordinary players.
do $$ declare f record; begin
 for f in select p.oid::regprocedure as signature from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='moxiu_private' and p.proname in ('chat_notice','equipped_title_notice','title_notice','refresh_titles','chat_read','community_chat_notice') loop
 execute format('revoke all on function %s from public,anon,authenticated',f.signature);
 execute format('grant execute on function %s to service_role',f.signature);
 end loop;
end; $$;

create or replace function moxiu_private.community_context(p_user uuid,p_action text,p_args jsonb)
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
 'target',case when t.user_id is null then null else jsonb_build_object('id',t.user_id,'state',t.payload,'revision',t.revision,'owned',owned,'title',(select equipped_title from moxiu_private.shard_wallets where user_id=target_id)) end,
 'active_orders',(select count(*) from moxiu_private.player_orders where owner=p_user and status='active'),
 'enrolled',coalesce(a.arena_joined,false),'target_enrolled',coalesce(b.arena_joined,false),
 'season',s,'rating',case when a.season=s then a.rating else 1000 end,'target_rating',case when b.season=s then b.rating else 1000 end,
 'challenges_today',count_today,'pair_used',exists(select 1 from moxiu_private.player_matches where day=d and pair=least(p_user,target_id)::text||':'||greatest(p_user,target_id)::text));
end; $$;
