import { h, panel, showToast } from '../dom.js';
import { INDUSTRIES } from '../../data/industries.js';
import { ITEM_MAP } from '../../data/items.js';
import { industryStatus } from '../../systems/industries.js';
import { industries_buildIndustry as buildIndustry, industries_setIndustryRunning as setIndustryRunning, industries_stockIndustry as stockIndustry } from '../commands.js';
import { fmtInt, fmtDuration } from '../../core/util.js';
export function industryPanel(state, ctx) {
  return panel('灵科公司与跨界产业', '材料 → 订单 → 资金与研究点',
    h('p.t-xs.t-dim', { text: '公司建立后默认暂停，由你选择何时生产。每单真实消耗灵材和灵石，人在修仙界半速；缺料等待、不积压订单。当前丹方、追踪工程和指定库存优先保留。贸易原料须亲自运到现代并入库，离开后不能使用异界行囊里的贸易货；秘境和牧场材料沿用共享材料规则。' }),
    INDUSTRIES.map(p => {
      const st = industryStatus(state, p.id);
      return h('div.mt-3', { style: 'padding-top:12px;border-top:1px solid var(--line)' },
        h('h3.t-sm', { text: p.name }), h('p.t-xs.t-dim.mt-1', { text: p.desc }),
        h('p.t-xs.mt-2', { text: `${st.status} · 前置 ${st.requirements.join(' / ')}` }),
        h('p.t-xs.mt-1', { text: `每单投入 ${p.runningCost} 灵石；回款 ¥${fmtInt(st.income)}、研究点 ${p.rp}；周期 ${p.cycleMs / 3600000} 现代世界小时。投入材料和两界币种另计，回款不等于利润。` }),
        h('details.mt-2', null, h('summary.t-xs', { text: '材料与备料来源' }), st.mats.map(m => h('p.t-xs.mt-1', { text: `${m.name} ${m.have}/${m.need}，另保留 ${m.keep} · ${m.source}` }))),
        st.built ? h('div.btn-row.mt-2', null,
          st.mats.some(m => ITEM_MAP[m.id]) ? h('button.btn.btn-sm', { text: `为${p.name}备料入库`, onclick: async () => { const r = await stockIndustry(state, p.id); showToast(r.ok ? `已入库 ${r.deposited} 件贸易原料，最多备五单及保留量。` : r.reason, r.ok ? 'good' : 'warn'); ctx.rerender(); } }) : null,
          h('button.btn.btn-sm', { text: st.on ? `暂停${p.name}` : `运行${p.name}`, onclick: async () => { const r = await setIndustryRunning(state, p.id, !st.on); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); } }),
          h('span.t-xs.t-dim', { text: `完成 ${st.record.orders} 单 · 下次检查 ${fmtDuration(st.remainingMs)}` }))
          : h('button.btn.btn-sm.mt-2', { text: `筹建${p.name}`, onclick: () => ctx.modal({ title: '公司筹建确认', subtitle: p.name,
            body: h('div', null, h('p.t-sm', { text: `投入 ¥${fmtInt(p.cost.cny)} 与 ${fmtInt(p.cost.stone)} 灵石，投资后保留 ¥${fmtInt(state.modern.reserveCny || 0)}；建成后暂停，不立即消耗材料。` }), h('p.t-xs.mt-2', { text: `前置 ${st.requirements.join(' / ')}${st.canBuild ? ' · 已备齐' : ' · 尚未备齐或资金不足'}` })),
            actions: [{ label: '返回' }, { label: '确认筹建', primary: true, keepOpen: true, onClick: async () => { const r = await buildIndustry(state, p.id); if (!r.ok) { showToast(r.reason, 'warn'); return; } ctx.closeOverlay(); ctx.rerender(); } }] }) }));
    }));
}
