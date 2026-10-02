/**
 * estate.js —— 现代地产 / 店铺 / 仓库（GDD 13.3）
 * 公寓收租、店铺自动售货、仓库扩货架（提升跨界载重）。
 */

import { ESTATES, ESTATE_MAP, SHOP, WAREHOUSE } from '../data/estate.js';
import { ITEM_MAP, currencyOf, CURRENCY_NAME } from '../data/items.js';
import { BUSINESS } from '../data/jobs.js';
import { projectEffects } from '../data/projects.js';
import { sideFactor, SIDE } from '../core/state.js';
import { sellPrice } from './market.js';
import { inventoryRows, removeEntry } from './inventory.js';
import { computeAttrs } from './character.js';
import { dutyMultiplier } from './companion.js';
import { countSold, earn } from './daily.js';
import { logGood, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';

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
  if (state.currency.cny < price) return { ok: false, reason: `需要 ¥${fmtInt(price)}。` };
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
  if (state.currency.cny < price) return { ok: false, reason: `需要 ¥${fmtInt(price)}。` };
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
  if (state.currency.cny < cost) return { ok: false, reason: `需要 ¥${fmtInt(cost)}。` };
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
    earn(state, 'cny', rent);
    state.stats.maxCny = Math.max(state.stats.maxCny || 0, state.currency.cny);
  }
  if (state.estate.autoSell && state.estate.shops > 0) {
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
  const world = state.side;
  const attrs = computeAttrs(state);
  const rows = inventoryRows(state).filter((r) => ITEM_MAP[r.itemId] && ITEM_MAP[r.itemId].origin !== world);
  if (!rows.length) return { ok: false, sold: 0 };
  const cur = currencyOf(world);
  let sold = 0;
  let revenue = 0;
  for (const r of rows) {
    if (sold >= limit) break;
    const n = Math.min(r.qty, limit - sold);
    const unit = sellPrice(state, world, r.itemId, r.quality, attrs) * (1 - SHOP.channelFee);
    removeEntry(state, r.uid, n);
    state.currency[cur] += unit * n;
    state.market.sold[world][r.itemId] = (state.market.sold[world][r.itemId] || 0) + n;
    sold += n;
    revenue += unit * n;
  }
  if (sold > 0) {
    state.stats.tradeCount += 1;
    state.stats.profit += revenue;
    countSold(state, sold);
    earn(state, cur, revenue);
    emit(EV.STATE);
  }
  return { ok: sold > 0, sold, revenue };
}

export function estateSummary(state) {
  const attrs = computeAttrs(state);
  return {
    list: ESTATES.map((e) => ({
      ...e,
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
