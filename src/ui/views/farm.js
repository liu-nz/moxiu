/**
 * views/farm.js —— 洞府：灵田 / 灵脉牧场 / 灵兽（GDD 11）
 */

import { h, panel, panelFlush, bar, showToast } from '../dom.js';
import { unlockedCrops, cropYield, CROP_MAP } from '../../data/crops.js';
import { BATTLE_BEASTS, DEPLOY_LIMIT, BEAST_MAX_LEVEL, beastUpgradeCost } from '../../data/beasts.js';
import { farmSummary, plant, plantAll, harvest, harvestAll, buyPlot, setPlotPlan, setFarmAutomation, hasFarmGuard } from '../../systems/farm.js';
import { ranchSummary, buyBeast, buySlot, collect, collectAll, removeBeast, unlockedBeasts as ranchUnlocked, setRanchAutoCollect } from '../../systems/ranch.js';
import { ownedBeasts, deploy, undeploy, upgrade, release } from '../../systems/beasts.js';
import { researchEffects } from '../../data/research.js';
import { productionGoal, reserveField } from './production.js';
import { getItem } from '../../data/items.js';
import { ALCHEMY_RECIPES } from '../../data/recipes.js';
import { fmtInt, fmtDuration, fmtPct } from '../../core/util.js';

function uses(id) {
  return ALCHEMY_RECIPES.filter(r => r.mats[id]).map(r => r.name).join('、') || '贸易 / 材料兑换';
}
function farmSection(state, ctx) {
  const s = farmSummary(state), crops = unlockedCrops(state.player.stage), fx = researchEffects(state);
  const check = r => { if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); };
  const grid = h('div.production-grid', null, s.plots.map(p => {
    const planned = Object.hasOwn(state.farm.plan, p.index) ? state.farm.plan[p.index] : state.farm.lastCrop;
    const selected = CROP_MAP[planned] || crops[0];
    const selector = h('select', { 'aria-label': `第 ${p.index + 1} 块田续种作物`, onchange: e => check(setPlotPlan(state, p.index, e.target.value || null)) },
      h('option', { value: '', selected: planned === null, text: '休耕 · 不自动补种' }),
      crops.map(c => h('option', { value: c.id, selected: planned !== null && c.id === selected.id, text: c.name })));
    return h('div.production-tile', null,
      h('div.rowitem-title', null, h('span.t-sm.t-strong', { text: `田 ${p.index + 1} · ${p.empty ? '空地' : p.crop?.name || '未知作物'}` }),
        p.ready ? h('span.tag.tag-ink', { text: '可收' }) : null),
      !p.empty ? h('div', null, h('div.t-xs.t-dim.mt-1', { live: `farmTime:${p.index}` }), bar(p.ratio, { liveKey: `farmRatio:${p.index}` }),
        h('button.btn.btn-sm.btn-block.mt-2', { text: '收获', disabled: !p.ready, liveDisabled: `farmNotReady:${p.index}`, onclick: () => check(harvest(state, p.index)) })) : null,
      h('label.production-field.mt-2', null, h('span.t-xs.t-dimmer', { text: p.empty ? '播种 / 续种计划' : '下茬续种（不影响本茬）' }), selector),
      h('div.t-xs.t-dim.mt-1', { text: `${selected.name}：${fmtDuration(selected.growMs)} · ${cropYield(selected, s.bonus)} 件 · 种子 ${fmtInt(selected.seedCost)} 灵石` }),
      h('div.t-xs.t-dimmer.mt-1', { text: `用途：${uses(selected.itemId)}` }),
      p.empty ? h('button.btn.btn-sm.btn-block.mt-2', { text: `播种${selected.name}`, disabled: state.currency.stone < selected.seedCost, onclick: () => check(plant(state, p.index, selected.id)) }) : null);
  }));
  return panel('灵田', `${s.unlocked} / ${s.max} 块 · 产量 +${fmtPct(s.bonus, 0)}`,
    h('div.btn-row.mb-3', null,
      h('button.btn.btn-sm.btn-solid', { text: '一键收获', onclick: () => { harvestAll(state); ctx.rerender(); } }),
      crops.map(c => h('button.btn.btn-sm', { text: `空地种${c.name}`, disabled: state.currency.stone < c.seedCost, onclick: () => { plantAll(state, c.id); ctx.rerender(); } })),
      s.unlocked < s.max ? h('button.btn.btn-sm.btn-ghost', { text: `开垦（${fmtInt(s.nextCost)} 灵石）`, disabled: state.currency.stone < s.nextCost, onclick: () => check(buyPlot(state)) }) : null),
    fx.autoFarm ? h('div.production-controls.mb-3', null,
      h('button.btn.btn-sm', { text: `自动收获：${state.farm.autoHarvest ? '开' : '关'}`, onclick: () => check(setFarmAutomation(state, { autoHarvest: !state.farm.autoHarvest })) }),
      h('button.btn.btn-sm', { text: `自动补种：${state.farm.autoReplant ? '开' : '关'}`, onclick: () => check(setFarmAutomation(state, { autoReplant: !state.farm.autoReplant })) }),
      reserveField(state.farm.reserveStone, '补种保留灵石', reserveStone => setFarmAutomation(state, { reserveStone })),
      h('p.t-xs.t-dimmer', { text: '按每块田的计划续种；不够种子费或触及保留线时等待。手动播种不受保留线限制。' })) :
      h('p.t-xs.t-dim.mb-3', { text: '前期手动收种；研究「自动灵田」后，可分别控制收获、续种和资金保留线。' }),
    grid,
    h('p.t-xs.t-dimmer.mt-3', { text: fx.autoFarm || hasFarmGuard(state) ? '灵田有看护，成熟作物可安心保留。' : '成熟后前 12 小时安全；之后无人看护可能被偷吃。上阵战斗灵兽可避免。' }));
}

function ranchSection(state, ctx) {
  const s = ranchSummary(state), beasts = ranchUnlocked(state), fx = researchEffects(state);
  const check = r => { if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); };
  return panel('灵脉牧场', `${s.unlocked} / ${s.max} 栏 · ${s.guarded ? '看护增产 15%' : '无看护'}`,
    h('div.btn-row.mb-3', null,
      h('button.btn.btn-sm.btn-solid', { text: '全部收取', onclick: () => { collectAll(state); ctx.rerender(); } }),
      beasts.map(b => h('button.btn.btn-sm', { text: `买${b.name}（${fmtInt(b.cost)}）`, disabled: state.currency.stone < b.cost || s.slots.every(x => !x.empty), title: b.desc, onclick: () => check(buyBeast(state, b.id)) })),
      s.unlocked < s.max ? h('button.btn.btn-sm.btn-ghost', { text: `扩建（${fmtInt(s.nextCost)} 灵石）`, disabled: state.currency.stone < s.nextCost, onclick: () => check(buySlot(state)) }) : null),
    fx.autoFarm ? h('button.btn.btn-sm.mb-3', { text: `牧场自动收取：${state.ranch.autoCollect ? '开' : '关'}`, onclick: () => check(setRanchAutoCollect(state, !state.ranch.autoCollect)) }) : null,
    h('div.production-grid', null, s.slots.map(slot => slot.empty ? h('div.production-tile', null, h('div.t-xs.t-dimmer', { text: '空栏位 · 购入养殖灵兽即可开始产出' })) :
      h('div.production-tile', null,
        h('div.rowitem-title', null, h('span.t-sm.t-strong', { text: slot.beast.name }), h('span.tag', { text: `待收 ${slot.pending}` })),
        h('div.t-xs.t-dim.mt-1', { text: `${getItem(slot.beast.produceId)?.name} · ${(slot.beast.qty * (s.guarded ? 1.15 : 1)).toFixed(s.guarded ? 2 : 0)} 件 / ${fmtDuration(slot.beast.cycleMs)}` }),
        h('div.t-xs.t-dimmer.mt-1', { text: `用途：${uses(slot.beast.produceId)}` }),
        h('div.t-xs.t-dim.mt-1', { live: `ranchTime:${slot.index}` }),
        bar(slot.ratio, { liveKey: `ranchRatio:${slot.index}` }),
        h('div.btn-row.mt-2', null,
          h('button.btn.btn-sm.btn-solid', { text: '收取', disabled: slot.pending <= 0, onclick: () => check(collect(state, slot.index)) }),
          h('button.btn.btn-sm.btn-ghost', { text: '清栏', onclick: () => ctx.modal({ title: '清理牧场栏位', body: h('p.t-sm', { text: `放归${slot.beast.name}，先自动收取待收产物。购入费用不退还，未完成周期不结算。` }), actions: [{ label: '保留' }, { label: '确认清栏', primary: true, onClick: () => check(removeBeast(state, slot.index)) }] }) }))))),
    h('p.t-xs.t-dimmer.mt-3', { text: '看护增产的小数跨周期累计，满一件入账。养殖产物不会因未收取而消失。' }));
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
    productionGoal(state, ctx),
    farmSection(state, ctx),
    ranchSection(state, ctx),
    beastSection(state, ctx),
  );
}
