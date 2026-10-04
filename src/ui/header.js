/**
 * header.js —— 顶部：两界切换 Tab（GDD 18）+ 资源 + 界潮 + 时间倍率
 */

import { h } from './dom.js';
import { showAccount } from './account.js';
import { cloudSession } from '../core/cloud.js';
import { isAuthoritative } from '../core/authority.js';
import { gameBusy, gameError, gamePending, refreshGame } from '../core/game.js';
import { SIDE, SIDE_NAME, SIDE_SUB } from '../core/state.js';
import { canCross, perDirection, msToNextRift, carryCapacity, gameDay } from '../systems/rift.js';
import { rift_cross as cross } from './commands.js';
import { fmtInt, fmtDuration, fmtKg } from '../core/util.js';
import { setSpeed, setMode, isStandard, SPEEDS } from '../core/loop.js';
import { showToast } from './dom.js';
import { emit, EV } from '../core/bus.js';
import { riftDayIndex } from '../core/clock.js';

function riftDots(n, max) {
  const out = [];
  const shown = Math.min(Math.max(n, 0), Math.max(max, 3));
  for (let i = 0; i < Math.max(max, 3); i++) {
    const cls = ['rift-dot'];
    if (i < shown) cls.push('full');
    if (i === 0) cls.push('cur');
    out.push(h('span', { class: cls.join(' ') }));
  }
  return h('span.rift-dots', null, out);
}

export function renderHeader(state, ctx) {
  const el = document.getElementById('topbar');
  if (!el) return;
  const per = perDirection(state);
  const other = state.side === SIDE.CULTIVATION ? SIDE.MODERN : SIDE.CULTIVATION;

  const tab = (side) => h('button.worldtab', {
    class: state.side === side ? 'on' : '',
    onclick: () => {
      if (state.side === side) return;
      ctx.navigate('gate');
    },
  },
    h('span', { text: SIDE_NAME[side] }),
    h('span.wt-sub', { text: side === SIDE.CULTIVATION ? '表世界 · 修炼与宗门' : '里世界 · 工作与商业' }),
  );

  const standard = isStandard(state);
  const managed = isAuthoritative(state);

  const speedBtn = (s) => h('button.btn', {
    class: state.world.speed === s ? 'btn-solid' : '',
    text: s + '×',
    title: s === 1 ? '真实时间' : `${s} 倍速（沙盒模式专用）`,
    onclick: () => {
      const r = setSpeed(state, s);
      if (!r.ok) showToast(r.reason, 'warn');
      ctx.rerender();
    },
  });

  const timeCtl = h('div.speedctl', null,
    h('span.t-xs.t-dimmer', { text: '时间' }),
    h('button.btn', {
      class: standard ? 'btn-solid' : '',
      text: '标准',
      title: '世界时钟对齐真实时间，界潮每日 05:00 全服统一刷新（GDD 3.1）',
      onclick: () => {
        const r = setMode(state, 'standard');
        if (!r.ok) showToast(r.reason, 'warn');
        ctx.rerender();
      },
    }),
    h('button.btn', {
      class: standard ? '' : 'btn-solid',
      text: '沙盒',
      disabled: managed,
      title: '可按倍率快进，用于快速体验完整流程；界潮不再与全服同步',
      onclick: () => {
        const r = setMode(state, 'sandbox');
        if (!r.ok) showToast(r.reason, 'warn');
        ctx.rerender();
      },
    }),
    standard ? null : SPEEDS.map(speedBtn),
  );

  const wrap = h('div.topbar-inner', null,
    h('div.brand', null,
      h('div', null,
        h('div.brand-mark', { text: '墨修' }),
        h('div.brand-sub', { text: managed ? (gameBusy ? '正在确认操作…' : gameError ? '连接待确认' : '服务器角色 · 已连接') : '访客试玩 · 本机进度' }),
      ),
    ),
    h('div.worldtabs', null, tab(SIDE.CULTIVATION), tab(SIDE.MODERN), h('button.btn.header-gate', {text:'◈ 界门',onclick:()=>ctx.navigate('gate')})),
    h('div.topres', null,
      h('div.res', null,
        h('span.res-k', { text: '灵石' }),
        h('span.res-v', { live: 'stone' }),
        h('span.res-sub', { live: 'stoneRate' }),
      ),
      h('div.res', null,
        h('span.res-k', { text: '人民币' }),
        h('span.res-v', { live: 'cny' }),
        h('span.res-sub', { live: 'cnyRate' }),
      ),
      h('div.res', null,
        h('span.res-k', { text: '修为 / 秒' }),
        h('span.res-v', { live: 'cultRate' }),
        h('span.res-sub', { live: 'stageName' }),
      ),
      h('div.rift-chip', null,
        h('span.res-k', { text: `界潮 · 第 ${gameDay(state)} 日` }),
        h('div.flex.gap-2', null,
          h('span.t-xs.t-dim', { text: '→仙' }), riftDots(state.rift.toCultivation, per),
          h('span.t-xs.t-dim', { text: '→现' }), riftDots(state.rift.toModern, per),
        ),
        h('span.res-sub', { live: 'riftCountdown' }),
      ),
      managed && (gameError || gamePending()) ? h('button.btn.btn-sm', { text:'重试确认', disabled:gameBusy, onclick:async ()=>{try {await refreshGame(true);} catch(e){showToast(e.message,'warn');} ctx.rerender();} }) : null,
      h('details.header-settings', null,h('summary', {text:'设置'}),h('div.settings-popover',null,timeCtl,h('button.btn.btn-block.mt-2',{text:'人物与存档',onclick:()=>ctx.navigate('character')}),h('button.btn.btn-block.mt-2',{text:cloudSession ? '云端账号 · 已登录' : '邮箱登录 / 云存档',onclick:()=>showAccount()}))),
    ),
  );

  el.replaceChildren(wrap);
}
