/**
 * views/cultivation.js —— 修炼视图（境界 / 修为 / 突破 / 道途）
 */

import { h, panel, bar, kv } from '../dom.js';
import { FLAT_STAGES, stageInfo, TIER_SUCCESS, BREAKTHROUGH_PITY, BREAKTHROUGH_FAIL_LOSS } from '../../data/realms.js';
import { researchEffects } from '../../data/research.js';
import { computeAttrs } from '../../systems/character.js';
import { cultivationRate, stageProgress, breakthroughInfo, attemptBreakthrough } from '../../systems/cultivation.js';
import { combatPower } from '../../systems/combat.js';
import { PATHS, getPath } from '../../data/paths.js';
import { fmtInt, fmtPct, fmtShort, fmtDuration } from '../../core/util.js';
import { getEvent } from '../../data/worldEvents.js';
import { SIDE, SIDE_NAME } from '../../core/state.js';
import { switchPath, pathSwitchStatus } from '../../systems/gear.js';
import { showToast } from '../dom.js';

function breakthroughModal(state, ctx) {
  const info = breakthroughInfo(state);
  if (!info.available) { showToast(info.reason, 'warn'); return; }
  if (info.locked) { showToast(info.reason, 'warn'); return; }

  const attrs = computeAttrs(state);
  const lossMul = researchEffects(state).breakthroughLossMul;
  const rows = [
    kv('当前境界', `${info.from.realm.name} · ${info.from.stage.name}`),
    kv('目标', info.ascension ? '飞升轮回' : `${info.toRealm.name} · 初期`),
    kv('基础成功率', fmtPct(TIER_SUCCESS[info.from.realm.tier] || 0.1, 0)),
    kv('道途加成', fmtPct(attrs.breakthroughAdd, 0)),
    kv('丹药加成', fmtPct(info.buff, 0)),
    info.eventPenalty ? kv('灵气异常', `-${fmtPct(info.eventPenalty, 0)}`) : null,
    kv('实际成功率', h('strong.t-num', { text: fmtPct(info.chance, 1) })),
    kv('保底进度', `${info.fails} / ${BREAKTHROUGH_PITY} 次失败（第 ${BREAKTHROUGH_PITY + 1} 次必成）`),
    kv('失败代价', `损失当前修为的 ${fmtPct(BREAKTHROUGH_FAIL_LOSS * lossMul, 0)}（不掉境界）`),
  ].filter(Boolean);

  const doIt = () => {
    const res = attemptBreakthrough(state);
    if (!res.ok) { showToast(res.reason, 'warn'); return; }
    ctx.rerender();
    if (res.ascension) {
      if (res.success) ctx.ascendModal();
      else showToast('雷劫未过，修为逸散。', 'warn');
      return;
    }
    if (res.success) showToast('突破成功！', 'good');
    else showToast('突破失败，修为逸散。', 'warn');
  };

  ctx.modal({
    title: info.ascension ? '飞升' : '突破',
    subtitle: info.ascension
      ? '九重雷劫落下的地方，台上的每一道刻痕都是一次没成功的飞升。'
      : '境界之上是境界。修士一生都在做这道选择题。',
    body: h('div', null,
      h('dl', { style: 'margin:0' }, rows),
      h('p.t-sm.t-dim.mt-3', { text: '提示：突破失败不会掉境界，但会散掉一部分修为。三次失败后进入保底。灵科「灵能电池」可让损失减半。' }),
    ),
    actions: [
      { label: '再等等', onClick: () => {} },
      { label: info.ascension ? '渡劫' : '现在突破', primary: true, onClick: doIt },
    ],
  });
}

function pathModal(state, ctx) {
  const sw = pathSwitchStatus(state);
  const first = !state.path;

  const body = h('div', null,
    h('p.t-sm.t-dim.mb-3', {
      text: first
        ? '开局择道。道途不是锁死的——中期可以用灵石改修，或借灵科「技能分支预测」每周免费重选一次。'
        : `改修需要 ${fmtInt(sw.cost)} 灵石${sw.freeUnlocked
          ? (sw.freeReady ? '；本周的免费重选还没用，本次免费。' : `；免费重选还要等 ${fmtDuration(sw.nextFreeMs)}。`)
          : '。'}`,
    }),
    h('div', null, PATHS.map((p) => h('div.rowitem', null,
      h('div.rowitem-main', null,
        h('div.rowitem-title', null,
          h('span.rowitem-name.t-serif', { text: `${p.icon} · ${p.name}` }),
        ),
        h('div.rowitem-meta', { text: p.passive }),
        h('div.t-xs.t-dimmer', { text: `适合：${p.fit}` }),
        h('div.t-xs.t-dim.mt-1', { text: p.desc }),
      ),
      h('div.rowitem-act', null,
        h('button.btn.btn-sm', {
          class: state.path === p.id ? 'btn-solid' : '',
          text: state.path === p.id ? '已在此道' : (first ? '择此道' : (sw.freeReady ? '免费改修' : '改修')),
          disabled: state.path === p.id,
          onclick: () => {
            const r = switchPath(state, p.id);
            if (!r.ok) { showToast(r.reason, 'warn'); return; }
            state.tutorial.done.path = true;
            ctx.closeOverlay();
            ctx.rerender();
            showToast(r.first ? `已选择「${p.name}」之道。` : r.free ? `免费改修「${p.name}」之道。` : `已改修「${p.name}」之道。`, 'good');
          },
        }),
      ),
    ))),
  );
  ctx.modal({
    title: first ? '择道' : '改修',
    subtitle: first ? '你想怎么走这两界之间的路？' : '换一条道，换一种活法。',
    body,
    actions: [{ label: '稍后再说', onClick: () => {} }],
  });
}

export function renderCultivation(state, ctx) {
  const attrs = computeAttrs(state);
  const prog = stageProgress(state);
  const rate = cultivationRate(state, attrs);
  const info = breakthroughInfo(state);
  const cur = stageInfo(state.player.stage);
  const path = getPath(state.path);
  const ev = getEvent(state.market.eventId);

  /* ---- 境界与修为 ---- */
  const main = panel('修炼',
    h('span', { text: `${SIDE_NAME[state.side]} · ${state.side === SIDE.CULTIVATION ? '满速' : '半速（50%）'}` }),
    h('div.flex-between', null,
      h('div', null,
        h('div.t-serif', { style: 'font-size:22px;font-weight:600', text: `${cur.realm.name} · ${cur.stage.name}` }),
        h('div.t-xs.t-dim', { text: cur.realm.desc }),
      ),
      h('div.t-right', null,
        h('div.t-xs.t-dim', { text: '战力' }),
        h('div.t-num.t-lg', { text: fmtInt(combatPower(state)) }),
      ),
    ),

    h('div.mt-4', null,
      bar(prog.ratio, { thick: true, liveKey: 'cultBar' }),
      h('div.bar-cap', null,
        h('span', null, h('span.t-num', { live: 'cultText' })),
        h('span', null, `${fmtShort(rate)} / 秒`),
      ),
    ),

    h('div.mt-3.flex-between', null,
      h('div.t-sm', null,
        h('span.t-dim', { text: '修炼速度加成 ' }),
        h('span.t-num', { text: fmtPct(attrs.cultSpeed, 0) }),
        h('span.t-dim', { text: '（上限 500%）' }),
      ),
      h('div.t-sm', null,
        h('span.t-dim', { text: '当前世界系数 ' }),
        h('span.t-num', { text: state.side === SIDE.CULTIVATION ? '×1.0' : '×0.5' }),
      ),
    ),

    ev.id !== 'calm' ? h('div.mt-3.t-sm', null,
      h('span.tag.tag-ink', { text: '世界事件' }),
      h('span.mt-1', { text: ` ${ev.name} · ${ev.desc}` }),
    ) : null,

    h('hr.hr'),

    /* 突破 */
    info.available ? h('div', null,
      h('div.flex-between', null,
        h('div', null,
          h('h3', { text: `突破至 ${info.toRealm.name}` }),
          h('div.t-xs.t-dim', {
            text: info.locked
              ? '该境界将在正式版开放，你已抵达 MVP 的边界。'
              : `成功率 ${fmtPct(info.chance, 1)}　·　保底 ${info.pityLeft} 次后必成${info.buff ? `　·　丹药 +${fmtPct(info.buff, 0)}` : ''}`,
          }),
        ),
        h('button.btn', {
          class: info.locked ? '' : 'btn-solid',
          text: info.locked ? '尚未开放' : (prog.isTop ? '突破' : '修为未满'),
          disabled: !prog.isTop || info.locked,
          onclick: () => breakthroughModal(state, ctx),
        }),
      ),
      !prog.isTop ? h('p.t-xs.t-dimmer.mt-2', { text: '层内晋升自动完成，无需手动操作。' }) : null,
    ) : h('p.t-sm.t-dim', { text: '当前境界无需突破。' }),
  );

  /* ---- 境界路标 ---- */
  const roadmap = panel('境界路标', `共 ${FLAT_STAGES.length} 阶（九境界已开放）`,
    h('div', { style: 'max-height:340px;overflow:auto' },
      FLAT_STAGES.map((s) => {
        const gi = s.globalIndex;
        const isCur = gi === state.player.stage;
        const passed = gi < state.player.stage;
        return h('div.rowitem', {
          style: 'padding:6px 0;border-bottom:1px dashed var(--line)',
        },
          h('div.rowitem-main', null,
            h('div.rowitem-title', null,
              h('span', {
                class: isCur ? 't-strong' : (passed ? 't-dim' : 't-dimmer'),
                text: `${s.realm.name} · ${s.stage.name}`,
              }),
              isCur ? h('span.tag.tag-ink', { text: '当前' }) : null,
              passed ? h('span.tag', { text: '已过' }) : null,
            ),
            s.stage.note ? h('div.t-xs.t-dimmer', { text: s.stage.note }) : null,
          ),
          h('div.rowitem-act.t-xs.t-num.t-dimmer', { text: fmtInt(s.stage.need) }),
        );
      }),
    ),
  );

  /* ---- 道途 ---- */
  const pathPanel = panel('道途', path ? path.name : '未择道',
    path
      ? h('div', null,
        h('div.t-serif.t-lg', { text: `${path.icon} · ${path.name}` }),
        h('p.t-sm.mt-1', { text: path.passive }),
        h('p.t-xs.t-dim', { text: path.desc }),
        h('div.btn-row.mt-3', null,
          h('button.btn.btn-ghost.btn-sm', { text: '更换道途', onclick: () => pathModal(state, ctx) }),
        ),
      )
      : h('div', null,
        h('p.t-sm.t-dim', { text: '尚未择道。道途提供核心被动，决定 Build 大方向。' }),
        h('button.btn.btn-solid', { text: '择道', onclick: () => pathModal(state, ctx) }),
      ),
  );

  return h('div.flex-col.gap-4', null, main, pathPanel, roadmap);
}

export { pathModal, breakthroughModal };
