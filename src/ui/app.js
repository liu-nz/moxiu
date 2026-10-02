/**
 * app.js —— UI 编排：顶部 / 左栏 / 中栏视图 / 右栏
 */

import { h, panel, panelFlush, bar, mount, resetLive, refreshLive, showToast, modal as domModal, closeOverlay } from './dom.js';
import { renderHome, progressEta } from './views/home.js';
import { renderGate, isCrossing } from './views/gate.js';
import { renderHeader } from './header.js';
import { renderCultivation, pathModal, breakthroughModal } from './views/cultivation.js';
import { renderMarket } from './views/market.js';
import { renderDungeon } from './views/dungeon.js';
import { renderCharacter } from './views/character.js';
import { renderModern } from './views/modern.js';
import { renderFarm } from './views/farm.js';
import { renderCraft } from './views/craft.js';
import { renderResearch } from './views/research.js';
import { renderCompanion } from './views/companion.js';
import { renderEstate } from './views/estate.js';
import { renderReincarnation } from './views/reincarnation.js';
import { renderTradehouse } from './views/tradehouse.js';
import { renderSocial } from './views/social.js';
import { renderLifestyle } from './views/lifestyle.js';

import { on, emit, EV } from '../core/bus.js';
import { SIDE, SIDE_NAME } from '../core/state.js';
import { staminaMax, staminaEta } from '../systems/dungeon.js';
import { computeAttrs } from '../systems/character.js';
import { cultivationRate, stageProgress, breakthroughInfo } from '../systems/cultivation.js';
import { carryCapacity, msToNextRift } from '../systems/rift.js';
import { carryWeight } from '../systems/inventory.js';
import { combatPower } from '../systems/combat.js';
import { totalIncomePerHour } from '../systems/modern.js';
import { rentPerHour } from '../systems/estate.js';
import { pendingTale, resolveTale, taleChoiceStatus } from '../systems/tales.js';
import { ascend, ascensionPreview, chooseFate, FATES, canAscend, fateChoicePending, ASCENSION_RESET, ASCENSION_KEEP } from '../systems/reincarnation.js';
import { rpPerHour } from '../systems/research.js';
import { getPath } from '../data/paths.js';
import { stageInfo } from '../data/realms.js';
import { hotList, demandArrow } from '../systems/market.js';
import { fmtInt, fmtShort, fmtDuration, fmtKg, fmtPct } from '../core/util.js';
import { RANCH_MAP } from '../data/beasts.js';
import { researchEffects } from '../data/research.js';
import { alchemyPlan, nextAlchemyEvent } from '../systems/alchemy.js';
import { investmentAllowed, investmentBudget } from '../systems/finance.js';
import { status as cityStatus, targetProject } from '../systems/projects.js';
import { canResearch } from '../data/research.js';
import { clockHM } from '../core/clock.js';

/* ------------------------------------------------------------------ */
/* 视图表：按当前所在世界分组                                          */
/* ------------------------------------------------------------------ */
export const VIEWS = {
  [SIDE.CULTIVATION]: [
    { id: 'home', name: '首页', render: renderHome },
    { id: 'gate', name: '界门', render: renderGate },
    { id: 'cultivation', name: '修炼', render: renderCultivation },
    { id: 'farm', name: '洞府', render: renderFarm },
    { id: 'craft', name: '丹器', render: renderCraft },
    { id: 'dungeon', name: '秘境', render: renderDungeon },
    { id: 'market', name: '坊市', render: renderMarket },
    { id: 'tradehouse', name: '交易行', render: renderTradehouse },
    { id: 'social', name: '势力', render: renderSocial },
    { id: 'character', name: '人物', render: renderCharacter },
    { id: 'research', name: '灵科', render: renderResearch },
    { id: 'companion', name: '道侣', render: renderCompanion },
    { id: 'reincarnation', name: '轮回', render: renderReincarnation },
  ],
  [SIDE.MODERN]: [
    { id: 'home', name: '首页', render: renderHome },
    { id: 'gate', name: '界门', render: renderGate },
    { id: 'cultivation', name: '修炼', render: renderCultivation },
    { id: 'modern', name: '事业', render: renderModern },
    { id: 'estate', name: '地产', render: renderEstate },
    { id: 'lifestyle', name: '生活', render: renderLifestyle },
    { id: 'market', name: '商城', render: renderMarket },
    { id: 'tradehouse', name: '交易行', render: renderTradehouse },
    { id: 'social', name: '势力', render: renderSocial },
    { id: 'character', name: '人物', render: renderCharacter },
    { id: 'research', name: '灵科', render: renderResearch },
    { id: 'companion', name: '道侣', render: renderCompanion },
    { id: 'reincarnation', name: '轮回', render: renderReincarnation },
  ],
};

let ui = { view: 'home' };
let stateRef = null;
let pending = false;
let lastTaleId = null;

export function getUI() { return ui; }

const ctx = {
  rerender: () => scheduleRender(),
  modal: (opts) => domModal(opts),
  closeOverlay: () => closeOverlay(),
  showToast,
  navigate: (view) => navigate(view),
  offlineReport: null,
  ascendModal: () => openAscendModal(),
  fateModal: () => openFateModal(),
  taleModal: () => openTaleModal(pendingTale(stateRef)),
};

export function scheduleRender() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; render(); });
}

export function navigate(view) {
  if (isCrossing()) return;
  const list = viewsOf(stateRef);
  if (view !== 'more' && !list.some(v => v.id === view)) {
    const other = stateRef.side === SIDE.MODERN ? '修仙界' : '现代都市';
    showToast(`该玩法位于${other}，请先在界门确认穿越。`);
    ui.view = 'gate';
  } else ui.view = view;
  scheduleRender();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function navGroup(view) {
  if (['cultivation','farm','craft','dungeon'].includes(view)) return 'cultivation';
  if (['modern','estate','lifestyle'].includes(view)) return 'modern';
  return ['home','gate'].includes(view) ? view : 'more';
}
function primaryNav(s) {
  return [ {id:'home',name:'首页'}, {id:'cultivation',name:'修行'},
    {id:'gate',name:'界门'}, {id:'modern',name:'经营'}, {id:'more',name:'更多'} ];
}
function moreView(s) {
  return panel('所有玩法', SIDE_NAME[s.side], h('div.menu-grid', null,
    viewsOf(s).filter(v => !['home','gate'].includes(v.id)).map(v => h('button.menu-entry', {
      text:v.name, onclick:()=>navigate(v.id),
    }))),h('p.t-xs.t-dim.mt-3',{text:'灵田、牧场与灵兽在「洞府」；装备与功法在「人物」；宗门与道盟在「势力」。'}));
}

function viewsOf(s) { return VIEWS[s.side] || VIEWS[SIDE.CULTIVATION]; }

function ensureValidView(s) {
  const list = viewsOf(s);
  if (ui.view !== 'more' && !list.some((v) => v.id === ui.view)) ui.view = list[0].id;
}

/* ------------------------------------------------------------------ */
/* 实时数值                                                            */
/* ------------------------------------------------------------------ */
let _attrsTick = -1;
let _attrsVal = null;
function attrsFast(s) {
  const t = Math.floor(s.world.clockMs / 250);
  if (t !== _attrsTick || !_attrsVal) {
    _attrsTick = t;
    _attrsVal = computeAttrs(s);
  }
  return _attrsVal;
}

function liveValue(key) {
  const s = stateRef;
  if (!s) return '';
  if (key.startsWith('investment:')) { const [,kind,id] = key.split(':'); return !investmentAllowed(s,kind,id); }
  if (key.startsWith('projectNotReady:')) return !cityStatus(s,key.split(':')[1])?.canStart;
  if (key.startsWith('researchNotReady:')) return !canResearch(s,key.split(':')[1]).ok;
  if (key.startsWith('farm')) {
    const [kind, index] = key.split(':'), p = s.farm.plots[Number(index)];
    if (kind === 'farmNotReady') return !p || p.readyAt > s.world.clockMs;
    if (kind === 'farmTime') return p ? p.readyAt <= s.world.clockMs ? '已成熟 · 可以收获' : `距成熟 ${fmtDuration(p.readyAt - s.world.clockMs)}` : '空地';
    if (kind === 'farmRatio') return p ? Math.max(0, Math.min(1, (s.world.clockMs - p.plantedAt) / (p.readyAt - p.plantedAt))) : 0;
  }
  if (key.startsWith('ranch')) {
    const [kind, index] = key.split(':'), slot = s.ranch.slots[Number(index)], b = RANCH_MAP[slot?.beastId];
    if (kind === 'ranchTime') return b ? `下批产出 ${fmtDuration(Math.max(0, b.cycleMs - (slot.acc || 0)))}` : '';
    if (kind === 'ranchRatio') return b ? (slot.acc || 0) / b.cycleMs : 0;
  }
  switch (key) {
    case 'investmentAvailable': return `可投资 ¥${fmtInt(investmentBudget(s,0).available)}`;
    case 'cityGoalMissing': { const st = targetProject(s); return st ? `还需灵石 ${fmtInt(st.missing.stone)} · 可投资资金缺口 ¥${fmtInt(st.missing.cny)} · 材料 ${st.mats.filter(m=>m.have<m.need).map(m=>`${m.name}缺${m.need-m.have}`).join('、') || '已备齐'}` : '工程目标已完成。'; }
    case 'alchemyAutoStatus': {
      if (!researchEffects(s).autoAlchemy) return '研究「自动炼丹机」后解锁。';
      if (!s.crafting.autoAlchemy) return '机器已暂停。';
      const st = alchemyPlan(s);
      const waiting = !st.ok ? st.reason : s.currency.stone - st.cost < (s.crafting.reserveStone || 0) ? '资金保留线' : '';
      return `${waiting ? `等待：${waiting}` : `运行：${st.recipe.name} · ${st.aux.name}`} · 下次检查 ${fmtDuration(nextAlchemyEvent(s))}`;
    }
    case 'goalEta': return progressEta(s);
    case 'goalMissing': { const p=stageProgress(s); return `还需 ${fmtInt(Math.max(0,p.need-p.cur))} 修为${p.isTop?' · 跨境界需手动突破':''}`; }
    case 'leisureStatus': return `${s.farm.plots.filter(p=>p && p.readyAt<=s.world.clockMs).length} 块灵田可收获 · 牧场待收 ${s.ranch.slots.reduce((n,x)=>n+(x?.pending||0),0)} 件`;
    case 'noHarvest': return !s.farm.plots.some(p=>p && p.readyAt<=s.world.clockMs);
    case 'noRanch': return !s.ranch.slots.some(x=>x?.pending>0);
    case 'stone': return fmtInt(s.currency.stone);
    case 'cny': return '¥' + fmtInt(s.currency.cny);
    case 'cultRate': return fmtShort(cultivationRate(s, attrsFast(s)));
    case 'stageName': return stageInfo(s.player.stage).stage.name;
    case 'stoneRate': return '修仙界货币';
    case 'cnyRate': return `被动 ¥${fmtInt(totalIncomePerHour(s) + rentPerHour(s))}/时`;
    case 'rp': return fmtInt(s.research?.points || 0);
    case 'rpRate': return `${rpPerHour(s).toFixed(2)} / 时`;
    case 'riftCountdown': return `下次刷新 ${fmtDuration(msToNextRift(s.world.clockMs))}`;
    case 'cultBar': return stageProgress(s).ratio;
    case 'cultText': {
      const p = stageProgress(s);
      return `${fmtInt(p.cur)} / ${fmtInt(p.need)}`;
    }
    case 'weightBar': {
      const cap = carryCapacity(s);
      return cap > 0 ? Math.min(1, carryWeight(s) / cap) : 0;
    }
    case 'weightText': {
      const cap = carryCapacity(s);
      return `载重 ${fmtKg(carryWeight(s))} / ${cap} kg`;
    }
    case 'staminaBar': return s.player.stamina / staminaMax(s);
    case 'staminaText': return `${Math.floor(s.player.stamina)} / ${staminaMax(s)}`;
    case 'staminaRecovery': return staminaEta(s, true) > 0 ? `${fmtDuration(staminaEta(s, true))} 后恢复 1 点 · ${fmtDuration(staminaEta(s))} 后回满（世界时间）` : '体力已满';
    default: return undefined;
  }
}

/* ------------------------------------------------------------------ */
/* 浮层：奇闻 / 飞升 / 天命                                            */
/* ------------------------------------------------------------------ */
export function openTaleModal(tale) {
  if (!tale) return;
  const s = stateRef;
  const body = h('div', null,
    h('p.t-sm', { text: tale.text }),
    h('div.mt-4', null, tale.choices.map((c, i) => h('button.btn.btn-block.mt-2', {
      style: 'text-align:left;white-space:normal;line-height:1.6',
      text: c.label + (taleChoiceStatus(s, c).ok ? '' : ' · 资金不足'),
      disabled: !taleChoiceStatus(s, c).ok,
      onclick: () => {
        const res = resolveTale(s, i);
        if (!res.ok) { showToast(res.reason, 'warn'); return; }
        closeOverlay();
        if (res.ok) {
          domModal({
            title: tale.name,
            subtitle: res.notes.length ? res.notes.join('　·　') : '什么也没发生',
            body: h('p.t-sm', { text: res.text }),
            actions: [{ label: '继续', primary: true }],
          });
        }
        scheduleRender();
      },
    }))),
  );
  domModal({
    title: `奇闻 · ${tale.name}`,
    subtitle: s.side === SIDE.CULTIVATION ? '修仙界' : '现代都市',
    sticky: true,
    body,
    actions: [{ label: '稍后处理' }],
  });
}

export function openAscendModal() {
  const s = stateRef;
  if (!canAscend(s)) { showToast('请先在修炼页圆满修为并渡过雷劫。', 'warn'); return; }
  const preview = ascensionPreview(s);
  domModal({
    title: '飞升轮回',
    subtitle: '九重雷劫已过。两个世界同时在你脚下。',
    sticky: true,
    body: h('div', null,
      h('p.t-sm', { text: `重置：${ASCENSION_RESET}。` }),
      h('p.t-sm.t-dim.mt-2', { text: `保留：${ASCENSION_KEEP}。` }),
      h('hr.hr'),
      ...preview.parts.map((p) => h('div.flex-between', { style: 'padding:3px 0' },
        h('span.t-sm.t-dim', { text: p.label }),
        h('span.t-num.t-sm', { text: `+${p.value}` }),
      )),
      h('div.flex-between.mt-2', { style: 'border-top:1px solid var(--line-ink);padding-top:8px' },
        h('span.t-sm.t-strong', { text: '本次获得轮回点' }),
        h('span.t-num.t-strong', { text: fmtInt(preview.total) }),
      ),
    ),
    actions: [
      { label: '再等等' },
      {
        label: '飞升',
        primary: true,
        onClick: () => {
          const r = ascend(s);
          if (!r.ok) { showToast(r.reason, 'warn'); return; }
          ui.view = 'home';
          scheduleRender();
          openFateModal();
        },
      },
    ],
  });
}

export function openFateModal() {
  const s = stateRef;
  if (!fateChoicePending(s)) return;
  domModal({
    title: '天命',
    subtitle: '每一次轮回，都换一种活法。',
    sticky: true,
    body: h('div', null,
      h('p.t-sm.t-dim.mb-3', { text: '天命本世生效，开局资源只领取一次；下一次轮回可以重选。' }),
      ...FATES.map((f) => h('div.rowitem', null,
        h('div.rowitem-main', null,
          h('div.rowitem-title', null, h('span.rowitem-name.t-serif', { text: `${f.icon} · ${f.name}` })),
          h('div.rowitem-meta', { text: f.effect }),
          h('div.t-xs.t-dimmer', { text: f.fit }),
        ),
        h('div.rowitem-act', null,
          h('button.btn.btn-sm.btn-solid', {
            text: '择此天命',
            onclick: () => {
              const r = chooseFate(s, f.id);
              if (!r.ok) { showToast(r.reason, 'warn'); return; }
              closeOverlay();
              scheduleRender();
            },
          }),
        ),
      )),
    ),
    actions: [],
  });
}

/* ------------------------------------------------------------------ */
/* 左栏                                                                */
/* ------------------------------------------------------------------ */
function leftColumn(s) {
  const attrs = computeAttrs(s);
  const info = stageInfo(s.player.stage);
  const path = getPath(s.path);

  return h('div.flex-col.gap-4', null,
    panel('行者档案', `第 ${(s.reincarnation.count || 0) + 1} 世`,
      h('div.avatar-seal', {text:'墨'}), h('h2.t-center.mt-2', {text:info.stage.name}),
      h('p.t-sm.t-center.t-dim.mt-1', {text:path ? `${path.icon} ${path.name}` : '道途未定'}),
      h('dl.kv',null,h('dt',{text:'战力'}),h('dd.t-num',{text:fmtInt(combatPower(s))})),
      h('dl.kv',null,h('dt',{text:'气血'}),h('dd.t-num',{text:`${fmtInt(s.player.hp ?? attrs.hpMax)} / ${fmtInt(attrs.hpMax)}`})),
      h('dl.kv',null,h('dt',{text:'真元'}),h('dd.t-num',{text:`${fmtInt(s.player.mp ?? attrs.mpMax)} / ${fmtInt(attrs.mpMax)}`})),
      h('div.btn-row.mt-3',null,
        h('button.btn.btn-sm',{text:'装备与功法',onclick:()=>navigate('character')}),
        h('button.btn.btn-sm',{text:'道侣',onclick:()=>navigate('companion')})),
    ),
    panel('成长与日常',null,h('div.menu-grid',null,
      ['cultivation','farm','craft','research','reincarnation'].map(id=>h('button.menu-entry',{text:({cultivation:'修炼',farm:'洞府 · 灵兽',craft:'炼丹 · 炼器',research:'灵科融合',reincarnation:'轮回'})[id],onclick:()=>navigate(id)})))),
  );
}

/* ------------------------------------------------------------------ */
/* 右栏                                                                */
/* ------------------------------------------------------------------ */
function rightColumn(s) {
  const world = s.side;
  const hot = hotList(s, world, 4);

  const marketCard = panelFlush('今日行情', SIDE_NAME[world],
    ...hot.map((x) => {
      const a = demandArrow(x.demand);
      return h('div.rowitem', { style: 'padding:8px 16px' },
        h('div.rowitem-main', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name.t-sm', { text: x.item.name }),
            h('span.t-num', { class: a.cls, text: a.sym }),
          ),
        ),
        h('div.rowitem-act.t-xs.t-dimmer', { text: a.label }),
      );
    }),
    h('div', { style: 'padding:10px 16px;border-top:1px solid var(--line)' },
      h('div.t-xs.t-dim', { text: '这里显示当前世界需求。另一世界行情与背包估价，请在界门查看。' }),
    ),
  );

  const logCard = panelFlush('记事', null,
    h('div.scroll', { style: 'max-height:320px;padding:0 16px' },
      s.log.length
        ? h('div.log-list', null, s.log.slice(-12).reverse().map((l) => h('div.log-item', { class: l.kind },
          h('span.lt', { text: clockHM(l.t) }),
          h('span.lm', { text: l.m }),
        )))
        : h('div.empty', { text: '暂无记录。' }),
    ),
  );

  return h('div.flex-col.gap-4', null, panel('今日界潮', null, h('p.t-sm',{text:`→ 修仙界 ${s.rift.toCultivation} 次 · → 现代 ${s.rift.toModern} 次`}), h('p.t-xs.t-dim.mt-2',{live:'riftCountdown'}),h('button.btn.btn-block.mt-3',{text:'查看界门与背包',onclick:()=>navigate('gate')})), marketCard, logCard);
}

/* ------------------------------------------------------------------ */
/* 中栏                                                                */
/* ------------------------------------------------------------------ */
function midColumn(s) {
  ensureValidView(s);
  const list = viewsOf(s);

  const currentGroup = navGroup(ui.view);
  const tabs = h('nav.viewtabs', {'aria-label':'主要玩法'}, primaryNav(s).map(v=>h('button.viewtab',{
    class:currentGroup===v.id?'on':'', text:v.name, 'aria-current':currentGroup===v.id?'page':null,
    onclick:()=>navigate(v.id),
  })));
  const secondary = list.filter(v=>navGroup(v.id)===currentGroup && !['home','gate'].includes(v.id));
  const subtabs = ['cultivation','modern'].includes(currentGroup) ? h('nav.subtabs',{'aria-label':'玩法分类'},secondary.map(v=>h('button.subtab',{
    text:v.name,class:ui.view===v.id?'on':'',onclick:()=>navigate(v.id),
  }))) : null;
  const view = ui.view==='more' ? {id:'more',render:moreView} : list.find(v=>v.id===ui.view) || list[0];
  let body = null;
  try {
    body = view.render(s, ctx);
  } catch (e) {
    console.error('[view]', view.id, e);
    body = panel('出错了', null, h('p.t-sm', { text: String(e && e.message || e) }));
  }

  return h('div.flex-col.gap-4', null, tabs, subtabs, body);
}

/* ------------------------------------------------------------------ */
/* 主渲染                                                              */
/* ------------------------------------------------------------------ */
export function render() {
  const s = stateRef;
  if (!s) return;
  resetLive();
  document.body.dataset.world = s.side;
  renderHeader(s, ctx);
  mount(document.getElementById('col-left'), leftColumn(s));
  mount(document.getElementById('col-mid'), midColumn(s));
  mount(document.getElementById('col-right'), rightColumn(s));

  const nav = document.getElementById('mobilenav');
  mount(nav, h('div.mobilenav-inner', null,
    primaryNav(s).map(v=>h('button',{
      class:navGroup(ui.view)===v.id?'on':'', 'aria-current':navGroup(ui.view)===v.id?'page':null,
      onclick:()=>navigate(v.id),
    },h('span',{text:v.id==='gate'?'◈':v.id==='home'?'⌂':v.id==='cultivation'?'◇':v.id==='modern'?'▦':'···'}),h('span',{text:v.name}))),
  ));
  refreshLive(liveValue);
}

export function initApp(state, offlineReport = null) {
  stateRef = state;
  ctx.offlineReport = offlineReport;

  on(EV.TICK, () => {
    refreshLive(liveValue);
    if (isCrossing()) return;
    if (fateChoicePending(stateRef)) {
      if (!document.getElementById('overlay-root').childElementCount) openFateModal();
      return;
    }
    const tale = pendingTale(stateRef);
    if (tale && !document.getElementById('overlay-root').childElementCount && stateRef.tales.pending?.id !== lastTaleId) {
      lastTaleId = stateRef.tales.pending?.id;
      openTaleModal(tale);
    }
  });
  on(EV.STATE, scheduleRender);
  on(EV.WORLD, () => { ensureValidView(stateRef); scheduleRender(); });
  on(EV.RIFT, scheduleRender);
  on(EV.TUTORIAL, scheduleRender);
  on(EV.BATTLE, scheduleRender);
  on(EV.BREAKTHROUGH, scheduleRender);
  on(EV.OVERLAY, (p) => {
    if (fateChoicePending(stateRef)) {
      if (!isCrossing() && !document.getElementById('overlay-root').childElementCount) openFateModal();
      return;
    }
    if (p && p.kind === 'tale' && p.tale && !isCrossing() && !document.getElementById('overlay-root').childElementCount) {
      lastTaleId = p.tale.id;
      openTaleModal(p.tale);
    }
  });
  on(EV.LOG, () => {
    if (!initApp._logPending) {
      initApp._logPending = true;
      setTimeout(() => { initApp._logPending = false; scheduleRender(); }, 500);
    }
  });
  on(EV.TOAST, showToast);

  scheduleRender();
}

export { ctx };
