/** 当地仓库是暂存，不跨界搬运；生产溢出和异界作物留在修仙仓库。 */
import { ITEM_MAP } from '../data/items.js';
import { addItem, removeEntry, countOf, carryWeight, validQuantity } from './inventory.js';
import { carryCapacity } from './rift.js';
import { QUALITY_MAP } from '../data/dungeons.js';
import { emit, EV } from '../core/bus.js';
function storage(state, world) { return (state.cargo ??= { storage: { modern: [], cultivation: [] } }).storage[world]; }
function store(state, world, itemId, qty, quality) {
  const list = storage(state, world), entry = list.find(e => e.itemId === itemId && e.quality === quality);
  if (entry) entry.qty += qty;
  else list.push({ itemId, qty, quality });
}
export function storedCount(state, world, id) { return (state.cargo?.storage?.[world] || []).filter(e => e.itemId === id).reduce((n,e)=>n+e.qty,0); }
export function worldCount(state, world, id) { return storedCount(state,world,id) + (state.side === world || !ITEM_MAP[id] ? countOf(state,id) : 0); }
export function consumeWorld(state, world, id, qty) {
  if (!validQuantity(qty) || worldCount(state,world,id)<qty) return false;
  let left=qty;
  const entries=storage(state,world);
  const bag = state.side === world || !ITEM_MAP[id] ? state.inventory.filter(e=>e.itemId===id) : [];
  const available=[...entries.filter(e=>e.itemId===id).map(e=>({e,stored:true})),...bag.map(e=>({e,stored:false}))].sort((a,b)=>(QUALITY_MAP[a.e.quality]?.mult||1)-(QUALITY_MAP[b.e.quality]?.mult||1));
  for(const {e,stored} of available){if(!left)break;const n=Math.min(e.qty,left);if(stored)e.qty-=n;else removeEntry(state,e.uid,n);left-=n;}
  state.cargo.storage[world]=entries.filter(e=>e.qty>0);
  return true;
}
export function depositCargo(state, uid, qty) {
  const entry=state.inventory.find(e=>e.uid===uid);
  if(!entry || !ITEM_MAP[entry.itemId] || !validQuantity(qty) || qty>entry.qty) return {ok:false,reason:'请选择行囊中的贸易货物和有效数量。'};
  store(state,state.side,entry.itemId,qty,entry.quality);
  removeEntry(state,uid,qty);emit(EV.STATE);return {ok:true};
}
export function withdrawCargo(state, itemId, quality, qty) {
  const item=ITEM_MAP[itemId],entry=(state.cargo?.storage?.[state.side] || []).find(e=>e.itemId===itemId&&e.quality===quality);
  if(!item || !entry || !validQuantity(qty) || qty>entry.qty) return {ok:false,reason:'当地仓库没有足够货物。'};
  if(carryWeight(state)+item.weight*qty>carryCapacity(state)+1e-8)return {ok:false,reason:'行囊载重不足，请减量提取。'};
  entry.qty-=qty;state.cargo.storage[state.side]=state.cargo.storage[state.side].filter(e=>e.qty>0);addItem(state,itemId,qty,quality);emit(EV.STATE);return {ok:true};
}
export function addProduced(state,itemId,qty,quality='common',world='cultivation') {
  const item=ITEM_MAP[itemId];
  if(item && (state.side!==world || carryWeight(state)+item.weight*qty>carryCapacity(state)+1e-8)) {store(state,world,itemId,qty,quality);return {stored:true,world};}
  addItem(state,itemId,qty,quality);return {stored:false};
}
export function productionCount(state,id){return worldCount(state,'cultivation',id);}
