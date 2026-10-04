create table moxiu_private.player_links (
  id uuid primary key default gen_random_uuid(),
  requester uuid not null references auth.users(id) on delete cascade,
  target uuid not null references auth.users(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending','accepted')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (requester <> target),
  unique(requester,target)
);
alter table moxiu_private.player_links enable row level security;
revoke all on moxiu_private.player_links from public, anon, authenticated;
create index player_links_target_status on moxiu_private.player_links(target,status);

create table moxiu_private.player_notes (
  id uuid primary key default gen_random_uuid(),
  author uuid not null references auth.users(id) on delete cascade,
  owner uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('message','blessing')),
  content text not null check (length(btrim(content)) between 1 and 240),
  utc_day date not null default ((now() at time zone 'utc')::date),
  created_at timestamptz not null default now(),
  check (author <> owner)
);
alter table moxiu_private.player_notes enable row level security;
revoke all on moxiu_private.player_notes from public, anon, authenticated;
create unique index player_notes_daily_blessing on moxiu_private.player_notes(author,owner,utc_day) where kind='blessing';
create index player_notes_owner_created on moxiu_private.player_notes(owner,created_at desc);

create or replace function public.moxiu_social(p_action text, p_data jsonb default '{}'::jsonb)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_target uuid;
  v_id uuid;
  v_uid integer;
  v_kind text;
  v_content text;
begin
  if v_user is null then raise exception '请先登录账号' using errcode='28000'; end if;
  if p_data is null or jsonb_typeof(p_data)<>'object' then raise exception '请求格式无效' using errcode='22023'; end if;
  if p_action='request' then
    v_uid := (p_data->>'uid')::integer;
    select user_id into v_target from public.moxiu_player_profiles where uid=v_uid;
    if v_target is null or v_target=v_user then raise exception '行者 UID 无效' using errcode='22023'; end if;
    if exists(select 1 from moxiu_private.player_links where requester=v_user and target=v_target and status='accepted') then
      raise exception '已是同行好友' using errcode='22023';
    end if;
    if exists(select 1 from moxiu_private.player_links where requester=v_target and target=v_user and status='pending') then
      update moxiu_private.player_links set status='accepted',updated_at=now() where requester=v_target and target=v_user;
    elsif not exists(select 1 from moxiu_private.player_links where requester=v_user and target=v_target and status='pending') then
      if (select count(*) from moxiu_private.player_links where status='accepted' and (requester=v_user or target=v_user))>=50 then
        raise exception '同行好友已达 50 人上限' using errcode='22023';
      end if;
      insert into moxiu_private.player_links(requester,target) values(v_user,v_target);
    end if;
  elsif p_action='accept' then
    v_id := (p_data->>'id')::uuid;
    update moxiu_private.player_links set status='accepted',updated_at=now()
      where id=v_id and target=v_user and status='pending';
    if not found then raise exception '好友申请已失效' using errcode='22023'; end if;
  elsif p_action='remove' then
    v_id := (p_data->>'id')::uuid;
    delete from moxiu_private.player_links where id=v_id and status in ('pending','accepted') and (requester=v_user or target=v_user);
    if not found then raise exception '同行关系已不存在' using errcode='22023'; end if;
  elsif p_action='post' then
    v_uid := (p_data->>'uid')::integer;
    v_kind := p_data->>'kind'; v_content := btrim(coalesce(p_data->>'content',''));
    select user_id into v_target from public.moxiu_player_profiles where uid=v_uid;
    if v_target is null or v_target=v_user or v_kind not in ('message','blessing') or length(v_content) not between 1 and 240 then
      raise exception '留言内容或收件行者无效' using errcode='22023';
    end if;
    if not exists(select 1 from moxiu_private.player_links where status='accepted' and ((requester=v_user and target=v_target) or (requester=v_target and target=v_user))) then
      raise exception '仅能给已互为好友的行者留言' using errcode='42501';
    end if;
    if (select count(*) from moxiu_private.player_notes where author=v_user and created_at>now()-interval '1 hour')>=20 then
      raise exception '留言过于频繁，请稍后再试' using errcode='22023';
    end if;
    insert into moxiu_private.player_notes(author,owner,kind,content) values(v_user,v_target,v_kind,v_content);
  elsif p_action<>'read' then
    raise exception '操作不存在' using errcode='22023';
  end if;

  return jsonb_build_object(
    'friends',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'uid',p.uid,'role_name',p.role_name) order by p.role_name)
      from moxiu_private.player_links l join public.moxiu_player_profiles p on p.user_id=case when l.requester=v_user then l.target else l.requester end
      where l.status='accepted' and (l.requester=v_user or l.target=v_user)),'[]'::jsonb),
    'incoming',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'uid',p.uid,'role_name',p.role_name) order by l.created_at)
      from moxiu_private.player_links l join public.moxiu_player_profiles p on p.user_id=l.requester where l.target=v_user and l.status='pending'),'[]'::jsonb),
    'outgoing',coalesce((select jsonb_agg(jsonb_build_object('id',l.id,'uid',p.uid,'role_name',p.role_name) order by l.created_at)
      from moxiu_private.player_links l join public.moxiu_player_profiles p on p.user_id=l.target where l.requester=v_user and l.status='pending'),'[]'::jsonb),
    'notes',coalesce((select jsonb_agg(jsonb_build_object('id',n.id,'kind',n.kind,'content',n.content,'created_at',n.created_at,'author_uid',a.uid,'author_name',a.role_name,'owner_uid',o.uid)
      order by n.created_at desc) from (
        select * from moxiu_private.player_notes where owner=v_user or author=v_user order by created_at desc limit 50
      ) n join public.moxiu_player_profiles a on a.user_id=n.author join public.moxiu_player_profiles o on o.user_id=n.owner),'[]'::jsonb)
  );
end;
$$;
revoke all on function public.moxiu_social(text,jsonb) from public,anon;
grant execute on function public.moxiu_social(text,jsonb) to authenticated;
