/**
 * views/reincarnation.js —— 轮回与天命（GDD 16）
 */

import { h, panel, panelFlush, showToast } from '../dom.js';
import { BLESSINGS, FATES, CODEX } from '../../data/fates.js';
import { canAscend, ascensionPreview, blessingEffects, fateChoicePending, ASCENSION_RESET, ASCENSION_KEEP } from '../../systems/reincarnation.js';
import { reincarnation_buyBlessing as buyBlessing, reincarnation_chooseFate as chooseFate } from '../commands.js';
import { FLAT_STAGES, stageInfo } from '../../data/realms.js';
import { fmtInt, fmtPct } from '../../core/util.js';

export function renderReincarnation(state, ctx) {
  const r = state.reincarnation;
  const bl = blessingEffects(state);
  const ready = canAscend(state);
  const pending = fateChoicePending(state);
  const preview = ready ? ascensionPreview(state) : null;

  const head = panel('轮回', `第 ${r.count + 1} 世　·　轮回点 ${fmtInt(r.points)}`,
    h('p.t-sm.t-dim', { text: '渡劫飞升后进入轮回。轮回点、图鉴、永久天赋、道侣缘分与灵科研究不会随轮回消散——财富与修为会。' }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '当前境界' }), h('dd', { text: stageInfo(state.player.stage).stage.name })),
      h('dl.kv', null, h('dt', { text: '已历轮回' }), h('dd.t-num', { text: `${r.count} 次` })),
      h('dl.kv', null, h('dt', { text: '可用轮回点' }), h('dd.t-num', { text: fmtInt(r.points) })),
      h('dl.kv', null, h('dt', { text: '天命' }), h('dd', { text: r.fate ? FATES.find((f) => f.id === r.fate)?.name : '未定' })),
    ),
    h('hr.hr'),
    h('div', null,
      h('div.t-xs.t-dim.mb-2', { text: '永久天赋与本世天命合计' }),
      h('dl', { style: 'margin:0' },
        h('dl.kv', null, h('dt', { text: '修炼速度' }), h('dd.t-num', { text: fmtPct(bl.cultSpeed, 0) })),
        h('dl.kv', null, h('dt', { text: '攻击' }), h('dd.t-num', { text: fmtPct(bl.atkMul, 0) })),
        h('dl.kv', null, h('dt', { text: '气血' }), h('dd.t-num', { text: `+${fmtPct(bl.hpMul, 0)}` })),
        h('dl.kv', null, h('dt', { text: '贸易利润' }), h('dd.t-num', { text: `+${fmtPct(bl.tradeProfit, 0)}` })),
        h('dl.kv', null, h('dt', { text: '跨界载重' }), h('dd.t-num', { text: `+${bl.gateCarry} kg` })),
      ),
    ),
    h('details.mt-3', null, h('summary.t-sm', { text: '轮回保留与重置规则' }),
      h('p.t-xs.t-dim.mt-2', { text: `保留：${ASCENSION_KEEP}。` }),
      h('p.t-xs.t-dim.mt-2', { text: `重置：${ASCENSION_RESET}。` })),
    ready
      ? h('div.mt-4', null,
        h('h3', { text: '可以飞升了' }),
        h('p.t-xs.t-dim.mt-1', { text: '雷劫已渡过，确认结算后进入下一世。' }),
        h('div.mt-2', null, ...preview.parts.map((p) => h('div.flex-between', { style: 'padding:2px 0' },
          h('span.t-sm.t-dim', { text: p.label }),
          h('span.t-num.t-sm', { text: `+${p.value}` }),
        ))),
        h('div.flex-between.mt-2', { style: 'border-top:1px solid var(--line-ink);padding-top:6px' },
          h('span.t-sm.t-strong', { text: '本次可获得轮回点' }),
          h('span.t-num.t-strong', { text: fmtInt(preview.total) }),
        ),
        h('button.btn.btn-solid.btn-block.mt-3', { text: '飞升轮回', onclick: () => ctx.ascendModal() }),
      )
      : h('p.t-xs.t-dimmer.mt-4', { text: state.player.stage === FLAT_STAGES.length - 1 ? '已到渡劫大圆满：请在修炼页积满修为并渡过雷劫。' : `距离飞升还需抵达「${FLAT_STAGES[FLAT_STAGES.length - 1].stage.name}」。` }),
  );

  const blessings = panelFlush('永久天赋', `轮回点 ${fmtInt(r.points)}`,
    ...BLESSINGS.map((b) => {
      const lv = r.blessings[b.id] || 0;
      const cost = b.costOf(lv);
      const maxed = lv >= b.max;
      return h('div.rowitem', null,
        h('div.rowitem-main', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name', { text: b.name }),
            h('span.tag', { text: `Lv.${lv} / ${b.max}` }),
          ),
          h('div.rowitem-meta', { text: b.desc }),
        ),
        h('div.rowitem-act', null,
          h('div.rowitem-price', { text: maxed ? '满级' : `${cost} 点` }),
          h('button.btn.btn-sm.btn-solid', {
            text: '提升',
            disabled: maxed || r.points < cost,
            onclick: async () => { const res = await buyBlessing(state, b.id); if (!res.ok) showToast(res.reason, 'warn'); ctx.rerender(); },
          }),
        ),
      );
    }),
  );

  const fates = panelFlush('天命', r.fate ? `已定：${FATES.find((f) => f.id === r.fate)?.name}` : '尚未选择',
    h('div', { style: 'padding:12px 16px;border-bottom:1px solid var(--line)' },
      h('div.t-xs.t-dim', { text: '每次轮回选择一项天命，改变下一轮的玩法路线。天命本世生效，开局资源只领一次；下一世可重选。' }),
    ),
    ...FATES.map((f) => h('div.rowitem', null,
      h('div.rowitem-main', null,
        h('div.rowitem-title', null,
          h('span.rowitem-name.t-serif', { text: `${f.icon} · ${f.name}` }),
          r.fate === f.id ? h('span.tag.tag-ink', { text: '当前天命' }) : null,
        ),
        h('div.rowitem-meta', { text: f.effect }),
        h('div.t-xs.t-dimmer', { text: f.fit }),
      ),
      h('div.rowitem-act', null,
        h('button.btn.btn-sm', {
          class: r.fate === f.id ? '' : 'btn-solid',
          text: r.fate === f.id ? '本世已定' : pending ? '选此天命' : '轮回后可选',
          disabled: !pending,
          onclick: async () => { const res = await chooseFate(state, f.id); if (!res.ok) showToast(res.reason, 'warn'); ctx.rerender(); },
        }),
      ),
    )),
  );

  const codex = panelFlush('境界图鉴', `${Object.keys(r.codex || {}).length} / ${CODEX.length}`,
    ...CODEX.map((c) => h('div.rowitem', { style: 'padding:8px 16px' },
      h('div.rowitem-main', null,
        h('div.rowitem-title', null,
          h('span.rowitem-name.t-sm', { class: r.codex?.[c.id] ? '' : 't-dimmer', text: r.codex?.[c.id] ? c.name : '？？？' }),
        ),
        h('div.t-xs.t-dim', { text: r.codex?.[c.id] ? c.desc : '尚未抵达。' }),
      ),
      h('div.rowitem-act', null, r.codex?.[c.id] ? h('span.tag.tag-ink', { text: '已录' }) : null),
    )),
  );

  return h('div.flex-col.gap-4', null, head, blessings, fates, codex);
}
