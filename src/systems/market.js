/**
 * market.js —— 跨界市场与经济系统（GDD 4）
 *
 * 实际价格 = 基础价格 × 市场需求系数 × 市场饱和度 × 品质系数 × 事件系数
 */

import { TRADE_ITEMS, ITEM_MAP, CONSUMABLES, CONSUMABLE_MAP, currencyOf, CURRENCY_NAME } from '../data/items.js';
import { QUALITY_MAP } from '../data/dungeons.js';
import { getEvent, WORLD_EVENTS } from '../data/worldEvents.js';
import { BUSINESS } from '../data/jobs.js';
import { seededRand, weightedPick, clamp } from '../core/util.js';
import { riftDayIndex } from '../core/clock.js';

export const SIDES = ['cultivation', 'modern'];

/** 需求系数 → 行情箭头（GDD 4.2 的 灵植↑↑ / 古代法器↑ / 丹药↓） */
export function demandArrow(d) {
  if (d <= 0.70) return { sym: '↓↓', cls: 't-fall', label: '暴跌' };
  if (d < 0.95)  return { sym: '↓',  cls: 't-fall', label: '下跌' };
  if (d <= 1.20) return { sym: '—',  cls: 't-dim',  label: '平稳' };
  if (d <= 1.60) return { sym: '↑',  cls: 't-rise', label: '上涨' };
  return { sym: '↑↑', cls: 't-rise', label: '暴涨' };
}

/** 每日刷新：行情、需求、世界事件（GDD 3.1 / 4.2 / 14.2） */
export function refreshDay(state, dayIndex) {
  const day = dayIndex ?? riftDayIndex(state.world.clockMs);
  const rnd = seededRand('moxiu-day-' + day);

  state.market.day = day;

  // 世界事件
  const entries = WORLD_EVENTS.map((e) => [e.id, e.weight]);
  state.market.eventId = weightedPickWith(rnd, entries);

  for (const world of SIDES) {
    state.market.demand[world] = {};
    state.market.sold[world] = {};
    state.market.bought[world] = {};
    for (const item of TRADE_ITEMS) {
      const r = rnd();
      // 需求系数范围 0.5 ~ 2.0（GDD 4.1）
      const d = 0.5 + r * 1.5;
      state.market.demand[world][item.id] = Math.round(d * 100) / 100;
    }
  }
  return state.market;
}

function weightedPickWith(rnd, entries) {
  const total = entries.reduce((a, e) => a + e[1], 0);
  let r = rnd() * total;
  for (const [v, w] of entries) { r -= w; if (r <= 0) return v; }
  return entries[entries.length - 1][0];
}

/** 事件系数（GDD 4.1） */
export function eventPriceMult(state, world, item) {
  const ev = getEvent(state.market.eventId);
  let m = 1;
  if (ev.price && ev.price[item.cat]) m *= ev.price[item.cat];
  const bw = ev.priceByWorld && ev.priceByWorld[world];
  if (bw && bw[item.cat]) m *= bw[item.cat];
  return m;
}

/** 饱和度系数：max(0.35, 1 ÷ (1 + 当日销售量 ÷ 市场容量)) —— GDD 4.1 / 4.3 */
export function saturation(state, world, itemId) {
  const item = ITEM_MAP[itemId];
  if (!item) return 1;
  const sold = state.market.sold[world]?.[itemId] || 0;
  const cap = item.capacity[world] || 1;
  return Math.max(0.35, 1 / (1 + sold / cap));
}

/** 在 world 世界卖出 itemId 的单价（world 的货币） */
export function sellPrice(state, world, itemId, quality = 'common', attrs = null) {
  const item = ITEM_MAP[itemId];
  if (!item) return 0;
  const base = item.price[world];
  const demand = state.market.demand[world]?.[itemId] ?? 1;
  const sat = saturation(state, world, itemId);
  const q = QUALITY_MAP[quality]?.mult ?? 1;
  const ev = eventPriceMult(state, world, item);
  const tradeProfit = 1 + (attrs?.tradeProfit || 0);
  const raw = base * demand * sat * q * ev * tradeProfit;
  // 本地回收不奖励跨界加成，且低于无供货涨价的进货价，防止原地刷钱。
  if (item.origin !== world) return raw;
  const discount = world === 'modern' ? BUSINESS.buyDiscount(state.modern.businessLevel) : 0;
  return Math.min(raw, base * demand * ev * (1 - discount) * 0.8 * q * sat);
}

/** 在 world 世界买入 itemId 的单价（world 的货币） */
export function buyPrice(state, world, itemId, attrs = null) {
  const item = ITEM_MAP[itemId];
  if (!item) return 0;
  const base = item.price[world];
  const demand = state.market.demand[world]?.[itemId] ?? 1;
  const bought = state.market.bought[world]?.[itemId] || 0;
  const cap = item.capacity[world] || 1;
  const supply = 1 + (bought / cap) * 0.5;
  const ev = eventPriceMult(state, world, item);
  const discount = world === 'modern'
    ? BUSINESS.buyDiscount(state.modern.businessLevel)
    : 0;
  return base * demand * supply * ev * (1 - discount);
}

/** 本地商店（消耗品）价格 */
export function consumablePrice(state, id) {
  const c = CONSUMABLE_MAP[id];
  if (!c) return Infinity;
  return c.price.cultivation;
}

/** 该世界今日的行情榜（按需求系数排序） */
export function hotList(state, world, n = 3) {
  const arr = TRADE_ITEMS
    .filter((i) => i.price[world] > 0)
    .map((i) => ({ item: i, demand: state.market.demand[world]?.[i.id] ?? 1 }))
    .sort((a, b) => b.demand - a.demand);
  return arr.slice(0, n);
}

export function coldList(state, world, n = 2) {
  const arr = TRADE_ITEMS
    .filter((i) => i.price[world] > 0)
    .map((i) => ({ item: i, demand: state.market.demand[world]?.[i.id] ?? 1 }))
    .sort((a, b) => a.demand - b.demand);
  return arr.slice(0, n);
}

export { currencyOf, CURRENCY_NAME };


/** 整批进货：第 j 件按已有进货量 + j 计算供货涨价。 */
export function quoteBuy(state, world, itemId, qty) {
  const item = ITEM_MAP[itemId];
  if (!SIDES.includes(world) || !item || !Number.isSafeInteger(qty) || qty <= 0) return null;
  const bought = state.market.bought[world]?.[itemId] || 0;
  const cap = item.capacity[world] || 1;
  const first = buyPrice(state, world, itemId);
  const baseline = first / (1 + bought / cap * 0.5);
  const total = first * qty + baseline * 0.5 / cap * qty * (qty - 1) / 2;
  return { qty, total, first, last: first + baseline * 0.5 / cap * (qty - 1), average: total / qty };
}

/** 整批出货：逐件计算饱和度；达到价格底线后的尾段直接求和。 */
export function quoteSell(state, world, itemId, qty, quality = 'common', attrs = null, offset = 0) {
  const item = ITEM_MAP[itemId];
  if (!SIDES.includes(world) || !item || !Number.isSafeInteger(qty) || qty <= 0 || !Number.isSafeInteger(offset) || offset < 0) return null;
  const sold = (state.market.sold[world]?.[itemId] || 0) + offset;
  const cap = item.capacity[world] || 1;
  const baseline = sellPrice(state, world, itemId, quality, attrs) / saturation(state, world, itemId);
  const factor = (n) => Math.max(0.35, 1 / (1 + n / cap));
  const changing = Math.min(qty, Math.max(0, Math.ceil(cap * (1 / 0.35 - 1) - sold)));
  let total = 0;
  for (let j = 0; j < changing; j++) total += baseline * factor(sold + j);
  total += baseline * 0.35 * (qty - changing);
  return { qty, total, first: baseline * factor(sold), last: baseline * factor(sold + qty - 1), average: total / qty };
}

/** 不同品质的同一商品共享当日销量，顺序与实际整包出货一致。 */
export function quotePortfolio(state, world, entries, attrs = null) {
  const offsets = {};
  let total = 0, qty = 0;
  const lines = [];
  for (const e of entries) {
    const quote = quoteSell(state, world, e.itemId, e.qty, e.quality, attrs, offsets[e.itemId] || 0);
    if (!quote) continue;
    offsets[e.itemId] = (offsets[e.itemId] || 0) + e.qty;
    total += quote.total; qty += e.qty;
    lines.push({ uid: e.uid, itemId: e.itemId, ...quote });
  }
  return { total, qty, lines };
}

/** 用整批价格求可负担数量，避免按钮显示能买却余额不足。 */
export function affordableQuantity(state, world, itemId, limit) {
  let lo = 0, hi = Math.max(0, Math.min(999, Math.floor(limit)));
  const money = state.currency[currencyOf(world)];
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    const q = quoteBuy(state, world, itemId, mid);
    if (q && q.total <= money) lo = mid; else hi = mid - 1;
  }
  return lo;
}

/** 只保留最近 40 笔，金额始终以该笔货币记录。 */
export function recordTrade(state, record) {
  if (!state.market.history) state.market.history = [];
  state.market.history.unshift({ at: state.world.clockMs, day: state.market.day, ...record });
  state.market.history.length = Math.min(40, state.market.history.length);
}
