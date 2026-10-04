// Opt-in live integration. Fixture: four disposable confirmed users, stage 2, playMs >= 30 min, CNY 2000.
// Only the first user holds 3 rare jingmi; other inventories are empty. Delete all QA users after the run.
const fs=require('fs'),assert=require('node:assert/strict'),{randomUUID}=require('node:crypto');
const {chromium}=require('playwright');
const root='https://zqgcijakvjzvvtecdacj.supabase.co',key='sb_publishable_RZj01InnTXgoan6DkDqBoQ_-PJ6zDZN';
(async()=>{
 assert(process.env.MOXIU_QA_FILE, 'Set MOXIU_QA_FILE to a temporary QA fixture; never use player accounts');
 const users=JSON.parse(fs.readFileSync(process.env.MOXIU_QA_FILE,'utf8')),checks=[];
 assert.equal(users.length,4);
 assert(users.every(u=>u.email.endsWith('@example.invalid')&&u.name.startsWith('社区测试')), 'Temporary QA accounts only');
 const check=(v,label)=>{assert(v,label);checks.push(label);};
 for(const u of users){const res=await fetch(root+'/auth/v1/token?grant_type=password',{method:'POST',headers:{apikey:key,'Content-Type':'application/json'},body:JSON.stringify({email:u.email,password:u.password})});assert.equal(res.status,200);u.session=await res.json();}
 const call=async(u,intent)=>{const res=await fetch(root+'/functions/v1/moxiu-game',{method:'POST',headers:{apikey:key,'Content-Type':'application/json',Authorization:'Bearer '+u.session.access_token},body:JSON.stringify(intent)});const data=await res.json();if(data.state)u.state=data.state;if(data.revision)u.revision=data.revision;return{status:res.status,data};};
 const sync=async u=>{const r=await call(u,{action:'sync',args:[]});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 const read=async u=>{const r=await call(u,{action:'community',args:[]});assert.equal(r.status,200,JSON.stringify(r.data));return r.data;};
 const action=async(u,name,args=[])=>call(u,{action:name,args,revision:u.revision,request_id:randomUUID()});
 const[a,b,c,d]=users;await Promise.all(users.map(sync));
 const listing=await action(a,'exchange.list',[a.state.inventory[0].uid,3,100,'cny']);check(listing.data.result?.ok,'real escrow listing');const lot=listing.data.result.order_id;
 const intent={action:'exchange.buy',args:[lot,2],revision:b.revision,request_id:randomUUID()};
 const bought=await call(b,intent);check(bought.data.result?.ok&&bought.data.state.currency.cny===1800,'real buyer charged');
 const replay=await call(b,intent);check(replay.data.replayed&&b.state.inventory.find(e=>e.itemId==='jingmi').qty===2,'repeat buyer request does not duplicate transferred goods');
 await sync(a);check(a.state.currency.cny===2196,'real seller credited once net 2 percent');
 const race=await Promise.all([action(b,'exchange.buy',[lot,1]),action(c,'exchange.buy',[lot,1])]);
 check(race.filter(r=>r.data.result?.ok).length===1,'two real buyers compete for last item, one succeeds');
 await sync(a);check(a.state.currency.cny===2294,'seller never credited twice in purchase race');
 const market=await read(a);check(market.trades.length===2&&market.mine.length===0,'escrow sold once and real records visible');
 for(const u of users){await sync(u);const r=await action(u,'arena.enroll');check(r.data.result?.ok,'real arena enrollment');const p=await fetch(root+'/rest/v1/moxiu_player_profiles?select=uid&user_id=eq.'+u.id,{headers:{apikey:key,Authorization:'Bearer '+u.session.access_token}});u.uid=(await p.json())[0].uid;}
 const before=a.state.currency.cny;
 for(const opponent of [b,c,d]){await sync(a);const r=await action(a,'arena.challenge',[opponent.uid]);check(r.data.result?.ok&&r.data.result.battle.rounds<=60,'real server duel and feedback');}
 const board=await read(a);check(board.self.games===3&&board.arena_board.some(p=>p.uid===a.uid),'three real matches qualify for monthly ranking');
 check(a.state.currency.cny===before,'arena never creates money rewards');
 await sync(b);const reverse=await action(b,'arena.challenge',[a.uid]);check(reverse.data.result?.ok===false,'reverse same-pair daily challenge rejected');
 const pages=await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',headless:true});
 const errors=[];
 try{
  const pa=await pages.newPage({viewport:{width:1280,height:900}});pa.on('pageerror',e=>errors.push(e.message));
  await pa.addInitScript(session=>{localStorage.setItem('moxiu.cloud.enabled','1');localStorage.setItem('moxiu.supabase.auth',JSON.stringify(session));},b.session);
  await pa.goto(process.env.MOXIU_URL||'http://127.0.0.1:3000/');await pa.waitForFunction(()=>!!window.__moxiu?.ready);await pa.evaluate(()=>window.__moxiu.ready);
  const dismiss=pa.getByRole('button',{name:'知道了',exact:true});if(await dismiss.isVisible())await dismiss.click();
  await pa.evaluate(()=>import('./src/ui/app.js').then(m=>m.navigate('tradehouse')));
  await pa.getByRole('heading',{name:'玩家交易行',exact:true}).waitFor();await pa.getByRole('button',{name:'预览玩家挂单',exact:true}).waitFor();
  await pa.getByLabel('上架数量',{exact:true}).fill('1');await pa.getByLabel('玩家交易单价',{exact:true}).fill('25');await pa.getByLabel('玩家交易货币',{exact:true}).selectOption('cny');
  await pa.getByRole('button',{name:'预览玩家挂单',exact:true}).click();await pa.getByRole('button',{name:'确认上架',exact:true}).click();
  await pa.getByRole('button',{name:'撤回玩家挂单',exact:true}).waitFor();check(true,'original tradehouse UI lists through real server');
  await pa.getByRole('button',{name:'撤回玩家挂单',exact:true}).click();await pa.getByRole('button',{name:'确认撤回',exact:true}).click();
  await pa.waitForFunction(()=>!document.querySelector('[data-player-order]'));check(true,'original UI returns escrow through real server');
  await pa.evaluate(()=>import('./src/ui/views/social.js').then(m=>m.setSocialTab('rank')));await pa.evaluate(()=>import('./src/ui/app.js').then(m=>m.navigate('social')));
  await pa.getByRole('heading',{name:'玩家论道',exact:true}).waitFor();
  await pa.getByRole('button',{name:'刷新玩家数据',exact:true}).click();
  await pa.getByText(c.name,{exact:true}).first().waitFor();
  const opponent=pa.locator('.rowitem').filter({has:pa.getByText(c.name,{exact:true})});
  await opponent.getByRole('button',{name:'预览论道',exact:true}).click();await pa.getByRole('button',{name:'确认论道',exact:true}).click();
  await pa.getByRole('button',{name:'继续修行',exact:true}).waitFor();await pa.getByText('查看战斗过程',{exact:true}).click();check(true,'real duel confirmation and battle log in original rankings');
  await pa.getByRole('button',{name:'继续修行',exact:true}).click();
  await pa.setViewportSize({width:390,height:844});
  for(const id of ['social','tradehouse']){await pa.evaluate(id=>import('./src/ui/app.js').then(m=>m.navigate(id)),id);check(await pa.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'mobile '+id+' no overflow');}
  await pa.screenshot({path:process.cwd()+'/test-results/玩家交易手机.png',fullPage:true});check(errors.length===0,'no browser runtime errors');
 }finally{await pages.close();}
 await sync(a);const reset=await action(a,'reset');check(reset.data.result.ok&&a.state.currency.cny===0,'real linked reset does not grant new starter funds');check((await read(a)).self.games===3,'real reset preserves rated match history');
 console.log(JSON.stringify({passed:checks.length,checks}));
})().catch(e=>{console.error(e.message);process.exitCode=1;});
