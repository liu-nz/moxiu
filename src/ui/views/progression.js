import { h, panel, showToast } from '../dom.js';
import { growthRoadmap, goalDestination, investmentOptions } from '../../systems/progression.js';
import { finance_setInvestmentReserve as setInvestmentReserve } from '../commands.js';
import { reserveField } from './production.js';
import { getItem } from '../../data/items.js';
import { fmtInt } from '../../core/util.js';
import { OBJECTIVE_OPTIONS, objectiveStatus, currentGoals } from '../../systems/objectives.js';
import { objectives_setObjective as setObjective } from '../commands.js';

export function objectivePanel(state, ctx) {
  const goal = objectiveStatus(state);
  const select = h('select', { 'aria-label': '选择个人目标', onchange: async e => {
    const r = await setObjective(state, e.target.value || null);
    if (!r.ok) showToast(r.reason, 'warn');
    ctx.rerender();
  } }, h('option', { value: '', selected: !goal, text: '暂不设置' }),
    OBJECTIVE_OPTIONS.filter(x=>x.id!=='research:compiler' || (state.collection?.secrets || []).includes('compiler')).map(x => h('option', { value: x.id, selected: x.id === goal?.id, text: x.label })));
  return panel('我的目标', '主要 · 推荐 · 自选长期目标',
    currentGoals(state).map(g=>h('div.rowitem.mt-2',null,
      h('div.rowitem-main',null,h('strong.t-sm',{text:`${g.kind} · ${g.label}`}),
        h('p.t-xs.t-dim',{live:`goalText:${g.id}`,text:`${Math.round(g.progress/g.total*100)}% · ${g.missing}` })),
      h('button.btn.btn-sm',{text:g.done?'继续探索':'前往处理',onclick:()=>ctx.navigate(goalDestination(state,g.view).view)}))),
    h('label.t-xs.t-dim.mt-3', { text: '自选一项长期目标；最多显示三项建议，不要求逐项完成。' }),select);

}
export function growthPanel(state, ctx) {
  const roadmap = growthRoadmap(state), goal = roadmap.next;
  const route = goal ? goalDestination(state, goal.view) : null;
  return panel('两界成长路线', roadmap.phases[roadmap.currentPhase],
    h('div.growth-phases', null, roadmap.phases.map((name, i) => h('span', { class: i === roadmap.currentPhase ? 'tag tag-ink' : 'tag', text: `${i + 1} · ${name}` }))),
    goal ? h('div.mt-3', null, h('h3', { text: goal.name }), h('p.t-sm.t-dim.mt-2', { text: goal.note }),
      goal.project ? h('p.t-xs.mt-2', { live: 'cityGoalMissing', text: `还需灵石 ${fmtInt(goal.project.missing.stone)} · 可投资资金缺口 ¥${fmtInt(goal.project.missing.cny)} · 材料 ${goal.project.mats.filter(m => m.have < m.need).map(m => `${m.name}缺${m.need - m.have}`).join('、') || '已备齐'}` }) : null,
      h('button.btn.btn-sm.mt-3', { text: route.label, onclick: () => ctx.navigate(route.view) })) : h('p.t-sm.mt-3', { text: '主线设施已经接通，可选择城市工程、不同配装与下一次轮回。' }),
    h('details.mt-3', null, h('summary.t-xs.t-dim', { text: `成长里程碑 · ${roadmap.steps.filter(s => s.done).length}/${roadmap.steps.length}` }),
      roadmap.steps.map(s => h('p.t-xs.mt-2', { text: `${s.done ? '✓' : '○'} ${s.name}` }))),
    h('p.t-xs.t-dimmer.mt-2', { text: '路线提供建议，不要求逐项完成；可在城市工程页追踪自己的长线目标。' }));
}
export function investmentPanel(state, ctx) {
  const { list, fastest, budget } = investmentOptions(state);
  return panel('投资比较', h('span', { live: 'investmentAvailable', text: `可投资 ¥${fmtInt(budget.available)}` }),
    reserveField(budget.reserve, '投资后保留资金', async v => await setInvestmentReserve(state, v)),
    h('p.t-xs.t-dim.mt-2', { text: '投资后保留用于进货的现金。采购与其他手动消费不受这条保留线限制。' }),
    fastest ? h('p.t-sm.mt-3', { text: `按当前世界估算，新增稳定收入回本最快：${fastest.name}，约${fastest.hours.toFixed(1)}小时${fastest.affordable ? '，资金足够' : '，当前资金尚不足'}。` }) : null,
    h('details.mt-3', { open: true }, h('summary.t-sm', { text: '比较下一笔投入' }),
      list.map(x => h('div.rowitem', null, h('div.rowitem-main', null,
        h('div.t-sm.t-strong', { text: x.name }),
        h('div.t-xs.t-dim.mt-1', { text: `投入 ¥${fmtInt(x.cost)} · 新增 ${x.delta.toFixed(2)} ${x.unit}${x.hours !== null ? ` · 约${x.hours.toFixed(1)}小时回本` : ' · 不换算现金回本'}` }),
        !x.affordable ? h('div.t-xs.t-dimmer', { text: x.reason }) : null),
        h('button.btn.btn-sm', { text: '查看投资', onclick: () => { const route = goalDestination(state, x.view); ctx.navigate(route.view); } })))),
    h('p.t-xs.t-dimmer.mt-3', { text: '回本只计算新增稳定收入，按当前世界、上班状态和已有加成估算；不会把货物回款当作新增利润。进货折扣、材料、灵石与研究点另计。' }));
}

export function offlineProduction(report) {
  const p = report?.production;
  if (!p || !(p.harvests || p.ranchCollected || p.attempts || p.sold || p.industryOrders || p.items.length)) return null;
  return h('div.mt-3', null, h('h3.t-sm', { text: '生产与经营明细' }),
    h('p.t-xs.mt-2', { text: `灵田收获 ${p.harvests} 块 · 牧场收取 ${p.ranchCollected} 件 · 炼丹 ${p.attempts} 炉 / 成丹 ${p.pills} 枚` }),
    h('p.t-xs.mt-1', { text: `种子支出 ${fmtInt(p.seedsStone)} 灵石 · 炼丹支出 ${fmtInt(p.alchemyStone)} 灵石（含反噬）` }),
    h('p.t-xs.mt-1', { text: `店铺售出 ${p.sold} 件 · 净回款 ¥${fmtInt(p.shopCny)}` }),
    p.industryOrders ? h('p.t-xs.mt-1', { text: `公司订单 ${p.industryOrders} 单 · 回款 ¥${fmtInt(p.industryCny)} · 灵石投入 ${fmtInt(p.industryStone)}` }) : null,
    p.items.length ? h('details.mt-2', null, h('summary.t-xs', { text: '物资净变化（含两界仓库，已扣除消耗和售出）' }), p.items.map(i => h('p.t-xs.mt-1', { text: `${getItem(i.id)?.name || i.id} ${i.delta < 0 ? '−' : '+'}${fmtInt(Math.abs(i.delta))}` }))) : null);
}
