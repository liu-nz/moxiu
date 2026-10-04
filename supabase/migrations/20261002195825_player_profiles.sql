create schema if not exists moxiu_private;
revoke all on schema moxiu_private from public, anon;
grant usage on schema moxiu_private to authenticated;

create table public.moxiu_player_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  uid integer generated always as identity (start with 10000001) unique not null,
  role_name text not null check (role_name ~ '^[一-龥A-Za-z0-9_]{2,16}$'),
  name_confirmed boolean not null default true,
  created_at timestamptz not null default now()
);
comment on table public.moxiu_player_profiles is 'Account identity independent of editable game snapshots. UID is not a password or payment proof.';
alter table public.moxiu_player_profiles enable row level security;
revoke all on public.moxiu_player_profiles from public, anon, authenticated;
grant select on public.moxiu_player_profiles to authenticated;
grant all on public.moxiu_player_profiles to service_role;
revoke all on sequence public.moxiu_player_profiles_uid_seq from public, anon, authenticated;
create policy moxiu_profile_read_own on public.moxiu_player_profiles
  for select to authenticated using ((select auth.uid()) = user_id);

-- Existing accounts get a UID and valid provisional name, with one opportunity to choose their name.
insert into public.moxiu_player_profiles (user_id, role_name, name_confirmed)
select id,
  case when btrim(raw_user_meta_data ->> 'role_name') ~ '^[一-龥A-Za-z0-9_]{2,16}$'
    then btrim(raw_user_meta_data ->> 'role_name') else '初来行者' end,
  coalesce(btrim(raw_user_meta_data ->> 'role_name') ~ '^[一-龥A-Za-z0-9_]{2,16}$', false)
from auth.users;

create function moxiu_private.create_player_profile()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_name text := btrim(new.raw_user_meta_data ->> 'role_name');
begin
  if v_name is null or v_name !~ '^[一-龥A-Za-z0-9_]{2,16}$' then
    raise exception 'A valid role_name is required for registration' using errcode = '22023';
  end if;
  insert into public.moxiu_player_profiles (user_id, role_name) values (new.id, v_name);
  return new;
end;
$$;
revoke all on function moxiu_private.create_player_profile() from public, anon, authenticated;
create trigger moxiu_create_player_profile after insert on auth.users
  for each row execute function moxiu_private.create_player_profile();

-- This narrowly privileged operation only lets an authenticated legacy user name their own profile once.
create function moxiu_private.set_initial_name(p_role_name text)
returns setof public.moxiu_player_profiles language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := (select auth.uid());
  v_name text := btrim(p_role_name);
begin
  if v_user is null then raise exception 'Authentication required' using errcode = '28000'; end if;
  if v_name is null or v_name !~ '^[一-龥A-Za-z0-9_]{2,16}$' then
    raise exception 'Invalid role name' using errcode = '22023';
  end if;
  return query update public.moxiu_player_profiles
    set role_name = v_name, name_confirmed = true
    where user_id = v_user and name_confirmed = false returning *;
  if not found then raise exception 'Role name already confirmed' using errcode = '22023'; end if;
end;
$$;
revoke all on function moxiu_private.set_initial_name(text) from public, anon, authenticated;
grant execute on function moxiu_private.set_initial_name(text) to authenticated;
create function public.moxiu_set_initial_name(p_role_name text)
returns setof public.moxiu_player_profiles language sql security invoker set search_path = '' as $$
  select * from moxiu_private.set_initial_name(p_role_name);
$$;
revoke all on function public.moxiu_set_initial_name(text) from public, anon, authenticated;
grant execute on function public.moxiu_set_initial_name(text) to authenticated;
