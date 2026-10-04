/**
 * trade.js —— 跨界交易结算
 * 买入用当地货币，卖出收当地货币；两界货币互不相通，逼出双向带货。
 */

import { ITEM_MAP, currencyOf, CURRENCY_NAME, CONSUMABLE_MAP } from '../data/items.js';
import { buyPrice, sellPrice, consumablePrice, quoteBuy, quoteSell, recordTrade, SIDES } from './market.js';
import { addItem, removeEntry, inventoryRows, validQuantity, carryWeight } from './inventory.js';
import { computeAttrs } from './character.js';
import { logGood, logWarn, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';
import { updateTutorial } from './tutorial.js';
import { countSold, earn } from './daily.js';
import { carryCapacity } from './rift.js';
import { chamberJoined } from './guild.js';

export function buy(state, world, itemId, qty = 1) {
  const item = ITEM_MAP[itemId];
  if (!item) return { ok: false, reason: '没有这件商品。' };
  if (!validQuantity(qty)) return { ok: false, reason: '数量须为正整数。' };
  if (!SIDES.includes(world) || world !== state.side || item.origin !== world) return { ok: false, reason: '只能在当前世界进本地货。' };
  if ((item.noBuy || []).includes(world)) return { ok: false, reason: '这种作物需要自己种植。' };
  if (item.chamberOnly && !chamberJoined(state)) return { ok: false, reason: '需要加入跨界商会。' };
  if (carryWeight(state) + item.weight * qty > carryCapacity(state) + 1e-8) return { ok: false, reason: '剩余跨界载重不足。' };
  const quote = quoteBuy(state, world, itemId, qty);
  const cost = quote.total, unit = quote.average;
  if (!Number.isFinite(cost) || cost <= 0) return { ok: false, reason: '报价无效。' };
  const cur = currencyOf(world);
  if (state.currency[cur] < cost) {
    return { ok: false, reason: `${CURRENCY_NAME[cur]}不足（需 ${fmtInt(cost)}）。` };
  }
  state.currency[cur] -= cost;
  addItem(state, itemId, qty, 'common');
  state.market.bought[world][itemId] = (state.market.bought[world][itemId] || 0) + qty;
  state.stats.tradeCount += 1;
  recordTrade(state, { type: 'buy', itemId, qty, currency: cur, amount: cost, channel: '市场' });
  updateTutorial(state);
  emit(EV.STATE);
  return { ok: true, cost, unit, qty };
}

export function sell(state, world, entryUid, qty = 1) {
  if (!validQuantity(qty)) return { ok: false, reason: '数量须为正整数。' };
  if (!SIDES.includes(world) || world !== state.side) return { ok: false, reason: '只能在当前世界出货。' };
  const entry = state.inventory.find((e) => e.uid === entryUid);
  if (!entry) return { ok: false, reason: '背包里没有这一项。' };
  const item = ITEM_MAP[entry.itemId];
  if (!item) return { ok: false, reason: '这件东西卖不出去。' };
  if (qty > entry.qty) return { ok: false, reason: '背包数量已变化，请重新报价。' };
  const n = qty;
  const attrs = computeAttrs(state);
  const quote = quoteSell(state, world, entry.itemId, n, entry.quality, attrs);
  const revenue = quote.total, unit = quote.average;
  if (!Number.isFinite(revenue) || revenue <= 0) return { ok: false, reason: '报价无效。' };
  const cur = currencyOf(world);

  removeEntry(state, entryUid, n);
  state.currency[cur] += revenue;
  state.market.sold[world][entry.itemId] = (state.market.sold[world][entry.itemId] || 0) + n;
  state.stats.tradeCount += 1;
  state.stats.profit += revenue;
  recordTrade(state, { type: 'sell', itemId: entry.itemId, qty: n, currency: cur, amount: revenue, channel: '市场' });
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
  if (!SIDES.includes(world) || world !== state.side) return { ok: false, reason: '只能在当前世界出货。' };
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
  if(CONSUMABLE_MAP[id]?.craftOnly)return {ok:false,reason:'此丹仅由炼制异变发现，坊市不出售。'};
  if (state.side !== 'cultivation') return { ok: false, reason: '丹药只能在修仙界坊市购买。' };
  const c = CONSUMABLE_MAP[id];
  if (!c) return { ok: false, reason: '坊市里没有这种丹药。' };
  const price = consumablePrice(state, id);
  if (state.currency.stone < price) return { ok: false, reason: `需要 ${fmtInt(price)} 灵石。` };
  state.currency.stone -= price;
  addItem(state, id, 1, 'common');
  recordTrade(state, {type:'buy',itemId:id,qty:1,amount:price,currency:'stone',channel:'丹药'});
  logGood(state, `购得「${c.name}」，耗 ${fmtInt(price)} 灵石。`);
  emit(EV.STATE);
  return { ok: true, price };
}

export { buyPrice, sellPrice, consumablePrice };
