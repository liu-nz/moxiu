-- Close the manual recharge lifecycle without trusting client-submitted balances.
alter table moxiu_private.shard_orders
  add column refund_receipt text,
  add column refunded_at timestamptz;

alter table moxiu_private.shard_orders drop constraint shard_orders_status_check;
alter table moxiu_private.shard_orders drop constraint shard_orders_check;
alter table moxiu_private.shard_orders
  add constraint shard_orders_status_check
    check (status in ('pending','approved','rejected','cancelled','refunded')),
  add constraint shard_orders_refund_receipt_check
    check (refund_receipt is null or refund_receipt ~ '^[0-9A-Za-z_-]{8,80}$'),
  add constraint shard_orders_check check (
    (status = 'pending' and reviewed_at is null and receipt is null and refund_receipt is null and refunded_at is null)
    or (status = 'approved' and reviewed_at is not null and receipt is not null and refund_receipt is null and refunded_at is null)
    or (status in ('rejected','cancelled') and reviewed_at is not null and receipt is null and refund_receipt is null and refunded_at is null)
    or (status = 'refunded' and reviewed_at is not null and receipt is not null and refund_receipt is not null and refunded_at is not null)
  );

create table moxiu_private.shard_adjustments (
  id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid not null references auth.users(id),
  order_id uuid unique references moxiu_private.shard_orders(id),
  delta integer not null check (delta <> 0 and abs(delta) <= 1000000),
  reason text not null check (length(btrim(reason)) between 3 and 120),
  kind text not null check (kind in ('manual','refund')),
  created_at timestamptz not null default now(),
  check ((kind = 'manual' and order_id is null) or (kind = 'refund' and order_id is not null and delta < 0))
);
alter table moxiu_private.shard_adjustments enable row level security;
revoke all on moxiu_private.shard_adjustments from public, anon, authenticated;
create index shard_adjustments_user_created on moxiu_private.shard_adjustments(user_id, created_at desc);

alter table moxiu_private.shard_ledger add column adjustment_id uuid unique
  references moxiu_private.shard_adjustments(id);
alter table moxiu_private.shard_ledger drop constraint shard_ledger_check;
alter table moxiu_private.shard_ledger add constraint shard_ledger_check check (
  (delta > 0 and order_id is not null and sku is null and adjustment_id is null)
  or (delta < 0 and sku is not null and order_id is null and adjustment_id is null)
  or (adjustment_id is not null and order_id is null and sku is null)
);

create or replace function moxiu_private.shards(p_action text, p_data jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_admin boolean;
  v_id uuid;
  v_amount integer;
  v_delta integer;
  v_sku text := p_data->>'sku';
  v_receipt text := btrim(p_data->>'receipt');
  v_note text := btrim(p_data->>'note');
  v_order moxiu_private.shard_orders;
  v_item moxiu_private.shard_catalog;
  v_entry moxiu_private.shard_ledger;
  v_balance bigint;
  v_adjustment uuid;
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
    perform 1 from moxiu_private.shard_wallets where user_id=v_user for update;
    select * into v_order from moxiu_private.shard_orders where id=v_id;
    if found then
      if v_order.user_id <> v_user or v_order.amount <> v_amount then raise exception '申请编号冲突' using errcode='22023'; end if;
    else
      if (select count(*) from moxiu_private.shard_orders where user_id=v_user and status='pending') >= 5 then
        raise exception '已有 5 笔待核对申请，请等待审核' using errcode='22023';
      end if;
      insert into moxiu_private.shard_orders(id,user_id,amount) values(v_id,v_user,v_amount);
    end if;
  elsif p_action = 'cancel' then
    v_id := (p_data->>'id')::uuid;
    select * into v_order from moxiu_private.shard_orders where id=v_id and user_id=v_user for update;
    if not found then raise exception '充值申请不存在' using errcode='22023'; end if;
    if v_order.status = 'pending' then
      update moxiu_private.shard_orders set status='cancelled', reviewed_at=now(), reviewer=v_user where id=v_id;
    elsif v_order.status <> 'cancelled' then
      raise exception '只有未审核的申请可以取消；若已付款请联系管理员' using errcode='22023';
    end if;
  elsif p_action in ('approve','reject','refund','adjust') then
    if not v_admin then raise exception '无充值审核权限' using errcode='42501'; end if;
    if p_action = 'approve' or p_action = 'reject' then
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
          raise exception '申请已关闭，不能入账' using errcode='22023';
        else
          if exists(select 1 from moxiu_private.shard_orders where receipt=v_receipt) then raise exception '该微信交易单号已入账' using errcode='22023'; end if;
          insert into moxiu_private.shard_wallets(user_id) values(v_order.user_id) on conflict do nothing;
          update moxiu_private.shard_wallets set balance=balance+v_order.amount*10 where user_id=v_order.user_id;
          update moxiu_private.shard_orders set status='approved', receipt=v_receipt, reviewer=v_user, reviewed_at=now() where id=v_id;
          insert into moxiu_private.shard_ledger(id,user_id,delta,order_id) values(gen_random_uuid(),v_order.user_id,v_order.amount*10,v_id);
        end if;
      else
        if length(coalesce(v_note,'')) not between 1 and 120 then raise exception '请填写 1–120 字驳回原因' using errcode='22023'; end if;
        if v_order.status = 'approved' or v_order.status = 'refunded' then raise exception '已入账申请不能驳回' using errcode='22023'; end if;
        if v_order.status = 'pending' then
          update moxiu_private.shard_orders set status='rejected', note=v_note, reviewer=v_user, reviewed_at=now() where id=v_id;
        else raise exception '申请已关闭，不能驳回' using errcode='22023'; end if;
      end if;
    elsif p_action = 'refund' then
      v_id := (p_data->>'id')::uuid;
      select * into v_order from moxiu_private.shard_orders where id=v_id for update;
      if not found then raise exception '充值申请不存在' using errcode='22023'; end if;
      if v_receipt is null or v_receipt !~ '^[0-9A-Za-z_-]{8,80}$' then raise exception '请填写真实微信退款单号' using errcode='22023'; end if;
      if v_order.status = 'refunded' and v_order.refund_receipt = v_receipt then
        null; -- Idempotent retry after a lost response.
      elsif v_order.status <> 'approved' then
        raise exception '只有已到账申请可以登记退款' using errcode='22023';
      else
      if exists(select 1 from moxiu_private.shard_orders where refund_receipt=v_receipt) then raise exception '该微信退款单号已登记' using errcode='22023'; end if;
      select balance into v_balance from moxiu_private.shard_wallets where user_id=v_order.user_id for update;
      if exists(select 1 from moxiu_private.shard_ledger where user_id=v_order.user_id and delta < 0 and created_at > v_order.created_at) then
        raise exception '该账号在这笔充值后已消费碎片；请人工核对权益和余额后使用调整流程' using errcode='22023';
      end if;
      if coalesce(v_balance,0) < v_order.amount*10 then raise exception '当前余额不足以冲回碎片，需先人工核对已购权益' using errcode='22023'; end if;
      v_delta := -(v_order.amount*10);
      v_adjustment := gen_random_uuid();
      update moxiu_private.shard_wallets set balance=balance+v_delta where user_id=v_order.user_id;
      insert into moxiu_private.shard_adjustments(id,user_id,admin_id,order_id,delta,reason,kind)
        values(v_adjustment,v_order.user_id,v_user,v_id,v_delta,'充值全额退款','refund');
      insert into moxiu_private.shard_ledger(id,user_id,delta,adjustment_id)
        values(gen_random_uuid(),v_order.user_id,v_delta,v_adjustment);
      update moxiu_private.shard_orders set status='refunded', refund_receipt=v_receipt,
        refunded_at=now(),reviewed_at=now(),reviewer=v_user where id=v_id;
      end if;
    else
      v_target := (select user_id from public.moxiu_player_profiles where uid=(p_data->>'uid')::integer);
      v_delta := (p_data->>'delta')::integer;
      v_adjustment := (p_data->>'id')::uuid;
      if v_target is null or v_delta is null or v_adjustment is null or v_delta=0 or abs(v_delta)>1000000 or length(coalesce(v_note,'')) not between 3 and 120 then
        raise exception '请填写有效 UID、非零碎片数量（最多 100 万）和 3–120 字原因' using errcode='22023';
      end if;
      if exists(select 1 from moxiu_private.shard_adjustments where id=v_adjustment) then
        if not exists(select 1 from moxiu_private.shard_adjustments where id=v_adjustment and user_id=v_target and admin_id=v_user and delta=v_delta and reason=v_note and kind='manual') then
          raise exception '调整编号冲突' using errcode='22023';
        end if;
      else
        insert into moxiu_private.shard_wallets(user_id) values(v_target) on conflict do nothing;
        select balance into v_balance from moxiu_private.shard_wallets where user_id=v_target for update;
        if v_delta < 0 and v_balance < abs(v_delta) then raise exception '余额不足，不能扣除；请人工核对已购权益' using errcode='22023'; end if;
        update moxiu_private.shard_wallets set balance=balance+v_delta where user_id=v_target;
        insert into moxiu_private.shard_adjustments(id,user_id,admin_id,delta,reason,kind)
          values(v_adjustment,v_target,v_user,v_delta,v_note,'manual');
        insert into moxiu_private.shard_ledger(id,user_id,delta,adjustment_id)
          values(gen_random_uuid(),v_target,v_delta,v_adjustment);
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
      if v_entry.user_id <> v_user or v_entry.sku is distinct from v_sku then raise exception '购买编号冲突' using errcode='22023'; end if;
    else
      if exists(select 1 from moxiu_private.shard_entitlements where user_id=v_user and sku=v_sku) then raise exception '已拥有此永久权益，无需重复购买' using errcode='22023'; end if;
      if v_balance < v_item.price then raise exception '天道碎片不足' using errcode='22023'; end if;
      update moxiu_private.shard_wallets set balance=balance-v_item.price where user_id=v_user;
      insert into moxiu_private.shard_entitlements(user_id,sku) values(v_user,v_sku);
      insert into moxiu_private.shard_ledger(id,user_id,delta,sku) values(v_id,v_user,-v_item.price,v_sku);
    end if;
  elsif p_action = 'equip' then
    if coalesce(v_sku,'') <> '' and not exists(select 1 from moxiu_private.shard_entitlements e join moxiu_private.shard_catalog c using(sku)
      where e.user_id=v_user and e.sku=v_sku and c.kind='title') then raise exception '尚未拥有此称号' using errcode='22023'; end if;
    update moxiu_private.shard_wallets set equipped_title=nullif(v_sku,'') where user_id=v_user;
  elsif p_action <> 'read' then
    raise exception '操作不存在' using errcode='22023';
  end if;

  return jsonb_build_object(
    'balance',(select balance from moxiu_private.shard_wallets where user_id=v_user),
    'title',(select equipped_title from moxiu_private.shard_wallets where user_id=v_user),
    'catalog',(select jsonb_agg(to_jsonb(c) order by kind desc,price,sku) from moxiu_private.shard_catalog c),
    'owned',coalesce((select jsonb_agg(sku) from moxiu_private.shard_entitlements where user_id=v_user),'[]'::jsonb),
    'orders',coalesce((select jsonb_agg(to_jsonb(o) order by created_at desc) from
      (select id,amount,status,created_at,reviewed_at,refunded_at,note from moxiu_private.shard_orders where user_id=v_user order by created_at desc limit 30) o),'[]'::jsonb),
    'ledger',coalesce((select jsonb_agg(to_jsonb(l) order by created_at desc) from
      (select l.id,l.delta,l.sku,l.order_id,l.created_at,a.reason as adjustment_note from moxiu_private.shard_ledger l
       left join moxiu_private.shard_adjustments a on a.id=l.adjustment_id where l.user_id=v_user order by l.created_at desc limit 30) l),'[]'::jsonb),
    'admin',v_admin,
    'review',case when v_admin then coalesce((select jsonb_agg(to_jsonb(o) order by created_at) from
      (select o.id,o.amount,o.status,o.created_at,p.uid,p.role_name from moxiu_private.shard_orders o
       join public.moxiu_player_profiles p using(user_id) where o.status='pending' order by o.created_at limit 100) o),'[]'::jsonb) else '[]'::jsonb end,
    'history',case when v_admin then coalesce((select jsonb_agg(to_jsonb(o) order by reviewed_at desc) from
      (select o.id,o.amount,o.status,o.created_at,o.reviewed_at,o.refunded_at,o.receipt,o.refund_receipt,o.note,p.uid,p.role_name
       from moxiu_private.shard_orders o join public.moxiu_player_profiles p using(user_id)
       where o.status <> 'pending' order by o.reviewed_at desc limit 100) o),'[]'::jsonb) else '[]'::jsonb end
  );
end;
$$;

comment on table moxiu_private.shard_adjustments is 'Immutable audit trail for admin fragment corrections and verified external refunds.';
