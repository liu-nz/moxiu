/** 新手小额试单：按整批成交价格寻找可执行的当日双向路线。 */
import { TRADE_ITEMS } from '../data/items.js';
import { quoteBuy, quoteSell } from './market.js';
import { computeAttrs } from './character.js';
import { carryCapacity } from './rift.js';
import { carryWeight } from './inventory.js';

export function returnCargo(state, stoneBudget, capacity = carryCapacity(state)) {
  const attrs = computeAttrs(state);
  let best = null;
  for (const item of TRADE_ITEMS.filter(i => i.origin === 'cultivation' && !i.noBuy?.includes('cultivation') && !i.chamberOnly)) {
    const max = Math.min(30, Math.floor(capacity / item.weight));
    for (let qty = 1; qty <= max; qty++) {
      const cost = quoteBuy(state, 'cultivation', item.id, qty).total;
      if (cost > stoneBudget + 1e-8) break;
      const revenue = quoteSell(state, 'modern', item.id, qty, 'common', attrs).total;
      if (!best || revenue > best.revenue) best = { item, qty, cost, revenue };
    }
  }
  return best;
}
export function starterRoute(state) {
  if (state.tutorial.journey?.inboundSold) return null;
  const cap = Math.max(0, carryCapacity(state) - carryWeight(state));
  if (state.side === 'cultivation') {
    const inbound = returnCargo(state, state.currency.stone * .9, cap);
    return inbound ? { local: inbound, inbound, direction: 'return', profit: null } : null;
  }
  const budget = Math.min(1400, state.currency.cny * .65), attrs = computeAttrs(state);
  let best = null;
  for (const item of TRADE_ITEMS.filter(i => i.origin === 'modern' && !i.chamberOnly)) {
    for (let qty = 1; qty <= Math.min(12, Math.floor(cap / item.weight)); qty++) {
      const cost = quoteBuy(state, 'modern', item.id, qty).total;
      if (cost > budget + 1e-8) break;
      const revenue = quoteSell(state, 'cultivation', item.id, qty, 'common', attrs).total;
      const inbound = returnCargo(state, revenue * .9, cap);
      if (!inbound) continue;
      const profit = inbound.revenue - cost;
      if (!best || profit > best.profit) best = { local: { item, qty, cost, revenue }, inbound, profit, direction: 'outbound' };
    }
  }
  return best;
}
