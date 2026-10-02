/**
 * views/lifestyle.js —— 现代休闲生活（GDD 1.2 里世界职责）
 */

import { h, panel, panelFlush, bar, showToast } from '../dom.js';
import { lifestyleSummary, upgrade, upgradeAll } from '../../systems/lifestyle.js';
import { fmtInt, fmtPct } from '../../core/util.js';

export function renderLifestyle(state, ctx) {
  const s = lifestyleSummary(state);
  const qualityPct = s.quality * 100;

  const head = panel('生活', `品质 ${qualityPct.toFixed(0)} / 100`,
    h('p.t-sm.t-dim', { text: '里世界负责的不只是赚钱。你在修仙界省吃俭用攒灵石，回到现代却可以决定自己住哪儿、吃什么——这是两个世界最直观的对比。' }),
    h('div.mt-3', null,
      bar(s.quality),
      h('div.bar-cap', null,
        h('span', { text: `生活品质 ${qualityPct.toFixed(0)} / 100（${s.totalLevels} / ${s.maxLevels} 级）` }),
        h('span', { text: `道侣好感 +${fmtPct(s.giftBonus, 0)}` }),
      ),
    ),
    h('dl', { style: 'margin:12px 0 0' },
      h('dl.kv', null, h('dt', { text: '离线收益加成' }), h('dd.t-num', { text: `+${fmtPct(s.effects.offlineBonus, 0)}` })),
      h('dl.kv', null, h('dt', { text: '体力恢复加成' }), h('dd.t-num', { text: `+${fmtPct(s.effects.staminaRegen, 0)}` })),
      h('dl.kv', null, h('dt', { text: '气血加成' }), h('dd.t-num', { text: `+${fmtPct(s.effects.hpMul, 0)}` })),
      h('dl.kv', null, h('dt', { text: '突破损失减免' }), h('dd.t-num', { text: `-${fmtPct(s.effects.breakthroughLossCut, 0)}` })),
      h('dl.kv', null, h('dt', { text: '奇闻触发加成' }), h('dd.t-num', { text: `+${fmtPct(s.effects.taleRate, 0)}` })),
      h('dl.kv', null, h('dt', { text: '交易行速度加成' }), h('dd.t-num', { text: `+${fmtPct(s.effects.tradehouseSpeed, 0)}` })),
    ),
    h('div.mt-3', null, h('span.t-xs.t-dim', { text: `现有资金 ¥${fmtInt(state.currency.cny)}` })),
  );

  const list = panelFlush('生活项目', `${s.list.length} 项`,
    ...s.list.map((x) => h('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--line)' },
      h('div.flex-between', null,
        h('div', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name.t-serif', { text: `${x.item.accent} · ${x.item.name}` }),
            h('span.tag', { text: `Lv.${x.level} / ${x.item.maxLevel}` }),
            x.level > 0 ? h('span.tag.tag-outline-ink', { text: x.currentName }) : null,
          ),
          h('div.t-xs.t-dim.mt-1', { text: x.item.desc }),
          h('div.t-xs.t-jade', { text: x.item.effectText }),
          x.nextName ? h('div.t-xs.t-dimmer.mt-1', { text: `下一级：${x.nextName}` }) : null,
        ),
        h('div.rowitem-act', null,
          x.maxed
            ? h('span.t-xs.t-dim', { text: '已到顶' })
            : h('div', null,
              h('div.rowitem-price', { text: `¥${fmtInt(x.cost)}` }),
              h('div.btn-row.mt-1', null,
                h('button.btn.btn-sm.btn-solid', {
                  text: '升级',
                  disabled: state.currency.cny < x.cost,
                  onclick: () => { const r = upgrade(state, x.item.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
                }),
                h('button.btn.btn-sm', {
                  text: '连升',
                  disabled: state.currency.cny < x.cost,
                  onclick: () => { upgradeAll(state, x.item.id); ctx.rerender(); },
                }),
              ),
            ),
        ),
      ),
      h('div.mt-2', null, bar(x.level / x.item.maxLevel)),
    )),
  );

  return h('div.flex-col.gap-4', null, head, list);
}
