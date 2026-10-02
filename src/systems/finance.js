/** 经营投资共用资金保留线；采购和其他手动消费不受此线约束。 */
import { jobUpgradeCost, BUSINESS } from '../data/jobs.js';
import { ESTATE_MAP, SHOP, WAREHOUSE } from '../data/estate.js';
import { RESEARCH_LAB } from '../data/research.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';
export function investmentBudget(state, cost) {
  const reserve = state.modern.reserveCny || 0;
  const available = Math.max(0, state.currency.cny - reserve);
  if (!Number.isFinite(cost) || cost < 0) return { ok: false, reason: '投资成本不可用。', available, reserve };
  return { ok: state.currency.cny >= cost && state.currency.cny - cost >= reserve, available, reserve,
    reason: state.currency.cny < cost ? `资金不足（需 ¥${fmtInt(cost)}）。` : state.currency.cny - cost < reserve ? `投资后需保留 ¥${fmtInt(reserve)}，当前可投资 ¥${fmtInt(available)}。` : '' };
}
export function setInvestmentReserve(state, value) {
  if (!Number.isSafeInteger(value) || value < 0) return { ok: false, reason: '保留资金须为非负整数。' };
  state.modern.reserveCny = value;
  emit(EV.STATE);
  return { ok: true };
}

export function investmentAllowed(state, kind, id) {
  let cost;
  if (kind === 'job') { if (!state.modern.job) return false; cost = jobUpgradeCost(state.modern.job, state.modern.jobLevel); }
  else if (kind === 'business') { if (state.modern.businessLevel >= BUSINESS.maxLevel) return false; cost = BUSINESS.costOf(state.modern.businessLevel); }
  else if (kind === 'estate') { const e = ESTATE_MAP[id]; if (!e || (state.estate.owned[id] || 0) >= e.maxOwn) return false; cost = Math.round(e.price * 1.12 ** (state.estate.owned[id] || 0)); }
  else if (kind === 'shop') { if (state.modern.businessLevel < SHOP.unlockBusinessLevel || state.estate.shops >= SHOP.maxOwn) return false; cost = SHOP.priceOf(state.estate.shops); }
  else if (kind === 'warehouse') { if (state.estate.warehouseLevel >= WAREHOUSE.maxLevel) return false; cost = WAREHOUSE.costOf(state.estate.warehouseLevel); }
  else if (kind === 'lab') { if (state.research.labLevel >= RESEARCH_LAB.maxLevel) return false; cost = RESEARCH_LAB.costOf(state.research.labLevel); }
  else return false;
  return investmentBudget(state, cost).ok;
}
