/** 界门只负责确认与反馈；次数、载重及估价由现有系统校验。 */
import { h, panel, bar, kv, openOverlay } from '../dom.js';
import { SIDE_NAME, otherSide } from '../../core/state.js';
import { canCross, carryCapacity, msToNextRift, perDirection, bankCap } from '../../systems/rift.js';
import { rift_cross as cross } from '../commands.js';
import { inventoryRows, carryWeight } from '../../systems/inventory.js';
import { ITEM_MAP } from '../../data/items.js';
import { hotList, demandArrow, quotePortfolio } from '../../systems/market.js';
import { computeAttrs } from '../../systems/character.js';
import { fmtInt, fmtKg, fmtDuration } from '../../core/util.js';
import { commissionsPanel } from './activity.js';

import { cargoPanel } from './cargo.js';

let crossing = false;
export function isCrossing() { return crossing; }
export function startCrossing(s, ctx, destination) {
  if (crossing) return;
  const check = canCross(s, destination);
  if (!check.ok) { ctx.showToast(check.reason, 'warn'); ctx.rerender(); return; }
  const cargo = JSON.stringify(s.inventory);
  const marketDay = s.market.day;
  crossing = true;
  const status = h('p', {text:'界门正在稳定…',role:'status','aria-live':'polite'});
  const overlay = openOverlay(h('div.gate-transition', null,h('div.gate-ring'),h('h1',{text:'穿行两界'}),status));
  overlay.dataset.sticky = '1';
  const phase = setTimeout(()=>{ status.textContent = `正在前往${SIDE_NAME[destination]}…`; },650);
  setTimeout(async ()=>{
    clearTimeout(phase);
    // 过渡期间生产和界潮仍会推进，落地前重新检查，失败不扣次数。
    const result = cargo !== JSON.stringify(s.inventory) || marketDay !== s.market.day
      ? {ok:false,reason:'行囊或当日行情已变化，请重新确认后穿越。'}
      : await cross(s, destination);
    crossing = false;
    overlay.remove();
    if (!result.ok) { ctx.showToast(result.reason,'warn'); ctx.rerender(); return; }
    ctx.navigate('home');
    ctx.modal({title:`已抵达${SIDE_NAME[destination]}`,subtitle:'界门在身后缓缓合拢。',body:h('div',null,
      h('p',{text:`跨界背包 ${fmtKg(carryWeight(s))} kg 已随你抵达，消耗该方向 1 次界潮。`}),
      h('p.t-sm.t-dim.mt-2',{text:destination==='cultivation'?'修炼恢复满速。可以去坊市出售现代货物，或回洞府照料灵田。':'都市的灯光亮起。可以出售修仙货物，继续经营与休闲生活。'})),
      actions:[{label:'返回首页'},{label:'前往当地市场',primary:true,onClick:()=>ctx.navigate('market')}],
    });
  },1600);
}
export function renderGate(s,ctx) {
  const to = otherSide(s.side), check=canCross(s,to), weight=carryWeight(s), cap=carryCapacity(s);
  const rows=inventoryRows(s), attrs=computeAttrs(s);
  const estimate=quotePortfolio(s,to,s.inventory.filter(e=>ITEM_MAP[e.itemId] && ITEM_MAP[e.itemId].origin!==to),attrs).total;
  const remain=to==='cultivation'?s.rift.toCultivation:s.rift.toModern;
  const bag=panel('跨界背包',`${fmtKg(weight)} / ${cap} kg`,
    h('p.t-sm.t-dim.mb-3',{text:'确认本次随身携带的全部物品。贸易商品占载重，材料与消耗品不占界门载重。'}),
    bar(Math.min(1,weight/cap),{thick:true,liveKey:'weightBar'}),
    rows.length?rows.map(r=>h('div.rowitem',null,h('div.rowitem-main',null,h('strong',{text:r.item.name}),h('div.t-xs.t-dim',{text:ITEM_MAP[r.itemId]?`${r.qualityInfo.name} · ${fmtKg(r.weight)} kg`:'材料 / 消耗品 · 不计跨界载重'})),h('span.t-num',{text:`×${r.qty}`}))):h('div.empty',{text:'背包为空，可以空手穿越，也可以先去市场备货。'}),
    h('button.btn.mt-3',{text:weight>cap?'前往市场减重':'去市场整理物资',onclick:()=>ctx.navigate('market')}),
  );
  const market=panel('当日市场摘要',`目的地 · ${SIDE_NAME[to]}`,
    hotList(s,to,3).map(x=>{const arrow=demandArrow(x.demand);return kv(x.item.name,h('span',{class:arrow.cls,text:`${arrow.sym} ${arrow.label}`}));}),
    kv('跨界货整批估价',`${to==='modern'?'¥':''}${fmtInt(estimate)}${to==='cultivation'?' 灵石':''}`),
    h('p.t-xs.t-dim.mt-2',{text:'估价使用目的地当前售价与品质、角色加成；仅贸易商品计价。实际成交会受销量饱和、跨日行情等影响，穿越不会自动售出。'}),
  );
  const commissions = commissionsPanel(s,ctx);
  return h('div.flex-col.gap-4',null,
    h('section.gate-intro',null,h('div.eyebrow',{text:`界门 LV.${s.rift.gateLevel}`}),h('h1',{text:`${SIDE_NAME[s.side]} → ${SIDE_NAME[to]}`}),h('p.t-sm.t-dim.mt-2',{text:'先看行情，再确认行囊。每次穿越，都是一次选择。'})),
    bag,cargoPanel(s,ctx),market,commissions,
    panel('确认穿越',`该方向剩余 ${remain} 次`,
      h('p.t-sm',{live:'riftCountdown',text:`下次刷新 ${fmtDuration(msToNextRift(s.world.clockMs))}`}),
      h('p.t-xs.t-dim.mt-2',{text:`每日双向各 ${perDirection(s)} 次，每方向最多累计 ${bankCap(s)} 次。标准模式每日 05:00（UTC+8）统一刷新。`}),
      !check.ok?h('p.gate-warning.mt-3',{role:'status',text:check.reason}):null,
      h('button.btn.btn-solid.btn-block.mt-3',{text:check.ok?'确认背包并开启界门':'暂时无法穿越',disabled:!check.ok||crossing,onclick:()=>startCrossing(s,ctx,to)}),
    ),
  );
}
