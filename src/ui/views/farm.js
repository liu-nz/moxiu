/**
 * views/farm.js —— 洞府：灵田 / 灵脉牧场 / 灵兽（GDD 11）
 */

import { h, panel, panelFlush, bar, showToast } from '../dom.js';
import { unlockedCrops, PLOTS, CROP_MAP } from '../../data/crops.js';
import { RANCH, BATTLE_BEASTS, DEPLOY_LIMIT, BEAST_MAX_LEVEL, beastUpgradeCost } from '../../data/beasts.js';
import { farmSummary, plant, plantAll, harvest, harvestAll, buyPlot, farmBonus } from '../../systems/farm.js';
import { ranchSummary, buyBeast, buySlot, collect, collectAll, removeBeast, unlockedBeasts as ranchUnlocked } from '../../systems/ranch.js';
import { ownedBeasts, deploy, undeploy, upgrade, release, deployedBeasts } from '../../systems/beasts.js';
import { researchEffects } from '../../data/research.js';
import { fmtInt, fmtDuration, fmtPct } from '../../core/util.js';

function farmSection(state, ctx) {
  const s = farmSummary(state);
  const crops = unlockedCrops(state.player.stage);

  const grid = h('div', {
    style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px',
  }, s.plots.map((p) => {
    if (p.empty) {
      return h('div', {
        style: 'border:1px dashed var(--line-2);padding:12px;min-height:104px;display:flex;flex-direction:column;justify-content:space-between',
      },
        h('div.t-xs.t-dimmer', { text: '空地' }),
        h('div.t-xs.t-dim', { text: '选一种作物播种' }),
        h('div.btn-row.mt-2', null,
          crops.slice(0, 2).map((c) => h('button.btn.btn-sm', {
            text: c.name,
            disabled: state.currency.stone < c.seedCost,
            title: `种子 ${c.seedCost} 灵石，${fmtDuration(c.growMs)} 成熟`,
            onclick: () => { const r = plant(state, p.index, c.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
          })),
        ),
      );
    }
    return h('div', {
      style: `border:1px solid ${p.ready ? 'var(--ink)' : 'var(--line)'};padding:12px;min-height:104px;display:flex;flex-direction:column;justify-content:space-between`,
    },
      h('div', null,
        h('div.rowitem-title', null,
          h('span.t-sm.t-strong', { text: p.crop.name }),
          p.ready ? h('span.tag.tag-ink', { text: '可收' }) : h('span.tag', { text: fmtDuration(p.remainMs) }),
        ),
        h('div.mt-2', null, bar(p.ratio, { liveKey: null })),
      ),
      h('button.btn.btn-sm.btn-block.mt-2', {
        class: p.ready ? 'btn-solid' : '',
        text: p.ready ? '收获' : '生长中',
        disabled: !p.ready,
        onclick: () => { const r = harvest(state, p.index); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
      }),
    );
  }));

  return panel('灵田', `${s.unlocked} / ${s.max} 块　·　产量 +${fmtPct(s.bonus, 0)}`,
    h('div.btn-row.mb-3', null,
      h('button.btn.btn-sm.btn-solid', { text: '一键收获', onclick: () => { harvestAll(state); ctx.rerender(); } }),
      ...crops.map((c) => h('button.btn.btn-sm', {
        text: `全种 ${c.name}`,
        title: `种子 ${fmtInt(c.seedCost)} 灵石 / 块　·　${fmtDuration(c.growMs)}`,
        disabled: state.currency.stone < c.seedCost,
        onclick: () => { plantAll(state, c.id); ctx.rerender(); },
      })),
      s.unlocked < s.max
        ? h('button.btn.btn-sm.btn-ghost', {
          text: `开垦新地（${fmtInt(s.nextCost)} 灵石）`,
          disabled: state.currency.stone < s.nextCost,
          onclick: () => { const r = buyPlot(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        })
        : null,
    ),
    grid,
    h('p.t-xs.t-dimmer.mt-3', {
      text: researchEffects(state).autoFarm
        ? '灵科「自动灵田」已启用：成熟自动收获，空地自动补种，也不会再被偷吃。'
        : (deployedBeasts(state).length
          ? '有战斗灵兽看护，成熟未收的作物不会被山里的东西偷吃。'
          : '⚠ 没有战斗灵兽看护。成熟后迟迟不收，作物会被山里的东西偷吃——去「秘境」抓一只上阵。'),
    }),
  );
}

function ranchSection(state, ctx) {
  const s = ranchSummary(state);
  const beasts = ranchUnlocked(state);

  return panel('灵脉牧场', `${s.unlocked} / ${s.max} 栏　·　${s.guarded ? '有战斗灵兽看护，产出 +15%' : '无看护'}`,
    h('div.btn-row.mb-3', null,
      h('button.btn.btn-sm.btn-solid', { text: '全部收取', onclick: () => { collectAll(state); ctx.rerender(); } }),
      ...beasts.map((b) => h('button.btn.btn-sm', {
        text: `买 ${b.name}（${fmtInt(b.cost)}）`,
        disabled: state.currency.stone < b.cost,
        title: b.desc,
        onclick: () => { const r = buyBeast(state, b.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
      })),
      s.unlocked < s.max
        ? h('button.btn.btn-sm.btn-ghost', {
          text: `扩建牧场（${fmtInt(s.nextCost)} 灵石）`,
          disabled: state.currency.stone < s.nextCost,
          onclick: () => { const r = buySlot(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        })
        : null,
    ),
    h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fill,minmax(160px,1fr));gap:10px' },
      s.slots.map((slot) => {
        if (slot.empty) {
          return h('div', { style: 'border:1px dashed var(--line-2);padding:12px;min-height:96px' },
            h('div.t-xs.t-dimmer', { text: '空栏位' }),
            h('div.t-xs.t-dim.mt-1', { text: '买一只养殖灵兽放进来' }),
          );
        }
        return h('div', { style: 'border:1px solid var(--line);padding:12px;min-height:96px;display:flex;flex-direction:column;justify-content:space-between' },
          h('div', null,
            h('div.rowitem-title', null,
              h('span.t-sm.t-strong', { text: slot.beast.name }),
              h('span.tag', { text: `待收 ${slot.pending}` }),
            ),
            h('div.t-xs.t-dim.mt-1', { text: `${slot.beast.qty} 件 / ${fmtDuration(slot.beast.cycleMs)}` }),
            h('div.mt-2', null, bar(slot.ratio)),
          ),
          h('div.btn-row.mt-2', null,
            h('button.btn.btn-sm.btn-solid', {
              text: '收取',
              disabled: slot.pending <= 0,
              onclick: () => { collect(state, slot.index); ctx.rerender(); },
            }),
            h('button.btn.btn-sm.btn-ghost', {
              text: '清栏',
              onclick: () => { removeBeast(state, slot.index); ctx.rerender(); },
            }),
          ),
        );
      })),
  );
}

function beastSection(state, ctx) {
  const owned = ownedBeasts(state);
  const deployed = owned.filter((b) => b.deployed);

  return panelFlush('战斗灵兽', `上阵 ${deployed.length} / ${DEPLOY_LIMIT}`, 
    owned.length
      ? owned.map((b) => h('div.rowitem', null,
        h('div.rowitem-main', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name', { text: b.def.name }),
            h('span.tag', { text: `Lv.${b.level}` }),
            b.deployed ? h('span.tag.tag-ink', { text: '已上阵' }) : null,
            h('span.tag', { class: 'q-epic', text: b.def.trait }),
          ),
          h('div.rowitem-meta', { text: `${b.def.traitDesc}　·　合击系数 ${b.def.atkRatio}` }),
        ),
        h('div.rowitem-act', null,
          b.deployed
            ? h('button.btn.btn-sm.btn-ghost', { text: '撤下', onclick: () => { undeploy(state, b.uid); ctx.rerender(); } })
            : h('button.btn.btn-sm.btn-solid', { text: '上阵', onclick: () => { const r = deploy(state, b.uid); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); } }),
          h('button.btn.btn-sm', {
            text: b.level >= BEAST_MAX_LEVEL ? '满级' : `培养 ${fmtInt(beastUpgradeCost(b, b.level))}`,
            disabled: b.level >= BEAST_MAX_LEVEL || state.currency.stone < beastUpgradeCost(b, b.level),
            onclick: () => { const r = upgrade(state, b.uid); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
          }),
          h('button.btn.btn-sm.btn-ghost', { text: '放归', onclick: () => { release(state, b.uid); ctx.rerender(); } }),
        ),
      ))
      : h('div.empty', { text: '还没有战斗灵兽。副本通关后有概率捕捉到。' }),
    h('div', { style: 'padding:12px 16px;border-top:1px solid var(--line)' },
      h('div.t-xs.t-dim', { text: '可获得：' }),
      h('div.t-xs.t-dimmer.mt-1', {
        text: BATTLE_BEASTS.map((b) => `${b.name}（${b.trait}，需${b.unlockStage >= 38 ? '渡劫' : b.unlockStage >= 22 ? '化神' : b.unlockStage >= 14 ? '金丹' : b.unlockStage >= 10 ? '筑基' : '炼气'}）`).join('　'),
      }),
    ),
  );
}

export function renderFarm(state, ctx) {
  return h('div.flex-col.gap-4', null,
    farmSection(state, ctx),
    ranchSection(state, ctx),
    beastSection(state, ctx),
  );
}
