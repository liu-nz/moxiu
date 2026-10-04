-- Trusted settlement ledger for future player trading and competitive rewards.
-- Client-computed single-player currency remains local and is not imported here.
create table moxiu_private.asset_wallets (
  user_id uuid primary key references auth.users(id) on delete cascade,
  stone bigint not null default 0 check (stone >= 0 and stone <= 9000000000000000),
  cny bigint not null default 0 check (cny >= 0 and cny <= 9000000000000000),
  updated_at timestamptz not null default now()
);
alter table moxiu_private.asset_wallets enable row level security;
revoke all on moxiu_private.asset_wallets from public, anon, authenticated;

create table moxiu_private.asset_ledger (
  request_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  currency text not null check (currency in ('stone','cny')),
  delta bigint not null check (delta <> 0 and abs(delta) <= 1000000000000),
  balance_after bigint not null check (balance_after >= 0 and balance_after <= 9000000000000000),
  reason text not null check (length(btrim(reason)) between 3 and 120),
  created_at timestamptz not null default now()
);
alter table moxiu_private.asset_ledger enable row level security;
revoke all on moxiu_private.asset_ledger from public, anon, authenticated;
create index asset_ledger_user_created on moxiu_private.asset_ledger(user_id, created_at desc);

create or replace function public.moxiu_settle_asset(
  p_request_id uuid, p_user_id uuid, p_currency text, p_delta bigint, p_reason text
) returns jsonb
language plpgsql security definer set search_path = '' as $$
declare
  v_role text := auth.role();
  v_old moxiu_private.asset_ledger;
  v_balance bigint;
begin
  if v_role is distinct from 'service_role' then
    raise exception 'Only the trusted settlement service may change player assets' using errcode='42501';
  end if;
  if p_request_id is null or p_user_id is null or p_currency not in ('stone','cny') or
     p_delta is null or p_delta = 0 or abs(p_delta) > 1000000000000 or
     length(btrim(coalesce(p_reason,''))) not between 3 and 120 then
    raise exception 'Invalid settlement request' using errcode='22023';
  end if;
  select * into v_old from moxiu_private.asset_ledger where request_id=p_request_id;
  if found then
    if v_old.user_id <> p_user_id or v_old.currency <> p_currency or v_old.delta <> p_delta or v_old.reason <> btrim(p_reason) then
      raise exception 'Settlement request id was reused with different data' using errcode='22023';
    end if;
    return jsonb_build_object('balance',v_old.balance_after,'replayed',true);
  end if;
  insert into moxiu_private.asset_wallets(user_id) values(p_user_id) on conflict(user_id) do nothing;
  if p_currency='stone' then
    select stone into v_balance from moxiu_private.asset_wallets where user_id=p_user_id for update;
  else
    select cny into v_balance from moxiu_private.asset_wallets where user_id=p_user_id for update;
  end if;
  if p_delta < 0 and v_balance < abs(p_delta) then
    raise exception 'Insufficient server-owned balance' using errcode='22023';
  end if;
  if v_balance + p_delta < 0 or v_balance + p_delta > 9000000000000000 then
    raise exception 'Settlement exceeds the supported balance range' using errcode='22023';
  end if;
  v_balance := v_balance + p_delta;
  if p_currency='stone' then
    update moxiu_private.asset_wallets set stone=v_balance,updated_at=now() where user_id=p_user_id;
  else
    update moxiu_private.asset_wallets set cny=v_balance,updated_at=now() where user_id=p_user_id;
  end if;
  insert into moxiu_private.asset_ledger(request_id,user_id,currency,delta,balance_after,reason)
    values(p_request_id,p_user_id,p_currency,p_delta,v_balance,btrim(p_reason));
  return jsonb_build_object('balance',v_balance,'replayed',false);
end;
$$;
revoke all on function public.moxiu_settle_asset(uuid,uuid,text,bigint,text) from public, anon, authenticated;
grant execute on function public.moxiu_settle_asset(uuid,uuid,text,bigint,text) to service_role;

-- Cover the private catalog and reviewer references reported by the advisor.
create index if not exists shard_adjustments_admin_created on moxiu_private.shard_adjustments(admin_id,created_at desc);
create index if not exists shard_entitlements_sku on moxiu_private.shard_entitlements(sku);
create index if not exists shard_ledger_sku on moxiu_private.shard_ledger(sku);
create index if not exists shard_orders_reviewer on moxiu_private.shard_orders(reviewer);
create index if not exists shard_wallets_equipped_title on moxiu_private.shard_wallets(equipped_title);
