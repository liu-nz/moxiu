-- Personal cloud saves for the private beta; not authoritative multiplayer balances.
create table public.moxiu_test_saves (
  user_id uuid primary key references auth.users(id) on delete cascade,
  payload jsonb not null check (
    jsonb_typeof(payload) = 'object'
    and jsonb_typeof(payload -> 'player') = 'object'
    and jsonb_typeof(payload -> 'currency') = 'object'
    and octet_length(payload::text) <= 1048576
  ),
  revision bigint not null default 1 check (revision > 0),
  updated_at timestamptz not null default now()
);
alter table public.moxiu_test_saves enable row level security;
revoke all on public.moxiu_test_saves from anon, authenticated;
grant select, insert, update on public.moxiu_test_saves to authenticated;
create policy test_save_read on public.moxiu_test_saves for select to authenticated
  using ((select auth.uid()) = user_id);
create policy test_save_insert on public.moxiu_test_saves for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy test_save_update on public.moxiu_test_saves for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create function public.moxiu_write_test_save(p_payload jsonb, p_expected_revision bigint)
returns table(revision bigint, updated_at timestamptz)
language plpgsql security invoker set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Sign in required' using errcode = '42501';
  end if;
  if p_expected_revision is null or p_expected_revision < 0 then
    raise exception 'Invalid revision' using errcode = '22023';
  end if;
  if p_expected_revision = 0 then
    return query insert into public.moxiu_test_saves as s (user_id, payload)
      values (auth.uid(), p_payload)
      on conflict (user_id) do nothing
      returning s.revision, s.updated_at;
  else
    return query update public.moxiu_test_saves as s
      set payload = p_payload, revision = s.revision + 1, updated_at = now()
      where s.user_id = auth.uid() and s.revision = p_expected_revision
      returning s.revision, s.updated_at;
  end if;
end;
$$;
revoke all on function public.moxiu_write_test_save(jsonb, bigint) from public, anon, authenticated;
grant execute on function public.moxiu_write_test_save(jsonb, bigint) to authenticated;
comment on table public.moxiu_test_saves is 'Private beta snapshots. Never use client-controlled payloads as authoritative multiplayer currency or rankings.';
