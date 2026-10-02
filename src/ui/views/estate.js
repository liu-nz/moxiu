/**
 * views/estate.js —— 现代地产 / 店铺 / 仓库（GDD 13.3）
 */

import { h, panel, panelFlush, showToast } from '../dom.js';
import { estateSummary, buyEstate, buyShop, upgradeWarehouse, toggleAutoSell, shopStock, setShopPolicy } from '../../systems/estate.js';
import { WAREHOUSE } from '../../data/estate.js';
import { projectsSummary, start as startProject, status as projectStatus, projectImpact, setProjectTarget } from '../../systems/projects.js';
import { investmentAllowed } from '../../systems/finance.js';
import { growthPanel } from './progression.js';
import { TRADE_ITEMS } from '../../data/items.js';
import { reserveField } from './production.js';
import { fmtInt, fmtKg, fmtPct } from '../../core/util.js';

function impactRows(impact) {
  const fields = [['cultivation', '修炼速度 / 秒'], ['income', '工资与商业 / 时'], ['rent', '地产租金 / 时'], ['carry', '跨界载重 kg'], ['throughput', '店铺吞吐 / 时']];
  return h('div.engineering-impact.mt-3', null, fields.filter(([key]) => Math.abs(impact.after[key] - impact.before[key]) > 1e-8).map(([key, name]) =>
    h('div', null, h('div.t-xs.t-dim', { text: name }), h('div.t-sm.t-num', { text: `${impact.before[key].toFixed(2)} → ${impact.after[key].toFixed(2)}` }))));
}
function projectModal(state, ctx, id, changed = false) {
  const st = projectStatus(state, id), impact = projectImpact(state, id);
  if (!st || st.done) { showToast(st?.reason || '工程不存在。', 'warn'); return; }
  const signature = JSON.stringify([state.side, st.project.cost, st.stageOk, st.reqOk, st.budget.reserve, impact]);
  ctx.modal({ title: '城市工程筹备', subtitle: st.project.name,
    body: h('div', null,
      changed ? h('p.t-xs.t-rise.mb-2', { text: '工程条件或收益已变化，预览已更新，请再次确认。' }) : null,
      h('p.t-sm', { text: st.project.effectText }), impactRows(impact),
      h('p.t-xs.t-dim.mt-3', { text: '以上为当前世界与现有产业下的实际变化；未建立的产业不会凭空产生收入。' }),
      h('dl.kv.mt-3', null, h('dt', { text: '投入灵石' }), h('dd', { text: fmtInt(st.project.cost.stone) })),
      h('dl.kv', null, h('dt', { text: '投入资金' }), h('dd', { text: `¥${fmtInt(st.project.cost.cny)} · 保留 ¥${fmtInt(st.budget.reserve)}` })),
      h('p.t-xs.mt-2', { text: `境界：${st.stageLabel}${st.stageOk ? ' · 已满足' : ' · 未达到'}` }),
      [...st.research, ...st.prerequisites].map(r => h('p.t-xs.mt-1', { text: `前置：${r.name} ${r.done ? '✓' : '尚未完成'}` })),
      st.mats.map(m => h('p.t-xs.mt-2', null, h('span', { text: `${m.name} ${m.have}/${m.need}${m.have < m.need ? ` · 缺${m.need - m.have}` : ''}` }), h('span.t-dimmer', { text: ` · ${m.source}` }))),
      !st.canStart ? h('p.t-xs.t-rise.mt-3', { text: st.reason }) : null),
    actions: [{ label: '返回' }, st.canStart ? { label: '确认投资动工', primary: true, keepOpen: true, onClick: () => {
      const current = projectStatus(state, id), nextImpact = projectImpact(state, id);
      const nextSignature = JSON.stringify([state.side, current.project.cost, current.stageOk, current.reqOk, current.budget.reserve, nextImpact]);
      if (!current.canStart || signature !== nextSignature) { ctx.closeOverlay(); projectModal(state, ctx, id, true); return; }
      const result = startProject(state, id);
      if (!result.ok) { showToast(result.reason, 'warn'); return; }
      ctx.closeOverlay(); ctx.rerender();
    } } : { label: '追踪此工程', primary: true, onClick: () => { const r = setProjectTarget(state, id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); } }],
  });
}
function projectPanel(state, ctx) {
  const s = projectsSummary(state);
  return panelFlush('城市灵改工程', `${s.doneCount} / ${s.total} 已完工`,
    h('p.t-xs.t-dim', { style: 'padding:12px 16px', text: '灵科研究提供方法，秘境产出材料，现代产业筹集资金。先追踪一项工程，再准备所缺资源。传送阵依赖灵能电网，飞升基座依赖城市聚灵阵。' }),
    ...s.list.map(st => h('div', { style: 'padding:14px 16px;border-top:1px solid var(--line)' },
      h('div.rowitem-title', null, h('span.rowitem-name.t-serif', { text: `${st.project.accent} · ${st.project.name}` }), h('span.tag', { text: st.done ? '已完工' : `需 ${st.stageLabel}` }), state.projects.target === st.project.id && !st.done ? h('span.tag.tag-ink', { text: '正在追踪' }) : null),
      h('p.t-xs.t-jade.mt-1', { text: st.project.effectText }),
      h('details.mt-2', { open: state.projects.target === st.project.id && !st.done }, h('summary.t-xs.t-dim', { text: '查看条件与材料来源' }),
        h('p.t-xs.mt-2', { text: `灵石 ${fmtInt(st.project.cost.stone)} · 资金 ¥${fmtInt(st.project.cost.cny)} · 可投资缺口 ¥${fmtInt(st.missing.cny)}` }),
        [...st.research, ...st.prerequisites].map(r => h('p.t-xs.mt-1', { text: `${r.done ? '✓' : '○'} ${r.name}` })),
        st.mats.map(m => h('p.t-xs.mt-1', { text: `${m.name} ${m.have}/${m.need} · ${m.source}` })),
        h('p.t-xs.t-dimmer.mt-2', { text: st.project.desc })),
      !st.done ? h('div.btn-row.mt-2', null,
        h('button.btn.btn-sm', { text: '查看筹备', onclick: () => projectModal(state, ctx, st.project.id) }),
        h('button.btn.btn-sm', { text: state.projects.target === st.project.id ? '取消追踪' : '追踪目标', onclick: () => { const r = setProjectTarget(state, state.projects.target === st.project.id ? null : st.project.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); } })) : null)));
}
function stockPanel(state, ctx) {
  const stock = shopStock(state);
  const goods = TRADE_ITEMS.filter(i => i.origin === 'cultivation');
  const check = result => { if (!result.ok) showToast(result.reason, 'warn'); ctx.rerender(); };
  return panel('店铺库存计划', stock.status,
    h('label.production-field', null, h('span.t-xs.t-dim', { text: '售货方式' }), h('select', { 'aria-label': '店铺售货方式', onchange: e => check(setShopPolicy(state, { mode: e.target.value })) },
      h('option', { value: 'surplus', selected: (state.estate.saleMode || 'surplus') === 'surplus', text: '保留一炉当前丹方备料，再售多余货物' }),
      h('option', { value: 'all', selected: state.estate.saleMode === 'all', text: '售出全部货物（仍保留指定库存）' }))),
    h('div.production-materials.mt-3', null, h('div.t-sm', { text: `可售 ${stock.qty} 件` }), h('div.t-sm', { text: `按当前行情整包预计净回款 ¥${fmtInt(stock.net)}` })),
    h('p.t-xs.t-dim.mt-2', { text: stock.capacity > 0 ? `当前总吞吐 ${stock.capacity.toFixed(2)} 件/时，处理现有可售库存约 ${stock.hours.toFixed(1)} 世界小时。自动售货需开启并留在现代界；实际回款随售出当天行情变化。` : '开设店铺后开始处理库存；当前报价只供筹备参考。' }),
    h('details.mt-3', null, h('summary.t-xs', { text: '指定货物保留数量' }), h('div.production-materials.mt-2', null,
      goods.map(item => reserveField(state.estate.keep?.[item.id] || 0, `保留${item.name}`, keepQty => setShopPolicy(state, { itemId: item.id, keepQty }))))),
    h('p.t-xs.t-dimmer.mt-2', { text: '保留量按同种货物的总数量计算，手动出货不受限制；炼丹备料会随当前丹方和辅材选择更新。材料与可服用丹药本来就不会被店铺卖出。' }));
}
function estateConfirmation(state, ctx, id) {
  const e = estateSummary(state).list.find(e => e.id === id);
  if (!e) return;
  ctx.modal({ title: '地产投资确认', subtitle: e.name, body: h('div', null,
    h('p.t-sm', { text: `投入 ¥${fmtInt(e.nextPrice)}，新增租金 ¥${e.actualRent.toFixed(2)}/时，约${e.paybackHours.toFixed(1)}世界小时回本。` }),
    h('p.t-xs.t-dim.mt-2', { text: `按当前世界与加成计算；投资后保留资金 ¥${fmtInt(state.modern.reserveCny || 0)}。` })),
    actions: [{ label: '返回比较' }, { label: '确认购入', primary: true, keepOpen: true, onClick: () => {
      const current = estateSummary(state).list.find(e => e.id === id);
      if (e.owned !== current.owned || e.actualRent !== current.actualRent) { ctx.closeOverlay(); estateConfirmation(state, ctx, id); return; }
      const result = buyEstate(state, id);
      if (!result.ok) { showToast(result.reason, 'warn'); return; }
      ctx.closeOverlay(); ctx.rerender();
    } }] });
}

export function renderEstate(state, ctx) {
  const s = estateSummary(state);

  const head = panel('地产', `租金 ¥${fmtInt(s.rentPerHour)} / 时`,
    h('p.t-sm.t-dim', { text: '地产带来稳定租金，店铺减少手动出货，仓库增加每次跨界的载重。回本时间按当前世界与角色、城市加成估算。' }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '合计租金' }), h('dd.t-num', { text: `¥${fmtInt(s.rentPerHour)} / 时` })),
      h('dl.kv', null, h('dt', { text: '店铺' }), h('dd.t-num', { text: `${s.shops} 间` })),
      h('dl.kv', null, h('dt', { text: '仓库' }), h('dd.t-num', { text: `Lv.${s.warehouseLevel}（跨界载重 +${s.carryBonus} kg）` })),
      h('dl.kv', null, h('dt', { text: '现有资金' }), h('dd.t-num', { text: `¥${fmtInt(state.currency.cny)}` })),
    ),
  );

  const list = panelFlush('可购地产', '每类持有上限不同',
    ...s.list.map((e) => h('div.rowitem', null,
      h('div.rowitem-main', null,
        h('div.rowitem-title', null,
          h('span.rowitem-name', { text: e.name }),
          h('span.tag', { text: `持有 ${e.owned} / ${e.maxOwn}` }),
        ),
        h('div.rowitem-meta', { text: `新增租金 ¥${e.actualRent.toFixed(1)} / 时 · 预计 ${e.paybackHours.toFixed(1)} 小时回本` }),
        h('div.t-xs.t-dim', { text: e.desc }),
      ),
      h('div.rowitem-act', null,
        h('div.rowitem-price', { text: `¥${fmtInt(e.nextPrice)}` }),
        h('button.btn.btn-sm.btn-solid', {
          text: '购入',
          disabled: !investmentAllowed(state, 'estate', e.id), liveDisabled: `investment:estate:${e.id}`,
          onclick: () => estateConfirmation(state, ctx, e.id),
        }),
      ),
    )),
  );

  const shops = panel('店铺', `${s.shops} 间`,
    h('p.t-sm.t-dim', { text: `你在现代界时，店铺会自动把背包里的修仙货按整批行情卖成人民币，渠道抽成 ${fmtPct(s.channelFee, 0)}。铁心兰知己时效率 +50%，同心时 +100%。` }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '当前店铺' }), h('dd.t-num', { text: `${s.shops} 间` })),
      h('dl.kv', null, h('dt', { text: '自动售货' }), h('dd.t-num', { text: s.autoSell ? '已开启' : '未开启' })),
      h('dl.kv', null, h('dt', { text: '每间吞吐' }), h('dd.t-num', { text: `${s.shopCapacity.toFixed(2)} 件 / 时（含加成）` })),
    ),
    h('p.investment-note.t-xs', { text: `下一间投入 ¥${fmtInt(s.shopPrice)}，吞吐增加 ${s.shopCapacity.toFixed(2)} 件 / 时。售货回款取决于货物与行情；售出已有库存不会创造额外利润，因此不承诺固定回本。离开现代界后自动售货暂停，租金按半速继续。` }),
    h('div.btn-row.mt-3', null,
      state.modern.businessLevel < s.shopUnlock
        ? h('button.btn', { text: `需商业等级 Lv.${s.shopUnlock}`, disabled: true })
        : h('button.btn.btn-solid', {
          text: s.shops === 0 ? '开第一间店' : `再开一间（¥${fmtInt(s.shopPrice)}）`,
          disabled: !investmentAllowed(state, 'shop'), liveDisabled: 'investment:shop',
          onclick: () => { const r = buyShop(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        }),
      h('button.btn', {
        class: s.autoSell ? 'btn-solid' : '',
        text: s.autoSell ? '停止自动售货' : '开启自动售货',
        disabled: s.shops === 0,
        onclick: () => { const r = toggleAutoSell(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
      }),
    ),
  );

  const warehouse = panel('仓库', `Lv.${s.warehouseLevel} / ${WAREHOUSE.maxLevel}`,
    h('p.t-sm.t-dim', { text: '扩货架。仓库每升一级，跨界时可携带的货物上限 +1 kg——配合界门晋阶与其他载重加成，增加每次可带的货物。' }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '当前载重加成' }), h('dd.t-num', { text: `+${s.carryBonus} kg` })),
      h('dl.kv', null, h('dt', { text: '下一级' }), h('dd.t-num', { text: `+${s.carryBonus + 1} kg` })),
      h('dl.kv', null, h('dt', { text: '升级成本' }), h('dd.t-num', { text: `¥${fmtInt(s.warehouseCost)}` })),
    ),
    h('div.mt-3', null,
      s.warehouseLevel >= WAREHOUSE.maxLevel
        ? h('button.btn', { text: '已满级', disabled: true })
        : h('button.btn.btn-solid', {
          text: '扩建仓库',
          disabled: !investmentAllowed(state, 'warehouse'), liveDisabled: 'investment:warehouse',
          onclick: () => { const r = upgradeWarehouse(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        }),
    ),
  );

  return h('div.flex-col.gap-4', null, head, growthPanel(state, ctx), list, shops, stockPanel(state, ctx), warehouse, projectPanel(state, ctx));
}
