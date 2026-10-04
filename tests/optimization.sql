begin;
select set_config('request.jwt.claims','{"role":"service_role"}',true);
select set_config('qa.story',gen_random_uuid()::text,true);
insert into auth.users(id,aud,role,email,raw_user_meta_data,created_at,updated_at)
values(current_setting('qa.story')::uuid,'authenticated','authenticated','qa-story-'||current_setting('qa.story')||'@example.invalid','{"role_name":"剧情验证"}',now(),now());
do $$ declare u uuid:=current_setting('qa.story')::uuid; begin
 perform public.moxiu_game_load(u,'{"player":{"stage":2},"currency":{"stone":0,"cny":2000},"tales":{"flags":{}},"world":{"mode":"standard"}}');
 perform moxiu_private.refresh_titles(u);
 assert not exists(select 1 from moxiu_private.shard_entitlements where user_id=u and sku like 'title_story_%'),'no story title before completion';
 update moxiu_private.game_characters set payload=jsonb_set(payload,'{tales,flags}','{"professor_complete":"protect","bond_moyao_complete":"listen","gate_origin_complete":"recorded"}') where user_id=u;
 perform moxiu_private.refresh_titles(u);perform moxiu_private.refresh_titles(u);
 assert (select count(*)=3 from moxiu_private.shard_entitlements where user_id=u and sku like 'title_story_%'),'three canonical completed stories grant exactly three titles without duplicate';
 assert (select count(*)=13 from moxiu_private.shard_catalog where sku like 'title_story_%' and availability='achievement'),'thirteen free display titles';
 assert not has_function_privilege('authenticated','moxiu_private.refresh_titles(uuid)','execute'),'client cannot grant titles';
end $$;
rollback;
