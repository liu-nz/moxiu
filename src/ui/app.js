/**
 * app.js —— UI 编排：顶部 / 左栏 / 中栏视图 / 右栏
 */

import { h, panel, panelFlush, bar, mount, resetLive, refreshLive, showToast, modal as domModal, closeOverlay } from './dom.js';
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
import { isStandard } from '../core/loop.js';
import { SIDE, SIDE_NAME } from '../core/state.js';
import { computeAttrs } from '../systems/character.js';
import { cultivationRate, stageProgress, breakthroughInfo } from '../systems/cultivation.js';
import { canCross, cross, carryCapacity, perDirection, msToNextRift } from '../systems/rift.js';
import { carryWeight } from '../systems/inventory.js';
import { combatPower } from '../systems/combat.js';
import { totalIncomePerHour } from '../systems/modern.js';
import { rentPerHour } from '../systems/estate.js';
import { pendingTale, resolveTale } from '../systems/tales.js';
import { ascend, ascensionPreview, chooseFate, FATES } from '../systems/reincarnation.js';
import { rpPerHour } from '../systems/research.js';
import { getPath } from '../data/paths.js';
import { stageInfo } from '../data/realms.js';
import { TUTORIAL_STEPS } from '../systems/tutorial.js';
import { hotList, demandArrow } from '../systems/market.js';
import { fmtInt, fmtShort, fmtDuration, fmtKg, fmtPct } from '../core/util.js';
import { clockHM } from '../core/clock.js';
import { getItem } from '../data/items.js';

/* ------------------------------------------------------------------ */
/* 视图表：按当前所在世界分组                                          */
/* ------------------------------------------------------------------ */
export const VIEWS = {
  [SIDE.CULTIVATION]: [
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

let ui = { view: 'cultivation' };
let stateRef = null;
let pending = false;
let lastTaleId = null;

export function getUI() { return ui; }

const ctx = {
  rerender: () => scheduleRender(),
  modal: (opts) => domModal(opts),
  closeOverlay: () => closeOverlay(),
  showToast,
  ascendModal: () => openAscendModal(),
  fateModal: () => openFateModal(),
};

export function scheduleRender() {
  if (pending) return;
  pending = true;
  requestAnimationFrame(() => { pending = false; render(); });
}

function viewsOf(s) { return VIEWS[s.side] || VIEWS[SIDE.CULTIVATION]; }

function ensureValidView(s) {
  const list = viewsOf(s);
  if (!list.some((v) => v.id === ui.view)) ui.view = list[0].id;
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
  switch (key) {
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
    case 'staminaBar': return s.player.stamina / 100;
    case 'staminaText': return `${Math.floor(s.player.stamina)} / 100`;
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
      text: c.label,
      onclick: () => {
        const res = resolveTale(s, i);
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
    actions: [],
  });
}

export function openAscendModal() {
  const s = stateRef;
  const preview = ascensionPreview(s);
  domModal({
    title: '飞升轮回',
    subtitle: '九重雷劫已过。两个世界同时在你脚下。',
    sticky: true,
    body: h('div', null,
      h('p.t-sm', { text: '飞升会重置本世的境界、货币、背包、装备、功法、灵田、牧场、灵兽、副本进度与地产。' }),
      h('p.t-sm.t-dim.mt-2', { text: '保留：轮回点、境界图鉴、永久天赋、道侣缘分、灵科研究。' }),
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
          ui.view = 'cultivation';
          scheduleRender();
          openFateModal();
        },
      },
    ],
  });
}

export function openFateModal() {
  const s = stateRef;
  domModal({
    title: '天命',
    subtitle: '每一次轮回，都换一种活法。',
    sticky: true,
    body: h('div', null,
      h('p.t-sm.t-dim.mb-3', { text: '天命永久生效，只能选一个。它决定你下一轮最舒服的路线。' }),
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
              chooseFate(s, f.id);
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
  const prog = stageProgress(s);
  const info = stageInfo(s.player.stage);
  const path = getPath(s.path);
  const bi = breakthroughInfo(s);

  const charCard = panel('修为', h('span', { text: `${fmtShort(cultivationRate(s, attrs))} / 秒` }),
    h('div.flex-between', null,
      h('div', null,
        h('div.t-serif', { style: 'font-size:17px;font-weight:600', text: `${info.realm.name} · ${info.stage.name}` }),
        h('div.t-xs.t-dim', { text: path ? `${path.icon} ${path.name}` : '未择道' }),
      ),
      h('div.t-right', null,
        h('div.t-xs.t-dim', { text: '战力' }),
        h('div.t-num', { text: fmtInt(combatPower(s)) }),
      ),
    ),
    h('div.mt-3', null,
      bar(prog.ratio, { liveKey: 'cultBar' }),
      h('div.bar-cap', null,
        h('span.t-num', { live: 'cultText' }),
        h('span', { text: `+${fmtPct(attrs.cultSpeed, 0)}` }),
      ),
    ),
    prog.isTop && bi.available && !bi.locked
      ? h('button.btn.btn-solid.btn-block.mt-3', {
        text: bi.ascension ? `飞升（${fmtPct(bi.chance, 1)}）` : `突破 ${bi.toRealm.name}（${fmtPct(bi.chance, 1)}）`,
        onclick: () => (bi.ascension ? openAscendModal() : breakthroughModal(s, ctx)),
      })
      : null,
  );

  const gate = panel('界门', `Lv.${s.rift.gateLevel}`,
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '跨界载重' }), h('dd.t-num', { text: `${carryCapacity(s)} kg` })),
      h('dl.kv', null, h('dt', { text: '当前负重' }), h('dd.t-num', { live: 'weightText' })),
      h('dl.kv', null, h('dt', { text: '→ 修仙界' }), h('dd.t-num', { text: `${s.rift.toCultivation} 次` })),
      h('dl.kv', null, h('dt', { text: '→ 现代都市' }), h('dd.t-num', { text: `${s.rift.toModern} 次` })),
      h('dl.kv', null, h('dt', { text: '下次刷新' }), h('dd.t-num', { live: 'riftCountdown' })),
    ),
    h('p.t-xs.t-dimmer.mt-2', { text: `每日双向各 ${perDirection(s)} 次，未使用可累计。付费无法购买额外界潮次数。` }),
    h('p.t-xs.t-dimmer.mt-1', {
      class: isStandard(s) ? 't-jade' : '',
      text: isStandard(s)
        ? '标准模式：世界时钟对齐真实时间，界潮每日 05:00 全服统一刷新。'
        : '沙盒模式：世界时钟按倍率推进，界潮已与全服脱钩。',
    }),
  );

  return h('div.flex-col.gap-4', null, charCard, gate, guideCard(s));
}

function guideCard(s) {
  const stepIdx = s.tutorial.step || 0;
  if (stepIdx >= TUTORIAL_STEPS.length) {
    return panel('新手引导', '已完成',
      h('p.t-sm.t-dim', { text: '引导已走完。接下来就是把它当成一门生意：每天看行情、带货、变强。' }),
    );
  }
  const step = TUTORIAL_STEPS[stepIdx];
  return h('section.guidebar', null,
    h('div.guidebar-main', null,
      h('div.guidebar-step', { text: `引导 ${stepIdx + 1} / ${TUTORIAL_STEPS.length}` }),
      h('h3.t-serif', { text: step.title }),
      h('p.t-sm.mt-1', { text: step.text }),
      step.id === 'path'
        ? h('button.btn.btn-sm.btn-solid.mt-2', { text: '择道', onclick: () => pathModal(s, ctx) })
        : null,
    ),
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
      h('div.t-xs.t-dim', { text: '需求系数越高，在对面世界卖得越贵；同时也意味着本地进价更贵。' }),
    ),
  );

  const bagRows = s.inventory.slice(0, 8);
  const bagCard = panelFlush('背包', `${fmtKg(carryWeight(s))} / ${carryCapacity(s)} kg`,
    bagRows.length
      ? bagRows.map((e) => h('div.rowitem', { style: 'padding:8px 16px' },
        h('div.rowitem-main', null,
          h('span.t-sm', { text: getItem(e.itemId)?.name || e.itemId }),
        ),
        h('div.rowitem-act', null, h('span.t-num.t-xs', { text: `×${e.qty}` })),
      ))
      : h('div.empty', { text: '背包是空的。' }),
  );

  const logCard = panelFlush('记事', null,
    h('div.scroll', { style: 'max-height:320px;padding:0 16px' },
      s.log.length
        ? h('div.log-list', null, s.log.slice(-40).reverse().map((l) => h('div.log-item', { class: l.kind },
          h('span.lt', { text: clockHM(l.t) }),
          h('span.lm', { text: l.m }),
        )))
        : h('div.empty', { text: '暂无记录。' }),
    ),
  );

  return h('div.flex-col.gap-4', null, marketCard, bagCard, logCard);
}

/* ------------------------------------------------------------------ */
/* 中栏                                                                */
/* ------------------------------------------------------------------ */
function midColumn(s) {
  ensureValidView(s);
  const list = viewsOf(s);

  const tabs = h('div.viewtabs', null,
    list.map((v) => h('button.viewtab', {
      class: ui.view === v.id ? 'on' : '',
      text: v.name,
      onclick: () => { ui.view = v.id; scheduleRender(); },
    })),
  );

  const view = list.find((v) => v.id === ui.view) || list[0];
  let body = null;
  try {
    body = view.render(s, ctx);
  } catch (e) {
    console.error('[view]', view.id, e);
    body = panel('出错了', null, h('p.t-sm', { text: String(e && e.message || e) }));
  }

  return h('div.flex-col.gap-4', null, tabs, body);
}

/* ------------------------------------------------------------------ */
/* 主渲染                                                              */
/* ------------------------------------------------------------------ */
export function render() {
  const s = stateRef;
  if (!s) return;
  resetLive();
  renderHeader(s, ctx);
  mount(document.getElementById('col-left'), leftColumn(s));
  mount(document.getElementById('col-mid'), midColumn(s));
  mount(document.getElementById('col-right'), rightColumn(s));

  const nav = document.getElementById('mobilenav');
  const list = viewsOf(s);
  mount(nav, h('div.mobilenav-inner', null,
    list.map((v) => h('button', {
      class: ui.view === v.id ? 'on' : '',
      onclick: () => {
        ui.view = v.id;
        scheduleRender();
        window.scrollTo({ top: 0, behavior: 'smooth' });
      },
    },
      h('span', { text: v.name }),
      h('span.mn-dot', { class: ui.view === v.id ? '' : 'hidden' }),
    )),
  ));
}

export function initApp(state) {
  stateRef = state;

  on(EV.TICK, () => {
    refreshLive(liveValue);
    const tale = pendingTale(stateRef);
    if (tale && stateRef.tales.pending?.id !== lastTaleId) {
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
    if (p && p.kind === 'tale' && p.tale) {
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
