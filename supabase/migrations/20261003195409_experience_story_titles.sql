insert into moxiu_private.shard_catalog(sku,name,price,kind,description,availability,style,symbol) values
('title_story_professor','求真同行',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','azure','✧'),
('title_story_collector','旧物知音',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','gold','◇'),
('title_story_classmate','故友新途',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','jade','♡'),
('title_story_blackmarket','账簿守望',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','violet','✉'),
('title_story_refugee','归途引路',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','jade','☘'),
('title_story_stele','古碑译者',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','azure','⌘'),
('title_story_auction','寻人藏家',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','gold','◇'),
('title_story_gate_echo','回声行者',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','violet','✧'),
('title_story_bond_suqingyuan','剑心相照',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','azure','⚔'),
('title_story_bond_moyao','炉火同心',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','gold','❀'),
('title_story_bond_tiexinlan','同行铁骨',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','jade','❖'),
('title_story_bond_bailing','狐乡归客',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','violet','♧'),
('title_story_gate_origin','两界见证',1,'title','免费：完成对应连续故事；纯展示，无属性加成。','achievement','gold','◈');

create or replace function moxiu_private.refresh_titles(p_user uuid)
returns void language plpgsql security definer set search_path='' as $$
declare s jsonb;
begin
 perform moxiu_private.refresh_titles_before_activity(p_user);
 select payload into s from moxiu_private.game_characters where user_id=p_user;
 if s is null then return; end if;
 insert into moxiu_private.shard_entitlements(user_id,sku,grant_source)
 select p_user,t.sku,'achievement' from (values
 ('title_messenger',coalesce((s#>>'{commissions,total}')::int,0)>=10),
 ('title_all_trades',coalesce(s#>'{commissions,sources}','[]') @> '["farm","ranch","market"]'),
 ('title_herbalist',coalesce(s#>'{collection,crops}','[]') @> '["lingmi","huangjing","bainian","binglian","jiuzhuan"]'),
 ('title_beast_codex',coalesce(s#>'{collection,beasts}','[]') @> '["linghu","canglang","xuangui","huofeng","pixiu"]'),
 ('title_ranch_codex',coalesce(s#>'{collection,ranch}','[]') @> '["lingji","lingyang","linglu"]'),
 ('title_gear_codex',jsonb_array_length(coalesce(s#>'{collection,equipment}','[]'))>=35),
 ('title_relay_aid',s#>>'{tales,flags,relay_complete}'='aid'),
 ('title_relay_search',s#>>'{tales,flags,relay_complete}'='search'),
 ('title_relay_keeper',s#>>'{tales,flags,relay_complete}' in ('carry','keep')),
 ('title_clinic_care',s#>>'{tales,flags,clinic_complete}'='care'),
 ('title_clinic_study',s#>>'{tales,flags,clinic_complete}'='study'),
 ('title_story_professor',s#>>'{tales,flags,professor_complete}' is not null),
('title_story_collector',s#>>'{tales,flags,collector_complete}' is not null),
('title_story_classmate',s#>>'{tales,flags,classmate_complete}' is not null),
('title_story_blackmarket',s#>>'{tales,flags,blackmarket_complete}' is not null),
('title_story_refugee',s#>>'{tales,flags,refugee_complete}' is not null),
('title_story_stele',s#>>'{tales,flags,stele_complete}' is not null),
('title_story_auction',s#>>'{tales,flags,auction_complete}' is not null),
('title_story_gate_echo',s#>>'{tales,flags,gate_echo_complete}' is not null),
('title_story_bond_suqingyuan',s#>>'{tales,flags,bond_suqingyuan_complete}' is not null),
('title_story_bond_moyao',s#>>'{tales,flags,bond_moyao_complete}' is not null),
('title_story_bond_tiexinlan',s#>>'{tales,flags,bond_tiexinlan_complete}' is not null),
('title_story_bond_bailing',s#>>'{tales,flags,bond_bailing_complete}' is not null),
('title_story_gate_origin',s#>>'{tales,flags,gate_origin_complete}' is not null),
 ('title_signin',coalesce((select signin_total from moxiu_private.player_activity where user_id=p_user),0)>=7)
 ) t(sku,earned) where earned on conflict(user_id,sku) do nothing;
end; $$;
revoke all on function moxiu_private.refresh_titles(uuid) from public,anon,authenticated;
grant execute on function moxiu_private.refresh_titles(uuid) to service_role;
