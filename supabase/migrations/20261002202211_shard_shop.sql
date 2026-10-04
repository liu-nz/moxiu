-- Real-money balances never live in editable game snapshots. No direct client table access.
create table moxiu_private.shard_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
create table moxiu_private.shard_catalog (
  sku text primary key,
  name text not null,
  price integer not null check (price > 0),
  kind text not null check (kind in ('title', 'capacity')),
  description text not null
);
insert into moxiu_private.shard_catalog values
  ('title_cloud', '云间闲客', 50, 'title', '纯展示称号，不增加属性。'),
  ('title_gate', '两界旅人', 100, 'title', '纯展示称号，不增加属性。'),
  ('title_ink', '墨道知音', 200, 'title', '纯展示称号，不增加属性。'),
  ('farm_extra', '灵田扩容', 200, 'capacity', '灵田上限 12→13。另需支付游戏内开垦费用。'),
  ('ranch_extra', '牧场扩容', 150, 'capacity', '养殖栏位上限 10→11。另需支付游戏内扩建费用；战斗灵兽仍最多上阵 2 只。'),
  ('suburb_extra', '城郊置业', 150, 'capacity', '城郊小区持有上限 12→13。另需支付游戏内购房费用；其他地产上限不变。');
create table moxiu_private.shard_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  balance bigint not null default 0 check (balance between 0 and 1000000000),
  equipped_title text references moxiu_private.shard_catalog(sku)
);
create table moxiu_private.shard_orders (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  amount integer not null check (amount in (1,5,10,25,50,100)),
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewer uuid references auth.users(id),
  receipt text unique check (receipt ~ '^[0-9A-Za-z_-]{8,80}$'),
  note text not null default '' check (length(note) <= 120),
  check ((status = 'pending' and reviewed_at is null and receipt is null) or
         (status = 'approved' and reviewed_at is not null and receipt is not null) or
         (status = 'rejected' and reviewed_at is not null and receipt is null))
);
create index shard_orders_user_created on moxiu_private.shard_orders(user_id, created_at desc);
create index shard_orders_pending on moxiu_private.shard_orders(created_at) where status='pending';
create table moxiu_private.shard_entitlements (
  user_id uuid not null references auth.users(id) on delete cascade,
  sku text not null references moxiu_private.shard_catalog(sku),
  purchased_at timestamptz not null default now(),
  primary key (user_id, sku)
);
create table moxiu_private.shard_ledger (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  delta integer not null check (delta <> 0),
  sku text references moxiu_private.shard_catalog(sku),
  order_id uuid unique references moxiu_private.shard_orders(id),
  created_at timestamptz not null default now(),
  check ((delta > 0 and order_id is not null and sku is null) or (delta < 0 and sku is not null and order_id is null))
);
create index shard_ledger_user_created on moxiu_private.shard_ledger(user_id, created_at desc);
alter table moxiu_private.shard_admins enable row level security;
alter table moxiu_private.shard_catalog enable row level security;
alter table moxiu_private.shard_wallets enable row level security;
alter table moxiu_private.shard_orders enable row level security;
alter table moxiu_private.shard_entitlements enable row level security;
alter table moxiu_private.shard_ledger enable row level security;
revoke all on moxiu_private.shard_admins, moxiu_private.shard_catalog, moxiu_private.shard_wallets,
  moxiu_private.shard_orders, moxiu_private.shard_entitlements, moxiu_private.shard_ledger from public, anon, authenticated;

create function moxiu_private.shards(p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_admin boolean;
  v_id uuid;
  v_amount integer;
  v_sku text := p_data->>'sku';
  v_receipt text := btrim(p_data->>'receipt');
  v_note text := coalesce(btrim(p_data->>'note'), '');
  v_order moxiu_private.shard_orders;
  v_item moxiu_private.shard_catalog;
  v_entry moxiu_private.shard_ledger;
  v_balance bigint;
begin
  if v_user is null then raise exception '请先登录账号' using errcode='28000'; end if;
  if p_action is null or p_data is null or jsonb_typeof(p_data) <> 'object' then
    raise exception '请求格式无效' using errcode='22023';
  end if;
  select exists(select 1 from moxiu_private.shard_admins where user_id=v_user) into v_admin;
  insert into moxiu_private.shard_wallets(user_id) values(v_user) on conflict do nothing;
  if p_action = 'request' then
    v_id := (p_data->>'id')::uuid;
    v_amount := (p_data->>'amount')::integer;
    if v_id is null or v_amount is null or v_amount not in (1,5,10,25,50,100) then
      raise exception '请选择有效充值档位' using errcode='22023';
    end if;
    -- Serialize request creation and limit outstanding requests per account.
    perform 1 from moxiu_private.shard_wallets where user_id=v_user for update;
    select * into v_order from moxiu_private.shard_orders where id=v_id;
    if found then
      if v_order.user_id <> v_user or v_order.amount <> v_amount then
        raise exception '申请编号冲突' using errcode='22023';
      end if;
    else
      if (select count(*) from moxiu_private.shard_orders where user_id=v_user and status='pending') >= 5 then
        raise exception '已有 5 笔待核对申请，请等待审核' using errcode='22023';
      end if;
      insert into moxiu_private.shard_orders(id,user_id,amount) values(v_id,v_user,v_amount);
    end if;
  elsif p_action in ('approve','reject') then
    if not v_admin then raise exception '无充值审核权限' using errcode='42501'; end if;
    v_id := (p_data->>'id')::uuid;
    select * into v_order from moxiu_private.shard_orders where id=v_id for update;
    if not found then raise exception '充值申请不存在' using errcode='22023'; end if;
    if p_action = 'approve' then
      v_amount := (p_data->>'amount')::integer;
      if v_amount is null or v_amount <> v_order.amount or v_receipt is null or v_receipt !~ '^[0-9A-Za-z_-]{8,80}$' then
        raise exception '实收金额或微信交易单号无效' using errcode='22023';
      end if;
      if v_order.status = 'approved' then
        if v_order.receipt <> v_receipt then raise exception '此申请已使用其他单号入账' using errcode='22023'; end if;
      elsif v_order.status <> 'pending' then
        raise exception '申请已驳回，不能入账' using errcode='22023';
      else
        if exists(select 1 from moxiu_private.shard_orders where receipt=v_receipt) then
          raise exception '该微信交易单号已入账' using errcode='22023';
        end if;
        insert into moxiu_private.shard_wallets(user_id) values(v_order.user_id) on conflict do nothing;
        update moxiu_private.shard_wallets set balance=balance+v_order.amount*10 where user_id=v_order.user_id;
        update moxiu_private.shard_orders set status='approved', receipt=v_receipt, reviewer=v_user, reviewed_at=now() where id=v_id;
        insert into moxiu_private.shard_ledger(id,user_id,delta,order_id)
          values(gen_random_uuid(),v_order.user_id,v_order.amount*10,v_id);
      end if;
    else
      if length(v_note) not between 1 and 120 then raise exception '请填写 1–120 字驳回原因' using errcode='22023'; end if;
      if v_order.status = 'approved' then raise exception '已入账申请不能驳回' using errcode='22023'; end if;
      if v_order.status = 'pending' then
        update moxiu_private.shard_orders set status='rejected', note=v_note, reviewer=v_user, reviewed_at=now() where id=v_id;
      end if;
    end if;
  elsif p_action = 'purchase' then
    v_id := (p_data->>'id')::uuid;
    if v_id is null then raise exception '购买编号无效' using errcode='22023'; end if;
    select * into v_item from moxiu_private.shard_catalog where sku=v_sku;
    if not found then raise exception '商品不存在' using errcode='22023'; end if;
    select balance into v_balance from moxiu_private.shard_wallets where user_id=v_user for update;
    select * into v_entry from moxiu_private.shard_ledger where id=v_id;
    if found then
      if v_entry.user_id <> v_user or v_entry.sku is distinct from v_sku then
        raise exception '购买编号冲突' using errcode='22023';
      end if;
    else
      if exists(select 1 from moxiu_private.shard_entitlements where user_id=v_user and sku=v_sku) then
        raise exception '已拥有此永久权益，无需重复购买' using errcode='22023';
      end if;
      if v_balance < v_item.price then raise exception '天道碎片不足' using errcode='22023'; end if;
      update moxiu_private.shard_wallets set balance=balance-v_item.price where user_id=v_user;
      insert into moxiu_private.shard_entitlements(user_id,sku) values(v_user,v_sku);
      insert into moxiu_private.shard_ledger(id,user_id,delta,sku) values(v_id,v_user,-v_item.price,v_sku);
    end if;
  elsif p_action = 'equip' then
    if coalesce(v_sku,'') <> '' and not exists(
      select 1 from moxiu_private.shard_entitlements e join moxiu_private.shard_catalog c using(sku)
      where e.user_id=v_user and e.sku=v_sku and c.kind='title') then
      raise exception '尚未拥有此称号' using errcode='22023';
    end if;
    update moxiu_private.shard_wallets set equipped_title=nullif(v_sku,'') where user_id=v_user;
  elsif p_action <> 'read' then
    raise exception '操作不存在' using errcode='22023';
  end if;
  return jsonb_build_object(
    'balance', (select balance from moxiu_private.shard_wallets where user_id=v_user),
    'title', (select equipped_title from moxiu_private.shard_wallets where user_id=v_user),
    'catalog', (select jsonb_agg(to_jsonb(c) order by kind desc,price,sku) from moxiu_private.shard_catalog c),
    'owned', coalesce((select jsonb_agg(sku) from moxiu_private.shard_entitlements where user_id=v_user), '[]'::jsonb),
    'orders', coalesce((select jsonb_agg(to_jsonb(o) order by created_at desc) from
      (select id,amount,status,created_at,reviewed_at,note from moxiu_private.shard_orders where user_id=v_user order by created_at desc limit 30) o), '[]'::jsonb),
    'ledger', coalesce((select jsonb_agg(to_jsonb(l) order by created_at desc) from
      (select id,delta,sku,order_id,created_at from moxiu_private.shard_ledger where user_id=v_user order by created_at desc limit 30) l), '[]'::jsonb),
    'admin', v_admin,
    'review', case when v_admin then coalesce((select jsonb_agg(to_jsonb(o) order by created_at) from
      (select o.id,o.amount,o.status,o.created_at,p.uid,p.role_name from moxiu_private.shard_orders o
       join public.moxiu_player_profiles p using(user_id) where o.status='pending' order by o.created_at limit 100) o), '[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;
revoke all on function moxiu_private.shards(text,jsonb) from public, anon, authenticated;
grant execute on function moxiu_private.shards(text,jsonb) to authenticated;
create function public.moxiu_shards(p_action text default 'read', p_data jsonb default '{}'::jsonb)
returns jsonb language sql security invoker set search_path = '' as $$
  select moxiu_private.shards(p_action,p_data);
$$;
revoke all on function public.moxiu_shards(text,jsonb) from public, anon, authenticated;
grant execute on function public.moxiu_shards(text,jsonb) to authenticated;
