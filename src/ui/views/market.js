/**
 * views/market.js —— 跨界市场（GDD 4）
 * 在当前世界买入本地货 / 卖出外来货；两界货币互不相通。
 */

import { h, panel, panelFlush, bar, showToast } from '../dom.js';
import { TRADE_ITEMS, ITEM_MAP, CATEGORIES, CURRENCY_NAME, CONSUMABLES } from '../../data/items.js';
import { QUALITY_MAP } from '../../data/dungeons.js';
import { buyPrice, sellPrice, demandArrow, hotList, coldList } from '../../systems/market.js';
import { inventoryRows, carryWeight } from '../../systems/inventory.js';
import { carryCapacity, canCross, msToNextRift } from '../../systems/rift.js';
import { computeAttrs } from '../../systems/character.js';
import { buy, sellOne, sellAllForeign, buyConsumable, dropEntry } from '../../systems/trade.js';
import { getEvent } from '../../data/worldEvents.js';
import { chamberJoined } from '../../systems/guild.js';
import { SIDE, SIDE_NAME, otherSide } from '../../core/state.js';
import { fmtInt, fmtKg, fmtDuration, fmtPct } from '../../core/util.js';

function arrowEl(demand) {
  const a = demandArrow(demand);
  return h('span.t-num', { class: a.cls, text: a.sym, title: `${a.label}（需求系数 ${demand.toFixed(2)}）` });
}

function buyRow(state, ctx, item) {
  const attrs = computeAttrs(state);
  const world = state.side;
  const unit = buyPrice(state, world, item.id, attrs);
  const demand = state.market.demand[world]?.[item.id] ?? 1;
  const cur = world === 'modern' ? 'cny' : 'stone';
  const afford = Math.floor(state.currency[cur] / Math.max(unit, 0.0001));
  const byWeight = Math.floor(carryCapacity(state) / Math.max(item.weight, 0.0001));
  const maxN = Math.max(0, Math.min(afford, byWeight, 999));

  const doBuy = (n) => {
    const res = buy(state, world, item.id, n);
    if (!res.ok) { showToast(res.reason, 'warn'); return; }
    ctx.rerender();
  };

  return h('div.rowitem', null,
    h('div.rowitem-main', null,
      h('div.rowitem-title', null,
        h('span.rowitem-name', { text: item.name }),
        h('span.tag', { class: CATEGORIES[item.cat]?.cls, text: CATEGORIES[item.cat]?.name || '' }),
        arrowEl(demand),
      ),
      h('div.rowitem-meta', { text: item.desc }),
      h('div.t-xs.t-dimmer', { text: `${item.weight} kg/件　·　可购 ${maxN} 件（受资金与载重限制）` }),
    ),
    h('div.rowitem-act', null,
      h('div.rowitem-price', null,
        h('div', { text: `${fmtInt(unit)} ${cur === 'cny' ? '¥' : '灵石'}` }),
        h('div.t-xs.t-dimmer', { text: '单价' }),
      ),
      h('button.btn.btn-sm', { text: '×1', disabled: maxN < 1, onclick: () => doBuy(1) }),
      h('button.btn.btn-sm', { text: '×10', disabled: maxN < 1, onclick: () => doBuy(Math.min(10, maxN)) }),
      h('button.btn.btn-sm.btn-solid', { text: '满', disabled: maxN < 1, onclick: () => doBuy(maxN) }),
    ),
  );
}

function sellRow(state, ctx, row) {
  const world = state.side;
  const attrs = computeAttrs(state);
  const unit = sellPrice(state, world, row.itemId, row.quality, attrs);
  const cur = world === 'modern' ? 'cny' : 'stone';
  const q = QUALITY_MAP[row.quality] || QUALITY_MAP.common;

  return h('div.rowitem', null,
    h('div.rowitem-main', null,
      h('div.rowitem-title', null,
        h('span.rowitem-name', { text: row.item.name }),
        row.quality !== 'common' ? h('span.tag', { class: q.cls, text: q.name }) : null,
        h('span.tag', { text: `×${row.qty}` }),
      ),
      h('div.rowitem-meta', { text: `${row.weight} kg　·　${row.item.origin === 'cultivation' ? '修仙界货' : '现代货'}` }),
    ),
    h('div.rowitem-act', null,
      h('div.rowitem-price', null,
        h('div', { text: `${fmtInt(unit)} ${cur === 'cny' ? '¥' : '灵石'}` }),
        h('div.t-xs.t-dimmer', { text: '单价' }),
      ),
      h('button.btn.btn-sm', { text: '卖 1', onclick: () => { sellOne(state, world, row.uid, 1); ctx.rerender(); } }),
      h('button.btn.btn-sm.btn-solid', { text: `全卖 +${fmtInt(unit * row.qty)}`, onclick: () => { sellOne(state, world, row.uid, row.qty); ctx.rerender(); } }),
      h('button.btn.btn-sm.btn-ghost', { text: '丢', title: '丢弃（无收益）', onclick: () => { dropEntry(state, row.uid, row.qty); ctx.rerender(); } }),
    ),
  );
}

export function renderMarket(state, ctx) {
  const world = state.side;
  const other = otherSide(world);
  const attrs = computeAttrs(state);
  const weight = carryWeight(state);
  const cap = carryCapacity(state);
  const curName = CURRENCY_NAME[world === 'modern' ? 'cny' : 'stone'];
  const ev = getEvent(state.market.eventId);

  const chamberOk = chamberJoined(state);
  const locals = TRADE_ITEMS.filter((i) => i.origin === world
    && !(i.noBuy || []).includes(world)
    && (!i.chamberOnly || chamberOk));
  const chamberLocked = TRADE_ITEMS.filter((i) => i.chamberOnly && !chamberOk && i.origin === world);
  const rows = inventoryRows(state).filter((r) => ITEM_MAP[r.itemId]);
  const foreign = rows.filter((r) => ITEM_MAP[r.itemId].origin !== world);

  const hot = hotList(state, world, 3);
  const cold = coldList(state, world, 2);

  const farmOnly = TRADE_ITEMS.filter((i) => i.origin === world && (i.noBuy || []).includes(world));

  /* ---- 头部状态 ---- */
  const head = panel(null, null,
    h('div.flex-between', null,
      h('div', null,
        h('h2.t-serif', { text: `${SIDE_NAME[world]} · 市场` }),
        h('div.t-xs.t-dim', { text: world === 'modern'
          ? '在里世界用人民币进货；把修仙界的货卖成人民币。'
          : '在表世界用灵石进货；把现代货卖成灵石。' }),
      ),
      h('div.t-right', null,
        h('div.t-xs.t-dim', { text: '界潮刷新' }),
        h('div.t-num', { live: 'riftCountdown' }),
      ),
    ),
    h('div.mt-3', null,
      bar(Math.min(1, cap > 0 ? weight / cap : 0), { thick: true, liveBar: 'weightBar' }),
      h('div.bar-cap', null,
        h('span', null, h('span.t-num', { live: 'weightText' })),
        h('span', { text: `界门 Lv.${state.rift.gateLevel} · 载重 ${cap} kg` }),
      ),
    ),
    h('div.mt-3.flex.gap-4', null,
      h('div.t-sm', null, h('span.t-dim', { text: '今日高位：' }),
        ...hot.map((x, i) => h('span', null,
          i ? h('span.t-dimmer', { text: ' · ' }) : null,
          h('span', { text: x.item.name }),
          arrowEl(x.demand),
        ))),
      h('div.t-sm', null, h('span.t-dim', { text: '今日低位：' }),
        ...cold.map((x, i) => h('span', null,
          i ? h('span.t-dimmer', { text: ' · ' }) : null,
          h('span', { text: x.item.name }),
          arrowEl(x.demand),
        ))),
    ),
    ev.id !== 'calm' ? h('p.t-sm.mt-3', null,
      h('span.tag.tag-ink', { text: '世界事件' }),
      h('span', { text: ` ${ev.name}：${ev.desc}` }),
    ) : null,
  );

  /* ---- 买入 ---- */
  const buyPanel = panelFlush(`进货 · ${SIDE_NAME[world]}本地货`, `持有 ${fmtInt(state.currency[world === 'modern' ? 'cny' : 'stone'])} ${curName}`,
    ...locals.map((i) => buyRow(state, ctx, i)),
  );

  /* ---- 卖出 ---- */
  const sellPanel = panelFlush(`出货 · 卖到${SIDE_NAME[world]}`, foreign.length ? h('button.btn.btn-sm.btn-solid', {
    text: '一键全卖',
    onclick: () => { sellAllForeign(state, world); ctx.rerender(); },
  }) : null,
    foreign.length
      ? foreign.map((r) => sellRow(state, ctx, r))
      : h('div.empty', { text: `背包里没有可卖的跨界货物。回到${SIDE_NAME[other]}进点货吧。` }),
  );

  /* ---- 坊市（修仙界本地消耗品） ---- */
  const shopPanel = world === SIDE.CULTIVATION
    ? panelFlush('坊市 · 丹药', `灵石 ${fmtInt(state.currency.stone)}`,
      ...CONSUMABLES.map((c) => h('div.rowitem', null,
        h('div.rowitem-main', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name', { text: c.name }),
            h('span.tag', { class: 'q-rare', text: '丹药' }),
            h('span.tag', { text: `库存 ${state.inventory.filter((e) => e.itemId === c.id).reduce((a, e) => a + e.qty, 0)}` }),
          ),
          h('div.rowitem-meta', { text: c.desc }),
        ),
        h('div.rowitem-act', null,
          h('div.rowitem-price', { text: `${fmtInt(c.price.cultivation)} 灵石` }),
          h('button.btn.btn-sm', {
            text: '购买',
            disabled: state.currency.stone < c.price.cultivation,
            onclick: () => { const r = buyConsumable(state, c.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
          }),
        ),
      )),
    )
    : null;

  return h('div.flex-col.gap-4', null, head, buyPanel,
    farmOnly.length
      ? h('p.t-xs.t-dim', { style: 'margin:-8px 0 0' ,
          text: `注：${farmOnly.map((i) => i.name).join('、')} 属于灵田作物，只能自己种，坊市里买不到。` })
      : null,
    chamberLocked.length
      ? h('p.t-xs.t-dim', { style: 'margin:-8px 0 0' ,
          text: `商会专属货：${chamberLocked.map((i) => i.name).join('、')}。加入跨界商会后可交易。` })
      : null,
    sellPanel, shopPanel);
}
