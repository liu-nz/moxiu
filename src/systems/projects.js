/**
 * projects.js —— 城市灵改工程（GDD 1.3 后期：修仙反哺现代）
 */

import { CITY_PROJECTS, PROJECT_MAP, projectEffects } from '../data/projects.js';
import { MATERIAL_MAP } from '../data/items.js';
import { stageInfo } from '../data/realms.js';
import { countOf, removeItem } from './inventory.js';
import { logHl, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';

function pj(state) {
  if (!state.projects) state.projects = { done: {} };
  if (!state.projects.done) state.projects.done = {};
  return state.projects;
}

export function isDone(state, id) {
  return !!pj(state).done[id];
}

export function status(state, id) {
  const p = PROJECT_MAP[id];
  if (!p) return null;
  const done = isDone(state, id);
  const stageOk = state.player.stage >= p.stage;
  const stoneOk = state.currency.stone >= p.cost.stone;
  const cnyOk = state.currency.cny >= p.cost.cny;
  const mats = Object.entries(p.cost.mats).map(([mid, qty]) => ({
    id: mid, need: qty, have: countOf(state, mid), name: MATERIAL_MAP[mid]?.name || mid,
  }));
  const matOk = mats.every((m) => m.have >= m.need);
  return {
    project: p,
    done,
    stageOk,
    stoneOk,
    cnyOk,
    mats,
    matOk,
    canStart: !done && stageOk && stoneOk && cnyOk && matOk,
    stageLabel: stageInfo(p.stage).stage.name,
  };
}

export function start(state, id) {
  const st = status(state, id);
  if (!st) return { ok: false, reason: '没有这项工程。' };
  if (st.done) return { ok: false, reason: '已完工。' };
  if (!st.stageOk) return { ok: false, reason: `需达到 ${st.stageLabel} 才能动工。` };
  if (!st.stoneOk) return { ok: false, reason: `灵石不足（需 ${fmtInt(st.project.cost.stone)}）。` };
  if (!st.cnyOk) return { ok: false, reason: `资金不足（需 ¥${fmtInt(st.project.cost.cny)}）。` };
  if (!st.matOk) {
    const miss = st.mats.filter((m) => m.have < m.need).map((m) => `${m.name} ${m.have}/${m.need}`);
    return { ok: false, reason: `材料不足：${miss.join('、')}。` };
  }

  const p = st.project;
  state.currency.stone -= p.cost.stone;
  state.currency.cny -= p.cost.cny;
  for (const [mid, qty] of Object.entries(p.cost.mats)) removeItem(state, mid, qty);

  pj(state).done[id] = state.world.clockMs;
  logHl(state, `城市灵改工程完工：「${p.name}」—— ${p.effectText}。`);
  toast(`工程完工：${p.name}`, 'good');
  emit(EV.STATE);
  return { ok: true, project: p };
}

export function projectsSummary(state) {
  return {
    list: CITY_PROJECTS.map((p) => status(state, p.id)),
    effects: projectEffects(state),
    doneCount: Object.keys(pj(state).done).length,
    total: CITY_PROJECTS.length,
  };
}

export { CITY_PROJECTS, PROJECT_MAP, projectEffects };
