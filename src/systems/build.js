import {AFFIXES} from '../data/affixes.js';
import {BUILDS} from '../data/builds.js';
import {rollEquipment} from '../data/equipment.js';
import {forgeScale} from './forging.js';
import {researchEffects} from '../data/research.js';
import {productionCount,consumeWorld} from './cargo.js';
import {markCollection} from './collection.js';
import {ITEM_MAP} from '../data/items.js';
import {sellPrice} from './market.js';
import {computeAttrs} from './character.js';
import {riftDayIndex} from '../core/clock.js';
import { emit, EV } from '../core/bus.js';
export const TACTICS = {
 bribe:{name:'山贼：买路',description:'仅山贼寨每次额外支付50灵石，避开前两波小兵，仍须击败首领；体力照常消耗。'},
 node_attack:{name:'遗迹：攻势节点',description:'仅在太虚遗迹：关闭增幅节点，使首领攻击降低20%；保留护盾与治疗节点。'},
 node_shield:{name:'遗迹：护盾节点',description:'仅在太虚遗迹：关闭护盾节点；首领保留攻势与每四回合治疗。'},
 node_heal:{name:'遗迹：治疗节点',description:'仅在太虚遗迹：关闭治疗节点；保留首领攻击与护盾。'},
 balanced:{name:'均衡',description:'保持现有攻防节奏。'},
 assault:{name:'强攻',description:'副本伤害 +15%，承受伤害 +15%。'},
 guard:{name:'守阵',description:'副本伤害 -10%，承受蓄力伤害 -25%。'},
 stealth:{name:'潜行',description:'山贼伏击失效；其他副本伤害 -10%。'},
};
export function setTactic(state,id) {
 if(!Object.hasOwn(TACTICS,id)) return {ok:false,reason:'没有这项战术。'};
 state.dungeon.tactic=id;emit(EV.STATE);return {ok:true};
}
export function setTraining(state,budget) {
 if(state.path !== 'speed' || !Number.isSafeInteger(budget) || budget < 0 || budget > 10000) return {ok:false,reason:'速修可设置0–10000灵石的本次冲刺预算。'};
 if(budget > state.currency.stone) return {ok:false,reason:'灵石不足。'};
 state.player.trainingBudget=budget;emit(EV.STATE);return {ok:true};
}
export function transferStat(state,donorUid,slot,key) {
 const donor=state.bag.find(x=>x.uid===donorUid),target=state.equipment[slot];
 if(state.path !== 'artifact' || !donor || !target || donor.slot !== target.slot || donor.tech || target.tech || !Object.hasOwn(target.stats,key) || !Object.hasOwn(donor.stats,key)) return {ok:false,reason:'器修只能把同部位装备的已有属性转移给已装备物品。'};
 if(!Number.isFinite(donor.stats[key]) || donor.stats[key] <= target.stats[key]) return {ok:false,reason:'供体属性没有提升。'};
 const cost=100 + (target.enhance || 0)*20;
 if(state.currency.stone < cost) return {ok:false,reason:`需要 ${cost} 灵石。`};
 target.stats[key]=donor.stats[key];state.currency.stone-=cost;
 state.bag=state.bag.filter(x=>x.uid!==donorUid);emit(EV.STATE);return {ok:true};
}

export function lockQuote(state,itemId) {
 const item=Object.hasOwn(ITEM_MAP,itemId) && ITEM_MAP[itemId],day=riftDayIndex(state.world.clockMs);
 if((state.path !== 'merchant' && state.reincarnation?.fate !== 'merchant') || !item) return {ok:false,reason:'商修才能为贸易商品锁定异界收购行情。'};
 if(state.market.quoteLockDay === day) return {ok:false,reason:'每天只能锁定一项商品行情。'};
 if(state.currency.stone < 20) return {ok:false,reason:'锁定行情需要20灵石。'};
 const world=item.origin==='modern'?'cultivation':'modern';
 const unit=sellPrice(state,world,itemId,'common',computeAttrs(state));
 // Snapshot unsaturated common-quality price. Quantities continue to saturate normally.
 const sold=state.market.sold[world]?.[itemId] || 0,cap=item.capacity[world] || 1;
 const baseline=unit / Math.max(.35,1/(1+sold/cap));
 state.market.quoteLock={itemId,world,baseline,expiresAt:state.world.clockMs+12*3600000};
 state.market.quoteLockDay=day;state.currency.stone-=20;emit(EV.STATE);return {ok:true};
}

export function createPowerArmor(state) {
 if(state.player.stage < 11 || !researchEffects(state).powerArmor) return {ok:false,reason:'筑基中期并完成双槽动力装甲研究后开放。'};
 if(state.currency.stone < 500 || productionCount(state,'lingjin') < 2) return {ok:false,reason:'需要500灵石与灵金×2。'};
 const armor=rollEquipment('armor',2,forgeScale(state));armor.name='灵能动力装甲';armor.rule='powerarmor';
 armor.stats.def=Math.round(armor.stats.def*1.6);armor.stats.hpMax=Math.round(armor.stats.hpMax*1.6);
 consumeWorld(state,'cultivation','lingjin',2);state.currency.stone-=500;state.bag.push(armor);
 markCollection(state,'equipment','armor:rare');emit(EV.STATE);return {ok:true};
}

export function selectBuild(state,id){
 if(!Object.hasOwn(BUILDS,id))return {ok:false,reason:'没有这个套路。'};
 const missing=BUILDS[id].needs.filter(([,test])=>!test(state)).map(([name])=>name);
 if(missing.length)return {ok:false,reason:'还需：'+missing.join('、')};
 state.player.build=id;emit(EV.STATE);return {ok:true};
}
export function inscribeAffix(state,uid,id){
 const eq=state.bag.find(x=>x.uid===uid) || Object.values(state.equipment).find(x=>x?.uid===uid);
 const aff=Object.hasOwn(AFFIXES,id) && AFFIXES[id];
 if(state.player.stage<11 || !eq || !aff || !['rare','epic','legend'].includes(eq.tier) || eq.tech || eq.rule==='powerarmor' || !aff.slots.includes(eq.slot))return {ok:false,reason:'筑基中期后，可在符合部位的宝品以上普通装备铭刻；动力装甲保留专属机制。'};
 if(eq.rule===id)return {ok:false,reason:'已有这个词条，材料已保留。'};
 if(state.currency.stone<1000 || productionCount(state,'lingjin')<2)return {ok:false,reason:'铭刻需要1000灵石与灵金×2；会替换原机制词条。'};
 consumeWorld(state,'cultivation','lingjin',2);state.currency.stone-=1000;eq.rule=id;emit(EV.STATE);return {ok:true};
}
