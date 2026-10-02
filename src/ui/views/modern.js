/**
 * views/modern.js —— 现代世界：职业 / 商业（GDD 13）
 */

import { h, panel, panelFlush, showToast } from '../dom.js';
import { JOBS, JOB_MAP, jobRate, jobUpgradeCost, BUSINESS } from '../../data/jobs.js';
import { chooseJob, upgradeJob, upgradeBusiness, toggleWork, totalIncomePerHour, jobIncomePerHour, businessIncomePerHour, investmentPreview } from '../../systems/modern.js';
import { fmtInt, fmtPct } from '../../core/util.js';
import { SIDE } from '../../core/state.js';

export function renderModern(state, ctx) {
  const investment = investmentPreview(state);
  const payback = (v) => Number.isFinite(v.hours) ? `${v.hours.toFixed(1)} 小时` : '停工期间无工资回本';
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
    cur ? h('div.investment-note.t-xs', { text: `下次职级提升：投入 ¥${fmtInt(investment.job.cost)} · 新增 ¥${investment.job.delta.toFixed(1)} / 时 · 预计回本 ${payback(investment.job)}。按当前世界与上班状态估算。` }) : null,
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
      h('dl.kv', null, h('dt', { text: '被动收入' }), h('dd.t-num', { text: `¥${fmtInt(businessIncomePerHour(state))} / 时` })),
      h('dl.kv', null, h('dt', { text: '下级折扣' }), h('dd.t-num', { text: `-${fmtPct(BUSINESS.buyDiscount(Math.min(BUSINESS.maxLevel, state.modern.businessLevel + 1)), 0)}` })),
    ),
    state.modern.businessLevel < BUSINESS.maxLevel ? h('div.investment-note.t-xs', { text: `下级商业：投入 ¥${fmtInt(investment.business.cost)} · 新增 ¥${investment.business.delta.toFixed(1)} / 时 · 仅被动收入预计 ${payback(investment.business)} 回本。进货折扣节省另计。` }) : null,
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
      text: '工资维持现金流，商业降低进货成本，店铺代售跨界货物，地产持续收租。选择投资时，也要为下一次跨界进货留出资金。',
    }),
  );

  return h('div.flex-col.gap-4', null, head, biz, panel('下一步投资', null, h('div.btn-row', null, h('button.btn', {text:'查看地产与店铺',onclick:()=>ctx.navigate('estate')}), h('button.btn', {text:'市场进货',onclick:()=>ctx.navigate('market')}))), jobs, note);
}
