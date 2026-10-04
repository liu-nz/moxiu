-- Run in the Supabase SQL editor / execute_sql. All test users and writes are rolled back.
begin;
insert into auth.users (id, email, raw_user_meta_data) values
  ('5135c290-a19a-4892-9e9b-80d64ba14811', 'profile-a@example.invalid', '{"role_name":"墨山行者","uid":10000001}'),
  ('5135c290-a19a-4892-9e9b-80d64ba14812', 'profile-b@example.invalid', '{"role_name":"墨山行者"}');
do $$
declare
  a integer;
  b integer;
  bad text;
begin
  select uid into a from public.moxiu_player_profiles where user_id = '5135c290-a19a-4892-9e9b-80d64ba14811';
  select uid into b from public.moxiu_player_profiles where user_id = '5135c290-a19a-4892-9e9b-80d64ba14812';
  assert a >= 10000001 and b > a, 'UID generation / uniqueness';
  assert a <> 10000001, 'Caller cannot choose UID';
  foreach bad in array array['{}', '{"role_name":""}', '{"role_name":"墨"}', '{"role_name":"bad name"}',
    '{"role_name":"abcdefghijklmnopq"}', '{"role_name":"<script>"}'] loop
    begin
      insert into auth.users (id, email, raw_user_meta_data) values
        ('5135c290-a19a-4892-9e9b-80d64ba14813', 'profile-invalid@example.invalid', bad::jsonb);
      raise exception 'Invalid name was accepted: %', bad;
    exception when invalid_parameter_value then null;
    end;
  end loop;
  assert not exists (select 1 from auth.users where id = '5135c290-a19a-4892-9e9b-80d64ba14813'), 'Registration rolled back';
  update auth.users set raw_user_meta_data = '{"role_name":"伪造名称","uid":1}' where id = '5135c290-a19a-4892-9e9b-80d64ba14811';
  assert (select role_name = '墨山行者' and uid = a from public.moxiu_player_profiles where user_id = '5135c290-a19a-4892-9e9b-80d64ba14811'), 'Auth metadata cannot rewrite identity';
  -- Simulate the one-time naming opportunity given only to pre-existing accounts.
  update public.moxiu_player_profiles set name_confirmed = false where user_id = '5135c290-a19a-4892-9e9b-80d64ba14811';
end;
$$;

set local role authenticated;
select set_config('request.jwt.claim.sub', '5135c290-a19a-4892-9e9b-80d64ba14811', true);
do $$
declare v_uid integer;
begin
  assert (select count(*) = 1 from public.moxiu_player_profiles), 'Can read own profile only';
  assert not exists (select 1 from public.moxiu_player_profiles where user_id = '5135c290-a19a-4892-9e9b-80d64ba14812'), 'Cross-account read denied';
  select uid into v_uid from public.moxiu_player_profiles;
  begin
    update public.moxiu_player_profiles set role_name = '伪造名称';
    raise exception 'Client UID update accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    insert into public.moxiu_player_profiles (user_id, role_name) values ('5135c290-a19a-4892-9e9b-80d64ba14812', '伪造行者');
    raise exception 'Client profile insert accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.moxiu_set_initial_name('bad name');
    raise exception 'Invalid initial name accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.moxiu_set_initial_name('  青云来客  ');
  assert (select uid = v_uid and role_name = '青云来客' and name_confirmed from public.moxiu_player_profiles), 'Legacy naming preserves UID';
  begin
    perform public.moxiu_set_initial_name('再次改名');
    raise exception 'Second initial rename accepted';
  exception when invalid_parameter_value then null;
  end;
  perform public.moxiu_write_test_save('{"player":{"role_name":"假名称","uid":1},"currency":{}}', 0);
  assert (select uid = v_uid and role_name = '青云来客' from public.moxiu_player_profiles), 'Game snapshots cannot replace identity';
end;
$$;
set local role anon;
do $$
begin
  begin
    perform 1 from public.moxiu_player_profiles;
    raise exception 'Anonymous profile read accepted';
  exception when insufficient_privilege then null;
  end;
  begin
    perform public.moxiu_set_initial_name('匿名改名');
    raise exception 'Anonymous naming accepted';
  exception when insufficient_privilege then null;
  end;
end;
$$;
reset role;
select 'PASS: UID generation, registration validation, account isolation, immutable identity, legacy naming and snapshot separation' as result;
rollback;
