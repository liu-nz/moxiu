/**
 * tradehouse.js —— 玩家交易行（GDD 15，NPC 模拟）
 *
 * 上架物品 → 选择收取的货币 → 定价 → 随时间被 NPC 天选者买走。
 * 核心价值：不必跨界也能换到另一侧货币；代价是参考价打折，且定价越高卖得越慢。
 */

import { TRADEHOUSE, LISTING_FEE } from '../data/tradehouse.js';
import { ITEM_MAP, currencyOf, CURRENCY_NAME } from '../data/items.js';
import { QUALITY_MAP } from '../data/dungeons.js';
import { sellPrice } from './market.js';
import { computeAttrs, sectMods } from './character.js';
import { lifestyleEffects } from './lifestyle.js';
import { inventoryRows, removeEntry, addItem } from './inventory.js';
import { countSold, earn } from './daily.js';
import { guildMods, chamberJoined } from './guild.js';
import { logGood, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { uid, fmtInt, clamp } from '../core/util.js';

function th(state) {
  if (!state.social) state.social = {};
  if (!state.social.tradehouse) {
    state.social.tradehouse = { listings: [], slots: TRADEHOUSE.baseSlots, totalSold: 0, earned: { stone: 0, cny: 0 } };
  }
  return state.social.tradehouse;
}

/**
 * 参考价：以「目标货币所在世界」的市场价为基础，再乘一个折扣。
 * 例如你想收人民币，参考价就按现代市场价算——但要比亲自带货过去便宜一点。
 */
export function referencePrice(state, itemId, currency, quality = 'common') {
  const world = currency === 'cny' ? 'modern' : 'cultivation';
  const attrs = computeAttrs(state);
  const base = sellPrice(state, world, itemId, quality, attrs);
  return base * TRADEHOUSE.refDiscount;
}

/** 成交速度加成：道盟 + 商会 + 宗门 + 称号 + 生活收藏 */
export function throughput(state) {
  const gm = guildMods(state);
  let mul = 1 + (gm.tradehouseSpeed || 0);
  if (chamberJoined(state)) mul += 0.20;
  const titles = state.social?.ranking?.titles || {};
  for (const t of Object.values(titles)) mul += (t.mods?.tradehouseSpeed || 0);
  mul += sectMods(state).tradehouseSpeed || 0;
  mul += lifestyleEffects(state).tradehouseSpeed || 0;
  return mul;
}

export function listingFeeRate(state) {
  const base = LISTING_FEE * (chamberJoined(state) ? 0.5 : 1);
  return base;
}

export function slotCost(state) {
  return TRADEHOUSE.slotCostOf(th(state).slots);
}

export function expandSlots(state) {
  const t = th(state);
  if (t.slots >= TRADEHOUSE.maxSlots) return { ok: false, reason: '摊位已扩到极限。' };
  const cost = slotCost(state);
  if (state.currency.stone < cost) return { ok: false, reason: `需要 ${fmtInt(cost)} 灵石。` };
  state.currency.stone -= cost;
  t.slots += 1;
  logGood(state, `交易行摊位扩充至 ${t.slots} 个。`);
  emit(EV.STATE);
  return { ok: true };
}

/** 上架 */
export function list(state, entryUid, qty, ratio, currency) {
  const t = th(state);
  if (t.listings.length >= t.slots) return { ok: false, reason: '摊位已满，先扩充或等货卖掉。' };

  const row = inventoryRows(state).find((r) => r.uid === entryUid);
  if (!row || !ITEM_MAP[row.itemId]) return { ok: false, reason: '这件东西不能上架。' };

  const n = Math.min(qty, row.qty);
  if (n <= 0) return { ok: false, reason: '数量不合法。' };

  const r = clamp(ratio, TRADEHOUSE.minRatio, TRADEHOUSE.maxRatio);
  const ref = referencePrice(state, row.itemId, currency, row.quality);
  const price = Math.max(1, Math.round(ref * r));

  const fee = Math.round(price * n * listingFeeRate(state));
  if (state.currency.stone < fee) return { ok: false, reason: `上架税费不足（需 ${fmtInt(fee)} 灵石）。` };

  removeEntry(state, entryUid, n);
  state.currency.stone -= fee;

  t.listings.push({
    uid: uid('ls'),
    itemId: row.itemId,
    qty: n,
    quality: row.quality,
    price,
    currency,
    ref,
    ratio: r,
    listedAt: state.world.clockMs,
    sold: 0,
    acc: 0,
  });

  logGood(state, `上架「${row.item.name}」×${n}，单价 ${fmtInt(price)} ${currency === 'cny' ? '¥' : '灵石'}。`);
  emit(EV.STATE);
  return { ok: true };
}

/** 撤单（按原样退回背包，税费不退） */
export function unlist(state, listingUid) {
  const t = th(state);
  const i = t.listings.findIndex((l) => l.uid === listingUid);
  if (i < 0) return { ok: false, reason: '没有这个挂单。' };
  const l = t.listings[i];
  const left = l.qty - l.sold;
  t.listings.splice(i, 1);
  if (left > 0) addItem(state, l.itemId, left, l.quality);
  emit(EV.STATE);
  return { ok: true, returned: left };
}

/** 主循环：结算成交 */
export function tickTradehouse(state, dtMs) {
  const t = state.social?.tradehouse;
  if (!t || !t.listings.length) return;
  const hours = dtMs / 3600000;
  if (hours <= 0) return;

  const speedMul = throughput(state);
  let changed = false;

  for (let i = t.listings.length - 1; i >= 0; i--) {
    const l = t.listings[i];
    const left = l.qty - l.sold;
    if (left <= 0) { t.listings.splice(i, 1); changed = true; continue; }

    const ratio = l.price / Math.max(1e-6, referencePrice(state, l.itemId, l.currency, l.quality));
    const rate = TRADEHOUSE.baseThroughput * TRADEHOUSE.speedFactor(ratio) * speedMul;
    l.acc = (l.acc || 0) + hours * rate;

    const canSell = Math.min(left, Math.floor(l.acc));
    if (canSell > 0) {
      l.acc -= canSell;
      l.sold += canSell;
      const revenue = l.price * canSell;
      state.currency[l.currency] += revenue;
      t.earned[l.currency] = (t.earned[l.currency] || 0) + revenue;
      t.totalSold += canSell;
      state.stats.profit = (state.stats.profit || 0) + revenue;
      countSold(state, canSell);
      earn(state, l.currency, revenue);
      if (l.currency === 'stone') state.stats.maxStone = Math.max(state.stats.maxStone || 0, state.currency.stone);
      else state.stats.maxCny = Math.max(state.stats.maxCny || 0, state.currency.cny);
      changed = true;
    }

    if (l.sold >= l.qty) {
      logGood(state, `交易行：${ITEM_MAP[l.itemId]?.name || l.itemId} ×${l.qty} 已售罄，入账 ${fmtInt(l.price * l.qty)} ${l.currency === 'cny' ? '¥' : '灵石'}。`);
      t.listings.splice(i, 1);
      changed = true;
    }
  }
  if (changed) emit(EV.STATE);
}

export function tradehouseSummary(state) {
  const t = th(state);
  const attrs = computeAttrs(state);
  return {
    slots: t.slots,
    maxSlots: TRADEHOUSE.maxSlots,
    slotCost: slotCost(state),
    listings: t.listings.map((l) => {
      const item = ITEM_MAP[l.itemId];
      const ref = referencePrice(state, l.itemId, l.currency, l.quality);
      const ratio = l.price / Math.max(1e-6, ref);
      const rate = TRADEHOUSE.baseThroughput * TRADEHOUSE.speedFactor(ratio) * throughput(state);
      return {
        ...l,
        item,
        qualityInfo: QUALITY_MAP[l.quality] || QUALITY_MAP.common,
        ref,
        refRatio: ratio,
        left: l.qty - l.sold,
        speed: rate,
        etaMs: rate > 0 ? ((l.qty - l.sold) / rate) * 3600000 : Infinity,
      };
    }),
    totalSold: t.totalSold,
    earned: t.earned,
    feeRate: listingFeeRate(state),
    speedMul: throughput(state),
    canList: t.listings.length < t.slots,
  };
}

/** 可上架的物品（背包里的贸易商品） */
export function listableItems(state) {
  return inventoryRows(state).filter((r) => ITEM_MAP[r.itemId]);
}

export { TRADEHOUSE, CURRENCY_NAME, currencyOf };
