-- First authoritative gameplay slice. Existing test-save JSON is never imported.
create table moxiu_private.online_catalog (
  item_id text primary key,
  name text not null,
  origin text not null check (origin in ('modern','cultivation')),
  weight numeric(8,2) not null check (weight > 0),
  modern_price bigint not null check (modern_price > 0),
  cultivation_price bigint not null check (cultivation_price > 0),
  modern_capacity integer not null check (modern_capacity > 0),
  cultivation_capacity integer not null check (cultivation_capacity > 0)
);
insert into moxiu_private.online_catalog values
  ('lingmi','灵米','cultivation',1,620,12,24,40),
  ('huangjing','黄精草','cultivation',0.5,1100,20,20,34),
  ('juqi','聚气丹','cultivation',0.4,2400,45,16,26),
  ('yasuo','压缩食品','modern',1,80,3,60,40),
  ('kangshengsu','抗生素','modern',0.4,200,8,40,30),
  ('jingmi','精密工具','modern',2.5,380,16,30,24);
create table moxiu_private.online_characters (
  user_id uuid primary key references auth.users(id) on delete cascade,
  side text not null default 'modern' check (side in ('modern','cultivation')),
  market_day date not null,
  to_modern integer not null default 1 check (to_modern between 0 and 1),
  to_cultivation integer not null default 1 check (to_cultivation between 0 and 1),
  counts jsonb not null default '{}' check (jsonb_typeof(counts) = 'object'),
  revision bigint not null default 1,
  created_at timestamptz not null default now()
);
create table moxiu_private.online_inventory (
  user_id uuid not null references moxiu_private.online_characters(user_id) on delete cascade,
  item_id text not null references moxiu_private.online_catalog(item_id),
  qty integer not null check (qty between 1 and 10000),
  primary key(user_id,item_id)
);
create table moxiu_private.online_requests (
  user_id uuid not null references moxiu_private.online_characters(user_id) on delete cascade,
  request_id uuid not null,
  action text not null check (action in ('buy','sell','cross')),
  payload jsonb not null,
  receipt jsonb not null,
  created_at timestamptz not null default now(),
  primary key(user_id,request_id)
);
create index online_requests_user_created on moxiu_private.online_requests(user_id,created_at desc);
alter table moxiu_private.online_catalog enable row level security;
alter table moxiu_private.online_characters enable row level security;
alter table moxiu_private.online_inventory enable row level security;
alter table moxiu_private.online_requests enable row level security;
revoke all on moxiu_private.online_catalog,moxiu_private.online_characters,
  moxiu_private.online_inventory,moxiu_private.online_requests from public,anon,authenticated;

create function moxiu_private.online_snapshot(p_user uuid)
returns jsonb language sql stable security invoker set search_path = '' as $$
  select jsonb_build_object(
    'revision',c.revision,'side',c.side,'day',c.market_day,
    'wallet',jsonb_build_object('stone',w.stone,'cny',w.cny),
    'gate',jsonb_build_object('modern',c.to_modern,'cultivation',c.to_cultivation,'capacity',18),
    'weight',coalesce((select sum(i.qty*g.weight) from moxiu_private.online_inventory i
      join moxiu_private.online_catalog g using(item_id) where i.user_id=p_user),0),
    'inventory',coalesce((select jsonb_agg(jsonb_build_object('item_id',i.item_id,'name',g.name,'qty',i.qty,'weight',g.weight) order by i.item_id)
      from moxiu_private.online_inventory i join moxiu_private.online_catalog g using(item_id)
      where i.user_id=p_user),'[]'::jsonb),
    'catalog',coalesce((select jsonb_agg(jsonb_build_object(
      'item_id',g.item_id,'name',g.name,'origin',g.origin,'weight',g.weight,
      'buy_price',ceil((case when c.side='modern' then g.modern_price else g.cultivation_price end)*1.05),
      'sell_price',floor((case when c.side='modern' then g.modern_price else g.cultivation_price end)*
        (case when c.side=g.origin then 0.8 else 0.95 end)),
      'buy_left',greatest(0,(case when c.side='modern' then g.modern_capacity else g.cultivation_capacity end)-
        coalesce((c.counts->>('buy:'||c.side||':'||g.item_id))::integer,0)),
      'sell_left',greatest(0,(case when c.side='modern' then g.modern_capacity else g.cultivation_capacity end)-
        coalesce((c.counts->>('sell:'||c.side||':'||g.item_id))::integer,0))
    ) order by g.item_id) from moxiu_private.online_catalog g),'[]'::jsonb),
    'receipts',coalesce((select jsonb_agg(r.receipt||jsonb_build_object('request_id',r.request_id,'at',r.created_at) order by r.created_at desc)
      from (select * from moxiu_private.online_requests where user_id=p_user order by created_at desc limit 20) r),'[]'::jsonb)
  ) from moxiu_private.online_characters c join moxiu_private.asset_wallets w using(user_id) where c.user_id=p_user;
$$;
revoke all on function moxiu_private.online_snapshot(uuid) from public,anon,authenticated;

create function moxiu_private.moxiu_online(p_action text,p_data jsonb default '{}')
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_day date := (timezone('Asia/Shanghai',statement_timestamp()) - interval '5 hours')::date;
  v_char moxiu_private.online_characters;
  v_wallet moxiu_private.asset_wallets;
  v_item moxiu_private.online_catalog;
  v_previous moxiu_private.online_requests;
  v_request uuid;
  v_qty integer;
  v_key text;
  v_count integer;
  v_capacity integer;
  v_price bigint;
  v_total bigint;
  v_balance bigint;
  v_currency text;
  v_owned integer;
  v_weight numeric;
  v_inserted uuid;
  v_receipt jsonb;
  v_replayed boolean := false;
begin
  if v_user is null then raise exception '请先登录账号' using errcode='42501'; end if;
  if p_action is null or p_action not in ('read','buy','sell','cross') or p_data is null or jsonb_typeof(p_data)<>'object' then
    raise exception '无效的联机操作' using errcode='22023';
  end if;
  if p_action='read' then
    if p_data<>'{}'::jsonb then raise exception '读取操作不接受资产数据' using errcode='22023'; end if;
  else
    if p_action='cross' then
      if p_data-'request_id'-'to'<>'{}'::jsonb or p_data->>'to' is null or p_data->>'to' not in ('modern','cultivation') then
        raise exception '请选择有效的目的地' using errcode='22023';
      end if;
    else
      if p_data-'request_id'-'item_id'-'qty'<>'{}'::jsonb or jsonb_typeof(p_data->'qty') is distinct from 'number' or
        coalesce(p_data->>'qty','') !~ '^[0-9]{1,4}$' or p_data->>'item_id' is null then
        raise exception '请提交有效的商品和整数数量' using errcode='22023';
      end if;
      v_qty := (p_data->>'qty')::integer;
      if v_qty not between 1 and 1000 then raise exception '数量须为 1–1000 的整数' using errcode='22023'; end if;
    end if;
    if coalesce(p_data->>'request_id','') !~ '^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$' then
      raise exception '操作编号无效' using errcode='22023';
    end if;
    v_request := (p_data->>'request_id')::uuid;
  end if;

  insert into moxiu_private.online_characters(user_id,market_day) values(v_user,v_day)
    on conflict(user_id) do nothing returning user_id into v_inserted;
  -- This per-player lock serializes actions AND replay checks across all devices.
  select * into strict v_char from moxiu_private.online_characters where user_id=v_user for update;
  insert into moxiu_private.asset_wallets(user_id) values(v_user) on conflict(user_id) do nothing;
  select * into strict v_wallet from moxiu_private.asset_wallets where user_id=v_user for update;
  if v_inserted is not null then
    if v_wallet.cny>8999999999998000 then raise exception '初始化余额超出范围' using errcode='22023'; end if;
    update moxiu_private.asset_wallets set cny=cny+2000,updated_at=now() where user_id=v_user;
    insert into moxiu_private.asset_ledger(request_id,user_id,currency,delta,balance_after,reason)
      values(gen_random_uuid(),v_user,'cny',2000,v_wallet.cny+2000,'online:initial_grant');
    v_wallet.cny := v_wallet.cny+2000;
  end if;
  if v_char.market_day<>v_day then
    update moxiu_private.online_characters set market_day=v_day,to_modern=1,to_cultivation=1,counts='{}',revision=revision+1 where user_id=v_user;
    select * into strict v_char from moxiu_private.online_characters where user_id=v_user;
  end if;

  if p_action<>'read' then
    select * into v_previous from moxiu_private.online_requests where user_id=v_user and request_id=v_request;
    if found then
      if v_previous.action<>p_action or v_previous.payload<>p_data then
        raise exception '该操作编号已用于其他内容' using errcode='22023';
      end if;
      v_replayed := true;
      v_receipt := v_previous.receipt;
    elsif p_action='cross' then
      if p_data->>'to'=v_char.side then raise exception '已经在目的地' using errcode='22023'; end if;
      if (p_data->>'to'='modern' and v_char.to_modern=0) or (p_data->>'to'='cultivation' and v_char.to_cultivation=0) then
        raise exception '今日该方向穿越次数已用完，05:00 刷新' using errcode='22023';
      end if;
      select coalesce(sum(i.qty*g.weight),0) into v_weight from moxiu_private.online_inventory i
        join moxiu_private.online_catalog g using(item_id) where i.user_id=v_user;
      if v_weight>18 then raise exception '联机背包超过 18 kg，请先出售部分货物' using errcode='22023'; end if;
      update moxiu_private.online_characters set side=p_data->>'to',
        to_modern=case when p_data->>'to'='modern' then to_modern-1 else to_modern end,
        to_cultivation=case when p_data->>'to'='cultivation' then to_cultivation-1 else to_cultivation end
        where user_id=v_user;
      v_receipt := jsonb_build_object('action','cross','side',p_data->>'to','weight',v_weight);
    else
      select * into v_item from moxiu_private.online_catalog where item_id=p_data->>'item_id';
      if not found then raise exception '该商品不在联机目录中' using errcode='22023'; end if;
      v_key := p_action||':'||v_char.side||':'||v_item.item_id;
      v_count := coalesce((v_char.counts->>v_key)::integer,0);
      v_capacity := case when v_char.side='modern' then v_item.modern_capacity else v_item.cultivation_capacity end;
      if v_qty+v_count>v_capacity then raise exception '超过该商品今日成交上限' using errcode='22023'; end if;
      v_currency := case when v_char.side='modern' then 'cny' else 'stone' end;
      v_balance := case when v_currency='cny' then v_wallet.cny else v_wallet.stone end;
      v_price := case when v_char.side='modern' then v_item.modern_price else v_item.cultivation_price end;
      select coalesce((select qty from moxiu_private.online_inventory where user_id=v_user and item_id=v_item.item_id),0) into v_owned;
      if p_action='buy' then
        if v_char.side<>v_item.origin then raise exception '此地仅收购该跨界货物，不能进货' using errcode='22023'; end if;
        v_price := ceil(v_price*1.05);
        v_total := v_price*v_qty;
        if v_balance<v_total then raise exception '联机余额不足' using errcode='22023'; end if;
        if v_owned+v_qty>10000 then raise exception '超过背包单品上限' using errcode='22023'; end if;
        insert into moxiu_private.online_inventory(user_id,item_id,qty) values(v_user,v_item.item_id,v_qty)
          on conflict(user_id,item_id) do update set qty=moxiu_private.online_inventory.qty+excluded.qty;
        v_total := -v_total;
      else
        if v_owned<v_qty then raise exception '联机背包数量不足' using errcode='22023'; end if;
        v_price := floor(v_price*(case when v_char.side=v_item.origin then 0.8 else 0.95 end));
        v_total := v_price*v_qty;
        if v_balance+v_total>9000000000000000 then raise exception '成交后余额超出范围' using errcode='22023'; end if;
        if v_owned=v_qty then delete from moxiu_private.online_inventory where user_id=v_user and item_id=v_item.item_id;
        else update moxiu_private.online_inventory set qty=qty-v_qty where user_id=v_user and item_id=v_item.item_id; end if;
      end if;
      if v_currency='cny' then update moxiu_private.asset_wallets set cny=cny+v_total,updated_at=now() where user_id=v_user;
      else update moxiu_private.asset_wallets set stone=stone+v_total,updated_at=now() where user_id=v_user; end if;
      insert into moxiu_private.asset_ledger(request_id,user_id,currency,delta,balance_after,reason)
        values(gen_random_uuid(),v_user,v_currency,v_total,v_balance+v_total,'online:'||p_action||':'||v_item.item_id||':'||v_request);
      update moxiu_private.online_characters set counts=jsonb_set(counts,array[v_key],to_jsonb(v_count+v_qty)) where user_id=v_user;
      v_receipt := jsonb_build_object('action',p_action,'item_id',v_item.item_id,'name',v_item.name,'qty',v_qty,
        'side',v_char.side,'currency',v_currency,'unit_price',v_price,'delta',v_total,'balance_after',v_balance+v_total);
    end if;
    if not v_replayed then
      insert into moxiu_private.online_requests(user_id,request_id,action,payload,receipt) values(v_user,v_request,p_action,p_data,v_receipt);
      update moxiu_private.online_characters set revision=revision+1 where user_id=v_user;
    end if;
  end if;
  return moxiu_private.online_snapshot(v_user)||jsonb_build_object('receipt',v_receipt,'replayed',v_replayed);
end;
$$;
revoke all on function moxiu_private.moxiu_online(text,jsonb) from public,anon;
grant execute on function moxiu_private.moxiu_online(text,jsonb) to authenticated;
create function public.moxiu_online(p_action text,p_data jsonb default '{}')
returns jsonb language sql security invoker set search_path = '' as $$
  select moxiu_private.moxiu_online(p_action,p_data);
$$;
revoke all on function public.moxiu_online(text,jsonb) from public,anon;
grant execute on function public.moxiu_online(text,jsonb) to authenticated;
