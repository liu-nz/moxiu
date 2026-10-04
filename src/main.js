import {worldState} from './data/worldStates.js';
import {activeBuild} from './data/builds.js';
/** 登录账号使用服务器角色；访客保留本机试玩进度。 */

import { createInitialState } from './core/state.js';
import * as Save from './core/save.js';
import { prepareCloud, passwordRecovery } from './core/cloud.js';
import { loadGame, startGameSync, resetGame } from './core/game.js';
import { isAuthoritative } from './core/authority.js';
import { tutorial_skipTutorial } from './ui/commands.js';
import { bindShardState, shardAction } from './core/shards.js';
import { startLoop, setMode, syncWorldDay } from './core/loop.js';
import { initApp, scheduleRender } from './ui/app.js';
import { modal, showToast, h, kv } from './ui/dom.js';
import { applyOffline } from './systems/offline.js';
import { updateTutorial } from './systems/tutorial.js';
import { stageInfo } from './data/realms.js';
import { offlineProduction } from './ui/views/progression.js';
import { fmtDuration, fmtInt } from './core/util.js';

let state = null;

/** 启动完成信号：外部（测试、调试台）应 await 这个 promise 再取 state */
export const ready = boot().catch((e) => {
  // 启动失败必须让玩家看见，而不是永远卡在启动屏上
  console.error('[boot] 启动失败', e);
  showBootError(e);
  throw e;
});

window.render_game_to_text = () => JSON.stringify({world:state?.side,stage:state?.player.stage,currencies:state?.currency,view:document.querySelector('#col-mid h1, #col-mid h2')?.textContent, pendingTale:state?.tales.pending?.id,commissionCount:state?.commissions.active.length,build:state?activeBuild(state):null,worldState:state?{name:worldState(state).name,phase:worldState(state).phase}:null});

/* 调试入口：同步可得，state 在 ready 之后才有值 */
window.__moxiu = {
  get state() { return state; },
  ready,
  Save,
  reset: async () => { if ((await (isAuthoritative(state) ? resetGame() : Save.resetAsync())).ok) location.reload(); },
};

/* ------------------------------------------------------------------ */
/* 启动屏                                                              */
/* ------------------------------------------------------------------ */
function showBootScreen(msg) {
  const el = document.getElementById('boot-screen');
  if (!el) return;
  el.style.display = 'flex';
  const m = document.getElementById('boot-msg');
  if (m && msg) m.textContent = msg;
}

function hideBootScreen() {
  window.__moxiu_booted = true;
  const fallback = document.getElementById('boot-fallback');
  if (fallback) fallback.style.display = 'none';
  const el = document.getElementById('boot-screen');
  if (el) el.style.display = 'none';
}

function showBootError(err) {
  const el = document.getElementById('boot-screen');
  if (!el) return;
  el.style.display = 'flex';
  el.textContent = '';
  el.appendChild(h('div.bootmark', { text: '墨修' }));
  el.appendChild(h('div.bootmsg', { style: 'animation:none', text: '启动失败' }));
  el.appendChild(h('div.t-xs.t-dim', {
    style: 'max-width:520px;text-align:center;line-height:1.8;margin-top:8px',
    text: String(err && err.message || err),
  }));
  el.appendChild(h('div.t-xs.t-dimmer', {
    style: 'max-width:520px;text-align:center;margin-top:12px',
    text: '进度未被覆盖。请检查网络后重新载入。',
  }));
  el.appendChild(h('button.btn.mt-3', { text: '重新载入', onclick: () => location.reload() }));
}

/* ------------------------------------------------------------------ */
/* 存档解析：先云端，再本地                                             */
/* ------------------------------------------------------------------ */
async function resolveInitialSave(now) {
  const local = Save.load();

  let cloud = null;
  if (Save.isAsyncProvider()) {
    showBootScreen('正在读取云端存档…');
    cloud = await Save.loadAsync();     // 读取失败返回 null，由这里决定回落，不静默降级
  }

  const { pick, conflict } = Save.decideSaveSource(local, cloud);

  if (!conflict) {
    if (pick === 'new') return { state: createInitialState(now), source: 'new' };
    return { state: pick === 'cloud' ? cloud : local, source: pick };
  }

  const chosen = await askLinkChoice(local, cloud);
  showBootScreen('正在载入所选进度…');
  return { state: chosen === 'local' ? local : cloud, source: chosen };
}

function describeSave(s, label) {
  const stage = s.player ? stageInfo(s.player.stage).stage.name : '—';
  const life = ((s.reincarnation?.count || 0) + 1);
  return h('div', { style: 'padding:10px 0;border-bottom:1px dashed var(--line)' },
    h('div.t-sm.t-strong', { text: label }),
    h('div.t-xs.t-dim', {
      text: `${stage}　·　第 ${life} 世　·　游玩 ${fmtDuration(s.playMs || 0)}　·　灵石 ${fmtInt(s.currency?.stone || 0)}`,
    }),
    h('div.t-xs.t-dimmer', {
      text: `最近保存 ${s.savedAt ? new Date(s.savedAt).toLocaleString('zh-CN') : '—'}`,
    }),
  );
}

function askLinkChoice(local, cloud) {
  const boot = document.getElementById('boot-screen');
  if (boot) boot.style.display = 'none';
  return new Promise((resolve) => {
    modal({
      title: '发现两份存档',
      subtitle: '云端和当前账号的本机备份不同，需要你决定用哪一份',
      sticky: true,
      body: h('div', null,
        h('p.t-sm.t-dim.mb-2', { text: '本机备份可能包含尚未上传的操作。选择后将以所选进度继续保存到当前账号。' }),
        describeSave(cloud, '云端存档'),
        describeSave(local, '本地存档'),
      ),
      actions: [
        { label: '用本地存档', onClick: () => resolve('local') },
        { label: '用云端存档', primary: true, onClick: () => resolve('cloud') },
      ],
    });
  });
}

/* ------------------------------------------------------------------ */
/* 启动                                                                */
/* ------------------------------------------------------------------ */
async function boot() {
  const now = Date.now();
  showBootScreen('正在载入…');
  const cloud = await prepareCloud();
  if (cloud) {
    showBootScreen('正在读取服务器角色…');
    const loaded = await loadGame();
    state = loaded.state;
    bindShardState(state);
    await shardAction().catch(() => {});
    initApp(state, loaded.report);
    startGameSync();
    hideBootScreen();
    if (passwordRecovery) (await import('./ui/account.js')).showAccount(true);
    else if (loaded.report) showOfflineReport(loaded.report, 'server');
    return state;
  }

  // 先自检存档后端：隐私模式 / 配额超限要立刻让玩家知道，
  // 而不是等他玩了两小时才发现什么都没存下来。
  const storage = Save.selfCheck();

  const { state: initial, source } = await resolveInitialSave(now);

  state = initial;
  if (!state.player.hp || state.player.hp <= 0) state.player.hp = null;

  Save.bindState(state);
  bindShardState(state);


  // 界潮日初始化 / 补发
  syncWorldDay(state);
  updateTutorial(state);

  // 离线收益（新档没有离线可言）
  const report = source === 'new' ? null : applyOffline(state, now);

  Save.startAutoSave(() => state, 8000);
  Save.installUnloadHook(() => state);
  initApp(state, report);
  startLoop(() => state);
  hideBootScreen();

  if (passwordRecovery) (await import('./ui/account.js')).showAccount(true);
  else if (!storage.ok) showStorageWarning(storage);
  else if (report) showOfflineReport(report, source);
  else if (source === 'new') showWelcome(state);

  return state;
}

const SOURCE_LABEL = { local: '本地存档', cloud: '云端存档', server: '服务器角色', new: '新档' };

function showStorageWarning(storage) {
  modal({
    title: '存档无法写入',
    subtitle: '进度不会被保存',
    sticky: true,
    body: h('div', null,
      h('p.t-sm', { text: storage.message || '浏览器存储不可用。' }),
      h('p.t-sm.mt-2', { text: '常见原因是使用了隐私/无痕窗口，或浏览器存储被策略禁用。' }),
      h('hr.hr'),
      h('p.t-xs.t-dim', { text: '建议：换一个普通窗口重新打开；或在「人物 → 存档」里导出备份，之后导入到可用环境。' }),
    ),
    actions: [{ label: '我知道了', primary: true }],
  });
}

function showOfflineReport(report, source) {
  const signed = (v) => `${v < 0 ? '−' : '+'}${fmtInt(Math.abs(v))}`;
  const rows = [
    kv('存档来源', SOURCE_LABEL[source] || source),
    kv('离线时长', fmtDuration(report.elapsedReal)),
    kv('世界时间推进', fmtDuration(report.worldMs)),
    kv('修为增长', `+${fmtInt(report.cult)}`),
    kv('灵石变化', signed(report.stone)),
    kv('现代资金变化', `¥${signed(report.cny)}`),
    report.rp > 0.5 ? kv('研究点', `+${fmtInt(report.rp)}`) : null,
    report.stageTo > report.stageFrom ? kv('境界推进', `${report.stageFrom + 1} 阶 → ${report.stageTo + 1} 阶`) : null,
    report.capped ? kv('结算上限', '最多结算 3 天') : null,
  ].filter(Boolean);

  modal({
    title: '你不在的时候',
    subtitle: '两界照常运转。当前世界满速结算，另一世界按 50% 结算。',
    body: h('div', null, h('dl', { style: 'margin:0' }, rows), offlineProduction(report)),
    actions: [{ label: '知道了', primary: true }],
  });
}

function showWelcome(s) {
  modal({
    title: '《墨修》',
    subtitle: '两界穿越修仙经营挂机游戏 · 正式版',
    sticky: true,
    body: h('div', null,
      h('p.t-sm', { text: '你在里世界（现代都市）醒来，手里多了一样东西：一道能撕开两个世界的界门。' }),
      h('p.t-sm.mt-2', { text: '表世界是修仙界——修炼、战斗、功法、法宝、宗门、灵兽、灵田、炼丹与飞升。' }),
      h('p.t-sm.mt-2', { text: '里世界是现代都市——科技、资金、商业、研究、地产与休闲生活。' }),
      h('p.t-sm.mt-2', { text: '两边的货币互不相通，两边的物价天差地别。你要做的，是每天借着界潮，把一边觉得廉价的东西，卖到另一边觉得昂贵的市场里。' }),
      h('hr.hr'),
      h('p.t-xs.t-dim', { text: '核心循环：发现机会 → 跨界倒卖 → 获得资本 → 投资生产 → 强化修仙 → 解锁新资源 → 反哺另一世界。' }),
      h('p.t-xs.t-dim.mt-2', { text: '正式版内容：九大境界 · 八大副本与灵脉源头 · 灵田牧场 · 炼丹炼器 · 灵科研究树 · 道侣灵兽 · 地产店铺 · 持续世界状态与十七条故事线 · 轮回与天命。' }),
      h('hr.hr'),
      h('p.t-xs.t-dim', { text: '时间模式：默认为「标准」——世界时钟对齐真实时间，界潮每日 05:00 全服统一刷新。若想快速体验完整流程，可在顶栏「设置」切到「沙盒」，那里可以 1×/10×/60× 快进。' }),
    ),
    actions: [
      { label: '跳过引导', onClick: async () => { await tutorial_skipTutorial(s); scheduleRender(); } },
      { label: '开始', primary: true, onClick: () => { setMode(s, 'standard'); } },
    ],
  });
}
