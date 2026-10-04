import { cloudSession, getCloudClient } from './cloud.js';
import { emit } from './bus.js';
let owner=null,snapshot=null;
export let chatBusy=false,chatError='';
const pendingKey=()=>`moxiu.chat.pending.${cloudSession?.user?.id}`;
export function chatData(){return owner===cloudSession?.user?.id?snapshot:null;}
export function chatPending(){try{return JSON.parse(localStorage.getItem(pendingKey()));}catch{return null;}}
export async function chatAction(action='read',payload={}) {
 const user=cloudSession?.user?.id;
 if(!user)throw new Error('请先登录账号');
 if(chatBusy)return null;
 chatBusy=true;
 try{
  const client=await getCloudClient();
  const {data:session,error:authError}=await client.auth.getSession();
  if(authError||session?.session?.user?.id!==user)throw new Error('登录状态已改变，请重新登录');
  const intent=action==='send'?(chatPending()||{...payload,id:crypto.randomUUID()}):payload;
  if(action==='send')localStorage.setItem(pendingKey(),JSON.stringify(intent));
  const {data,error}=await client.rpc('moxiu_chat',{p_action:action,p_data:intent});
  if(cloudSession?.user?.id!==user)throw new Error('账号已改变，请重新载入');
  if(error){
   if(action==='send'&&['22023','42501','28000'].includes(error.code))localStorage.removeItem(pendingKey());
   throw new Error(['22023','42501','28000'].includes(error.code)?error.message:'消息结果暂未确认，请重试原消息');
  }
  if(!Array.isArray(data?.messages)||typeof data.admin!=='boolean'||!data.self?.uid)throw new Error('聊天记录读取异常');
  if(action==='send')localStorage.removeItem(pendingKey());
  snapshot=data;owner=user;chatError='';return data;
 }catch(e){chatError=e.message||'聊天连接失败';throw e;}
 finally{chatBusy=false;emit('chat');}
}
