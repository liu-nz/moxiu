import assert from 'node:assert/strict';
import { initialGame, settleGame, validateCommand } from '../src/core/game-engine.js';
import { actions } from '../src/core/game-actions.js';
import { farmSummary, ensurePlots } from '../src/systems/farm.js';
const now = Date.UTC(2026,9,3,6), fresh = () => initialGame(now);
let checks = 0;
const check = (v,label) => { assert(v,label); checks++; };
const initial = fresh(), original = JSON.stringify(initial);
let s = settleGame(initial,'modern.chooseJob',['dev'],now).state;
check(JSON.stringify(initial) === original,'settlement does not mutate trusted input');
const cny = s.currency.cny;
s = settleGame(s,'sync',[],now+3600000).state;
check(s.currency.cny > cny && s.player.totalCultivation > initial.player.totalCultivation,'server elapsed time advances salary and cultivation');
check(settleGame(s,'sync',[],now+3600000).state.currency.cny === s.currency.cny,'same server time cannot award salary twice');
assert.throws(() => settleGame(s,'sync',[],now)); checks++;
for (const [action,args] of [
 ['tickModern',[9999999]],['trade.buy',['modern','jingmi',-1]],['trade.buy',['modern','jingmi',Infinity]],
 ['trade.buy',[]],['sync',[999]],['reset',[{}]],['dungeon.runDungeon',['bandit','normal',{free:true}]],
 ['dungeon.runDungeon',['bandit','normal',{rng:0}]],['farm.setFarmAutomation',[{currency:1e9}]],
 ['gear.equipItem',['__proto__']],['alchemy.craft',['huiyuan',1,{silent:{}}]],
]) { assert.throws(()=>validateCommand(action,args),action); checks++; }
check(Object.keys(actions).length === 104 && !actions['inventory.addItem'] && !actions['beasts.capture'],'only explicit player operations are exposed');
let farmer=fresh(); farmer.side='cultivation'; farmer.currency.stone=1e9;
farmer=settleGame(farmer,'farm.plant',[0,'lingmi'],now).state;
check(farmer.farm.plots[0]?.cropId === 'lingmi','planting consumes funds and starts actual crop');
farmer=settleGame(farmer,'farm.harvest',[0],now+3600000).state;
check(farmer.inventory.some(e=>e.itemId==='lingmi' && e.qty>0),'server time matures crop and harvest shares the original bag');
const cap=fresh(); cap.currency.stone=1e9; cap.farm.unlocked=12; ensurePlots(cap);
check(!settleGame(cap,'farm.buyPlot',[],now).result.ok,'unowned paid expansion cannot exceed free limit');
const paid=settleGame(cap,'farm.buyPlot',[],now,['farm_extra']);
check(paid.result.ok && paid.state.farm.unlocked===13 && paid.state.currency.stone<cap.currency.stone,'trusted entitlement grants exactly one expansion with game cost');
check(!settleGame(paid.state,'farm.buyPlot',[],now,['farm_extra']).result.ok,'paid cap remains bounded');
check(farmSummary(settleGame(cap,'sync',[],now,['farm_extra']).state).max===12,'JSON state cannot smuggle server rights into an unrelated client object');
const fight=fresh(); fight.side='cultivation'; fight.player.stage=15;
const stamina=fight.player.stamina;
const result=settleGame(fight,'dungeon.runDungeon',['bandit','normal',{silent:true}],now);
check(result.state.player.stamina===stamina-10 && result.result.waves.length>0,'server combat consumes stamina and returns original battle feedback');
const reset=settleGame(paid.state,'reset',[],now);
check(reset.state.farm.unlocked===3 && reset.state.player.stage===0,'reset starts a fresh gameplay character');
console.log(JSON.stringify({passed:checks,commands:Object.keys(actions).length}));
