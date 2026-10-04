import { h, panel, showToast } from '../dom.js';
import { starterRoute } from '../../systems/journey.js';
import { trade_buy as buy } from '../commands.js';
import { quoteBuy } from '../../systems/market.js';
import { ITEM_MAP } from '../../data/items.js';
import { fmtInt } from '../../core/util.js';
export function journeyPanel(state, ctx) {
  const j = state.tutorial.journey || {};
  if (state.tutorial.skipped || (j.inboundSold && state.player.stage >= 10)) return null;
  if (j.inboundSold) return panel('首次双向贸易已完成', '分别记账',
    h('p.t-sm', { text: `现代进货投入 ¥${fmtInt(j.cnySpent || 0)} · 首次回程成交 ¥${fmtInt(j.cnyReturned || 0)} · 差额 ¥${fmtInt((j.cnyReturned || 0) - (j.cnySpent || 0))}` }),
    h('p.t-xs.t-dim.mt-2', { text: '这里只记录首次回程成交，不包含后续分批出货、工资或剩余灵石；下一步可安排洞府生产。' }));
  const route = starterRoute(state), local = route?.local;
  const carried = state.inventory.some(e => e.qty > 0 && ITEM_MAP[e.itemId] && (state.side === 'modern' ? ITEM_MAP[e.itemId].origin === 'modern' || j.returned : ITEM_MAP[e.itemId].origin === 'modern' || ITEM_MAP[e.itemId].origin === 'cultivation'));
  return panel('第一次两界生意', '小额试单 · 约5–15分钟',
    h('p.t-sm', { text: '现代采购 → 界门确认 → 修仙出货 → 装回程货 → 返回现代 → 出货。双向次数分别计数，回程不用等灵田成熟。' }),
    local && !carried ? h('p.t-sm.mt-2', { text: `当前建议：${local.item.name} ×${local.qty}，投入 ${state.side === 'modern' ? '¥' : ''}${fmtInt(local.cost)}${state.side === 'cultivation' ? ' 灵石' : ''}。` }) : h('p.t-sm.mt-2', { text: '已有货物可先比较出货报价，再整理下一程；资金或空间不足时可减量。' }),
    route?.direction === 'outbound' && local && !carried ? h('p.t-xs.t-dim.mt-2', { text: `修仙预计回款 ${fmtInt(local.revenue)} 灵石 → 回程${route.inbound.item.name} ×${route.inbound.qty} → 现代预计回款 ¥${fmtInt(route.inbound.revenue)}。按当前行情，两次人民币差额约 ¥${fmtInt(route.profit)}，另留少量灵石；跨日、品质与途中成交会改变报价。` }) : null,
    h('div.btn-row.mt-3', null,
      local && !carried ? h('button.btn.btn-sm', { text: '预览建议试单', onclick: () => {
        const side = state.side, cost = quoteBuy(state, side, local.item.id, local.qty).total;
        ctx.modal({ title: '新手试单确认', body: h('p.t-sm', { text: `${local.item.name} ×${local.qty} · 支付 ${side === 'modern' ? '¥' : ''}${fmtInt(cost)}${side === 'cultivation' ? ' 灵石' : ''}。确认才进货，不自动穿越或售出。` }), actions: [{ label: '返回' }, { label: '确认试单', primary: true, keepOpen: true, onClick: async () => {
          if (state.side !== side || Math.abs(quoteBuy(state, side, local.item.id, local.qty).total - cost) > 1e-8) { showToast('报价或世界已变化，请重新预览。', 'warn'); ctx.closeOverlay(); ctx.rerender(); return; }
          const r = await buy(state, side, local.item.id, local.qty); if (!r.ok) { showToast(r.reason, 'warn'); return; }
          ctx.closeOverlay(); ctx.rerender();
        } }] });
      } }) : null,
      h('button.btn.btn-sm', { text: '查看市场进货与出货', onclick: () => ctx.navigate('market') }),
      h('button.btn.btn-sm', { text: '查看界门次数与载重', onclick: () => ctx.navigate('gate') })));
}
