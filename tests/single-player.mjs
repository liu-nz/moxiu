import assert from 'node:assert/strict';
import fs from 'node:fs';
import { createInitialState } from '../src/core/state.js';
import { seed, fresh, fixed } from './simulation-helpers.mjs';
import { TALES, talesFor } from '../src/data/tales.js';
import { DUNGEONS, resolveWaves } from '../src/data/dungeons.js';
import { ALCHEMY_RECIPES, FORGE_RECIPES } from '../src/data/recipes.js';
import { CROPS } from '../src/data/crops.js';
import { RANCH_BEASTS } from '../src/data/beasts.js';
import { INDUSTRIES } from '../src/data/industries.js';
import { quoteBuy, quoteSell, refreshDay } from '../src/systems/market.js';
import { buy, sell, sellAllForeign } from '../src/systems/trade.js';
import { addItem, countOf } from '../src/systems/inventory.js';
import { cross, ensureDay } from '../src/systems/rift.js';
import { switchPath } from '../src/systems/gear.js';
import { chooseJob } from '../src/systems/modern.js';
import { updateTutorial, currentStep } from '../src/systems/tutorial.js';
import { starterRoute } from '../src/systems/journey.js';
import { trigger, resolveTale, taleChoiceStatus, tickTales, taleQuota, nextTaleEvent } from '../src/systems/tales.js';
import { simulateBattle } from '../src/systems/combat.js';
import { techEquipment } from '../src/data/equipment.js';
import { ITEM_MAP, MATERIAL_MAP, CONSUMABLE_MAP } from '../src/data/items.js';
import { buildIndustry, setIndustryRunning, industryStatus, stockIndustry } from '../src/systems/industries.js';
import { depositCargo, withdrawCargo, storedCount, addProduced, productionCount } from '../src/systems/cargo.js';
import { carryWeight } from '../src/systems/inventory.js';
import { carryCapacity } from '../src/systems/rift.js';
import { setBreakthroughAutomation, attemptBreakthrough, advanceIfReady, needOf } from '../src/systems/cultivation.js';
import { runDungeon, setMaterialTarget, dungeonPreparation } from '../src/systems/dungeon.js';
import { ascend } from '../src/systems/reincarnation.js';
import { advance } from '../src/core/loop.js';
import { applyOffline } from '../src/systems/offline.js';
import { farmBonus } from '../src/systems/farm.js';
import { craft, recipeStatus } from '../src/systems/alchemy.js';
import { projectImpact } from '../src/systems/projects.js';
import { objectiveStatus, setObjective } from '../src/systems/objectives.js';
import { commissionBoard, fulfillCommission } from '../src/systems/commissions.js';
import { collectionSections, markCollection } from '../src/systems/collection.js';
const checks=[],check=(condition,name)=>{assert(condition,name);checks.push(name);};
const near=(a,b)=>Math.abs(a-b)<1e-6*Math.max(1,Math.abs(a),Math.abs(b));
const sourceStage=id=>Math.min(ITEM_MAP[id] && !ITEM_MAP[id].noBuy?.includes(ITEM_MAP[id].origin) ? 0 : Infinity,...CROPS.filter(c=>c.itemId===id).map(c=>c.unlockStage),...RANCH_BEASTS.filter(b=>b.produceId===id).map(b=>b.unlockStage),...DUNGEONS.filter(d=>d.matPool?.includes(id)).map(d=>d.unlockStage));
check(TALES.length >= 100 && new Set(TALES.map(t=>t.id)).size===TALES.length,'100+独立奇闻且ID唯一');
for(const tale of TALES){
 check(tale.choices.length>=(tale.arc ? 1 : 2) && tale.text.length>=15,`独立场景与选择 ${tale.id}`);
 for(const choice of tale.choices){const effects=choice.effect?.roll?[choice.effect.roll.success,choice.effect.roll.fail]:[choice.effect];for(const eff of effects.filter(Boolean)){for(const it of eff.items||[])check(ITEM_MAP[it.id]||MATERIAL_MAP[it.id]||CONSUMABLE_MAP[it.id],`奇闻奖励存在 ${tale.id}/${it.id}`);}}
}
for(const r of [...ALCHEMY_RECIPES,...FORGE_RECIPES])for(const id of Object.keys(r.mats || {[r.mat]:r.qty}))check(sourceStage(id)<=r.unlockStage,`丹方/图谱解锁时材料可得 ${r.id}/${id}`);
for(let day=20700;day<20800;day++){
 const s=fresh(0,'modern');refreshDay(s,day);switchPath(s,'speed');chooseJob(s,'dev');const route=starterRoute(s);
 check(route && route.profit>0,`100种行情新手路线可执行并有人民币正差额 ${day}`);
 const t=s.world.clockMs;check(buy(s,'modern',route.local.item.id,route.local.qty).ok,'真实采购不超预算');
 check(cross(s,'cultivation').ok,'去程真实穿越');sellAllForeign(s,'cultivation');
 const inbound=starterRoute(s)?.inbound;check(inbound && buy(s,'cultivation',inbound.item.id,inbound.qty).ok,'出货所得灵石够回程进货');
 check(cross(s,'modern').ok,'回程真实穿越');sellAllForeign(s,'modern');updateTutorial(s);
 check(s.tutorial.journey.inboundSold && s.rift.crossings===2 && s.world.clockMs-t<=900000,'真实成交完成双向闭环，无调钱、免载重或额外穿越');
}
{
 const s=fresh(0);s.currency.stone=999999;updateTutorial(s);check(!s.tutorial.done.sell,'已有灵石不冒充出货');
 addItem(s,'lingmi',1);s.side='cultivation';sellAllForeign(s,'cultivation');check(!s.tutorial.journey?.outboundSold,'本地回收不冒充去程出货');
 s.tutorial.step=999;updateTutorial(s);check(currentStep(s)?.id==='path','引导从稳定步骤ID恢复，不被旧序号跳过');
}
{
 const s=fresh(0);s.currency.cny=s.currency.stone=0;trigger(s,'black_market');const before=JSON.stringify(s);check(!resolveTale(s,0).ok && JSON.stringify(s)===before,'付费奇闻余额不足不送材料、不关闭待处理事件');check(resolveTale(s,1).ok,'无钱仍可选择离开');
 const b=fresh(0);trigger(b,'gambling_den');b.currency.stone=149;check(!taleChoiceStatus(b,TALES.find(t=>t.id==='gambling_den').choices[0]).ok,'随机奇闻备足最大可能损失');
 check(!trigger(fresh(0),'sea_buoy'),'高境界奇闻不能在新开局强制触发');
 check(!talesFor('modern',0,fresh(0,'modern')).some(t=>t.world==='cultivation'||t.minStage>0||t.context==='estate'),'事件世界、境界和资产条件过滤');
 const max=fresh(41);max.reincarnation.blessings.fortune=10;check(taleQuota(max)===4 && taleQuota(fresh(0))===2,'奇闻每日2–4机会封顶');
 const a=fresh(0);a.world.clockMs = Date.parse('2026-10-01T21:00:00Z');a.createdAt=a.savedAt=a.world.clockMs;ensureDay(a,{silent:true});nextTaleEvent(a);
 for(let i=0;i<96;i++){advance(a,15*60000);if(a.tales.pending)resolveTale(a,1);}
 check(a.tales.count===2,'积极处理事件的一整日2次机会');
 const offline=fresh(0);const start=offline.world.clockMs;applyOffline(offline,start+72*3600000);check(offline.tales.pending && offline.tales.count===1,'三天离线仅保留一条待处理事件');
 const late=fresh(38);late.currency.cny=1e9;trigger(late,'sign_in_sky');const gain=resolveTale(late,0);check(late.player.totalCultivation>1e9 && gain.ok,'后期修为奇闻按真实境界速率缩放');
}
{
 for(const d of DUNGEONS){const s=fresh(d.unlockStage);const boss=resolveWaves(d).at(-1);const a=simulateBattle(s,{...boss,hp:boss.hp*30,atk:0},{dungeon:d,rng:()=>.99});check(a.mechanic===d.mechanic.name && a.log.some(x=>x.includes(d.mechanic.name)),`首领机制实际执行 ${d.id}`);}
 const compare=(id,tech)=>{const d=DUNGEONS.find(d=>d.id===id),s=fresh(d.unlockStage),boss={...resolveWaves(d).at(-1),hp:1e12,atk:0};const a=simulateBattle(s,boss,{dungeon:d,rng:()=>.99});s.tech=[techEquipment(ITEM_MAP[tech])];const b=simulateBattle(s,boss,{dungeon:d,rng:()=>.99});return [a,b];};
 const [grave,gLight]=compare('graveyard','qiangguang');check(grave.metrics.foeHealing>0 && gLight.metrics.foeHealing===0,'强光阻止首领复苏');
 const [poison,immune]=compare('swamp','kangshengsu');check(poison.metrics.mechanicDamage>0 && immune.metrics.mechanicDamage===0,'抗生素实际免疫叠毒');
 const [burn,suit]=compare('purgatory','fangkui');check(burn.metrics.mechanicDamage>0 && suit.metrics.mechanicDamage===0,'防火服实际隔绝地火');
 const d=DUNGEONS.find(d=>d.id==='ruins'),s=fresh(d.unlockStage),boss={...resolveWaves(d).at(-1),atk:0};const shield=simulateBattle(s,boss,{dungeon:d,rng:()=>.99});s.research.done.sensor=true;const intel=simulateBattle(s,boss,{dungeon:d,intel:true,rng:()=>.99});check(shield.metrics.absorbed>intel.metrics.absorbed,'传感器实际削减护盾');
 const sword=DUNGEONS.find(d=>d.id==='swordtomb'),f=fresh(15),foe={...resolveWaves(sword).at(-1),hp:1e12,atk:0};const melee=simulateBattle(f,foe,{dungeon:sword,rng:()=>.99});f.path='law';const spell=simulateBattle(f,foe,{dungeon:sword,rng:()=>.99});check(spell.metrics.mechanicDamage/spell.metrics.playerDamage<melee.metrics.mechanicDamage/melee.metrics.playerDamage,'法修降低反弹占伤害比例');
}
{
 const s=fresh(30,'modern');s.currency.cny=s.currency.stone=1e9;s.modern.businessLevel=4;s.research.done.alloy=s.research.done.database=true;s.projects.done.teleport=true;
 for(const p of INDUSTRIES){const before=JSON.stringify(s);check(industryStatus(s,p.id).canBuild && JSON.stringify(s)===before,`公司筹备无扣款 ${p.id}`);check(buildIndustry(s,p.id).ok&&!s.modern.industries[p.id].on,`公司建立默认暂停 ${p.id}`);check(!buildIndustry(s,p.id).ok,'重复建立不收费');setIndustryRunning(s,p.id,true);for(const [id,n]of Object.entries(p.mats))addItem(s,id,n*50);}
 const a=structuredClone(s),b=structuredClone(s),duration=48*3600000;fixed(seed(63),()=>{for(let t=0;t<duration;t+=137000)advance(a,Math.min(137000,duration-t));});const report=fixed(seed(63),()=>applyOffline(b,b.savedAt+duration));
 check(near(a.currency.cny,b.currency.cny)&&near(a.currency.stone,b.currency.stone)&&a.stats.industryOrders===b.stats.industryOrders,'产业48小时不同分片/离线一致');check(report.production.industryOrders>0&&report.production.industryStone>0,'离线公司订单和支出正确入账');
 const scarce=fresh(14,'modern');scarce.currency.cny=1e8;scarce.currency.stone=1e6;scarce.modern.businessLevel=2;scarce.research.done.alloy=true;buildIndustry(scarce,'textile');setIndustryRunning(scarce,'textile',true);advance(scarce,24*3600000);check(!scarce.stats.industryOrders,'缺材不凭空生成订单收入');
 const keep=fresh(18,'modern');keep.currency.cny=1e8;keep.currency.stone=1e6;keep.modern.businessLevel=3;keep.research.done.database=true;buildIndustry(keep,'biotech');setIndustryRunning(keep,'biotech',true);keep.crafting.selectedRecipe='lingsomething'; // 非法旧计划不会抹掉指定库存
 keep.estate.keep.bainian=2;addItem(keep,'bainian',2);addItem(keep,'lurong',1);advance(keep,8*3600000);check(countOf(keep,'bainian')===2&&!keep.stats.industryOrders,'公司尊重指定库存保留');
 const reserve=fresh(14,'modern');reserve.currency.cny=120000;reserve.currency.stone=4000;reserve.modern.businessLevel=2;reserve.research.done.alloy=true;reserve.modern.reserveCny=1;check(!buildIndustry(reserve,'textile').ok,'公司建设尊重投资保留线');
 const preview=projectImpact(s,'powergrid');check(preview.after.income>preview.before.income,'城市电网基础收入预览仍有效');
}
{
 const s=fresh(14);s.market.eventId='calm';const b=farmBonus(s);s.market.eventId='herb_harvest';check(farmBonus(s)===b+.5,'灵植丰收实际增加田地产量50个百分点');
 for(const r of ALCHEMY_RECIPES) for(const path of ['war','law','alchemy','artifact','merchant','speed']) for(const aux of ['plain','steady','potent','pure']){
  const x=fresh(41);x.path=path;x.currency.stone=1e8;const st=recipeStatus(x,r.id,aux);for(const m of st.mats)addItem(x,m.id,m.need*2);const rng=seed(77);const result=craft(x,r.id,1,{auxId:aux,rng,silent:true});check(result.ok&&result.attempts===1&&Number.isFinite(st.rate)&&st.rate<=.98&&st.rate>=.05,`丹方道途辅材可结算 ${r.id}/${path}/${aux}`);
 }
}
{
 const s=fresh(0,'modern');const e=addItem(s,'lingmi',3,'rare');const before=JSON.stringify(s);
 for(const n of [-1,0,.5,NaN,Infinity,4])check(!depositCargo(s,e.uid,n).ok&&JSON.stringify(s)===before,'非法入库无资源变化');
 check(depositCargo(s,e.uid,3).ok&&countOf(s,'lingmi')===0&&storedCount(s,'modern','lingmi')===3,'入库保持数量、品质和世界');
 s.side='cultivation';const snap=JSON.stringify(s);check(!withdrawCargo(s,'lingmi','rare',1).ok&&JSON.stringify(s)===snap,'另一世界仓库不能远程提取');
 s.side='modern';check(withdrawCargo(s,'lingmi','rare',2).ok&&countOf(s,'lingmi','rare')===2&&storedCount(s,'modern','lingmi')===1,'提取保持品质，库存只减一次');
 addItem(s,'qiangguang',100);const heavy=JSON.stringify(s);check(!withdrawCargo(s,'lingmi','rare',1).ok&&JSON.stringify(s)===heavy,'超重提取被拦截');
 const p=fresh(0,'modern');addProduced(p,'lingmi',100);check(countOf(p,'lingmi')===0&&storedCount(p,'cultivation','lingmi')===100&&carryWeight(p)<=carryCapacity(p),'异界生产进当地仓库，不免费运到现代');
 p.side='cultivation';addProduced(p,'huangjing',100,'common');addItem(p,'huangjing',4,'rare');p.currency.stone=10000;
 craft(p,'huiyuan',1,{rng:()=>0,silent:true});check(productionCount(p,'huangjing')===102&&countOf(p,'huangjing','rare')===4,'炼丹先用普通仓库料，不吞行囊稀有品质');
 const remote=fresh(14,'modern');remote.currency.stone=10000;addItem(remote,'huangjing',4);const old=JSON.stringify(remote);check(!craft(remote,'huiyuan',1,{rng:()=>0,silent:true}).ok&&JSON.stringify(remote)===old,'异界炼丹不能直接取现代行囊贸易原料');
 remote.side='cultivation';depositCargo(remote,remote.inventory[0].uid,4);remote.side='modern';check(craft(remote,'huiyuan',1,{rng:()=>0,silent:true}).ok&&storedCount(remote,'cultivation','huangjing')===2,'异界炼丹可以消耗已留在修仙仓库的原料');
 const c=fresh(18,'modern');c.currency.cny=1e6;c.currency.stone=1e6;c.modern.businessLevel=3;c.research.done.database=true;buildIndustry(c,'biotech');setIndustryRunning(c,'biotech',true);addItem(c,'bainian',10);addItem(c,'lurong',5);stockIndustry(c,'biotech');c.side='cultivation';advance(c,16*3600000);
 check(c.stats.industryOrders===1&&storedCount(c,'modern','bainian')===8,'人在异界，公司用当地备料半速结算');
 addItem(c,'bainian',100);c.cargo.storage.modern=[];const orders=c.stats.industryOrders;advance(c,16*3600000);check(c.stats.industryOrders===orders,'公司不能消耗玩家异界贸易行囊');
}
{
 const s=fresh(0);const snap=JSON.stringify(s);check(!setBreakthroughAutomation(s,true).ok&&JSON.stringify(s)===snap,'新手未尝试突破时不能提前托管');
 s.player.stage=9;s.player.cultivation=needOf(9);fixed(()=>.999,()=>attemptBreakthrough(s));check(setBreakthroughAutomation(s,true).ok,'亲自失败一次后可开启托管');
 for(let i=0;i<3;i++){s.player.cultivation=needOf(s.player.stage);fixed(()=>.999,()=>advanceIfReady(s));}
 check(s.player.stage===10&&s.stats.breakthroughAttempts===4,'托管失败真实逸散并第四次保底突破');
 const end=fresh(41);setBreakthroughAutomation(end,true);end.player.cultivation=needOf(41);fixed(()=>0,()=>advanceIfReady(end));check(!end.player.ascensionReady&&end.player.stage===41,'最终雷劫不托管、不自动飞升');
 fixed(()=>0,()=>attemptBreakthrough(end));markCollection(end,'crops','lingmi');check(ascend(end).ok&&!end.player.autoBreakthrough&&end.collection.crops.includes('lingmi'),'新周目恢复默认关闭托管并保留收藏图鉴');
 const a=fresh(0),b=structuredClone(a);for(const x of [a,b]){x.tales=null;x.stats.breakthroughAttempts=1;setBreakthroughAutomation(x,true);}
 const duration=48*3600000;fixed(()=>0,()=>{for(let t=0;t<duration;t+=137000)advance(a,Math.min(137000,duration-t));advance(b,duration);});
 check(a.player.stage===b.player.stage&&near(a.player.cultivation,b.player.cultivation)&&near(a.player.totalCultivation,b.player.totalCultivation),'跨境长段离线与不同时间分片修为一致');
}
{
 const s=fresh(0);const snap=JSON.stringify(s);check(!setMaterialTarget(s,'ruins','xuanjing').ok&&!setMaterialTarget(s,'bandit','xingchen').ok&&JSON.stringify(s)===snap,'采材目标必须来自已解锁秘境');
 const a=fresh(41),b=structuredClone(a);const normal=dungeonPreparation(a,'bandit','normal');setMaterialTarget(b,'bandit','yaodan');const focus=dungeonPreparation(b,'bandit','normal');
 check(focus.stone[0]===Math.round(normal.stone[0]*.85)&&focus.equipChance<normal.equipChance,'采材准备展示实际收益代价');
 const x=fixed(seed(15),()=>runDungeon(a,'bandit','normal',{rng:()=>0,silent:true})),y=fixed(seed(15),()=>runDungeon(b,'bandit','normal',{rng:()=>0,silent:true}));
 check(x.win&&y.win&&countOf(b,'yaodan')===countOf(a,'yaodan')+1&&y.rewards.stone<x.rewards.stone,'采材通关额外保证材料且实际减少灵石');
 const fail=fresh(23);setMaterialTarget(fail,'ruins','xuanjing');const loss=runDungeon(fail,'ruins','hell',{rng:()=>.99,silent:true});check(!loss.win&&countOf(fail,'xuanjing')===0,'采材战败不发保证材料');
}
{
 const s=fresh(0);check(setObjective(s,'home').ok,'玩家可选择攒第一套房');
 let goal=objectiveStatus(s);check(!goal.done&&goal.view==='estate'&&goal.missing.includes('还需'),'房屋目标展示资金缺口和地产入口');
 s.estate.owned.suburb=1;check(objectiveStatus(s).done,'持有第一套城郊房后目标完成');
 check(setObjective(s,'beasts').ok,'玩家可选择战斗灵兽收集目标');
 s.beasts.owned=[{id:'linghu'},{id:'linghu'},{id:'canglang'}];goal=objectiveStatus(s);check(goal.progress===2&&!goal.done&&goal.view==='dungeon','灵兽目标按物种去重并提示副本入口');
 check(setObjective(s,'research:battery').ok,'玩家可选择具体研究目标');goal=objectiveStatus(s);check(!goal.done&&goal.view==='research'&&goal.missing.includes('20'),'研究目标展示研究点缺口');
 s.research.done.battery=true;check(objectiveStatus(s).done,'完成指定研究后目标自动完成');
 check(!setObjective(s,'invented-goal').ok,'无效玩家目标不会写入存档');
}
{
 const s=fresh(0,'cultivation');let board=commissionBoard(s);
 while(!board.some(x=>x.id==='workshop-tools')){s.world.clockMs+=86400000;board=commissionBoard(s);}
 check(board.filter(x=>x.type==='normal').length===2,'界门按世界展示轮换的跨界订单');
 const order=board.find(x=>x.id==='workshop-tools'),before=s.currency.stone;
 check(!fulfillCommission(s,order.id).ok&&s.currency.stone===before,'缺少订单物资时不能领取奖励');
 addItem(s,'jingmi',2);const delivered=fulfillCommission(s,order.id);
 check(delivered.ok&&countOf(s,'jingmi')===0&&s.currency.stone===before+delivered.reward,'跨界精密工具订单真实消耗货物并给灵石报酬');
 check(!fulfillCommission(s,order.id).ok&&s.currency.stone===before+delivered.reward,'同一订单每日只能交付一次');
}
{
 const s=fresh(0);markCollection(s,'crops','lingmi');markCollection(s,'crops','lingmi');markCollection(s,'beasts','linghu');markCollection(s,'equipment','weapon:common');
 const sections=collectionSections(s);check(sections.find(x=>x.id==='crops').rows.find(x=>x.id==='lingmi').unlocked&&s.collection.crops.length===1,'收藏图鉴记录首次发现且避免重复计数');
 check(!sections.find(x=>x.id==='beasts').rows.find(x=>x.id==='canglang').unlocked&&sections.find(x=>x.id==='equipment').rows.find(x=>x.id==='weapon:common').unlocked,'灵兽与装备品阶图鉴分别记录发现状态');
}
{
 const s=fresh(0,'modern');check(trigger(s,'sealed_letter')?.id==='sealed_letter','连续奇闻第一章可触发');
 check(resolveTale(s,0).ok&&s.tales.flags.broken_relay==='deliver','第一章选择会记录后续故事分支');
 s.side='cultivation';check(talesFor('cultivation',0,s).some(t=>t.id==='sealed_letter_followup')&&!talesFor('cultivation',0,s).some(t=>t.id==='sealed_letter_archive'),'分支选择只解锁对应后续事件');
 check(trigger(s,'sealed_letter_followup')?.id==='sealed_letter_followup'&&resolveTale(s,1).ok&&s.tales.flags.broken_relay_ending==='search','后续选择形成可追踪故事结局');
}
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/single-player-checks.json',JSON.stringify({count:checks.length,checks},null,2));console.log(JSON.stringify({checks:checks.length,tales:TALES.length}));
