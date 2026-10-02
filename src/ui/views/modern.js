/**
 * views/modern.js —— 现代世界：职业 / 商业（GDD 13）
 */

import { h, panel, panelFlush, showToast } from '../dom.js';
import { JOBS, JOB_MAP, jobRate, jobUpgradeCost, BUSINESS } from '../../data/jobs.js';
import { chooseJob, upgradeJob, upgradeBusiness, toggleWork, totalIncomePerHour, jobIncomePerHour, businessIncomePerHour } from '../../systems/modern.js';
import { fmtInt, fmtPct } from '../../core/util.js';
import { SIDE } from '../../core/state.js';

export function renderModern(state, ctx) {
  const cur = state.modern.job;
  const curJob = cur ? JOB_MAP[cur] : null;
  const inModern = state.side === SIDE.MODERN;

  const head = panel('现代都市 · 生计', inModern ? '满速收益' : '半速收益（你人在修仙界）',
    h('div.flex-between', null,
      h('div', null,
        h('div.t-serif', { style: 'font-size:20px', text: curJob ? `${curJob.name} · Lv.${state.modern.jobLevel}` : '待业中' }),
        h('div.t-xs.t-dim', {
          text: curJob ? curJob.desc : '在里世界，钱是唯一的通行证。先找一份工作。',
        }),
      ),
      h('div.t-right', null,
        h('div.t-xs.t-dim', { text: '当前时薪' }),
        h('div.t-num.t-lg', { text: curJob ? `¥${jobRate(cur, state.modern.jobLevel).toFixed(1)}` : '¥0' }),
      ),
    ),
    h('hr.hr'),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '工资收入' }), h('dd.t-num', { text: `¥${fmtInt(jobIncomePerHour(state))} / 时` })),
      h('dl.kv', null, h('dt', { text: `商业被动（Lv.${state.modern.businessLevel}）` }), h('dd.t-num', { text: `¥${fmtInt(businessIncomePerHour(state))} / 时` })),
      h('dl.kv', null, h('dt', { text: '合计' }), h('dd.t-num.t-strong', { text: `¥${fmtInt(totalIncomePerHour(state))} / 时` })),
      h('dl.kv', null, h('dt', { text: '现有资金' }), h('dd.t-num', { text: `¥${fmtInt(state.currency.cny)}` })),
    ),
    h('div.btn-row.mt-3', null,
      h('button.btn', {
        class: state.modern.workOn ? 'btn-solid' : '',
        text: state.modern.workOn ? '正在上班' : '已停工',
        onclick: () => { toggleWork(state); ctx.rerender(); },
      }),
      cur ? h('button.btn', {
        text: `职级提升（¥${fmtInt(jobUpgradeCost(cur, state.modern.jobLevel))}）`,
        disabled: state.currency.cny < jobUpgradeCost(cur, state.modern.jobLevel),
        onclick: () => { const r = upgradeJob(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
      }) : null,
    ),
  );

  const jobs = panelFlush('职业', cur ? '转行会掉一级' : '选一份工作',
    ...JOBS.map((j) => h('div.rowitem', null,
      h('div.rowitem-main', null,
        h('div.rowitem-title', null,
          h('span.rowitem-name', { text: j.name }),
          cur === j.id ? h('span.tag.tag-ink', { text: '在职' }) : null,
        ),
        h('div.rowitem-meta', { text: `起薪 ¥${j.base}/时　·　涨幅 ×${j.growth}　·　升级成本 ¥${fmtInt(j.baseCost)} 起` }),
        h('div.t-xs.t-dim', { text: j.desc }),
      ),
      h('div.rowitem-act', null,
        h('button.btn.btn-sm', {
          class: cur === j.id ? '' : 'btn-solid',
          text: cur === j.id ? '已就职' : '入职',
          disabled: cur === j.id,
          onclick: () => { chooseJob(state, j.id); ctx.rerender(); },
        }),
      ),
    )),
  );

  const biz = panel('商业', `Lv.${state.modern.businessLevel} / ${BUSINESS.maxLevel}`,
    h('p.t-sm.t-dim', { text: '开店、批发、扩货架。商业等级越高，进货成本越低，客流量越大。' }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '进货成本折扣' }), h('dd.t-num', { text: `-${fmtPct(BUSINESS.buyDiscount(state.modern.businessLevel), 0)}` })),
      h('dl.kv', null, h('dt', { text: '被动收入' }), h('dd.t-num', { text: `¥${fmtInt(BUSINESS.passiveIncome(state.modern.businessLevel))} / 时` })),
      h('dl.kv', null, h('dt', { text: '下级折扣' }), h('dd.t-num', { text: `-${fmtPct(BUSINESS.buyDiscount(Math.min(BUSINESS.maxLevel, state.modern.businessLevel + 1)), 0)}` })),
    ),
    h('div.mt-3', null,
      state.modern.businessLevel >= BUSINESS.maxLevel
        ? h('button.btn', { text: '已满级', disabled: true })
        : h('button.btn.btn-solid', {
          text: `升级商业（¥${fmtInt(BUSINESS.costOf(state.modern.businessLevel))}）`,
          disabled: state.currency.cny < BUSINESS.costOf(state.modern.businessLevel),
          onclick: () => { const r = upgradeBusiness(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        }),
    ),
  );

  const note = panel(null, null,
    h('p.t-xs.t-dim', {
      text: '地产与店铺在「地产」页。GDD 13.3：一期所有商铺均可购买、无竞争；二期加入地皮限量与玩家竞拍。',
    }),
  );

  return h('div.flex-col.gap-4', null, head, jobs, biz, note);
}
