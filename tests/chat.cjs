const assert=require('node:assert/strict'),{chromium}=require('playwright');
const {gameFixture}=require('./game-fixture.cjs');
(async()=>{
 const user={id:'6135c290-a19a-4892-9e9b-80d64ba14811',email:'chat@example.invalid',aud:'authenticated',role:'authenticated'},exp=Math.floor(Date.now()/1000)+3600;
 const token=`${Buffer.from('{}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp,role:'authenticated'})).toString('base64url')}.fixture`;
 const title={sku:'title_creator',name:'创世神',style:'rainbow',symbol:'✺',kind:'title',price:1,availability:'exclusive',description:'作者专属'};
 const gold={sku:'title_core',name:'金丹真人',style:'gold',symbol:'☀'};
 const data={admin:true,self:{uid:10000001,role_name:'传音行者'},server_time:new Date().toISOString(),messages:[
  {id:1,channel:'public',kind:'message',content:'两界相逢，道友安好。',uid:10000002,role_name:'青云客',title:gold,mine:false,created_at:new Date().toISOString()},
  {id:2,channel:'private',kind:'message',content:'私聊测试：只显示自己的收件箱。',uid:10000003,role_name:'灵田散人',peer_uid:10000003,peer_name:'灵田散人',mine:false,created_at:new Date().toISOString()},
  {id:3,channel:'system',kind:'notice',content:'获得称号「创世神」。',role_name:'天道',mine:false,created_at:new Date().toISOString()}
 ]};
 const calls=[],committed=new Map(),errors=[],checks=[];let lose=false;
 const check=(v,label)=>{assert(v,label);checks.push(label);};
 const game=await gameFixture();
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 try{
  const p=await browser.newPage({viewport:{width:1440,height:1000}});p.on('pageerror',e=>errors.push(e.message));
  await p.addInitScript(({user,exp,token})=>{localStorage.setItem('moxiu.cloud.enabled','1');localStorage.setItem('moxiu.supabase.auth',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:exp,token_type:'bearer',user}));},{user,exp,token});
  await p.route('https://zqgcijakvjzvvtecdacj.supabase.co/**',async route=>{
   const u=route.request().url();let result=[];
   if(u.includes('/functions/v1/moxiu-game'))return game.handle(route);
   if(u.includes('/auth/v1/user'))result=user;
   else if(u.includes('/moxiu_player_profiles'))result={uid:10000001,role_name:'传音行者',name_confirmed:true};
   else if(u.includes('/moxiu_shards'))result={balance:0,title:title.sku,catalog:[title],owned:[title.sku],orders:[],ledger:[],review:[],history:[],admin:true};
   else if(u.includes('/moxiu_chat')){
    const {p_action:action,p_data:payload}=route.request().postDataJSON();calls.push({action,payload});
    if(action==='send'&&!committed.has(payload.id)){
     committed.set(payload.id,payload);data.messages.push({id:Math.max(...data.messages.map(m=>m.id))+1,channel:payload.channel,kind:payload.announcement?'announcement':payload.channel==='broadcast'?'shout':'message',content:payload.content,uid:10000001,role_name:'传音行者',title,mine:true,peer_uid:payload.uid,peer_name:'青云客',created_at:new Date().toISOString()});
     if(lose){lose=false;return route.abort('failed');}
    }
    if(action==='delete')data.messages=data.messages.filter(m=>m.id!==payload.id);
    result=data;
   }
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(result)});
  });
  await p.goto(process.env.MOXIU_URL||'http://127.0.0.1:3002/');await p.waitForFunction(()=>!!window.__moxiu?.ready);await p.evaluate(()=>window.__moxiu.ready);
  const dismiss=p.getByRole('button',{name:'知道了',exact:true});if(await dismiss.isVisible())await dismiss.click();
  check(await p.locator('.chat-window').isHidden(),'chat begins collapsed and does not block the game');
  await p.locator('.chat-launcher').click();await p.getByText('两界相逢，道友安好。').waitFor();
  check(await p.locator('.chat-window .title-gold').count()===1,'messages display gold title and symbol');
  check(await p.locator('.chat-self .title-rainbow').count()===1,'own equipped creator title has animated rainbow badge');
  await p.getByRole('button',{name:'青云客',exact:true}).click();
  check(await p.getByLabel('私聊玩家UID').inputValue()==='10000002','clicking role name opens private recipient');
  await p.getByLabel('聊天消息').fill('给青云客的一句私聊。');await p.getByRole('button',{name:'发送',exact:true}).click();await p.getByText('给青云客的一句私聊。',{exact:true}).waitFor();
  const dm=calls.find(c=>c.action==='send');check(dm.payload.uid===10000002&&dm.payload.channel==='private'&&!('title' in dm.payload)&&!('role_name' in dm.payload),'message submits recipient and text only, never trusted identity');
  await p.getByRole('tab',{name:/^公共/}).click();await p.getByLabel('聊天消息').fill('导航后保留草稿');
  const input=await p.getByLabel('聊天消息').elementHandle();await p.evaluate(()=>import('./src/ui/app.js').then(m=>m.navigate('farm')));await p.waitForTimeout(150);
  check(await input.evaluate(el=>el===document.querySelector('[aria-label="聊天消息"]'))&&await p.getByLabel('聊天消息').inputValue()==='导航后保留草稿','game rendering preserves input node and unsent draft');
  await p.getByLabel('聊天消息').fill('<img src=x onerror="window.chatInjected=1">');await p.getByRole('button',{name:'发送',exact:true}).click();await p.getByText('<img src=x onerror="window.chatInjected=1">',{exact:true}).waitFor();
  check(await p.locator('.chat-log img').count()===0&&!await p.evaluate(()=>window.chatInjected),'chat content is plain text, HTML never runs');
  lose=true;await p.getByLabel('聊天消息').fill('丢失响应仍只发一次');await p.getByRole('button',{name:'发送',exact:true}).click();await p.getByRole('button',{name:'重试原消息',exact:true}).waitFor();
  await p.getByRole('button',{name:'重试原消息',exact:true}).click();await p.getByText('丢失响应仍只发一次',{exact:true}).waitFor();
  const retries=calls.filter(c=>c.action==='send'&&c.payload.content==='丢失响应仍只发一次');
  check(retries.length===2&&retries[0].payload.id===retries[1].payload.id&&data.messages.filter(m=>m.content==='丢失响应仍只发一次').length===1,'lost response retries original UUID without duplicate');
  await p.getByRole('tab',{name:/^公告喊话/}).click();await p.getByLabel('发布管理员公告').check();await p.getByLabel('聊天消息').fill('管理员公告测试');await p.getByRole('button',{name:'发送',exact:true}).click();await p.getByText('管理员公告测试',{exact:true}).waitFor();
  check(calls.some(c=>c.payload.announcement===true)&&await p.locator('.chat-announcement .chat-kind').innerText()==='公告','admin announcement visually distinct from player shouts');
  await p.getByRole('tab',{name:/^系统/}).click();await p.getByText('获得称号「创世神」。',{exact:true}).waitFor();
  check(await p.getByLabel('聊天消息').isHidden(),'system channel is read only');
  await p.setViewportSize({width:390,height:844});await p.getByRole('tab',{name:/^公共/}).click();
  check(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile chat has no horizontal overflow');
  await p.screenshot({path:'test-results/两界聊天手机.png',fullPage:false});
  await p.setViewportSize({width:390,height:530});
  const rect=await p.locator('.chat-compose').boundingBox();check(rect&&rect.y>=0&&rect.y+rect.height<=530,'composer stays within small mobile viewport');
  await p.locator('.chat-launcher').click();check(await p.locator('.chat-window').isHidden(),'chat collapses again without changing gameplay');
  check(errors.length===0,'no browser runtime errors');console.log(JSON.stringify({passed:checks.length,checks}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
