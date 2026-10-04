import { h,mount,showToast } from './dom.js';
import { on } from '../core/bus.js';
import { cloudSession } from '../core/cloud.js';
import { chatData,chatBusy,chatError,chatAction,chatPending } from '../core/chat.js';
import { equippedTitleInfo } from '../core/shards.js';
import { titleBadge } from './titles.js';
import { showAccount } from './account.js';
const channels={public:'公共',private:'私聊',broadcast:'公告喊话',system:'系统'};
let open=false,channel='public',drafts={},peer='',announcement=false,identity=null,lastSuccess=0;
let root,body,log,input,target,send,status,tabs,launcher,identityBox,contacts,announceControl,seen={},lastRendered='',lastScroll=0;
const seenKey=()=>`moxiu.chat.seen.${cloudSession?.user?.id||'guest'}`;
const draftKey=()=>channel==='private'?`private:${peer}`:channel;
function unread(ch){return(chatData()?.messages||[]).filter(m=>m.channel===ch&&!m.mine&&m.id>(seen[ch==='private'?`private:${m.peer_uid}`:ch]||0)).length;}
function markSeen(){
 const rows=(chatData()?.messages||[]).filter(m=>m.channel===channel&&(channel!=='private'||!peer||String(m.peer_uid)===peer));
 for(const m of rows){const key=channel==='private'?`private:${m.peer_uid}`:channel;seen[key]=Math.max(seen[key]||0,m.id);}
 try{localStorage.setItem(seenKey(),JSON.stringify(seen));}catch{}
}
function scrollToEnd(){requestAnimationFrame(()=>{log.scrollTop=log.scrollHeight;});}
function choose(ch){channel=ch;lastRendered='';input.value=drafts[draftKey()]||'';paint();scrollToEnd();}
function setPeer(uid){peer=String(uid);target.value=peer;choose('private');input.focus();}
function messageNode(m){
 const time=new Date(m.created_at).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'});
 return h('article.chat-message',{class:`chat-${m.kind}${m.mine?' chat-mine':''}`},
  h('div.chat-author',null,m.kind==='announcement'?h('span.chat-kind',{text:'公告'}):m.kind==='shout'?h('span.chat-kind',{text:'喊话'}):null,
   titleBadge(m.title),m.uid?h('button.chat-name',{text:m.role_name,title:`UID ${m.uid} · 点击私聊`,onclick:()=>setPeer(m.uid)}):h('strong',{text:m.role_name}),
   h('time',{text:time,datetime:m.created_at}),m.channel!=='system'&&(m.mine||chatData()?.admin)?h('button.chat-retract',{text:'撤回','aria-label':`撤回消息 ${m.id}`,onclick:async()=>{
    try{await chatAction('delete',{id:m.id});lastRendered='';paint();}catch(e){showToast(e.message,'warn');}
   }}):null),
  m.channel==='private'?h('div.chat-peer',{text:`${m.mine?'发给':'来自'} ${m.peer_name} · UID ${m.peer_uid}`}):null,
  h('p.chat-text',{text:m.content}));
}
function paint(){
 if(!root)return;
 const user=cloudSession?.user?.id||null;
 if(identity!==user){identity=user;drafts={};peer='';lastRendered='';lastSuccess=0;
  try{seen=JSON.parse(localStorage.getItem(seenKey()))||{};}catch{seen={};}
  const pending=chatPending();if(pending){channel=pending.channel;peer=String(pending.uid||'');drafts[draftKey()]=pending.content;announcement=!!pending.announcement;}
  input.value=drafts[draftKey()]||'';target.value=peer;
 }
 const data=chatData(),pending=chatPending(),isPrivate=channel==='private',system=channel==='system';
 body.hidden=!open;launcher.setAttribute('aria-expanded',String(open));
 if(open&&data&&!document.hidden)markSeen();
 const count=Object.keys(channels).reduce((n,ch)=>n+unread(ch),0);
 launcher.textContent=`${open?'收起聊天':'◌ 两界聊天'}${count?` · ${count>99?'99+':count}`:''}`;
 for(const[ch,button]of Object.entries(tabs)){const n=unread(ch);button.textContent=channels[ch]+(n?` ${n}`:'');button.classList.toggle('on',channel===ch);button.setAttribute('aria-selected',String(channel===ch));}
 target.parentElement.hidden=!isPrivate;
 input.parentElement.hidden=system||!user;
 input.disabled=!!pending||chatBusy;
 target.disabled=!!pending||chatBusy;
 send.disabled=chatBusy||(!system&&!pending&&!input.value.trim());send.textContent=pending?'重试原消息':'发送';
 announceControl.hidden=channel!=='broadcast'||!data?.admin;announceControl.querySelector('input').checked=announcement;
 status.textContent=chatError||(pending?'消息尚未确认，请重试原消息。':system?'交易、称号、充值与论道通知，仅本人可见。':channel==='broadcast'?'喊话每60秒一次；公告由管理员发布。':'1–300字 · 发言间隔5秒 · 最近30天记录');
 mount(identityBox,user?h('div.chat-self',null,titleBadge(equippedTitleInfo()),h('span',{text:data?.self?.role_name||'正在读取行者身份…'}),h('button.chat-title-link',{text:'称号收藏',onclick:()=>import('./app.js').then(m=>{m.navigate('shards');open=false;paint();})})):h('button.btn.btn-sm',{text:'登录账号参与聊天',onclick:()=>showAccount()}));
 const friends=new Map();for(const m of data?.messages||[])if(m.channel==='private')friends.set(String(m.peer_uid),m.peer_name);
 contacts.hidden=!isPrivate||friends.size===0;
 mount(contacts,[...friends].slice(-20).reverse().map(([uid,name])=>h('button.chat-contact',{text:name,class:peer===uid?'on':'',onclick:()=>setPeer(uid)})));
 const rows=(data?.messages||[]).filter(m=>m.channel===channel&&(!isPrivate||!peer||String(m.peer_uid)===peer));
 const signature=JSON.stringify([channel,peer,user,rows]);
 if(signature!==lastRendered){
  const nearEnd=log.scrollHeight-log.scrollTop-log.clientHeight<70;
  const previous=log.scrollTop;
  mount(log,rows.length?rows.map(messageNode):h('div.chat-empty',{text:!user?'登录后与两界行者聊天。':isPrivate?'输入8位UID，或点击玩家名字开始私聊。':system?'暂无系统通知。':'频道还很安静，来打个招呼吧。'}));
  lastRendered=signature;if(nearEnd||lastScroll===0)scrollToEnd();else log.scrollTop=previous;
 }
}
async function read(){if(chatBusy||!cloudSession||document.hidden)return;try{await chatAction();lastSuccess=Date.now();}catch{lastSuccess=Date.now();}paint();}
async function submit(){
 const pending=chatPending();
 if(!pending&&(!input.value.trim()||input.value.trim().length>300))return showToast('请输入1–300字消息','warn');
 if(!pending&&channel==='private'&&!/^[1-9]\d{7}$/.test(peer))return showToast('请输入8位玩家UID','warn');
 try{
  const payload=pending||{channel,content:input.value.trim(),...(channel==='private'?{uid:Number(peer)}:{}),...(channel==='broadcast'&&announcement?{announcement:true}:{})};
  const sendingKey=payload.channel==='private'?`private:${payload.uid}`:payload.channel;
  const request=chatAction('send',payload);paint();
  const data=await request;if(!data)return;
  drafts[sendingKey]='';input.value=drafts[draftKey()]||'';lastSuccess=Date.now();lastRendered='';paint();scrollToEnd();
 }catch(e){showToast(e.message,'warn');paint();}
}
export function initChat(){
 root=document.getElementById('chat-root');if(!root||root.childElementCount)return;
 launcher=h('button.chat-launcher',{type:'button','aria-expanded':'false','aria-controls':'chat-window',onclick:()=>{open=!open;paint();if(open){read();scrollToEnd();}}});
 log=h('div.chat-log',{role:'log','aria-live':'polite','aria-label':'聊天记录',onscroll:()=>{lastScroll=log.scrollTop;}});
 target=h('input',{type:'text',inputmode:'numeric',maxlength:8,'aria-label':'私聊玩家UID',placeholder:'输入8位玩家UID',oninput:e=>{drafts[draftKey()]=input.value;peer=e.target.value;input.value=drafts[draftKey()]||'';lastRendered='';paint();}});
 input=h('textarea',{rows:2,maxlength:300,'aria-label':'聊天消息',placeholder:'与两界行者说点什么…',oninput:e=>{drafts[draftKey()]=e.target.value;send.disabled=chatBusy||!e.target.value.trim();},onkeydown:e=>{if(e.key==='Enter'&&(e.ctrlKey||e.metaKey)&&!e.isComposing){e.preventDefault();submit();}}});
 send=h('button.btn.btn-solid.chat-send',{type:'button',text:'发送',onclick:submit});
 status=h('p.chat-status',{role:'status'});identityBox=h('div.chat-identity');contacts=h('div.chat-contacts');
 announceControl=h('label.chat-announcement',null,h('input',{type:'checkbox',onchange:e=>announcement=e.target.checked}),' 发布管理员公告');
 tabs=Object.fromEntries(Object.entries(channels).map(([ch,name])=>[ch,h('button',{type:'button',role:'tab',text:name,onclick:()=>choose(ch)})]));
 body=h('section#chat-window.chat-window',{'aria-label':'两界聊天',hidden:true},
  h('div.chat-heading',null,h('strong',{text:'两界传音'}),h('button.chat-refresh',{text:'刷新聊天',onclick:read})),
  h('div.chat-tabs',{role:'tablist','aria-label':'聊天频道'},Object.values(tabs)),identityBox,
  h('label.chat-target',null,h('span',{text:'私聊UID'}),target),contacts,log,status,
  h('div.chat-compose',null,input,announceControl,h('div.chat-compose-foot',null,h('span',{text:'Ctrl / ⌘ + Enter 发送'}),send)));
 mount(root,[body,launcher]);
 const size=()=>{
  const viewport=window.visualViewport;
  if(!viewport)return;
  root.style.setProperty('--chat-visible-height',`${viewport.height}px`);
  root.style.setProperty('--chat-keyboard-inset',`${Math.max(0,innerHeight-viewport.height-viewport.offsetTop)}px`);
 };
 window.visualViewport?.addEventListener('resize',size);
 window.visualViewport?.addEventListener('scroll',size);size();
 on('chat',paint);on('state',()=>{if(identity!==(cloudSession?.user?.id||null)){paint();read();}else if(open)paint();});
 read();
 setInterval(()=>{if(Date.now()-lastSuccess>(open?5000:30000))read();},5000);
 document.addEventListener('visibilitychange',()=>{if(!document.hidden){paint();read();}});
 paint();
}
