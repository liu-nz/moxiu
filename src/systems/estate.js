/**
 * estate.js —— 现代地产 / 店铺 / 仓库（GDD 13.3）
 * 公寓收租、店铺自动售货、仓库扩货架（提升跨界载重）。
 */

import { ESTATES, ESTATE_MAP, SHOP, WAREHOUSE } from '../data/estate.js';
import { ITEM_MAP, currencyOf, CURRENCY_NAME } from '../data/items.js';
import { BUSINESS } from '../data/jobs.js';
import { projectEffects } from '../data/projects.js';
import { sideFactor, SIDE } from '../core/state.js';
import { quoteSell, quotePortfolio, recordTrade } from './market.js';
import { inventoryRows, countOf, removeEntry, validQuantity } from './inventory.js';
import { computeAttrs } from './character.js';
import { dutyMultiplier } from './companion.js';
import { countSold, earn } from './daily.js';
import { logGood, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';
import { investmentBudget } from './finance.js';
import { alchemyPlan } from './alchemy.js';

export function ownedCount(state, id) {
  return state.estate?.owned?.[id] || 0;
}

export function rentPerHour(state) {
  let total = 0;
  for (const e of ESTATES) total += ownedCount(state, e.id) * e.rent;
  const shopMul = 1 + (computeAttrs(state).shopTraffic || 0);
  const projectMul = 1 + (projectEffects(state).rentMul || 0);
  return total * shopMul * projectMul * sideFactor(state, SIDE.MODERN);
}

export function buyEstate(state, id) {
  const e = ESTATE_MAP[id];
  if (!e) return { ok: false, reason: '没有这处地产。' };
  const owned = ownedCount(state, id);
  if (owned >= e.maxOwn) return { ok: false, reason: '这类地产已达持有上限。' };
  const price = Math.round(e.price * Math.pow(1.12, owned));
  const budget = investmentBudget(state, price);
  if (!budget.ok) return budget;
  state.currency.cny -= price;
  state.estate.owned[id] = owned + 1;
  logGood(state, `购入「${e.name}」，租金 +¥${e.rent}/时。`);
  emit(EV.STATE);
  return { ok: true };
}

export function buyShop(state) {
  if (state.modern.businessLevel < SHOP.unlockBusinessLevel) {
    return { ok: false, reason: `需要商业等级 Lv.${SHOP.unlockBusinessLevel}。` };
  }
  const owned = state.estate.shops || 0;
  if (owned >= SHOP.maxOwn) return { ok: false, reason: '店铺数量已达上限。' };
  const price = SHOP.priceOf(owned);
  const budget = investmentBudget(state, price);
  if (!budget.ok) return budget;
  state.currency.cny -= price;
  state.estate.shops = owned + 1;
  logGood(state, `新开一间店铺，共 ${state.estate.shops} 间。`);
  emit(EV.STATE);
  return { ok: true };
}

export function upgradeWarehouse(state) {
  const lv = state.estate.warehouseLevel || 0;
  if (lv >= WAREHOUSE.maxLevel) return { ok: false, reason: '仓库已扩到极限。' };
  const cost = WAREHOUSE.costOf(lv);
  const budget = investmentBudget(state, cost);
  if (!budget.ok) return budget;
  state.currency.cny -= cost;
  state.estate.warehouseLevel = lv + 1;
  logGood(state, `仓库扩建至 Lv.${state.estate.warehouseLevel}，跨界载重 +1 kg。`);
  emit(EV.STATE);
  return { ok: true };
}

export function toggleAutoSell(state) {
  if (!state.estate.shops) return { ok: false, reason: '还没有店铺。' };
  state.estate.autoSell = !state.estate.autoSell;
  toast(state.estate.autoSell ? '店铺开始自动售货。' : '店铺已停止自动售货。');
  emit(EV.STATE);
  return { ok: true };
}

export function warehouseCarryBonus(state) {
  return WAREHOUSE.carryBonus(state.estate?.warehouseLevel || 0);
}

/** 主循环：租金 + 自动售货 */
export function tickEstate(state, dtMs) {
  const hours = dtMs / 3600000;
  const rent = rentPerHour(state) * hours;
  if (rent > 0) {
    state.currency.cny += rent;
    state.stats.passiveCny = (state.stats.passiveCny || 0) + rent;
    earn(state, 'cny', rent);
    state.stats.maxCny = Math.max(state.stats.maxCny || 0, state.currency.cny);
  }
  if (state.side === SIDE.MODERN && state.estate.autoSell && state.estate.shops > 0) {
    state.estate.sellAcc = (state.estate.sellAcc || 0) + hours;
    const projectBoost = 1 + (projectEffects(state).shopThroughput || 0);
    const capacity = SHOP.throughputPerHour * state.estate.shops
      * (1 + dutyMultiplier(state, 'tiexinlan') * 0.5) * projectBoost;
    const canSell = Math.floor(state.estate.sellAcc * capacity);
    if (canSell > 0) {
      state.estate.sellAcc -= canSell / capacity;
      autoSell(state, canSell);
    }
  }
}

/** 店铺自动售货：把背包里的外来货按当日价卖出（渠道抽成） */
export function autoSell(state, limit) {
  if (state.side !== SIDE.MODERN || !validQuantity(limit)) return { ok: false, sold: 0 };
  const world = SIDE.MODERN;
  const attrs = computeAttrs(state);
  const rows = shopStock(state).rows;
  if (!rows.length) return { ok: false, sold: 0 };
  const cur = currencyOf(world);
  let sold = 0;
  let revenue = 0;
  for (const r of rows) {
    if (sold >= limit) break;
    const n = Math.min(r.qty, limit - sold);
    const amount = quoteSell(state, world, r.itemId, n, r.quality, attrs).total * (1 - SHOP.channelFee);
    removeEntry(state, r.uid, n);
    state.currency[cur] += amount;
    state.market.sold[world][r.itemId] = (state.market.sold[world][r.itemId] || 0) + n;
    sold += n;
    revenue += amount;
    recordTrade(state, { type: 'sell', itemId: r.itemId, qty: n, currency: cur, amount, channel: '店铺' });
  }
  if (sold > 0) {
    state.stats.shopSold = (state.stats.shopSold || 0) + sold;
    state.stats.shopCny = (state.stats.shopCny || 0) + revenue;
    state.stats.tradeCount += 1;
    state.stats.profit += revenue;
    state.stats.maxCny = Math.max(state.stats.maxCny || 0, state.currency.cny);
    countSold(state, sold);
    earn(state, cur, revenue);
    emit(EV.STATE);
  }
  return { ok: sold > 0, sold, revenue };
}

export function shopCapacity(state) {
  return SHOP.throughputPerHour * (1 + dutyMultiplier(state, 'tiexinlan') * 0.5)
    * (1 + (projectEffects(state).shopThroughput || 0));
}

export function estateSummary(state) {
  const attrs = computeAttrs(state);
  const rentMul = (1 + (attrs.shopTraffic || 0)) * (1 + (projectEffects(state).rentMul || 0)) * sideFactor(state, SIDE.MODERN);
  return {
    shopCapacity: shopCapacity(state),
    list: ESTATES.map((e) => ({
      ...e,
      actualRent: e.rent * rentMul,
      paybackHours: Math.round(e.price * Math.pow(1.12, ownedCount(state, e.id))) / (e.rent * rentMul),
      owned: ownedCount(state, e.id),
      nextPrice: Math.round(e.price * Math.pow(1.12, ownedCount(state, e.id))),
    })),
    shops: state.estate.shops || 0,
    shopPrice: SHOP.priceOf(state.estate.shops || 0),
    autoSell: !!state.estate.autoSell,
    rentPerHour: rentPerHour(state),
    warehouseLevel: state.estate.warehouseLevel || 0,
    warehouseCost: WAREHOUSE.costOf(state.estate.warehouseLevel || 0),
    carryBonus: warehouseCarryBonus(state),
    channelFee: SHOP.channelFee,
    businessLevel: state.modern.businessLevel,
    shopUnlock: SHOP.unlockBusinessLevel,
  };
}

export { ESTATES, ESTATE_MAP, SHOP, WAREHOUSE, BUSINESS };

/** 只保留一炉目标丹药所需的贸易药草；指定库存保留量不区分品质。 */
export function shopReservations(state) {
  const keep = { ...(state.estate.keep || {}) };
  if ((state.estate.saleMode || 'surplus') === 'surplus') {
    const plan = alchemyPlan(state);
    for (const m of plan.mats || []) keep[m.id] = Math.max(keep[m.id] || 0, m.need);
  }
  return keep;
}
export function setShopPolicy(state, { mode, itemId, keepQty } = {}) {
  if (mode !== undefined && !['all', 'surplus'].includes(mode)) return { ok: false, reason: '请选择全部货物或保留炼丹备料。' };
  if (itemId !== undefined && (!ITEM_MAP[itemId] || ITEM_MAP[itemId].origin !== 'cultivation' || !Number.isSafeInteger(keepQty) || keepQty < 0)) return { ok: false, reason: '保留数量须为非负整数，且货物来自修仙界。' };
  if (mode !== undefined) state.estate.saleMode = mode;
  if (itemId !== undefined) (state.estate.keep ??= {})[itemId] = keepQty;
  emit(EV.STATE); return { ok: true };
}
export function shopStock(state) {
  const keep = shopReservations(state), used = {}, rows = [];
  for (const r of inventoryRows(state)) {
    if (!ITEM_MAP[r.itemId] || r.item.origin !== 'cultivation') continue;
    const available = Math.max(0, countOf(state, r.itemId) - (keep[r.itemId] || 0) - (used[r.itemId] || 0));
    const qty = Math.min(r.qty, available);
    if (qty > 0) { rows.push({ ...r, qty }); used[r.itemId] = (used[r.itemId] || 0) + qty; }
  }
  const quote = quotePortfolio(state, SIDE.MODERN, rows, computeAttrs(state));
  const capacity = shopCapacity(state) * (state.estate.shops || 0);
  return { rows, keep, qty: quote.qty, gross: quote.total, net: quote.total * (1 - SHOP.channelFee), capacity,
    hours: capacity > 0 ? quote.qty / capacity : Infinity,
    status: !state.estate.shops ? '尚无店铺' : !state.estate.autoSell ? '已暂停' : state.side !== SIDE.MODERN ? '异界暂停，返回现代后继续' : !quote.qty ? '等待可售库存' : '正在售货' };
}
export function nextShopEvent(state) {
  if (state.side !== SIDE.MODERN || !state.estate.autoSell || !state.estate.shops || !shopStock(state).qty) return Infinity;
  const capacity = shopCapacity(state) * state.estate.shops;
  return Math.max(1, (1 / capacity - (state.estate.sellAcc || 0)) * 3600000);
}
