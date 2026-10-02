/**
 * duties.js —— 道侣日常职责（GDD 12）
 * 好感度达到「知己」后，道侣会在每次界潮刷新时替你干活。
 * 单独成模块以避免 rift ↔ dungeon 的循环依赖。
 */

import { hasDuty, dutyMultiplier, COMPANIONS } from './companion.js';
import { bestDungeon, runDungeon } from './dungeon.js';
import { autoCraft } from './alchemy.js';
import { autoSell } from './estate.js';
import { grantStipend } from './sect.js';
import { logGood, toast } from './log.js';
import { emit, EV } from '../core/bus.js';
import { fmtInt } from '../core/util.js';

/** 每次界潮刷新时结算一轮道侣工作 */
export function runDailyDuties(state, days = 1) {
  const rounds = Math.max(1, Math.min(days, 7));
  const report = [];

  for (let i = 0; i < rounds; i++) {
    /* 苏清鸢：代刷副本（不耗体力） */
    if (hasDuty(state, 'suqingyuan')) {
      const d = bestDungeon(state);
      if (d) {
        const times = 1 + dutyMultiplier(state, 'suqingyuan') - 1;
        for (let k = 0; k < times; k++) {
          const r = runDungeon(state, d.id, 'normal', { free: true });
          if (r.ok && r.win) {
            report.push(`苏清鸢代刷「${d.name}」，灵石 +${fmtInt(r.rewards.stone)}`);
          }
        }
      }
    }

    /* 墨瑶：自动炼丹 */
    if (hasDuty(state, 'moyao')) {
      const n = dutyMultiplier(state, 'moyao');
      const r = autoCraft(state, 2 * n, { companion: true });
      if (r.made) report.push(`墨瑶炼成丹药 ×${r.made}`);
    }

    /* 铁心兰：店铺补货（自动售货额外结算一批） */
    if (hasDuty(state, 'tiexinlan') && state.estate?.autoSell && state.estate?.shops) {
      const r = autoSell(state, 6 * state.estate.shops * dutyMultiplier(state, 'tiexinlan'));
      if (r.sold) report.push(`铁心兰看店售出 ${r.sold} 件，入账 ¥${fmtInt(r.revenue)}`);
    }
  }

  if (report.length) {
    logGood(state, `道侣事务：${report.join('；')}。`);
    toast('道侣已替你打理一轮', 'good');
    emit(EV.STATE);
  }
  return report;
}

/** 界潮刷新时结算的宗门月俸 */
export function runDailyStipend(state, days = 1) {
  if (!state.sect?.id) return 0;
  let total = 0;
  for (let i = 0; i < Math.max(1, Math.min(days, 7)); i++) {
    total += grantStipend(state) || 0;
  }
  return total;
}

export function dutySummary(state) {
  return COMPANIONS.map((c) => ({
    id: c.id,
    name: c.name,
    trait: c.trait,
    active: hasDuty(state, c.id),
    multiplier: dutyMultiplier(state, c.id),
  }));
}
