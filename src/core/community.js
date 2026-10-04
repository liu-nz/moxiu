import { cloudSession, getCloudClient } from './cloud.js';
import { emit, EV } from './bus.js';
let snapshot, owner;
export let communityBusy=false, communityError='';
export function communityData(){return cloudSession?.user?.id===owner?snapshot:null;}
export async function refreshCommunity(){
  if(communityBusy)return snapshot;
  const user=cloudSession?.user?.id;
  if(!user)throw new Error('请先登录账号');
  communityBusy=true;emit(EV.STATE);
  try{
    const client=await getCloudClient();
    const {data:session,error:authError}=await client.auth.getSession();
    if(authError||session?.session?.user?.id!==user)throw new Error('登录状态已改变，请重新登录');
    const {data,error}=await client.functions.invoke('moxiu-game',{body:{action:'community',args:[]}});
    if(error)throw new Error('玩家交易与论道连接失败，请刷新重试');
    if(cloudSession?.user?.id!==user)throw new Error('登录状态已改变，请重新登录');
    if(!data||!['offers','mine','power_board','arena_board','opponents','matches','trades'].every(k=>Array.isArray(data[k])))throw new Error('玩家资料格式异常，请重试');
    owner=user;snapshot=data;communityError='';return data;
  }catch(e){communityError=e.message;throw e;}
  finally{communityBusy=false;emit(EV.STATE);}
}
