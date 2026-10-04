import {h,panel} from '../dom.js';
import {worldState,sourceOpen} from '../../data/worldStates.js';
import {fmtDuration} from '../../core/util.js';
export function worldStatePanel(s,ctx){const w=worldState(s);return panel('两界风云',w.name+(w.phase?` · 第${w.phase}/3天`:''),
 h('p.t-sm',{text:w.text}),h('p.t-xs.t-dim.mt-2',{text:`下一阶段 ${fmtDuration(w.endsAt-s.world.clockMs)} · 北京时间05:00推进 · ${w.forecast}。`} ),
 h('details.mt-2',null,h('summary.t-xs',{text:'本轮变化与应对'}),h('p.t-xs.mt-2',{text:w.id==='depletion'?'第一天修炼-10% → 第二天灵草行情+30%、修炼-10% → 第三天秘境敌人攻击+10%、开放灵脉源头。可调整修炼丹、生产与配装。':w.id==='leak'?'第一天异常新闻 → 第二天现代法器行情+40% → 第三天现代灵植行情+20%。金丹行者找到穿越者线索后可调查光晕。':'每12天一轮：衰竭3天、休整3天、泄漏3天、休整3天。每日市场事件仍独立刷新，价格影响同时作用于购入与出售。'})),
 h('div.btn-row.mt-2',null,sourceOpen(s)?h('button.btn.btn-sm',{text:'挑战灵脉源头',onclick:()=>ctx.navigate(s.side==='cultivation'?'dungeon':'gate')}):null,
 s.player.stage>=14?h('button.btn.btn-sm',{text:'追寻另一位穿越者',onclick:()=>ctx.navigate('events')}):h('p.t-xs.t-dim',{text:'金丹将开启新的两界主线。'})));
}
