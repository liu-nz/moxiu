const assert = require('node:assert/strict'), fs = require('node:fs');
const { chromium } = require('playwright');
const { gameFixture } = require('./game-fixture.cjs');
(async () => {
 const browser = await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const errors = [], checks = []; const check = (v,label) => {assert(v,label); checks.push(label);};
 try {
  const game = await gameFixture(); game.state.player.stage=2; game.state.tutorial.step=999;
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

  await nav('build');await page.getByRole('heading',{name:'配装与战术',exact:true}).waitFor();
  await page.getByRole('button',{name:'守阵',exact:true}).click();await page.waitForFunction(()=>window.__moxiu.state.dungeon.tactic==='guard');
  check(game.state.dungeon.tactic==='guard' && game.calls.some(x=>x.action==='build.setTactic'),'tactic selection settles through server command');
  await page.getByRole('button',{name:'调整装备与功法',exact:true}).click();await page.waitForTimeout(100); check(await page.getByRole('heading',{name:'配装与战术',exact:true}).count()===0,'equipment action navigates to character');
  await nav('exploration');await page.getByRole('heading',{name:'世界探索',exact:true}).waitFor();
  check(await page.getByRole('heading',{name:'连续故事',exact:true}).count()===1,'exploration exposes story journal in current world');
  check(await page.locator('.viewtabs button').count()===5,'five primary categories');
  fs.mkdirSync('test-results',{recursive:true});await page.screenshot({path:'test-results/优化探索页.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  for(const view of ['build','events','home','gate']){await nav(view);await page.waitForTimeout(80);check(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth + 1),'mobile '+view+' has no overflow');}
  await nav('build');await page.screenshot({path:'test-results/配装战术手机.png',fullPage:true});
  check(errors.length===0,'new views have no browser errors');console.log(JSON.stringify({passed:checks.length,checks}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
