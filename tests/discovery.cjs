const assert=require('node:assert/strict'),fs=require('node:fs');
const {chromium}=require('playwright');
const {gameFixture}=require('./game-fixture.cjs');
(async()=>{
 const browser=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const originalRandom=Math.random;Math.random=()=>.1;
 const checks=[],errors=[],check=(v,label)=>{assert(v,label);checks.push(label);};
 try{
 const game=await gameFixture();game.state.side='cultivation';game.state.player.stage=27;game.state.tutorial.step=999;game.state.currency.stone=5000;game.state.research.points=300;game.state.modern.job='dev';game.state.research.done.meridian=true;game.state.research.done.neuralinterface=true;game.state.collection={secrets:['signal','night']};game.state.commissions.relations={'炼器大师':40};
 const {addItem}=await import('../src/systems/inventory.js');addItem(game.state,'yinjing',4);
 const user={id:'6135c290-a19a-4892-9e9b-80d64ba14811',email:'qa-discovery@example.invalid',aud:'authenticated',role:'authenticated'},exp=Math.floor(Date.now()/1000)+3600,token=`e30.${Buffer.from(JSON.stringify({sub:'6135c290-a19a-4892-9e9b-80d64ba14811',exp,role:'authenticated'})).toString('base64url')}.fixture`;
 const context=await browser.newContext({viewport:{width:1440,height:1000}});
 await context.addInitScript(({user,exp,token})=>{localStorage.setItem('moxiu.cloud.enabled','1');localStorage.setItem('moxiu.supabase.auth',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:exp,token_type:'bearer',user}));},{user,exp,token});
 await context.route('https://zqgcijakvjzvvtecdacj.supabase.co/**',async route=>{const url=route.request().url();if(url.includes('/functions/v1/moxiu-game'))return game.handle(route);const data=url.includes('/auth/v1/user')?user:url.includes('/moxiu_player_profiles')?{uid:10000001,role_name:'图鉴测试',name_confirmed:true}:[];await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});});
 const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.MOXIU_URL || 'http://127.0.0.1:3002/');await page.waitForFunction(()=>window.__moxiu?.ready);await page.evaluate(()=>window.__moxiu.ready);await page.evaluate(()=>import('/src/ui/dom.js').then(m=>m.closeAllOverlays()));
 const nav=async view=>page.evaluate(v=>import('/src/ui/app.js').then(m=>m.navigate(v)),view);
 await nav('home');await page.getByLabel('选择个人目标').selectOption('home');await page.waitForFunction(()=>window.__moxiu.state.objective==='home');
 check(game.calls.some(c=>c.action==='objectives.setObjective'),'long term choice settles on server');
 check(await page.getByText('主要目标 · 修炼至星陨海',{exact:true}).count()===0,'goal is realm progress, not dungeon name');
 check(await page.getByText(/^主要目标 · /).count()===1 && await page.getByText('长期目标 · 攒第一套城郊房',{exact:true}).count()===1,'main and personal goal live progress mounted');
 fs.mkdirSync('test-results',{recursive:true});await page.getByRole('heading',{name:'我的目标',exact:true}).evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));await page.waitForTimeout(350);await page.screenshot({path:'test-results/三项目标桌面.png'});
 await nav('character');await page.getByText('隐秘手记 · 3/3',{exact:true}).click();check(await page.getByText('程序员、元婴及以上、完成经脉模型；发现隐藏研究灵识编译器。',{exact:true}).count()===1,'secret discovery conditions visible only after discovery');
 await page.getByRole('heading',{name:'收藏图鉴',exact:true}).evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));await page.waitForTimeout(350);await page.screenshot({path:'test-results/两界录桌面.png'});
 await nav('craft');await page.waitForTimeout(250);const row=page.locator('.rowitem').filter({has:page.getByText('青穗剑',{exact:true})});await row.getByRole('button',{name:'锻造 武器',exact:true}).click();await page.waitForFunction(()=>window.__moxiu.state.bag.some(e=>e.design==='qingsui'));
 check(game.state.currency.stone===4760 && game.calls.some(c=>c.action==='forging.forge' && c.args[0]==='design_qingsui'),'named blueprint UI charges material and stone through command');
 await nav('research');const researchRow=page.locator('.rowitem').filter({has:page.getByText('灵识编译器',{exact:true})});await researchRow.getByRole('button',{name:'研究',exact:true}).click();await page.waitForFunction(()=>window.__moxiu.state.research.done.compiler);
 check(game.state.research.points<121 && game.calls.some(c=>c.action==='research.doResearch' && c.args[0]==='compiler'),'secret research uses actual paid research action');
 await nav('events');const story=page.locator('.rowitem').filter({has:page.getByText('○ 炼器大师 · 徒弟的图谱',{exact:true})});await story.getByRole('button',{name:'追寻线索',exact:true}).click();await page.getByRole('heading',{name:'奇闻 · 徒弟的第一张图谱',exact:true}).waitFor();
 check(game.state.tales.pending?.id==='workshop_after_start','relation-gated NPC followup opens from existing exploration');await page.getByRole('button',{name:'先试雨露袍，验证守护',exact:true}).click();await page.waitForFunction(()=>window.__moxiu.state.tales.flags.workshop_after_route==='robe');
 check(game.calls.some(c=>c.action==='tales.resolveTale'),'NPC branch choice goes to authoritative settlement');
 await page.evaluate(()=>import('/src/ui/dom.js').then(m=>m.closeAllOverlays()));await page.setViewportSize({width:390,height:844});
 for(const view of ['home','character','craft','research','events']){await nav(view);await page.waitForTimeout(150);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),view+' has no mobile overflow');}
 await nav('character');await page.getByText('定向器物志 · 1/6',{exact:true}).click();await page.getByRole('heading',{name:'收藏图鉴',exact:true}).evaluate(el=>el.scrollIntoView({behavior:'instant',block:'start'}));await page.waitForTimeout(350);await page.screenshot({path:'test-results/两界录手机.png'});
 check(!errors.length,'new content has no browser exceptions');console.log(JSON.stringify({passed:checks.length,checks}));
 }finally{Math.random=originalRandom;await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
