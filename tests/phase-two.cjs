const { chromium } = require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
(async()=>{
const browser=await chromium.launch({...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{}),headless:true});
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}});const errors=[];
page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error')errors.push(m.text())});
await page.goto(process.env.MOXIU_URL||'http://127.0.0.1:8080');await page.getByRole('button',{name:'开始',exact:true}).click();
const checks=await page.evaluate(async()=>{
const {createInitialState}=await import('/src/core/state.js');
const market=await import('/src/systems/market.js'),trade=await import('/src/systems/trade.js'),inv=await import('/src/systems/inventory.js');
const {TRADE_ITEMS}=await import('/src/data/items.js');const {computeAttrs}=await import('/src/systems/character.js');
const {ensureDay,carryCapacity}=await import('/src/systems/rift.js');const loop=await import('/src/core/loop.js');
const {applyOffline}=await import('/src/systems/offline.js');const {dailyDelta}=await import('/src/systems/daily.js');
const estate=await import('/src/systems/estate.js');const th=await import('/src/systems/tradehouse.js');
loop.stopLoop();const checked=[];
const check=(v,label)=>{if(!v)throw Error(label);checked.push(label)};
const near=(a,b)=>Math.abs(a-b)<1e-6*Math.max(1,Math.abs(b));
const fresh=(t=Date.now())=>{const s=createInitialState(t);s.tales=null;s.tutorial.done=true;ensureDay(s,{silent:true});s.currency.cny=s.currency.stone=1e8;return s};
const item=TRADE_ITEMS.find(i=>i.origin==='modern' && !i.chamberOnly && !(i.noBuy||[]).includes('modern'));
for(const n of [-1,0,NaN,Infinity,1.5,'2',Number.MAX_SAFE_INTEGER+1]){
 const s=fresh(),e=inv.addItem(s,item.id,2);const before=JSON.stringify(s);
 check(!trade.buy(s,'modern',item.id,n).ok && !trade.sell(s,'modern',e.uid,n).ok && inv.removeEntry(s,e.uid,n)===0 && inv.removeItem(s,item.id,n)===0 && inv.addItem(s,item.id,n)===null && !th.list(s,e.uid,n,1,'cny').ok && JSON.stringify(s)===before,`非法数量无副作用 ${String(n)}`);
}
{
 const s=fresh();const before=JSON.stringify(s);check(!trade.buy(s,'cultivation','lingmi',1).ok&&!trade.buy(s,'modern','lingmi',1).ok&&!trade.buyConsumable(s,'zhuji').ok&&before===JSON.stringify(s),'异地和外来货进货拦截');
 s.side='cultivation';check(!trade.buy(s,'cultivation','bainian',1).ok,'灵田作物不可直接购买');
}
{
 const s=fresh(); const n=Math.min(5,Math.floor(carryCapacity(s)/item.weight));
 const quote=market.quoteBuy(s,'modern',item.id,n);const before=s.currency.cny;
 const result=trade.buy(s,'modern',item.id,n);check(result.ok&&near(before-s.currency.cny,quote.total),'整批买入与报价一致');
 const single=fresh();let cost=0;for(let j=0;j<n;j++)cost+=trade.buy(single,'modern',item.id,1).cost;
 check(near(cost,quote.total),'批量买入等于连续单件买入');
 check(!trade.buy(s,'modern',item.id,999).ok,'实际进货拦截超重');
 const e=s.inventory[0],old=s.currency.cny;check(trade.sell(s,'modern',e.uid,e.qty).revenue<before-old,'本地买卖不能刷钱');
 check(s.currency.cny<before,'本地回收造成损耗');
}
{
 const s=fresh();s.side='modern'; inv.addItem(s,'lingmi',30,'common');inv.addItem(s,'lingmi',10,'fine');
 const quoted=market.quotePortfolio(s,'modern',s.inventory,computeAttrs(s)); const before=s.currency.cny;const sold=trade.sellAllForeign(s,'modern');
 check(sold.ok&&near(sold.total,quoted.total)&&near(s.currency.cny-before,quoted.total),'混合品质整包报价等于实收');
 const single=fresh();let revenue=0;const e=inv.addItem(single,'lingmi',40);
 for(let j=0;j<40;j++)revenue+=trade.sell(single,'modern',e.uid,1).revenue;
 const q=market.quoteSell(fresh(),'modern','lingmi',40,'common',computeAttrs(fresh()));
 check(near(revenue,q.total),'批量出货等于连续单件出货');
 check(q.total<q.first*40,'批量出货计入饱和');
 check(market.quoteSell(s,'modern','lingmi',1000000).total>0,'百万件报价可在饱和底线快速求和');
}
{
 const s=fresh();s.estate.shops=1;s.estate.autoSell=true;inv.addItem(s,'lingmi',5);const q=market.quoteSell(s,'modern','lingmi',2,'common',computeAttrs(s));const old=s.currency.cny;
 const r=estate.autoSell(s,2);check(r.sold===2&&near(r.revenue,q.total*.92)&&near(s.currency.cny-old,r.revenue),'店铺计入饱和与渠道费');
 s.side='cultivation';const before=JSON.stringify(s.inventory);check(!estate.autoSell(s,2).ok&&JSON.stringify(s.inventory)===before,'修仙界不执行现代店铺售货');
}
{
 const s=fresh();const e=inv.addItem(s,'lingmi',2),before=s.currency.cny,stone=s.currency.stone;
 const r=th.list(s,e.uid,1,1,'cny');check(r.ok&&s.currency.cny<before&&s.currency.stone===stone,'交易行人民币挂单按人民币缴费');
 const bad=fresh(),entry=inv.addItem(bad,'lingmi',1),snap=JSON.stringify(bad);
 check(!th.list(bad,entry.uid,1,NaN,'cny').ok&&!th.list(bad,entry.uid,1,1,'other').ok&&snap===JSON.stringify(bad),'交易行非法货币和定价无副作用');
}
{
 const t=Date.parse('2026-10-01T20:59:00Z');const s=fresh(t);s.modern.job='dev';s.modern.jobLevel=1;s.currency.cny=0;s.world.mode='sandbox';
 loop.advance(s,120000,120000);check(near(s.currency.cny,88/30),'跨日生产完整结算');
 check(near(dailyDelta(s).cnyEarned,88/60),'新日只记录刷新之后的收入');check(s.rift.toModern===2&&s.market.day===s.rift.day,'界潮和行情统一跨日刷新');
 const rolls=s.daily.rolls;loop.advance(s,0,0);check(s.daily.rolls===rolls,'零时间推进不重复跨日');
}
{
 const t=Date.parse('2026-10-01T20:59:00Z');const s=fresh(t);s.modern.job='dev';s.modern.jobLevel=1;s.currency.cny=0;
 const report=applyOffline(s,t+2*3600000);check(near(report.cny,176)&&s.world.clockMs===t+2*3600000,'离线两小时完整收入并对齐时钟');
 const before=JSON.stringify(s);check(applyOffline(s,t+2*3600000)===null&&JSON.stringify(s)===before,'同一离线区间不重复结算');
 const long=fresh(t);long.modern.job='dev';long.currency.cny=0;const cap=applyOffline(long,t+10*86400000);
 check(cap.capped&&near(cap.cny,88*72)&&long.world.clockMs===t+10*86400000&&long.rift.toModern===3,'离线超过三天限制收益但刷新当日界潮');
 const sb=fresh(t);sb.world.mode='sandbox';sb.world.speed=10;sb.modern.job='dev';sb.currency.cny=0;
 const speed=applyOffline(sb,t+3600000);check(near(speed.cny,880)&&near(speed.worldMs,36000000),'沙盒离线按倍率计算');
}
{
 const s=fresh();s.modern.job='dev';s.currency.cny=0;loop.startLoop(()=>s);loop.stopLoop();s.world.clockMs=Date.now()-2*3600000;
 loop.step(2*3600000);check(Math.abs(s.currency.cny-176)<.01,'后台恢复两小时不再只结算一分钟');
 const before=s.currency.cny;loop.step(0);check(s.currency.cny-before<.01,'恢复后下一帧不会重复结算');
}
{
 const s=fresh(); const limit=Math.floor(carryCapacity(s)/item.weight);s.currency.cny=market.quoteBuy(s,'modern',item.id,3).total;
 check(market.affordableQuantity(s,'modern',item.id,limit)===3,'可购数量考虑整批供货涨价');
 s.currency.cny-=.01;check(market.affordableQuantity(s,'modern',item.id,limit)===2,'可购数量不会透支余额');
}
{
 const s=fresh();const preview=(await import('/src/systems/modern.js')).investmentPreview;s.modern.job='dev';
 const next=preview(s).job;const income=(await import('/src/systems/modern.js')).jobIncomePerHour;
 const old=income(s);s.modern.jobLevel++;check(near(next.delta,income(s)-old),'职级投资预估等于实际新增收入');
 s.modern.workOn=false;check(preview(s).job.delta===0&&!Number.isFinite(preview(s).job.hours),'停工不虚报工资回本');
 const property=estate.estateSummary(s).list[0];const before=estate.rentPerHour(s);estate.buyEstate(s,property.id);
 check(near(estate.rentPerHour(s)-before,property.actualRent),'地产预估等于实际新增租金');
}
{
 const t=Date.parse('2026-10-01T18:00:00Z');const s=fresh(t);s.world.mode='sandbox';s.player.stage=9;
 const base=(await import('/src/systems/character.js')).cultivationRate(s);
 s.player.buffs=[{id:'test',until:t+60000,mods:{cultSpeed:1}}];const boosted=(await import('/src/systems/character.js')).cultivationRate(s);
 loop.advance(s,120000,120000);check(near(s.player.totalCultivation,boosted*60+base*60)&&s.player.buffs.length===0,'临时加成只在到期前生效');
}
{
 const t=Date.parse('2026-10-01T20:59:00Z');const s=fresh(t);s.sect.id='qingyunjian';s.sect.rank=1;
 const stipend=(await import('/src/data/sects.js')).SECT_STIPEND[1], old=s.currency.stone;
 loop.advance(s,120000,120000);check(s.currency.stone-old===stipend&&dailyDelta(s).stoneEarned===stipend,'跨日月俸只发一次并记入新日收入');
 loop.advance(s,0,0);check(s.currency.stone-old===stipend,'重复跨日检查不重复发俸');
}
{
 const t=Date.parse('2026-10-01T18:00:00Z');const a=fresh(t),b=fresh(t);
 for(const s of [a,b]){s.modern.job='dev';s.currency.cny=0;s.estate.shops=1;s.estate.autoSell=true;inv.addItem(s,'lingmi',2)}
 b.lifestyle.levels.housing=1;const plain=applyOffline(a,t+3600000),bonus=applyOffline(b,t+3600000);
 check(near(bonus.cny-plain.cny,88*.08),'居所只加成被动收入，不放大售货回款');
 check(b.player.cultivation<=((await import('/src/data/realms.js')).stageInfo(b.player.stage).stage.need),'居所加成后再次检查修为封顶');
}
return checked;
});
console.log(JSON.stringify({economyChecks:checks.length,checks},null,2));
await page.evaluate(async()=>{const {ctx,navigate}=await import('/src/ui/app.js');const s=window.__moxiu.state;s.tales.pending=null;s.modern.job='dev';s.modern.businessLevel=1;s.currency.cny=500000;s.currency.stone=50000;s.inventory=[];navigate('market')});
await page.getByRole('tab',{name:'进货',exact:true}).waitFor();
fs.mkdirSync('test-results',{recursive:true});await page.locator('#toast-root').evaluate(el=>el.replaceChildren());await page.waitForTimeout(220);await page.locator('#toast-root').evaluate(el=>el.replaceChildren());await page.screenshot({path:'test-results/第二阶段市场.png',fullPage:true});
const row=page.locator('.market-row').first();await row.getByRole('button',{name:'买 1',exact:true}).click();
assert(await page.getByRole('heading',{name:/进货 ·/}).isVisible());
await page.waitForTimeout(220);await page.locator('#toast-root').evaluate(el=>el.replaceChildren());await page.screenshot({path:'test-results/第二阶段报价.png',fullPage:true});
const before=await page.evaluate(()=>window.__moxiu.state.currency.cny);
await page.evaluate(()=>{const s=window.__moxiu.state;const id=document.querySelector('.market-row').dataset.item;s.market.bought.modern[id]=(s.market.bought.modern[id]||0)+1});
await page.getByRole('button',{name:'确认成交',exact:true}).click();assert.equal(await page.evaluate(()=>window.__moxiu.state.currency.cny),before);assert(await page.getByText('行情或背包已变化，报价已更新。请再次确认成交。').isVisible());
await page.getByRole('button',{name:'确认成交',exact:true}).click();assert(await page.evaluate(before=>window.__moxiu.state.currency.cny<before,before));
await page.getByRole('tab',{name:'出货',exact:true}).click();await page.getByText(/本地回收 ·/).click();await page.locator('.market-local').getByRole('button',{name:'全卖',exact:true}).click();await page.getByRole('button',{name:'确认成交',exact:true}).click();
await page.evaluate(async()=>{const s=window.__moxiu.state;const inv=await import('/src/systems/inventory.js');inv.addItem(s,'lingmi',3);inv.addItem(s,'lingmi',2,'fine');(await import('/src/ui/app.js')).scheduleRender()});
await page.getByRole('button',{name:'整包报价',exact:true}).click();await page.getByRole('button',{name:'确认成交',exact:true}).click();assert.equal(await page.evaluate(()=>window.__moxiu.state.inventory.length),0);
await page.evaluate(async()=>{(await import('/src/ui/app.js')).navigate('modern')});await page.getByText(/下级商业：投入/).waitFor();await page.waitForTimeout(220);await page.locator('#toast-root').evaluate(el=>el.replaceChildren());await page.screenshot({path:'test-results/第二阶段经营.png',fullPage:true});
await page.evaluate(async()=>{(await import('/src/ui/app.js')).navigate('estate')});await page.getByText(/预计 .*小时回本/).first().waitFor();await page.waitForTimeout(220);await page.locator('#toast-root').evaluate(el=>el.replaceChildren());await page.screenshot({path:'test-results/第二阶段地产.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
for(const side of ['modern','cultivation']){
 await page.evaluate(async(side)=>{const s=window.__moxiu.state;s.side=side;(await import('/src/ui/app.js')).navigate('market')},side);
 for(const name of ['进货','出货',...(side==='cultivation'?['丹药']:[])]){await page.getByRole('tab',{name,exact:true}).click();assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,`手机溢出 ${side} ${name}`)}
}
await page.getByRole('tab',{name:'进货',exact:true}).click();await page.locator('#toast-root').evaluate(el=>el.replaceChildren());await page.waitForTimeout(220);await page.locator('#toast-root').evaluate(el=>el.replaceChildren());await page.screenshot({path:'test-results/第二阶段手机市场.png',fullPage:true});
assert.deepEqual(errors,[]);console.log(JSON.stringify({ui:'买卖确认、报价变化重新确认、当地回收、整包出货、经营地产、手机两界市场无溢出',errors}));
}finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
