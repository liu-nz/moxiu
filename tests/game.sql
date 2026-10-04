-- Test the live database with an ephemeral auth account; all changes roll back.
begin;
select set_config('request.jwt.claims',jsonb_build_object('sub',gen_random_uuid(),'role','authenticated')::text,true);
insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
values(auth.uid(),'authenticated','authenticated',auth.uid()::text||'@example.invalid','{"role_name":"服务结算测试"}',now(),now());
set local role authenticated;
do $$
begin
 begin
  perform * from moxiu_private.game_characters;
  raise exception 'Client read private game characters';
 exception when insufficient_privilege then null; end;
 begin
  perform public.moxiu_game_load(auth.uid(),'{}');
  raise exception 'Client initialized arbitrary character';
 exception when insufficient_privilege then null; end;
 begin
  perform public.moxiu_game_commit(auth.uid(),1,gen_random_uuid(),'reset','[]','{}','{}');
  raise exception 'Client committed arbitrary assets';
 exception when insufficient_privilege then null; end;
 begin
  perform public.moxiu_online('read','{}');
  raise exception 'Retired experimental wallet still accessible';
 exception when insufficient_privilege then null; end;
end; $$;
reset role;
select set_config('request.jwt.claims',jsonb_build_object('sub',auth.uid(),'role','service_role')::text,true);
set local role service_role;
do $$
declare
 initial jsonb := '{"player":{},"currency":{"stone":0,"cny":2000},"inventory":[],"world":{"mode":"standard"}}';
 changed jsonb; loaded jsonb; saved jsonb; replay jsonb;
 request uuid := gen_random_uuid();
begin
 loaded := public.moxiu_game_load(auth.uid(),initial);
 assert loaded->'state'=initial and (loaded->>'revision')::int=1,'first server character initialization';
 assert public.moxiu_game_load(auth.uid(),'{"currency":{"cny":999999}}')->'state'=initial,'initial funds granted once';
 changed := jsonb_set(initial,'{currency,cny}','1600');
 saved := public.moxiu_game_commit(auth.uid(),1,request,'trade.buy','["modern","jingmi",1]',changed,'{"ok":true,"cost":400}');
 assert (saved->>'revision')::int=2 and saved->'state'=changed,'atomic server commit';
 replay := public.moxiu_game_commit(auth.uid(),1,request,'trade.buy','["modern","jingmi",1]',initial,'{}');
 assert replay->'state'=changed and (replay->>'revision')::int=2 and (replay->>'replayed')::boolean,'retry does not spend or award twice';
 assert public.moxiu_game_load(auth.uid(),initial,request)->>'known'='true','receipt survives reload';
 begin
  perform public.moxiu_game_commit(auth.uid(),2,request,'trade.buy','["modern","jingmi",2]',initial,'{}');
  raise exception 'Same request reused for different quantity';
 exception when invalid_parameter_value then null; end;
 saved := public.moxiu_game_commit(auth.uid(),1,gen_random_uuid(),'modern.chooseJob','["dev"]',initial,'{}');
 assert saved->>'conflict'='true' and saved->'state'=changed,'stale second device cannot overwrite character';
 begin
  perform public.moxiu_game_commit(auth.uid(),2,gen_random_uuid(),'sync','[]',jsonb_set(changed,'{currency,cny}','-1'),'{}');
  raise exception 'Negative balance accepted';
 exception when invalid_parameter_value then null; end;
 saved := public.moxiu_game_commit(auth.uid(),2,null,'sync','[]',changed,'{}');
 assert (saved->>'revision')::int=3,'sync uses the same versioned character';
 replay := public.moxiu_game_commit(auth.uid(),1,request,'trade.buy','["modern","jingmi",1]',initial,'{}');
 assert replay->'state'=changed and (replay->>'revision')::int=3,'old replay returns current state without undoing later work';
end; $$;
reset role;
rollback;
select 'private privileges, initialization, CAS, replay, bad balance and retired API: passed' as result;
