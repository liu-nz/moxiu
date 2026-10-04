/**
 * research.js —— 灵科融合研究（GDD 5）
 * 研究点来源：现代研究所挂机产出 + 修仙材料兑换。
 */

import { PROJECTS, PROJECT_MAP, BRANCHES, projectsOf, RESEARCH_LAB, materialToRP, canResearch, researchEffects } from '../data/research.js';
import { MATERIAL_MAP } from '../data/items.js';
import { sideFactor, SIDE } from '../core/state.js';
import { countOf, removeItem, validQuantity } from './inventory.js';
import { logGood, logHl, toast } from './log.js';
import { updateTutorial } from './tutorial.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';
import { investmentBudget } from './finance.js';

export function rpPerHour(state) {
  return RESEARCH_LAB.rpPerHour(state.research.labLevel) * (state.modern.job === 'dev' ? 1.1 : 1) * sideFactor(state, SIDE.MODERN);
}

export function upgradeLab(state) {
  const lv = state.research.labLevel;
  if (lv >= RESEARCH_LAB.maxLevel) return { ok: false, reason: '研究所已至满级。' };
  const cost = RESEARCH_LAB.costOf(lv);
  const budget = investmentBudget(state, cost);
  if (!budget.ok) return budget;
  state.currency.cny -= cost;
  state.research.labLevel += 1;
  logGood(state, `研究所升级至 Lv.${state.research.labLevel}，研究点产出 ${RESEARCH_LAB.rpPerHour(state.research.labLevel).toFixed(1)} / 时。`);
  emit(EV.STATE);
  return { ok: true };
}

export function doResearch(state, id) {
  const chk = canResearch(state, id);
  if (!chk.ok) return chk;
  const p = PROJECT_MAP[id];
  state.research.points -= p.cost;
  state.research.done[id] = state.world.clockMs;
  logHl(state, `灵科研究完成：「${p.name}」—— ${p.effectDesc}。`);
  toast(`研究完成：${p.name}`, 'good');
  updateTutorial(state);
  emit(EV.STATE);
  return { ok: true, project: p };
}

/** 材料兑换研究点 */
export function exchangeMaterial(state, matId, qty = 1) {
  if (!validQuantity(qty)) return { ok: false, reason: '兑换数量须为正整数。' };
  const mat = MATERIAL_MAP[matId];
  if (!mat) return { ok: false, reason: '没有这种材料。' };
  const have = countOf(state, matId);
  const n = Math.min(qty, have);
  if (n <= 0) return { ok: false, reason: '材料不足。' };
  removeItem(state, matId, n);
  const rp = materialToRP(mat) * n;
  state.research.points += rp;
  logGood(state, `兑换 ${mat.name} ×${n}，获得研究点 ${rp}。`);
  emit(EV.STATE);
  return { ok: true, rp };
}

export function tickResearch(state, dtMs) {
  const r = state.research;
  if (!r || !r.labLevel) return;
  const hours = dtMs / 3600000;
  r.points += rpPerHour(state) * hours;
}

export function branchProgress(state) {
  return BRANCHES.map((b) => {
    const list = projectsOf(b.id);
    const done = list.filter((p) => state.research.done[p.id]).length;
    return { ...b, total: list.length, done, ratio: done / list.length };
  });
}

export function projectStatus(state, id) {
  const p = PROJECT_MAP[id];
  if (!p) return null;
  const done = !!state.research.done[id];
  const reqOk = p.req.every((r) => state.research.done[r]);
  const affordable = state.research.points >= p.cost;
  return { project: p, done, reqOk, affordable, available: !done && reqOk && affordable };
}

export { PROJECTS, PROJECT_MAP, BRANCHES, projectsOf, RESEARCH_LAB, materialToRP, researchEffects };
