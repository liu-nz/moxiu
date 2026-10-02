import { h, panel, showToast } from '../dom.js';
import { ITEM_MAP } from '../../data/items.js';
import { SIDE_NAME } from '../../core/state.js';
import { carryWeight } from '../../systems/inventory.js';
import { carryCapacity } from '../../systems/rift.js';
import { depositCargo, withdrawCargo } from '../../systems/cargo.js';
import { QUALITY_MAP } from '../../data/dungeons.js';
export function cargoPanel(state,ctx){
  const stock=state.cargo?.storage?.[state.side] || [],other=state.side==='modern'?'cultivation':'modern';
  const action=r=>{if(!r.ok)showToast(r.reason,'warn');ctx.rerender();};
  return panel('当地仓库与装货',SIDE_NAME[state.side],
    h('p.t-xs.t-dim',{text:'暂存不收费，不占行囊载重。仓库留在各自世界；另一侧货物须亲自提取并穿越。异界灵田收获、生产溢出的贸易货留在修仙仓库；炼丹可使用修仙仓库备料，公司使用现代仓库备料。'}),
    h('details.mt-2',null,h('summary.t-xs',{text:'把行囊货物暂存此地'}),state.inventory.filter(e=>ITEM_MAP[e.itemId]).map(e=>h('div.rowitem',null,h('span.t-xs',{text:`${ITEM_MAP[e.itemId].name} ×${e.qty}`}),h('button.btn.btn-sm',{text:`暂存${ITEM_MAP[e.itemId].name}`,onclick:()=>action(depositCargo(state,e.uid,e.qty))})))),
    stock.length?stock.map(e=>h('div.rowitem',null,h('div.t-xs',{text:`${ITEM_MAP[e.itemId]?.name || e.itemId} · ${QUALITY_MAP[e.quality]?.name || e.quality} ×${e.qty}`}),h('button.btn.btn-sm',{text:`提取${ITEM_MAP[e.itemId]?.name || e.itemId}`,disabled:carryWeight(state)+ITEM_MAP[e.itemId].weight>carryCapacity(state),onclick:()=>{const max=Math.max(0,Math.min(e.qty,Math.floor((carryCapacity(state)-carryWeight(state)+1e-8)/ITEM_MAP[e.itemId].weight)));action(withdrawCargo(state,e.itemId,e.quality,Math.min(10,max)));}}))) : h('p.t-xs.mt-2',{text:'当地仓库为空。'}),
    h('p.t-xs.t-dimmer.mt-2',{text:`${SIDE_NAME[other]}仓库另有 ${(state.cargo?.storage?.[other]||[]).reduce((n,e)=>n+e.qty,0)} 件货物，需前往当地提取。一次最多提取10件，仍受剩余载重限制。`}));
}
