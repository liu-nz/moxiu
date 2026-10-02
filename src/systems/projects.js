/** 城市工程：前置研究、材料目标、预算与实际收益使用同一份规则。 */
import { CITY_PROJECTS, PROJECT_MAP, projectEffects, canStart } from '../data/projects.js';
import { PROJECT_MAP as RESEARCH_MAP } from '../data/research.js';
import { MATERIAL_MAP } from '../data/items.js';
import { stageInfo } from '../data/realms.js';
import { countOf, removeItem } from './inventory.js';
import { materialSource } from './alchemy.js';
import { investmentBudget } from './finance.js';
import { cultivationRate } from './character.js';
import { totalIncomePerHour } from './modern.js';
import { rentPerHour, shopCapacity } from './estate.js';
import { carryCapacity } from './rift.js';
import { logHl, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';
export function isDone(state, id) { return !!state.projects?.done?.[id]; }
export function status(state, id) {
  const p = PROJECT_MAP[id];
  if (!p) return null;
  const done = isDone(state, id), stageOk = state.player.stage >= p.stage;
  const budget = investmentBudget(state, p.cost.cny);
  const stoneOk = state.currency.stone >= p.cost.stone, cnyOk = budget.ok;
  const research = (p.research || []).map(id => ({ id, name: RESEARCH_MAP[id].name, done: !!state.research?.done?.[id], cost: RESEARCH_MAP[id].cost }));
  const prerequisites = (p.prerequisites || []).map(id => ({ id, name: PROJECT_MAP[id].name, done: isDone(state, id) }));
  const reqOk = research.every(r => r.done) && prerequisites.every(r => r.done);
  const mats = Object.entries(p.cost.mats).map(([id, need]) => ({ id, need, have: countOf(state, id), name: MATERIAL_MAP[id]?.name || id, source: materialSource(state, id) }));
  const matOk = mats.every(m => m.have >= m.need);
  const stageLabel = stageInfo(p.stage).stage.name;
  const check = canStart(state, id);
  const reason = done ? '已完工。' : !stageOk ? `需达到 ${stageLabel}。` : !reqOk ? `前置未完成：${[...research, ...prerequisites].filter(r => !r.done).map(r => r.name).join('、')}。` : !stoneOk ? `灵石还缺 ${fmtInt(p.cost.stone - state.currency.stone)}。` : !cnyOk ? budget.reason : !matOk ? '材料尚未备齐。' : check.reason || '';
  return { project: p, done, stageOk, stoneOk, cnyOk, mats, matOk, research, prerequisites, reqOk, budget,
    canStart: check.ok && budget.ok, stageLabel, reason,
    missing: { stone: Math.max(0, p.cost.stone - state.currency.stone), cny: Math.max(0, p.cost.cny - budget.available) } };
}
export function start(state, id) {
  const st = status(state, id);
  if (!st || !st.canStart) return { ok: false, reason: st?.reason || '没有这项工程。' };
  const p = st.project;
  state.currency.stone -= p.cost.stone; state.currency.cny -= p.cost.cny;
  for (const [id, qty] of Object.entries(p.cost.mats)) removeItem(state, id, qty);
  state.projects.done[id] = state.world.clockMs || true;
  logHl(state, `城市灵改工程完工：「${p.name}」—— ${p.effectText}。`);
  toast(`工程完工：${p.name}`, 'good'); emit(EV.STATE);
  return { ok: true, project: p };
}
export function setProjectTarget(state, id) {
  if (id !== null && (!PROJECT_MAP[id] || isDone(state, id))) return { ok: false, reason: '请选择尚未完成的城市工程。' };
  state.projects.target = id; emit(EV.STATE); return { ok: true };
}
export function targetProject(state) {
  const pinned = state.projects?.target;
  return pinned && !isDone(state, pinned) ? status(state, pinned) : null;
}
export function projectImpact(state, id) {
  if (!PROJECT_MAP[id]) return null;
  const after = { ...state, projects: { ...state.projects, done: { ...state.projects?.done, [id]: true } } };
  const rates = s => ({ cultivation: cultivationRate(s), income: totalIncomePerHour(s), rent: rentPerHour(s), carry: carryCapacity(s), throughput: shopCapacity(s) * (s.estate.shops || 0), ...projectEffects(s) });
  return { before: rates(state), after: rates(after) };
}
export function projectsSummary(state) { return { list: CITY_PROJECTS.map(p => status(state, p.id)), effects: projectEffects(state), doneCount: CITY_PROJECTS.filter(p => isDone(state, p.id)).length, total: CITY_PROJECTS.length }; }
export { CITY_PROJECTS, PROJECT_MAP, projectEffects };
