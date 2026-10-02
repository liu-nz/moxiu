/**
 * views/tradehouse.js —— 玩家交易行（GDD 15，NPC 模拟）
 */

import { h, panel, panelFlush, bar, showToast } from '../dom.js';
import { TRADEHOUSE } from '../../data/tradehouse.js';
import { QUALITY_MAP } from '../../data/dungeons.js';
import {
  tradehouseSummary, listableItems, list, unlist, expandSlots,
  referencePrice, throughput,
} from '../../systems/tradehouse.js';
import { fmtInt, fmtDuration, fmtPct } from '../../core/util.js';

/* UI 局部状态（不存档） */
let ui = { itemUid: null, ratio: 1.0, currency: 'stone', qty: 0 };

export function renderTradehouse(state, ctx) {
  const s = tradehouseSummary(state);
  const items = listableItems(state);

  if (!ui.itemUid && items.length) ui.itemUid = items[0].uid;
  const sel = items.find((r) => r.uid === ui.itemUid) || items[0] || null;
  if (sel && (!ui.qty || ui.qty > sel.qty)) ui.qty = sel.qty;

  const ref = sel ? referencePrice(state, sel.itemId, ui.currency, sel.quality) : 0;
  const unit = Math.round(ref * ui.ratio);
  const fee = Math.round(unit * (ui.qty || 0) * s.feeRate);
  const speed = sel
    ? TRADEHOUSE.baseThroughput * TRADEHOUSE.speedFactor(ui.ratio) * s.speedMul
    : 0;
  const etaMs = speed > 0 && ui.qty ? (ui.qty / speed) * 3600000 : Infinity;

  /* ---------- 上架表单 ---------- */
  const form = panel('上架', `成交速度 ×${s.speedMul.toFixed(2)}`,
    h('p.t-sm.t-dim', { text: '交易行的意义在于：不用跨界，也能把货换成另一侧的货币。代价是参考价打了 8.5 折，而且定价越高卖得越慢。' }),

    h('div.t-xs.t-dim.mt-3.mb-1', { text: '① 选择货物' }),
    items.length
      ? h('div', { style: 'display:flex;flex-wrap:wrap;gap:6px' },
        items.map((r) => h('button.btn.btn-sm', {
          class: ui.itemUid === r.uid ? 'btn-solid' : '',
          text: `${r.item.name} ×${r.qty}${r.quality !== 'common' ? `（${(QUALITY_MAP[r.quality] || {}).name}）` : ''}`,
          onclick: () => { ui.itemUid = r.uid; ui.qty = r.qty; ctx.rerender(); },
        })))
      : h('div.empty', { text: '背包里没有可上架的贸易商品。' }),

    sel ? h('div', null,
      h('div.t-xs.t-dim.mt-3.mb-1', { text: '② 数量与收款货币' }),
      h('div.btn-row', null,
        [1, Math.max(1, Math.floor(sel.qty / 2)), sel.qty].filter((v, i, a) => a.indexOf(v) === i).map((n) =>
          h('button.btn.btn-sm', {
            class: ui.qty === n ? 'btn-solid' : '',
            text: `×${n}`,
            onclick: () => { ui.qty = n; ctx.rerender(); },
          })),
        h('span', { style: 'width:12px' }),
        h('button.btn.btn-sm', {
          class: ui.currency === 'stone' ? 'btn-solid' : '',
          text: '收灵石',
          onclick: () => { ui.currency = 'stone'; ctx.rerender(); },
        }),
        h('button.btn.btn-sm', {
          class: ui.currency === 'cny' ? 'btn-solid' : '',
          text: '收人民币',
          onclick: () => { ui.currency = 'cny'; ctx.rerender(); },
        }),
      ),

      h('div.t-xs.t-dim.mt-3.mb-1', { text: '③ 定价' }),
      h('div.btn-row', null,
        TRADEHOUSE.presets.map((p) => h('button.btn.btn-sm', {
          class: Math.abs(ui.ratio - p.ratio) < 0.01 ? 'btn-solid' : '',
          text: p.label,
          title: p.hint,
          onclick: () => { ui.ratio = p.ratio; ctx.rerender(); },
        })),
      ),

      h('dl', { style: 'margin:10px 0 0' },
        h('dl.kv', null, h('dt', { text: '参考价（8.5 折后）' }), h('dd.t-num', { text: `${fmtInt(ref)} ${ui.currency === 'cny' ? '¥' : '灵石'}` })),
        h('dl.kv', null, h('dt', { text: '你的定价' }), h('dd.t-num.t-strong', { text: `${fmtInt(unit)} ${ui.currency === 'cny' ? '¥' : '灵石'}` })),
        h('dl.kv', null, h('dt', { text: '相对参考价' }), h('dd.t-num', { text: `×${ui.ratio.toFixed(2)}` })),
        h('dl.kv', null, h('dt', { text: '上架税费' }), h('dd.t-num', { text: `${fmtInt(fee)} 灵石（${fmtPct(s.feeRate, 1)}）` })),
        h('dl.kv', null, h('dt', { text: '预计成交速度' }), h('dd.t-num', { text: `${speed.toFixed(2)} 件 / 时` })),
        h('dl.kv', null, h('dt', { text: '预计清空' }), h('dd.t-num', { text: isFinite(etaMs) ? fmtDuration(etaMs) : '—' })),
      ),

      h('div.btn-row.mt-3', null,
        h('button.btn.btn-solid', {
          text: `上架 ${ui.qty} 件`,
          disabled: !s.canList || state.currency.stone < fee,
          onclick: () => {
            const r = list(state, ui.itemUid, ui.qty, ui.ratio, ui.currency);
            if (!r.ok) { showToast(r.reason, 'warn'); return; }
            ui.itemUid = null;
            ctx.rerender();
          },
        }),
        !s.canList ? h('span.t-xs.t-dim', { text: '摊位已满' }) : null,
      ),
    ) : null,
  );

  /* ---------- 挂单 ---------- */
  const listings = panelFlush('摊位', `${s.listings.length} / ${s.slots}`,
    s.listings.length
      ? s.listings.map((l) => h('div.rowitem', null,
        h('div.rowitem-main', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name', { text: l.item.name }),
            l.quality !== 'common' ? h('span.tag', { class: l.qualityInfo.cls, text: l.qualityInfo.name }) : null,
            h('span.tag', { text: `×${l.left} / ${l.qty}` }),
            h('span.tag', { class: l.refRatio <= 1 ? 'tag-outline-ink' : '', text: `×${l.refRatio.toFixed(2)} 参考价` }),
          ),
          h('div.rowitem-meta', { text: `单价 ${fmtInt(l.price)} ${l.currency === 'cny' ? '¥' : '灵石'}　·　${l.speed.toFixed(2)} 件/时　·　预计 ${fmtDuration(l.etaMs)} 清空` }),
          h('div.mt-2', null, bar(l.sold / l.qty)),
        ),
        h('div.rowitem-act', null,
          h('button.btn.btn-sm.btn-ghost', { text: '撤单', onclick: () => { unlist(state, l.uid); ctx.rerender(); } }),
        ),
      ))
      : h('div.empty', { text: '摊位上还没有东西。' }),
    h('div', { style: 'padding:12px 16px;border-top:1px solid var(--line)' },
      h('div.btn-row', null,
        s.slots < s.maxSlots
          ? h('button.btn.btn-sm', {
            text: `扩充摊位（${fmtInt(s.slotCost)} 灵石）`,
            disabled: state.currency.stone < s.slotCost,
            onclick: () => { const r = expandSlots(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
          })
          : h('span.t-xs.t-dim', { text: `摊位已扩到上限 ${s.maxSlots} 个` }),
      ),
      h('div.t-xs.t-dim.mt-2', {
        text: `累计售出 ${fmtInt(s.totalSold)} 件　·　累计收入 ${fmtInt(s.earned.stone)} 灵石 / ¥${fmtInt(s.earned.cny)}`,
      }),
    ),
  );

  return h('div.flex-col.gap-4', null, form, listings);
}

export function resetTradehouseUI() { ui = { itemUid: null, ratio: 1.0, currency: 'stone', qty: 0 }; }
