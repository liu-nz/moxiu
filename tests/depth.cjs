const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('playwright');
const { gameFixture } = require('./game-fixture.cjs');
(async () => {
 const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const errors = [], checks = []; const check = (v,label) => {assert(v,label); checks.push(label);};
 try {
  const game = await gameFixture(); game.state.player.stage=14; game.state.side='cultivation'; game.state.path='alchemy'; game.state.research.done.database=true; game.state.currency.stone=3000; game.state.bag=[{uid:'qa-affix',slot:'artifact',tier:'rare',name:'溯界灵枢盘',enhance:0,stats:{}}]; const {addItem}=await import('../src/systems/inventory.js'); addItem(game.state,'lingjin',4);addItem(game.state,'shilingdan',1); game.state.tutorial.step=999;
  game.state.farm.plots[0]={cropId:'lingmi',readyAt:Date.now()+3600000};
  game.state.daily.help={id:'qa-help',author_name:'青云客'};
  const user={id:'6135c290-a19a-4892-9e9b-80d64ba14811',email:'qa-activity@example.invalid',aud:'authenticated',role:'authenticated'};
  const exp=Math.floor(Date.now()/1000)+3600, token=`e30.${Buffer.from(JSON.stringify({sub:user.id,exp,role:'authenticated'})).toString('base64url')}.fixture`;
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.addInitScript(({user,exp,token})=>{
   localStorage.setItem('moxiu.cloud.enabled','1'); localStorage.setItem('moxiu.supabase.auth',JSON.stringify({access_token:token,refresh_token:'fixture',expires_at:exp,token_type:'bearer',user}));
  },{user,exp,token});
  const social={friends:[{id:'qa-friend',uid:10000002,role_name:'青云客',stage:10,power:2000,updated_at:new Date().toISOString(),title:{name:'两界信使',style:'azure',symbol:'✉'},help_sent:false}],incoming:[],outgoing:[],notes:[]};
  await context.route('https://zqgcijakvjzvvtecdacj.supabase.co/**',async route=>{
   const url=route.request().url();let data=[];
   if(url.includes('/functions/v1/moxiu-game'))return game.handle(route);
   if(url.includes('/auth/v1/user'))data=user;
   else if(url.includes('/moxiu_player_profiles'))data={uid:10000001,role_name:'照料测试',name_confirmed:true};
   else if(url.includes('/rpc/moxiu_social')) {const body=route.request().postDataJSON(); if(body.p_action==='help')social.friends[0].help_sent=true; data=social;}
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(data)});
  });
  const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
  await page.goto(process.env.MOXIU_URL||'http://127.0.0.1:3002/');await page.waitForFunction(()=>!!window.__moxiu?.ready);await page.evaluate(()=>window.__moxiu.ready);
  await page.evaluate(()=>import('/src/ui/dom.js').then(m=>m.closeAllOverlays()));
  const nav=async id=>page.evaluate(v=>import('/src/ui/app.js').then(m=>m.navigate(v)),id);

  await nav('build');await page.getByRole('heading',{name:'本世套路',exact:true}).waitFor();
  await page.getByRole('button',{name:'启用毒丹流',exact:true}).click();await page.waitForFunction(()=>window.__moxiu.state.player.build==='poison');
  check(game.state.player.build==='poison' && game.calls.some(c=>c.action==='build.selectBuild'),'routine choice uses server settlement');
  await page.getByText('毒丹流 · 条件不足，暂按自由配装',{exact:true}).waitFor();
  check(await page.getByText('毒丹流 · 条件不足，暂按自由配装',{exact:true}).count()===1,'missing pill shown as suspended');
  await page.getByRole('button',{name:'服用蚀灵丹',exact:true}).click();await page.waitForFunction(()=>window.__moxiu.state.player.buffs.some(b=>b.id==='poison_pill'));
  await page.getByText('毒丹流 · 生效',{exact:true}).waitFor();
  check(await page.getByText('毒丹流 · 生效',{exact:true}).count()===1,'consumed pill visibly activates routine');
  check(await page.getByRole('button',{name:'启用灵科流',exact:true}).isDisabled(),'unqualified build disabled');
  await page.getByText('选择铭刻装备 · 1 件可用',{exact:true}).click();await page.getByRole('button',{name:'铭刻商骨',exact:true}).click();
  await page.getByRole('button',{name:'取消',exact:true}).click();check(game.state.currency.stone===3000 && game.state.bag[0].rule===undefined,'imprint cancellation preserves assets');
  await page.getByRole('button',{name:'铭刻商骨',exact:true}).click();await page.getByRole('button',{name:'确认铭刻',exact:true}).click();
  await page.waitForFunction(()=>window.__moxiu.state.bag.some(e=>e.rule==='shanggu'));
  check(game.state.currency.stone===2000 && game.calls.some(c=>c.action==='build.inscribeAffix'),'imprint confirmation settles cost once');
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/套路与词条桌面.png',fullPage:true});
  await nav('events');await page.getByRole('heading',{name:'两界风云',exact:true}).waitFor();
  check(await page.getByText('○ 不属于你的矿泉水',{exact:true}).count()===1,'midgame mainline visible');
  const row=page.locator('.rowitem').filter({has:page.getByText('○ 不属于你的矿泉水',{exact:true})});
  await row.getByRole('button',{name:'追寻线索',exact:true}).click();await page.getByRole('heading',{name:'奇闻 · 坊市的塑料瓶',exact:true}).waitFor();
  check(await page.getByRole('heading',{name:'奇闻 · 坊市的塑料瓶',exact:true}).count()===1,'story opens one modal');
  check(game.state.tales.pending?.id==='crosser_water','mainline request validated by shared rules');
  await page.waitForTimeout(350);await page.screenshot({path:'test-results/穿越者主线选择.png'});
  await page.evaluate(()=>import('/src/ui/dom.js').then(m=>m.closeAllOverlays()));
  await page.setViewportSize({width:390,height:844});
  for(const view of ['build','events','home','dungeon','character']){await nav(view);await page.waitForTimeout(100);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile '+view+' has no overflow');}
  await nav('home');await page.getByRole('heading',{name:'两界风云',exact:true}).evaluate(el=>el.scrollIntoView({behavior:'instant',block:'center'}));await page.waitForTimeout(350);await page.screenshot({path:'test-results/两界风云手机.png'});
  check(errors.length===0,'new views have no browser errors');console.log(JSON.stringify({passed:checks.length,checks}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
