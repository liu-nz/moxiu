/**
 * trade.js —— 跨界交易结算
 * 买入用当地货币，卖出收当地货币；两界货币互不相通，逼出双向带货。
 */

import { ITEM_MAP, currencyOf, CURRENCY_NAME, CONSUMABLE_MAP } from '../data/items.js';
import { buyPrice, sellPrice, consumablePrice } from './market.js';
import { addItem, removeEntry, inventoryRows } from './inventory.js';
import { computeAttrs } from './character.js';
import { logGood, logWarn, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';
import { updateTutorial } from './tutorial.js';
import { countSold, earn } from './daily.js';

export function buy(state, world, itemId, qty = 1) {
  const item = ITEM_MAP[itemId];
  if (!item) return { ok: false, reason: '没有这件商品。' };
  if (qty <= 0) return { ok: false, reason: '数量不合法。' };
  const attrs = computeAttrs(state);
  const unit = buyPrice(state, world, itemId, attrs);
  const cost = unit * qty;
  const cur = currencyOf(world);
  if (state.currency[cur] < cost) {
    return { ok: false, reason: `${CURRENCY_NAME[cur]}不足（需 ${fmtInt(cost)}）。` };
  }
  state.currency[cur] -= cost;
  addItem(state, itemId, qty, 'common');
  state.market.bought[world][itemId] = (state.market.bought[world][itemId] || 0) + qty;
  state.stats.tradeCount += 1;
  updateTutorial(state);
  emit(EV.STATE);
  return { ok: true, cost, unit, qty };
}

export function sell(state, world, entryUid, qty = 1) {
  const entry = state.inventory.find((e) => e.uid === entryUid);
  if (!entry) return { ok: false, reason: '背包里没有这一项。' };
  const item = ITEM_MAP[entry.itemId];
  if (!item) return { ok: false, reason: '这件东西卖不出去。' };
  const n = Math.min(qty, entry.qty);
  const attrs = computeAttrs(state);
  const unit = sellPrice(state, world, entry.itemId, entry.quality, attrs);
  const revenue = unit * n;
  const cur = currencyOf(world);

  removeEntry(state, entryUid, n);
  state.currency[cur] += revenue;
  state.market.sold[world][entry.itemId] = (state.market.sold[world][entry.itemId] || 0) + n;
  state.stats.tradeCount += 1;
  state.stats.profit += revenue;
  countSold(state, n);
  earn(state, cur, revenue);
  if (cur === 'stone') state.stats.maxStone = Math.max(state.stats.maxStone || 0, state.currency.stone);
  else state.stats.maxCny = Math.max(state.stats.maxCny || 0, state.currency.cny);

  updateTutorial(state);
  emit(EV.STATE);
  return { ok: true, revenue, unit, qty: n };
}

/** 一键卖出：只卖「非本地出产」的商品，避免把刚买的货又卖掉 */
export function sellAllForeign(state, world) {
  const rows = inventoryRows(state).filter((r) => ITEM_MAP[r.itemId] && ITEM_MAP[r.itemId].origin !== world);
  if (!rows.length) return { ok: false, reason: '没有可卖的跨界货物。' };
  let total = 0;
  let count = 0;
  for (const r of rows) {
    const res = sell(state, world, r.uid, r.qty);
    if (res.ok) { total += res.revenue; count += res.qty; }
  }
  const cur = currencyOf(world);
  logGood(state, `售出 ${count} 件跨界货物，得 ${fmtInt(total)} ${CURRENCY_NAME[cur]}。`);
  toast(`+${fmtInt(total)} ${CURRENCY_NAME[cur]}`, 'good');
  emit(EV.STATE);
  return { ok: true, total, count };
}

export function sellOne(state, world, entryUid, qty) {
  const res = sell(state, world, entryUid, qty);
  if (!res.ok) { toast(res.reason, 'warn'); return res; }
  const cur = currencyOf(world);
  logGood(state, `售出 ${res.qty} 件，得 ${fmtInt(res.revenue)} ${CURRENCY_NAME[cur]}。`);
  toast(`+${fmtInt(res.revenue)} ${CURRENCY_NAME[cur]}`, 'good');
  return res;
}

export function dropEntry(state, entryUid, qty = 1) {
  const n = removeEntry(state, entryUid, qty);
  if (n > 0) toast(`丢弃了 ${n} 件货物。`);
  emit(EV.STATE);
  return { ok: n > 0 };
}

/** 修仙界坊市：本地消耗品 */
export function buyConsumable(state, id) {
  const c = CONSUMABLE_MAP[id];
  if (!c) return { ok: false, reason: '坊市里没有这种丹药。' };
  const price = consumablePrice(state, id);
  if (state.currency.stone < price) return { ok: false, reason: `需要 ${fmtInt(price)} 灵石。` };
  state.currency.stone -= price;
  addItem(state, id, 1, 'common');
  logGood(state, `购得「${c.name}」，耗 ${fmtInt(price)} 灵石。`);
  emit(EV.STATE);
  return { ok: true, price };
}

export { buyPrice, sellPrice, consumablePrice };
