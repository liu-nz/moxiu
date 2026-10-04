import { createClient } from 'npm:@supabase/supabase-js@2.117.2';
import { initialGame, settleGame, settleShared, validateCommand, publicProjection, SHARED_COMMANDS } from './game/core/game-engine.js';

const headers = {
 'Access-Control-Allow-Origin':'*',
 'Access-Control-Allow-Headers':'authorization, apikey, content-type, x-client-info',
 'Access-Control-Allow-Methods':'POST, OPTIONS',
 'Content-Type':'application/json',
 'Cache-Control':'no-store',
};
const respond = (data, status=200) => new Response(JSON.stringify(data), {status,headers});
Deno.serve(async request => {
 if (request.method==='OPTIONS') return new Response('ok',{headers});
 if (request.method!=='POST') return respond({error:'仅支持 POST'},405);
 try {
  const bearer=request.headers.get('Authorization');
  if (!bearer?.startsWith('Bearer ')) return respond({error:'请先登录'},401);
  const admin=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false}});
  // Custom authentication is mandatory even when the platform JWT check is off.
  const {data:identity,error:authError}=await admin.auth.getUser(bearer.slice(7));
  if (authError||!identity.user) return respond({error:'登录已过期，请重新登录'},401);
  const text=await request.text();
  if (text.length>8192) return respond({error:'操作内容过长'},400);
  let intent;
  try { intent=JSON.parse(text); } catch { return respond({error:'无效操作'},400); }
  if (!intent||typeof intent!=='object'||Array.isArray(intent)||
      Object.keys(intent).some(k=>!['action','args','request_id','revision'].includes(k))) return respond({error:'不接受客户端角色数据'},400);
  const action=intent.action,args=intent.args;
  try { validateCommand(action,args); } catch(e) { return respond({error:e.message},400); }
  if(action==='community') {
    const {data,error}=await admin.rpc('moxiu_community_read',{p_user:identity.user.id});
    return error?respond({error:'玩家名册暂不可用，请刷新重试'},503):respond(data);
  }
  const id=action==='sync'?null:intent.request_id;
  if (action!=='sync'&&(!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id)||
      !Number.isSafeInteger(intent.revision))) return respond({error:'操作编号或版本无效'},400);
  const {data:loaded,error:loadError}=await admin.rpc('moxiu_game_load',{
    p_user:identity.user.id,p_initial:initialGame(Date.now()),p_request:id,
  });
  if(loadError) return respond({error:'角色读取失败，请稍后重试'},503);
  if(!loaded.known&&action!=='sync'&&intent.revision!==loaded.revision)
    return respond({error:'进度已在另一设备或页面更新，请根据最新资料重新操作',...loaded,conflict:true},409);
  const now=Math.max(Date.now(),loaded.state.savedAt);
  let context;
  if(!loaded.known&&Object.hasOwn(SHARED_COMMANDS,action)) {
    const response=await admin.rpc('moxiu_shared_context',{p_user:identity.user.id,p_action:action,p_args:args});
    if(response.error)return respond({error:'交易或论道资料读取失败，请用原操作编号重试'},503);
    context=response.data;
  }
  const settled=loaded.known ? {state:loaded.state,result:loaded.result,report:null} : context
    ? settleShared(loaded.state,action,args,now,loaded.owned,context,loaded.title) : settleGame(loaded.state,action,args,now,loaded.owned,loaded.title,loaded.activity);
  const shared=!!settled.effect&&settled.result.ok;
  const counterpart=shared&&['exchange.buy','arena.challenge'].includes(action)?context.target:null;
  const params={
    p_user:identity.user.id,p_revision:loaded.revision,p_request:id,p_action:action,
    p_args:args,p_state:settled.state,p_result:settled.result,p_projection:publicProjection(settled.state),
    ...(shared?{p_target:counterpart?.id||null,p_target_revision:counterpart?.revision||null,
      p_target_state:counterpart?settled.targetState:null,p_target_projection:counterpart?publicProjection(settled.targetState):null,p_effect:settled.effect}:{}),
  };
  const {data:saved,error:commitError}=await admin.rpc(shared?'moxiu_shared_commit':'moxiu_game_commit_v2',params);
  if(commitError) return respond({error:commitError.code==='22023'?'操作已失效或参数不符，请刷新后重新确认':'结果暂未确认，请用原操作编号重试'},commitError.code==='22023'?400:503);
  if(saved.conflict) return respond({...saved,owned:loaded.owned,title:loaded.title,error:'角色、挂单或对手已更新，请刷新后重新确认'},409);
  return respond({...saved,owned:loaded.owned,title:loaded.title,report:saved.replayed?null:settled.report});
 } catch(e) {
  console.error('game settlement failed',e?.name);
  return respond({error:'服务器结算暂不可用，请用原操作编号重试'},503);
 }
});
