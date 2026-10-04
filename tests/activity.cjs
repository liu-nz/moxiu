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
  await nav('home');await page.getByRole('button',{name:'签到 +20 灵石',exact:true}).click();await page.getByRole('button',{name:'今日已签到',exact:true}).waitFor();
  check(game.state.daily.signInTotal===1,'homepage sign in settles via command');
  const at=game.state.farm.plots[0].readyAt; await page.getByRole('button',{name:'领取同行照料',exact:true}).click();
  await page.waitForFunction(()=>window.__moxiu.state.daily.help===null);
  check(game.state.farm.plots[0].readyAt===at-300000,'homepage care shortens canonical crop wait');
  await nav('gate');await page.getByRole('heading',{name:'两界委托板',exact:true}).waitFor();
  const eggs=page.locator('.rowitem').filter({has:page.getByText('早餐店试吃订单 · 现代都市',{exact:true})});
  await eggs.getByRole('button',{name:'接取委托',exact:true}).click();await page.waitForFunction(()=>window.__moxiu.state.commissions.active.some(x=>x.id==='breakfast-eggs'));
  await nav('home');check(await page.getByText('早餐店试吃订单 · 现代都市',{exact:true}).count()===1,'accepted order appears on home');
  await page.getByText('连续故事与同行手记',{exact:true}).click(); await page.getByRole('heading',{name:'连续故事',exact:true}).waitFor(); check(await page.getByRole('heading',{name:'连续故事',exact:true}).count()===1,'story journal uses existing homepage');
  await nav('character');await page.getByText('异兽志 · 牧场灵兽 · 0/3',{exact:true}).click();
  check(await page.getByText('○ 灵鸡',{exact:true}).count()===1,'undiscovered codex reveals discovery target and source');
  await nav('social');await page.getByRole('button',{name:'同行',exact:true}).click();await page.getByText('青云客 · UID 10000002',{exact:true}).waitFor();
  check(await page.locator('.shard-record .title-azure').count()===1,'friend card displays server title style');
  await page.getByLabel('给 青云客 留言').fill('尚未发送的测试留言'); await page.getByRole('button',{name:'刷新',exact:true}).click(); await page.waitForTimeout(100); check(await page.getByLabel('给 青云客 留言').inputValue()==='尚未发送的测试留言','friend draft survives refresh');
  await page.getByRole('button',{name:'送出同行照料',exact:true}).click();await page.getByRole('button',{name:'今日已送照料',exact:true}).waitFor();
  check(social.friends[0].help_sent,'friend care RPC updates daily status');
  fs.mkdirSync('test-results',{recursive:true});
  await page.screenshot({path:'test-results/同行名片与照料.png',fullPage:true});
  await page.setViewportSize({width:390,height:844});
  for(const view of ['home','gate','character','social']) {await nav(view);check(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),`mobile ${view} has no overflow`);}
  await nav('home');await page.screenshot({path:'test-results/签到与故事手机首页.png',fullPage:true});
  check(errors.length===0,'no browser runtime errors'); console.log(JSON.stringify({passed:checks.length,checks}));
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
