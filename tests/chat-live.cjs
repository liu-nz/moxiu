// Opt-in integration; seed canonical server roles with stats.crossings=1. Delete temporary auth users after testing.
const fs=require('fs'),assert=require('node:assert/strict'),{randomUUID}=require('crypto'),{chromium}=require('playwright');
(async()=>{
 assert(process.env.MOXIU_QA_FILE,'Set MOXIU_QA_FILE to two disposable QA accounts; never use player accounts');
 const users=JSON.parse(fs.readFileSync(process.env.MOXIU_QA_FILE,'utf8'));assert.equal(users.length,2);assert(users.every(u=>u.email.endsWith('@example.invalid')),'QA accounts only');
 const url='https://zqgcijakvjzvvtecdacj.supabase.co',key='sb_publishable_RZj01InnTXgoan6DkDqBoQ_-PJ6zDZN',checks=[];
 const check=(v,label)=>{assert(v,label);checks.push(label);};
 for(const u of users){const r=await fetch(url+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password:u.password})});assert.equal(r.status,200);u.session=await r.json();}
 const request=async(u,path,body)=>{const r=await fetch(url+path,{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Authorization:'Bearer '+u.session.access_token},body:JSON.stringify(body)});return{status:r.status,data:await r.json()};};
 const rpc=(u,fn,action,data={})=>request(u,'/rest/v1/rpc/'+fn,{p_action:action,p_data:data});
 const[a,b]=users;
 for(const u of users){const sync=await request(u,'/functions/v1/moxiu-game',{action:'sync',args:[]});check(sync.status===200&&sync.data.owned.includes('title_first_cross'),'actual Edge exposes server-earned title');const equip=await rpc(u,'moxiu_shards','equip',{sku:'title_first_cross'});check(equip.status===200&&equip.data.title==='title_first_cross','free title equips through audited shard RPC');u.uid=(await rpc(u,'moxiu_chat','read')).data.self.uid;}
 const intent={id:randomUUID(),channel:'public',content:'[临时联测] 称号与公开聊天验证，测试后删除。'};
 let r=await rpc(a,'moxiu_chat','send',intent);check(r.status===200&&r.data.messages.some(m=>m.content===intent.content&&m.title?.name==='界门初开'),'actual public message carries server title');
 r=await rpc(a,'moxiu_chat','send',intent);check(r.status===200&&r.data.messages.filter(m=>m.content===intent.content).length===1,'actual retry returns one message');
 r=await rpc(a,'moxiu_chat','send',{id:randomUUID(),channel:'public',content:'非法称号',title:'创世神'});check(r.status===400,'actual endpoint rejects client title injection');
 r=await rpc(b,'moxiu_chat','send',{id:randomUUID(),channel:'broadcast',content:'非法公告',announcement:true});check(r.status===403,'actual nonadmin cannot announce');
 r=await rpc(b,'moxiu_chat','send',{id:randomUUID(),channel:'private',content:'[临时联测] 给甲的私聊消息。',uid:a.uid});check(r.status===200,'actual recipient private message accepted');
 const own=await rpc(a,'moxiu_chat','read');check(own.data.messages.some(m=>m.content==='[临时联测] 给甲的私聊消息。'),'actual private message appears for recipient');
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:390,height:844}}),errors=[];p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(session=>{localStorage.setItem('moxiu.cloud.enabled','1');localStorage.setItem('moxiu.supabase.auth',JSON.stringify(session));},a.session);
  await p.goto(process.env.MOXIU_URL||'http://127.0.0.1:3002/');await p.waitForFunction(()=>!!window.__moxiu?.ready);await p.evaluate(()=>window.__moxiu.ready);
  const dismiss=p.getByRole('button',{name:'知道了',exact:true});if(await dismiss.isVisible())await dismiss.click();
  await p.locator('.chat-launcher').click();await p.getByText(intent.content,{exact:true}).waitFor();check(await p.locator('.chat-self .title-azure').count()===1,'actual logged-in browser shows equipped title');
  await p.getByRole('tab',{name:/^私聊/}).click();await p.getByLabel('私聊玩家UID').fill(String(b.uid));
  await new Promise(r=>setTimeout(r,5200));await p.getByLabel('聊天消息').fill('[临时联测] 手机聊天窗实际发送。');await p.getByRole('button',{name:'发送',exact:true}).click();await p.getByText('[临时联测] 手机聊天窗实际发送。',{exact:true}).waitFor();
  check((await rpc(b,'moxiu_chat','read')).data.messages.some(m=>m.content==='[临时联测] 手机聊天窗实际发送。'),'actual browser sends and other test user receives');
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1)&&errors.length===0,'actual mobile UI has no overflow or runtime errors');
 }finally{await browser.close();}
 console.log(JSON.stringify({passed:checks.length,checks}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
