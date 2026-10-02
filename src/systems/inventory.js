/**
 * inventory.js —— 背包与跨界载重
 *
 * 载重只统计「跨界贸易商品」（装备/功法不算重量），
 * 因此界门等级直接决定你一天能倒多少货。
 */

import { ITEM_MAP, CONSUMABLE_MAP, getItem } from '../data/items.js';
import { QUALITY_MAP } from '../data/dungeons.js';
import { uid } from '../core/util.js';

export function addItem(state, itemId, qty = 1, quality = 'common') {
  if (qty <= 0) return null;
  const isConsumable = !!CONSUMABLE_MAP[itemId];
  const q = isConsumable ? 'common' : quality;
  let entry = state.inventory.find((e) => e.itemId === itemId && e.quality === q);
  if (!entry) {
    entry = { uid: uid('it'), itemId, qty: 0, quality: q };
    state.inventory.push(entry);
  }
  entry.qty += qty;
  return entry;
}

export function removeItem(state, itemId, qty = 1, quality = null) {
  let left = qty;
  for (let i = state.inventory.length - 1; i >= 0 && left > 0; i--) {
    const e = state.inventory[i];
    if (e.itemId !== itemId) continue;
    if (quality && e.quality !== quality) continue;
    const take = Math.min(e.qty, left);
    e.qty -= take;
    left -= take;
    if (e.qty <= 0) state.inventory.splice(i, 1);
  }
  return qty - left;
}

export function countOf(state, itemId, quality = null) {
  return state.inventory
    .filter((e) => e.itemId === itemId && (!quality || e.quality === quality))
    .reduce((a, e) => a + e.qty, 0);
}

export function removeEntry(state, entryUid, qty = 1) {
  const idx = state.inventory.findIndex((e) => e.uid === entryUid);
  if (idx < 0) return 0;
  const e = state.inventory[idx];
  const take = Math.min(e.qty, qty);
  e.qty -= take;
  if (e.qty <= 0) state.inventory.splice(idx, 1);
  return take;
}

/** 当前背包的跨界载重（kg）——只算可贸易商品，材料与丹药不占界门载重 */
export function carryWeight(state) {
  let w = 0;
  for (const e of state.inventory) {
    const it = ITEM_MAP[e.itemId];
    if (it) w += it.weight * e.qty;
  }
  return Math.round(w * 100) / 100;
}

/** 背包全部物品重量（仅用于 UI 展示） */
export function totalWeight(state) {
  let w = 0;
  for (const e of state.inventory) {
    const it = getItem(e.itemId);
    if (it) w += it.weight * e.qty;
  }
  return Math.round(w * 100) / 100;
}

/** 背包明细（按商品聚合） */
export function inventoryRows(state) {
  return state.inventory
    .map((e) => {
      const it = getItem(e.itemId);
      if (!it) return null;
      return {
        ...e,
        item: it,
        weight: Math.round(it.weight * e.qty * 100) / 100,
        qualityInfo: QUALITY_MAP[e.quality] || QUALITY_MAP.common,
      };
    })
    .filter(Boolean);
}

export function inventoryValue(state, world, priceFn) {
  let total = 0;
  for (const e of state.inventory) {
    if (!ITEM_MAP[e.itemId]) continue;
    total += priceFn(state, world, e.itemId, e.quality) * e.qty;
  }
  return total;
}
