import { INDUSTRIES, INDUSTRY_MAP } from '../data/industries.js';
import { PROJECT_MAP as RESEARCH } from '../data/research.js';
import { PROJECT_MAP as CITY, projectEffects } from '../data/projects.js';
import { getItem } from '../data/items.js';
import { stageInfo } from '../data/realms.js';
import { sideFactor, SIDE } from '../core/state.js';
import { worldCount, consumeWorld, depositCargo, storedCount } from './cargo.js';
import { ITEM_MAP } from '../data/items.js';
import { investmentBudget } from './finance.js';
import { alchemyPlan, materialSource } from './alchemy.js';
import { earn } from './daily.js';
import { emit, EV } from '../core/bus.js';

export function industryStatus(state, id) {
  const p = INDUSTRY_MAP[id];
  if (!p) return null;
  const record = state.modern.industries?.[id];
  const requirements = [`${stageInfo(p.stage).stage.name}`, `商业Lv.${p.business}`, p.research ? RESEARCH[p.research].name : CITY[p.project].name];
  const unlocked = state.player.stage >= p.stage && state.modern.businessLevel >= p.business && (!p.research || state.research.done[p.research]) && (!p.project || state.projects.done[p.project]);
  const budget = investmentBudget(state, p.cost.cny);
  const keep = { ...(state.estate.keep || {}) };
  for (const m of alchemyPlan(state).mats || []) keep[m.id] = Math.max(keep[m.id] || 0, m.need);
  const target = CITY[state.projects.target];
  if (target && !state.projects.done[target.id]) for (const [mid, n] of Object.entries(target.cost.mats)) keep[mid] = Math.max(keep[mid] || 0, n);
  const mats = Object.entries(p.mats).map(([mid, need]) => ({ id: mid, need, have: worldCount(state, SIDE.MODERN, mid), keep: keep[mid] || 0, name: getItem(mid)?.name || mid, source: materialSource(state, mid) }));
  const stocked = mats.every(m => m.have - m.keep >= m.need), funded = state.currency.stone - p.runningCost >= (state.crafting.reserveStone || 0);
  const income = p.cny * (1 + projectEffects(state).modernIncome);
  const factor = sideFactor(state, SIDE.MODERN);
  return { project: p, record, built: !!record, on: !!record?.on, unlocked, budget, requirements, mats, stocked, funded, income,
    canBuild: !record && unlocked && state.side === SIDE.MODERN && budget.ok && state.currency.stone >= p.cost.stone,
    remainingMs: Math.max(0, p.cycleMs - (record?.acc || 0)) / factor,
    status: !record ? '待建立' : !record.on ? '已暂停' : !stocked ? '等待材料（已保留丹方与工程备料）' : !funded ? '等待灵石周转' : state.side === SIDE.MODERN ? '正在处理订单' : '异界半速处理订单' };
}
export function buildIndustry(state, id) {
  const st = industryStatus(state, id);
  if (!st?.canBuild) return { ok: false, reason: st?.built ? '已建立该公司。' : '请在现代界备齐前置、资金和灵石，投资后须满足保留线。' };
  state.currency.cny -= st.project.cost.cny; state.currency.stone -= st.project.cost.stone;
  (state.modern.industries ??= {})[id] = { on: false, acc: 0, orders: 0 };
  emit(EV.STATE); return { ok: true };
}
export function setIndustryRunning(state, id, on) {
  if (!INDUSTRY_MAP[id] || !state.modern.industries?.[id] || typeof on !== 'boolean') return { ok: false, reason: '先建立该公司。' };
  state.modern.industries[id].on = on; emit(EV.STATE); return { ok: true };
}
/** 仅把已运抵现代的贸易原料放入当地仓库；材料本身仍按共享材料规则使用。 */
export function stockIndustry(state, id) {
  const st = industryStatus(state, id);
  if (!st?.built || state.side !== SIDE.MODERN) return { ok: false, reason: '请在现代界为已建立的公司备料。' };
  let deposited = 0;
  for (const m of st.mats.filter(m => ITEM_MAP[m.id])) {
    let need = Math.max(0, m.need * 5 + m.keep - storedCount(state, SIDE.MODERN, m.id));
    for (const e of [...state.inventory].filter(e => e.itemId === m.id)) {
      const n = Math.min(e.qty, need);
      if (n > 0 && depositCargo(state, e.uid, n).ok) { deposited += n; need -= n; }
    }
  }
  return { ok: true, deposited };
}
export function tickIndustries(state, dtMs) {
  if (!Number.isFinite(dtMs) || dtMs <= 0) return;
  for (const p of INDUSTRIES) {
    const record = state.modern.industries?.[p.id];
    if (!record?.on) continue;
    record.acc += dtMs * sideFactor(state, SIDE.MODERN);
    while (record.acc + 1e-6 >= p.cycleMs) {
      record.acc = Math.max(0, record.acc - p.cycleMs);
      const st = industryStatus(state, p.id);
      if (!st.stocked || !st.funded) { record.acc %= p.cycleMs; break; }
      for (const [id, n] of Object.entries(p.mats)) consumeWorld(state, SIDE.MODERN, id, n);
      state.currency.stone -= p.runningCost; state.currency.cny += st.income; state.research.points += p.rp;
      record.orders++; state.stats.industryOrders = (state.stats.industryOrders || 0) + 1;
      state.stats.maxCny = Math.max(state.stats.maxCny || 0, state.currency.cny);
      state.stats.industryCny = (state.stats.industryCny || 0) + st.income;
      state.stats.industryStone = (state.stats.industryStone || 0) + p.runningCost;
      earn(state, 'cny', st.income); emit(EV.STATE);
    }
  }
}
export function nextIndustryEvent(state) {
  return Math.min(Infinity, ...INDUSTRIES.filter(p => state.modern.industries?.[p.id]?.on).map(p => Math.max(1, (p.cycleMs - (state.modern.industries[p.id].acc || 0)) / sideFactor(state, SIDE.MODERN))));
}
