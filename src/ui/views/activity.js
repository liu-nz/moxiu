import {worldStatePanel} from './world-state.js';
import {getEvent} from '../../data/worldEvents.js';
import { h, panel } from '../dom.js';
import { SIDE_NAME } from '../../core/state.js';
import { riftDayIndex } from '../../core/clock.js';
import { fmtDuration } from '../../core/util.js';
import { SIGN_IN_REWARD } from '../../systems/daily.js';
import { commissionBoard } from '../../systems/commissions.js';
import { storyJournal } from '../../systems/tales.js';
import { daily_signIn, daily_claimHelp, commissions_acceptCommission, commissions_abandonCommission, commissions_fulfillCommission, tales_followStory } from '../commands.js';
import { cloudSession } from '../../core/cloud.js';
import { showAccount } from '../account.js';

async function run(state, ctx, command, ...args) {
  const result = await command(state, ...args);
  if (!result.ok) ctx.showToast(result.reason || '操作暂未完成', 'warn');
  ctx.rerender();
}
export function dailyPanel(state, ctx) {
  const d = state.daily || {}, day = riftDayIndex(state.world.clockMs), signed = d.signInDay === day;
  return panel('每日签到与同行照料', '北京时间 05:00 刷新',
    h('p.t-xs.t-dim', { text: cloudSession ? `每天签到 +${SIGN_IN_REWARD} 灵石 · 连续 ${d.signInStreak || 0} 天 · 累计 ${d.signInTotal || 0} 天。累计七天获得免费称号「七日有约」。签到与已领取照料记录随账号保留。` : '登录后可参加每日签到和好友照料。' }),
    h('div.btn-row.mt-2', null,
      h('button.btn.btn-sm', { text: cloudSession ? signed ? '今日已签到' : `签到 +${SIGN_IN_REWARD} 灵石` : '登录 / 注册', disabled: cloudSession && signed, onclick: () => cloudSession ? run(state, ctx, daily_signIn) : showAccount() }),
      d.help && d.helpClaimedDay !== day ? h('button.btn.btn-sm', { text: '领取同行照料', onclick: () => run(state, ctx, daily_claimHelp) }) : null),
    h('p.t-xs.t-dimmer.mt-2', { text: d.help ? `${d.help.author_name} 留下一份照料。领取后，一块生长中的灵田或一个牧场栏位缩短至多 5 分钟等待。` : '好友可离线送来照料，24 小时内有效，每日最多领取一份。' }));
}
export function commissionsPanel(state, ctx, trackedOnly = false) {
  const all = [...commissionBoard(state, 'modern'), ...commissionBoard(state, 'cultivation')];
  const orders = trackedOnly ? all.filter(x => x.accepted) : all;
  const sourceView = x => state.side === (x.source === 'market' ? 'modern' : 'cultivation') ? x.source === 'market' ? 'market' : 'farm' : 'gate';
  return panel(trackedOnly ? '我接取的委托' : '两界委托板', `累计交付 ${state.commissions.total} 份`,
    h('p.t-xs.t-dim', { text: '自选接取最多两份，报酬锁定，普通委托保留 72 小时，可无损放弃。货物备齐后，在指定世界交付；同一委托每日限交付一次。急件限 12 小时；收藏委托检查品质；客户关系与连锁进度随轮回保留。' }),
    !trackedOnly ? h('p.t-xs.t-jade.mt-2', { text: '完成 10 份委托：免费称号「两界信使」；分别完成种田、养殖和采购委托：免费称号「百业同行」。' }) : null,
    orders.length ? orders.map(order => h('div.rowitem.mt-2', null,
      h('div.rowitem-main', null, h('strong.t-sm', { text: `${order.title} · ${SIDE_NAME[order.side]}` }),
        h('p.t-xs.t-dimmer',{text:order.relation.dialogue}),
        h('p.t-xs.t-dim', { text: `${order.client} · ${order.relation.tier} ${order.relation.points}/100：${order.note}` }),
        h('p.t-xs', { text: `${order.itemName} ×${order.qty} · 持有 ${order.have} · 报酬 ${order.currency === 'cny' ? '¥' : ''}${order.reward}${order.currency === 'stone' ? ' 灵石' : ''}` }),
        order.accepted ? h('p.t-xs.t-dimmer', { text: `已接取 · 剩余 ${fmtDuration(order.accepted.expiresAt - state.world.clockMs)}` }) : null),
      h('div.btn-row', null,
        order.accepted ? h('button.btn.btn-sm', { text: order.have < order.qty ? sourceView(order) === 'gate' ? order.source === 'market' ? '前往现代采购' : '前往修仙界备货' : '准备物资' : order.side !== state.side ? '前往界门交付' : '交付委托', disabled: order.done || order.locked,
          onclick: () => order.have < order.qty ? ctx.navigate(sourceView(order)) : order.side !== state.side ? ctx.navigate('gate') : run(state, ctx, commissions_fulfillCommission, order.id) })
          : h('button.btn.btn-sm', { text: order.done ? '今日已完成' : order.locked ? '需要现代店铺' : '接取委托', disabled: order.done || order.locked || state.commissions.active.length >= 2, onclick: () => run(state, ctx, commissions_acceptCommission, order.id) }),
        order.accepted ? h('button.btn.btn-sm.btn-ghost', { text: '放弃', onclick: () => run(state, ctx, commissions_abandonCommission, order.id) }) : null)))
      : h('p.t-xs.t-dim.mt-2', { text: '尚未接取委托，可去界门查看两界需求。' }),
    trackedOnly ? h('button.btn.btn-sm.mt-2', { text: '查看两界委托板', onclick: () => ctx.navigate('gate') }) :
      h('details.mt-3', null, h('summary.t-xs', { text: '最近交付' }), state.commissions.history.map(x => h('p.t-xs.mt-1', { text: `${x.title} · +${x.reward} ${x.currency === 'cny' ? '元' : '灵石'}` }))));
}
export function storiesPanel(state, ctx) {
  return panel('连续故事', '选择留下线索，称号与世界记忆',
    h('p.t-xs.t-dim', { text: '追寻线索会使用一次当日奇闻机会，事件之间间隔三小时。分支选择随轮回保留，已完成的章节不能重领奖励。' }),
    storyJournal(state).map(arc => h('div.rowitem.mt-2', null, h('div.rowitem-main', null,
      h('strong.t-sm', { text: `${arc.done ? '✓' : '○'} ${arc.name}` }), h('p.t-xs.t-dim', { text: arc.note }),
      h('p.t-xs', { text: arc.reason }), h('p.t-xs.t-jade', { text: `结局纪念：${arc.rewards}` })),
      arc.done ? null : h('button.btn.btn-sm', { text: '追寻线索', disabled: !arc.available, onclick: async () => { await run(state, ctx, tales_followStory, arc.id); } }))));
}

export function renderExploration(state,ctx) {const event=getEvent(state.market.eventId || state.world.eventId);return h('div.flex-col.gap-4',null,panel('世界探索',SIDE_NAME[state.side],h('p.t-sm',{text:event.name+'：'+event.desc}),h('div.btn-row.mt-2',null,h('button.btn.btn-sm',{text:state.side==='cultivation'?'前往秘境':'前往界门准备历练',onclick:()=>ctx.navigate(state.side==='cultivation'?'dungeon':'gate')}))),worldStatePanel(state,ctx),storiesPanel(state,ctx));}
