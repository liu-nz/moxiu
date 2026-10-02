/**
 * modern.js —— 现代世界（GDD 13）
 * 职业挂机工资 + 商业等级（降低进货成本、提供被动收入）
 */

import { JOB_MAP, jobRate, jobUpgradeCost, BUSINESS } from '../data/jobs.js';
import { projectEffects } from '../data/projects.js';
import { sideFactor, SIDE } from '../core/state.js';
import { logGood, logWarn, toast } from './log.js';
import { updateTutorial } from './tutorial.js';
import { earn } from './daily.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';
import { investmentBudget } from './finance.js';

export function jobIncomePerHour(state) {
  if (!state.modern.job || !state.modern.workOn) return 0;
  return jobRate(state.modern.job, state.modern.jobLevel) * sideFactor(state, SIDE.MODERN) * cityMul(state);
}

export function businessIncomePerHour(state) {
  return BUSINESS.passiveIncome(state.modern.businessLevel) * sideFactor(state, SIDE.MODERN) * cityMul(state);
}

/** 城市灵改工程：灵能电网提升现代侧全部产出 */
function cityMul(state) {
  return 1 + (projectEffects(state).modernIncome || 0);
}

export function totalIncomePerHour(state) {
  return jobIncomePerHour(state) + businessIncomePerHour(state);
}

export function tickModern(state, dtMs) {
  const hours = dtMs / 3600000;
  if (hours <= 0) return 0;
  const gain = totalIncomePerHour(state) * hours;
  if (gain <= 0) return 0;
  state.currency.cny += gain;
  state.stats.passiveCny = (state.stats.passiveCny || 0) + gain;
  earn(state, 'cny', gain);
  state.stats.maxCny = Math.max(state.stats.maxCny || 0, state.currency.cny);
  return gain;
}

export function chooseJob(state, jobId) {
  if (!JOB_MAP[jobId]) return { ok: false, reason: '没有这个职业。' };
  if (state.modern.job && state.modern.job !== jobId) {
    // 转行保留等级但降一级，避免无成本横跳
    state.modern.jobLevel = Math.max(1, state.modern.jobLevel - 1);
  }
  state.modern.job = jobId;
  state.modern.jobLevel = state.modern.jobLevel || 1;
  logGood(state, `入职「${JOB_MAP[jobId].name}」，当前 Lv.${state.modern.jobLevel}。`);
  updateTutorial(state);
  emit(EV.STATE);
  return { ok: true };
}

export function upgradeJob(state) {
  if (!state.modern.job) return { ok: false, reason: '先选一份工作。' };
  const cost = jobUpgradeCost(state.modern.job, state.modern.jobLevel);
  const budget = investmentBudget(state, cost);
  if (!budget.ok) return budget;
  state.currency.cny -= cost;
  state.modern.jobLevel += 1;
  logGood(state, `职级提升至 Lv.${state.modern.jobLevel}，时薪 ¥${jobRate(state.modern.job, state.modern.jobLevel).toFixed(1)}。`);
  emit(EV.STATE);
  return { ok: true };
}

export function upgradeBusiness(state) {
  const lv = state.modern.businessLevel;
  if (lv >= BUSINESS.maxLevel) return { ok: false, reason: '商业等级已满。' };
  const cost = BUSINESS.costOf(lv);
  const budget = investmentBudget(state, cost);
  if (!budget.ok) return budget;
  state.currency.cny -= cost;
  state.modern.businessLevel += 1;
  logGood(state, `商业等级升至 Lv.${state.modern.businessLevel}：进货成本 -${(BUSINESS.buyDiscount(state.modern.businessLevel) * 100).toFixed(0)}%，被动收入 +¥${BUSINESS.passiveIncome(state.modern.businessLevel)}/时。`);
  emit(EV.STATE);
  return { ok: true };
}

export function toggleWork(state) {
  state.modern.workOn = !state.modern.workOn;
  toast(state.modern.workOn ? '开始上班。' : '停止上班。');
  emit(EV.STATE);
  return state.modern.workOn;
}

export { BUSINESS, JOB_MAP, jobRate, jobUpgradeCost };


/** 固定当前世界与城市加成，只估算新增被动收入，不折算两界货币。 */
export function investmentPreview(state) {
  const mul = sideFactor(state, SIDE.MODERN) * cityMul(state);
  const job = state.modern.job;
  const lv = state.modern.jobLevel;
  const jobCost = job ? jobUpgradeCost(job, lv) : 0;
  const jobDelta = job && state.modern.workOn ? (jobRate(job, lv + 1) - jobRate(job, lv)) * mul : 0;
  const bizLv = state.modern.businessLevel;
  const bizCost = BUSINESS.costOf(bizLv);
  const bizDelta = bizLv < BUSINESS.maxLevel ? (BUSINESS.passiveIncome(bizLv + 1) - BUSINESS.passiveIncome(bizLv)) * mul : 0;
  return {
    job: { cost: jobCost, delta: jobDelta, hours: jobDelta > 0 ? jobCost / jobDelta : Infinity },
    business: { cost: bizCost, delta: bizDelta, hours: bizDelta > 0 ? bizCost / bizDelta : Infinity },
  };
}
