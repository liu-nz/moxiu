/** 离线收益与后台恢复共享时间推进；同一份状态不会重复结算。 */
import { settleElapsed, isStandard } from '../core/loop.js';
import { pushLog } from './log.js';
import { fmtDuration, fmtInt } from '../core/util.js';

export function applyOffline(state, nowMs) {
  if (!Number.isFinite(nowMs)) return null;
  const savedAt = state.savedAt || nowMs;
  const elapsedReal = Math.max(0, nowMs - savedAt);
  if (elapsedReal === 0) return null;
  const before = { stage: state.player.stage, stone: state.currency.stone, cny: state.currency.cny,
    cult: state.player.totalCultivation, rp: state.research?.points || 0, stats: { ...state.stats }, pills: state.crafting.totalPills || 0, items: itemCounts(state) };
  const elapsed = isStandard(state) ? Math.max(0, nowMs - state.world.clockMs) : elapsedReal;
  const result = settleElapsed(state, elapsed, { targetMs: isStandard(state) ? nowMs : null, homeBonus: elapsedReal >= 60000 });
  state.savedAt = nowMs;
  if (elapsedReal < 60000) return null;
  const report = { elapsedReal, ...result, cult: state.player.totalCultivation - before.cult,
    cny: state.currency.cny - before.cny, stone: state.currency.stone - before.stone,
    rp: (state.research?.points || 0) - before.rp, stageFrom: before.stage, stageTo: state.player.stage };
  const deltaStat = id => Math.max(0, (state.stats[id] || 0) - (before.stats[id] || 0));
  const items = itemCounts(state);
  report.production = { harvests: deltaStat('harvests'), ranchCollected: deltaStat('ranchCollected'), attempts: deltaStat('crafts'), pills: (state.crafting.totalPills || 0) - before.pills,
    seedsStone: deltaStat('farmSeedStone'), alchemyStone: deltaStat('alchemyStone'), sold: deltaStat('shopSold'), shopCny: deltaStat('shopCny'),
    items: [...new Set([...Object.keys(before.items), ...Object.keys(items)])].map(id => ({ id, delta: (items[id] || 0) - (before.items[id] || 0) })).filter(i => i.delta !== 0) };
  const signed = n => `${n < 0 ? '−' : '+'}${fmtInt(Math.abs(n))}`;
  pushLog(state, `离线 ${fmtDuration(elapsedReal)}：修为 ${signed(report.cult)}，灵石 ${signed(report.stone)}，资金 ¥${signed(report.cny)}${result.homeBonus ? `（居所加成 ${(result.homeBonus * 100).toFixed(0)}%）` : ''}。`, 'hl');
  return report;
}

function itemCounts(state) {
  const counts = {};
  for (const e of state.inventory) counts[e.itemId] = (counts[e.itemId] || 0) + e.qty;
  return counts;
}
