import { cloudSession, getCloudClient } from './cloud.js';
import { bindAuthority } from './authority.js';
import { emit, EV } from './bus.js';
import { bindServerRights } from './shards.js';
let stateRef, owner, revision = 0, poll;
export let gameBusy = false;
export let gameError = '';
export let marketLinked = false;
const key = () => 'moxiu.game.pending.' + owner;
export function gamePending() {
 try { return JSON.parse(localStorage.getItem(key())); } catch { return null; }
}
function adopt(data) {
 if (!data?.state?.player || !Array.isArray(data.state.inventory) ||
     !['stone','cny'].every(k => Number.isFinite(data.state.currency?.[k]) && data.state.currency[k] >= 0) ||
     !Number.isSafeInteger(data.revision)) throw new Error('服务器角色资料异常，请重试确认');
 if (!stateRef) stateRef = data.state;
 else { for (const k of Object.keys(stateRef)) delete stateRef[k]; Object.assign(stateRef,data.state); }
 revision = data.revision;
 marketLinked = data.market_linked ?? marketLinked;
 if (Array.isArray(data.owned)) bindServerRights(stateRef,data.owned,data.title);
 emit(EV.STATE); emit(EV.TICK);
}
async function request(intent) {
 const client = await getCloudClient();
 const {data:session,error:authError} = await client.auth.getSession();
 if (authError || session?.session?.user?.id !== owner) throw new Error('登录状态已改变，请重新登录');
 const {data,error} = await client.functions.invoke('moxiu-game',{body:intent});
 if (cloudSession?.user?.id !== owner) throw new Error('登录状态已改变，请重新登录');
 if (error) {
  const response=error.context; let details;
  if (response?.json) { try { details=await response.json(); } catch {} }
  if (details?.state) adopt(details);
  // A sync conflict or expired login cannot establish the pending command's outcome.
  if (intent.action !== 'sync' && [400,409].includes(response?.status)) localStorage.removeItem(key());
  throw new Error(details?.error || '结果暂未确认，请重试原操作；新操作已暂停');
 }
 adopt(data); return data;
}
export async function refreshGame(retry=false) {
 if (gameBusy) return;
 gameBusy=true; emit(EV.STATE);
 try {
  const pending=gamePending();
  const data=await request(retry&&pending ? pending : {action:'sync',args:[]});
  if (retry&&pending) localStorage.removeItem(key());
  gameError=''; return data;
 } catch(e) { gameError=e.message; throw e; }
 finally { gameBusy=false; emit(EV.STATE); }
}
async function command(_state,action,args) {
 if (gameBusy || gamePending()) return {ok:false,reason:'上一笔操作尚未确认，请先刷新或重试确认'};
 gameBusy=true; emit(EV.STATE);
 try {
  const intent={action,args,request_id:crypto.randomUUID(),revision};
  localStorage.setItem(key(),JSON.stringify(intent));
  const response=await request(intent);
  localStorage.removeItem(key()); gameError=''; return response.result;
 } catch(e) {
  gameError=e.message; emit(EV.TOAST,{message:e.message,kind:'warn'});
  return {ok:false,reason:e.message};
 } finally { gameBusy=false; emit(EV.STATE); }
}
export async function loadGame() {
 owner=cloudSession.user.id;
 const response=await refreshGame();
 bindAuthority(stateRef,command);
 return {state:stateRef,report:response.report};
}
export function startGameSync() {
 clearInterval(poll);
 const sync=()=>{if(!gameBusy&&!gamePending()&&!document.hidden)refreshGame().catch(()=>{});};
 poll=setInterval(sync,15000);
 document.addEventListener('visibilitychange',sync);
}
export function resetGame() { return command(stateRef,'reset',[]); }
