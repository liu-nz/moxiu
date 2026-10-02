/**
 * views/estate.js —— 现代地产 / 店铺 / 仓库（GDD 13.3）
 */

import { h, panel, panelFlush, showToast } from '../dom.js';
import { estateSummary, buyEstate, buyShop, upgradeWarehouse, toggleAutoSell } from '../../systems/estate.js';
import { WAREHOUSE } from '../../data/estate.js';
import { projectsSummary, start as startProject } from '../../systems/projects.js';
import { fmtInt, fmtKg, fmtPct } from '../../core/util.js';

function projectPanel(state, ctx) {
  const s = projectsSummary(state);
  return panelFlush('城市灵改工程', `${s.doneCount} / ${s.total} 已完工`,
    h('div', { style: 'padding:12px 16px;border-bottom:1px solid var(--line)' },
      h('div.t-xs.t-dim', { text: 'GDD 1.3 的后期幻想：把修仙的阵法与材料搬进现代都市。这些工程需要后期材料与巨额资源，是长线目标。' }),
    ),
    ...s.list.map((st) => h('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--line)' },
      h('div.flex-between', null,
        h('div', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name.t-serif', { text: `${st.project.accent} · ${st.project.name}` }),
            st.done ? h('span.tag.tag-ink', { text: '已完工' }) : h('span.tag', { text: `需 ${st.stageLabel}` }),
          ),
          h('div.t-xs.t-dim.mt-1', { text: st.project.desc }),
          h('div.t-xs.t-jade', { text: st.project.effectText }),
        ),
      ),
      h('div.mt-2', null,
        h('div.t-xs.t-dim', {
          text: `灵石 ${fmtInt(st.project.cost.stone)}　·　资金 ¥${fmtInt(st.project.cost.cny)}　·　`
            + st.mats.map((m) => `${m.name} ${m.have}/${m.need}`).join('　'),
        }),
      ),
      h('div.btn-row.mt-2', null,
        st.done
          ? h('span.t-xs.t-dim', { text: '✓ 已完工' })
          : h('button.btn.btn-sm', {
            class: st.canStart ? 'btn-solid' : '',
            text: '动工',
            disabled: !st.canStart,
            onclick: () => { const r = startProject(state, st.project.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
          }),
      ),
    )),
  );
}

export function renderEstate(state, ctx) {
  const s = estateSummary(state);

  const head = panel('地产', `租金 ¥${fmtInt(s.rentPerHour)} / 时`,
    h('p.t-sm.t-dim', { text: '公寓收租、店铺卖货、仓库扩货架。一期所有地产均可购买、无竞争；二期才会加入地皮限量与玩家竞拍。' }),
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
        h('div.rowitem-meta', { text: `租金 ¥${fmtInt(e.rent)} / 时 / 处` }),
        h('div.t-xs.t-dim', { text: e.desc }),
      ),
      h('div.rowitem-act', null,
        h('div.rowitem-price', { text: `¥${fmtInt(e.nextPrice)}` }),
        h('button.btn.btn-sm.btn-solid', {
          text: '购入',
          disabled: e.owned >= e.maxOwn || state.currency.cny < e.nextPrice,
          onclick: () => { const r = buyEstate(state, e.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        }),
      ),
    )),
  );

  const shops = panel('店铺', `${s.shops} 间`,
    h('p.t-sm.t-dim', { text: `店铺会自动把背包里的「外来货」按当日行情卖出，渠道抽成 ${fmtPct(s.channelFee, 0)}。铁心兰在岗时效率 +50%。` }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '当前店铺' }), h('dd.t-num', { text: `${s.shops} 间` })),
      h('dl.kv', null, h('dt', { text: '自动售货' }), h('dd.t-num', { text: s.autoSell ? '已开启' : '未开启' })),
      h('dl.kv', null, h('dt', { text: '每间吞吐' }), h('dd.t-num', { text: '1.2 件 / 时' })),
    ),
    h('div.btn-row.mt-3', null,
      state.modern.businessLevel < s.shopUnlock
        ? h('button.btn', { text: `需商业等级 Lv.${s.shopUnlock}`, disabled: true })
        : h('button.btn.btn-solid', {
          text: s.shops === 0 ? '开第一间店' : `再开一间（¥${fmtInt(s.shopPrice)}）`,
          disabled: s.shops >= 6 || state.currency.cny < s.shopPrice,
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
    h('p.t-sm.t-dim', { text: '扩货架。仓库每升一级，跨界时可携带的货物上限 +1 kg——这是唯一能突破界门载重的途径。' }),
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
          disabled: state.currency.cny < s.warehouseCost,
          onclick: () => { const r = upgradeWarehouse(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        }),
    ),
  );

  return h('div.flex-col.gap-4', null, head, list, shops, warehouse, projectPanel(state, ctx));
}
