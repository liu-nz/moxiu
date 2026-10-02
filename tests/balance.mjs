/** 标准1倍速自动化对照。真实操作策略用于对照，不等同于真人体验。 */
import fs from 'node:fs';
import assert from 'node:assert/strict';
import { fresh, fixed, seed } from './simulation-helpers.mjs';
import { PATHS } from '../src/data/paths.js';
import { stageInfo, baseAttrs, baseCultivationRate } from '../src/data/realms.js';
import { DUNGEONS } from '../src/data/dungeons.js';
import { ITEM_MAP } from '../src/data/items.js';
import { ALCHEMY_RECIPES } from '../src/data/recipes.js';
import { AUXILIARIES, PILL_QUALITY } from '../src/data/alchemy.js';
import { rollEquipment, techEquipment } from '../src/data/equipment.js';
import { rollSkill } from '../src/data/skills.js';
import { CROPS } from '../src/data/crops.js';
import { RANCH_BEASTS, BEAST_MAP } from '../src/data/beasts.js';
import { INDUSTRIES } from '../src/data/industries.js';
import { CITY_PROJECTS } from '../src/data/projects.js';
import { PROJECTS } from '../src/data/research.js';
import { starterRoute, returnCargo } from '../src/systems/journey.js';
import { quoteBuy, quoteSell, affordableQuantity } from '../src/systems/market.js';
import { buy, sellAllForeign } from '../src/systems/trade.js';
import { cross, carryCapacity, ensureDay } from '../src/systems/rift.js';
import { depositCargo, withdrawCargo } from '../src/systems/cargo.js';
import { carryWeight, countOf } from '../src/systems/inventory.js';
import { switchPath, equipItem, equipSkill, previewBuildSwap, useConsumable, equipTech } from '../src/systems/gear.js';
import { chooseJob, upgradeJob, upgradeBusiness } from '../src/systems/modern.js';
import { investmentOptions } from '../src/systems/progression.js';
import { buyEstate } from '../src/systems/estate.js';
import { upgradeLab, doResearch } from '../src/systems/research.js';
import { industryStatus, buildIndustry, setIndustryRunning } from '../src/systems/industries.js';
import { setProjectTarget, status, start } from '../src/systems/projects.js';
import { farmSummary, harvestAll, plant, buyPlot, setPlotPlan } from '../src/systems/farm.js';
import { buyBeast, buySlot, collectAll } from '../src/systems/ranch.js';
import { setAlchemyPlan, craft, recipeStatus } from '../src/systems/alchemy.js';
import { deploy } from '../src/systems/beasts.js';
import { runDungeon, canEnter, setMaterialTarget } from '../src/systems/dungeon.js';
import { breakthroughInfo, attemptBreakthrough, setBreakthroughAutomation } from '../src/systems/cultivation.js';
import { resolveTale, pendingTale, taleChoiceStatus } from '../src/systems/tales.js';
import { advance } from '../src/core/loop.js';
import { ascend, chooseFate } from '../src/systems/reincarnation.js';
const HOUR=3600000,DAY=24*HOUR;
function equipLoot(s){
 for(const e of [...s.bag]){const p=previewBuildSwap(s,'equipment',e.uid);if(p.ok&&p.powerAfter>p.powerBefore)equipItem(s,e.uid);}
 for(const sk of [...s.skillBag])for(const key of sk.slot==='move'?['move1','move2']:[sk.slot]){const p=previewBuildSwap(s,'skill',sk.uid,key);if(p.ok&&p.powerAfter>p.powerBefore)equipSkill(s,sk.uid,key);}
 for(const pet of s.beasts.owned){if(s.beasts.deployed.length>=2)break;if(!s.beasts.deployed.includes(pet.uid))deploy(s,pet.uid);}
}
function tradeReturn(s){
 sellAllForeign(s,s.side);
 if(s.side==='modern'){
  const r=starterRoute(s); // 小额路线用于开局；后续按单位灵石/人民币选择现代货
  if(!s.tutorial.journey.inboundSold&&r)buy(s,'modern',r.local.item.id,r.local.qty);
  else {
   const cap=Math.max(0,carryCapacity(s)-carryWeight(s)),budget=s.currency.cny*.4;
   const options=Object.values(ITEM_MAP).filter(i=>i.origin==='modern'&&!i.chamberOnly).map(i=>{let n=Math.min(999,Math.floor(cap/i.weight),affordableQuantity(s,'modern',i.id,999));while(n&&quoteBuy(s,'modern',i.id,n).total>budget)n--;return {i,n,q:n?quoteBuy(s,'modern',i.id,n):null};}).filter(x=>x.n).sort((a,b)=>quoteSell(s,'cultivation',b.i.id,b.n).total/b.q.total-quoteSell(s,'cultivation',a.i.id,a.n).total/a.q.total);
   if(options[0])buy(s,'modern',options[0].i.id,options[0].n);
  }
  if(!cross(s,'cultivation').ok)return;
  sellAllForeign(s,'cultivation');
 }
 // 先暂存过重货物，再从当地仓库挑现代每公斤回款高的回程货。
 for(const e of [...s.inventory].filter(e=>ITEM_MAP[e.itemId]?.origin==='cultivation'))depositCargo(s,e.uid,e.qty);
 const stock=[...(s.cargo.storage.cultivation||[])].sort((a,b)=>ITEM_MAP[b.itemId].price.modern/ITEM_MAP[b.itemId].weight-ITEM_MAP[a.itemId].price.modern/ITEM_MAP[a.itemId].weight);
 for(const e of stock){const n=Math.min(e.qty,10,Math.max(0,Math.floor((carryCapacity(s)-carryWeight(s))/ITEM_MAP[e.itemId].weight)));if(n)withdrawCargo(s,e.itemId,e.quality,n);}
 // 保留过半灵石供生产/工程，小批回货避免饱和。
 const r=returnCargo(s,s.currency.stone*.35,Math.max(0,carryCapacity(s)-carryWeight(s)));
 if(r)buy(s,'cultivation',r.item.id,r.qty);
 if(!cross(s,'modern').ok)return;
 sellAllForeign(s,'modern');
}
function visit(s){
 const tale=pendingTale(s);if(tale){const ix=tale.choices.findIndex(c=>taleChoiceStatus(s,c).ok);if(ix>=0)resolveTale(s,ix);}
 if(breakthroughInfo(s).full)attemptBreakthrough(s);
 if(s.player.ascensionReady)return;
 if(s.stats.breakthroughAttempts>0 || s.player.stage>=10)setBreakthroughAutomation(s,true);
 harvestAll(s);collectAll(s);
 const plan=['huangjing','bainian','binglian','jiuzhuan','bainian','huangjing'];
 const crops=CROPS.filter(c=>s.player.stage>=c.unlockStage);
 for(let i=0;i<s.farm.unlocked;i++){let id=plan[i%plan.length];if(!crops.some(c=>c.id===id))id='lingmi';setPlotPlan(s,i,id);if(!s.farm.plots[i])plant(s,i,id);}
 if(s.currency.stone>5000&&s.farm.unlocked<6)buyPlot(s);
 for(const b of RANCH_BEASTS){if(s.player.stage<b.unlockStage||s.ranch.slots.some(slot=>slot?.beastId===b.id))continue;if(s.ranch.slots.filter(Boolean).length>=s.ranch.unlocked&&s.currency.stone>b.cost+1000)buySlot(s);if(s.currency.stone>b.cost+500)buyBeast(s,b.id);}
 if(s.side==='cultivation'){
  equipLoot(s);
  let target=DUNGEONS.filter(d=>s.player.stage>=d.unlockStage).at(-1);
  const missing=CITY_PROJECTS.find(p=>!s.projects.done[p.id]);const targetMat=missing&&Object.entries(missing.cost.mats).find(([id,n])=>countOf(s,id)<n);
  if(targetMat){const materialDungeon=DUNGEONS.filter(d=>s.player.stage>=d.unlockStage&&d.matPool.includes(targetMat[0])).at(-1);if(materialDungeon){target=materialDungeon;setMaterialTarget(s,target.id,targetMat[0]);}}
  let tries=0;while(target&&s.player.stamina>=10&&tries++<10){const r=runDungeon(s,target.id,'normal',{silent:true});if(!r.win){target=DUNGEONS[DUNGEONS.indexOf(target)-1];if(!target)break;}equipLoot(s);}
  const recipe=s.player.stage>=14?'lingyuan':s.player.stage>=10?'ningshen':'huiyuan';
  const st=recipeStatus(s,recipe,s.path==='alchemy'?'potent':'steady');
  if(st.ok&&s.currency.stone>st.cost*2){setAlchemyPlan(s,{recipeId:recipe,auxId:s.path==='alchemy'?'potent':'steady'});craft(s,recipe,1,{auxId:s.crafting.selectedAux,silent:true});}
  for(const id of ['lingyuandan','ningshendan'])useConsumable(s,id);
 }
 tradeReturn(s);
 if(s.side==='modern'){
  if(s.currency.cny>12000&&s.research.labLevel<2)upgradeLab(s);
  for(const p of PROJECTS)doResearch(s,p.id);
  const target=CITY_PROJECTS.find(p=>!s.projects.done[p.id]);if(target)setProjectTarget(s,target.id);
  for(const p of CITY_PROJECTS)if(status(s,p.id).canStart)start(s,p.id);
  if(s.currency.cny>5000&&s.modern.businessLevel<4)upgradeBusiness(s);
  for(const p of INDUSTRIES)if(industryStatus(s,p.id).canBuild){buildIndustry(s,p.id);setIndustryRunning(s,p.id,true);}
  const invest=investmentOptions(s).list.filter(x=>!x.locked&&x.affordable&&x.hours&&x.hours<180&&x.cost<s.currency.cny*.45).sort((a,b)=>a.hours-b.hours)[0];
  if(invest?.id==='job')upgradeJob(s);else if(invest?.id==='business')upgradeBusiness(s);else if(invest?.id)buyEstate(s,invest.id);
  // 所需现代科技购买后携带，不能既带装备又将同一件货卖出。
  for(const id of ['hejin','qiangguang','kangshengsu','fangkui'])if(s.currency.cny>3000&&!s.tech.some(t=>t.name===ITEM_MAP[id].name)&&buy(s,'modern',id,1).ok){const e=s.inventory.find(e=>e.itemId===id);equipTech(s,id);}
  cross(s,'cultivation');
 }
 if(breakthroughInfo(s).full)attemptBreakthrough(s);
}
function run(path,visits,randSeed){
 return fixed(seed(randSeed),()=>{
  const s=fresh(0,'modern'),begin=s.world.clockMs;switchPath(s,path);chooseJob(s,'dev');visit(s);const trace=[];let finish=null;
  for(let t=0;t<14*DAY;t+=DAY/visits){advance(s,DAY/visits);visit(s);if((t+DAY/visits)%DAY===0)trace.push({day:(t+DAY/visits)/DAY,stage:s.player.stage,side:s.side,autoBreakthrough:s.player.autoBreakthrough,cny:Math.round(s.currency.cny),stone:Math.round(s.currency.stone),projects:Object.keys(s.projects.done).length,industries:Object.keys(s.modern.industries).length});if(s.player.ascensionReady){finish=(s.world.clockMs-begin)/DAY;break;}}
  const before=structuredClone(s);let second=null;
  if(finish){ascend(s);chooseFate(s,'speed');switchPath(s,path);chooseJob(s,'dev');const secondStart=s.world.clockMs;visit(s);for(let t=0;t<14*DAY;t+=DAY/visits){advance(s,DAY/visits);visit(s);if(s.player.ascensionReady){second=(s.world.clockMs-secondStart)/DAY;break;}}}
  return {path,visits,seed:randSeed,finishDays:finish,secondDays:second,finalStage:before.player.stage,projects:Object.keys(before.projects.done),industries:Object.keys(before.modern.industries),cny:Math.round(before.currency.cny),stone:Math.round(before.currency.stone),tradeCount:before.stats.tradeCount,harvests:before.stats.harvests||0,trace};
 });
}
const results=[];
for(const path of PATHS)for(const visits of [2,12])for(const randSeed of [17,43,89]){const row=run(path.id,visits,randSeed);results.push(row);console.log(JSON.stringify({path:row.path,visits,seed:randSeed,finish:row.finishDays,second:row.secondDays,cities:row.projects.length,companies:row.industries.length}));}
assert(results.every(r => r.finishDays > 0 && r.finishDays <= 14 && r.secondDays > 0 && r.secondDays <= 14 && r.cny >= 0 && r.stone >= 0), '各道途两轮应能在14天内完成且资金不为负');
const battles=[];
for(const d of DUNGEONS)for(const path of PATHS)for(const kit of ['balanced','burst','guard'])for(const petSet of ['none','foxWolf','turtlePhoenix'])for(const diff of ['normal','hard','hell']){
 let wins=0,rounds=0;
 for(let n=0;n<24;n++)fixed(seed(1000+n),()=>{const s=fresh(d.unlockStage);s.path=path.id;const scale=baseAttrs(s.player.stage).atk*.9;for(const slot of Object.keys(s.equipment))s.equipment[slot]=rollEquipment(slot,1,scale);
  if(s.player.stage>=4)for(const [key,type]of [['heart','heart'],['move1','move'],['move2','move'],['special','special']])s.skills[key]=rollSkill(type,1,1,scale*.5);
  if(kit==='burst'){s.equipment.weapon.stats.atk*=1.4;s.equipment.armor.stats.hpMax*=.6;}
  if(kit==='guard'){s.equipment.weapon.stats.atk*=.6;s.equipment.armor.stats.hpMax*=1.4;s.equipment.armor.stats.dmgReduce+=.06;}
  const ids=(petSet==='none'?[]:petSet==='foxWolf'?['linghu','canglang']:['xuangui','huofeng']).filter(id=>BEAST_MAP[id].unlockStage<=s.player.stage);s.beasts.owned=ids.map(id=>({id,uid:id,level:2}));s.beasts.deployed=ids;
  // 主比较不携带克制科技，避免把首领差异全抵消。
  const r=runDungeon(s,d.id,diff,{free:true,silent:true});wins+=r.win?1:0;rounds+=r.waves.reduce((t,w)=>t+w.rounds,0);
 });
 battles.push({dungeon:d.id,path:path.id,kit,pets:petSet,diff,wins,runs:24,winRate:wins/24,avgRounds:rounds/24});
}
const alchemy=[];
for(const r of ALCHEMY_RECIPES)for(const path of PATHS)for(const aux of AUXILIARIES){const s=fresh(41);s.path=path.id;s.currency.stone=1e9;const st=recipeStatus(s,r.id,aux.id);const mean=1+aux.fine*.15+aux.rare*.3;const cost=st.cost*(1+(1-st.rate)*st.tox*.5);alchemy.push({recipe:r.id,path:path.id,aux:aux.id,success:st.rate,expectedPills:r.qty*st.rate,effectUnits:r.qty*st.rate*mean,stonePerPill:cost/(r.qty*st.rate),rarePer100Attempts:100*st.rate*aux.rare,mats:st.mats.map(m=>({id:m.id,qty:m.need}))});}
fs.mkdirSync('test-results',{recursive:true});fs.writeFileSync('test-results/balance.json',JSON.stringify({configuration:{speed:1,maxDays:14,seeds:[17,43,89],visits:[2,12],controlledBattleRuns:battles.length*24},results,battles,alchemy},null,2));
console.log(JSON.stringify({progressionRuns:results.length,battleRuns:battles.length*24,alchemyCases:alchemy.length}));
