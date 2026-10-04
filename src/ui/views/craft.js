/**
 * views/craft.js —— 丹器：炼丹 / 炼器 / 材料库（GDD 11 / 9.2）
 */

import { h, panel, panelFlush, showToast } from '../dom.js';
import { ALCHEMY_RECIPES, ALCHEMY_MAP, FORGE_RECIPES } from '../../data/recipes.js';
import { MATERIALS, getItem } from '../../data/items.js';
import { SLOTS } from '../../data/equipment.js';
import { recipeStatus as alchemyStatus, alchemyPlan, AUTO_ALCHEMY_INTERVAL, alchemyEconomics } from '../../systems/alchemy.js';
import { alchemy_craft as craft, alchemy_setAlchemyPlan as setAlchemyPlan } from '../commands.js';
import { recipeStatus as forgeStatus, forgeRate, forgeScale } from '../../systems/forging.js';
import { forging_forge as forge } from '../commands.js';
import { computeAttrs } from '../../systems/character.js';
import { countOf } from '../../systems/inventory.js';
import { researchEffects } from '../../data/research.js';
import { AUXILIARIES, PILL_QUALITY, pillDescription } from '../../data/alchemy.js';
import { productionGoal, reserveField } from './production.js';
import { fmtInt, fmtPct, fmtDuration } from '../../core/util.js';

let forgeSlot = 'weapon';

function craftConfirmation(state, ctx, id, auxId, requested, notice = '') {
  const st = alchemyStatus(state, id, auxId);
  if (!st.ok) { showToast(st.reason, 'warn'); ctx.rerender(); return; }
  const n = Math.min(requested, st.maxAttempts);
  const signature = JSON.stringify([st.cost, st.rate, st.tox, st.recipe.qty, st.mats.map(m => [m.id, m.need]), n]);
  ctx.modal({ title: '开炉确认', subtitle: `${st.recipe.name} · ${st.aux.name} · 最多 ${n} 炉`,
    body: h('div', null,
      notice ? h('p.t-xs.t-rise.mb-2', { text: notice }) : null,
      h('p.t-sm.mb-3', { text: `每炉成功率 ${fmtPct(st.rate, 1)}，成功产出 ${st.recipe.qty} 枚。` }),
      st.mats.map(m => h('dl.kv', null, h('dt', { text: m.name }), h('dd', { text: `${m.need * n}（现有 ${fmtInt(m.have)}）` }))),
      h('dl.kv', null, h('dt', { text: '基础灵石支出' }), h('dd', { text: `${fmtInt(st.cost * n)}（每炉 ${fmtInt(st.cost)}）` })),
      h('p.t-xs.t-dim.mt-3', { text: `失败会消耗本炉全部材料；失败后 ${fmtPct(st.tox, 1)} 概率反噬，额外损失本炉一半灵石成本（${fmtInt(Math.round(st.cost * .5))}）。资金不足会提前结束。` }),
      h('p.t-xs.t-dim.mt-2', { text: `成功后品质：普通 ${fmtPct(1 - st.aux.fine - st.aux.rare, 0)} / 优质 ${fmtPct(st.aux.fine, 0)} / 稀有 ${fmtPct(st.aux.rare, 0)}。` }),
      Object.keys(PILL_QUALITY).map(q => h('p.t-xs.mt-2', { text: `${PILL_QUALITY[q].name}：${pillDescription(st.recipe.out, q)}` }))),
    actions: [{ label: '返回配置' }, { label: '确认开炉', primary: true, keepOpen: true, onClick: async () => {
      const current = alchemyStatus(state, id, auxId);
      if (!current.ok) { showToast(current.reason, 'warn'); return; }
      const nowSignature = JSON.stringify([current.cost, current.rate, current.tox, current.recipe.qty, current.mats.map(m => [m.id, m.need]), Math.min(requested, current.maxAttempts)]);
      if (signature !== nowSignature) { ctx.closeOverlay(); craftConfirmation(state, ctx, id, auxId, requested, '材料、可炼炉数或成功率已变化，请再次确认。'); return; }
      const result = await craft(state, id, n, { auxId });
      if (!result.ok) { showToast(result.reason, 'warn'); return; }
      ctx.closeOverlay(); ctx.rerender();
    } }],
  });
}
function alchemySection(state, ctx) {
  const fx = researchEffects(state), attrs = computeAttrs(state), st = alchemyPlan(state);
  const id = state.crafting.selectedRecipe || 'huiyuan', auxId = state.crafting.selectedAux || 'plain';
  const change = async options => { const r = await setAlchemyPlan(state, options); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); };
  return panel('炼丹配置', `丹修 +${fmtPct(attrs.alchemy, 0)} · 药性数据库 +${fmtPct(fx.alchemySuccess, 0)}`,
    h('p.t-sm.mb-3', { text: `${st.recipe?.name || '丹方不可用'}：${st.recipe?.desc || st.reason}` }),
    h('div.production-grid.mb-3', null, AUXILIARIES.map(a => h('button.btn.production-choice', {
      class: auxId === a.id ? 'btn-solid' : '', disabled: state.player.stage < a.stage, 'aria-label': `辅材方案${a.name}`,
      onclick: async () => await change({ auxId: a.id }),
    }, h('span.t-strong', { text: `${a.name}${state.player.stage < a.stage ? ' · 尚未解锁' : ''}` }),
      h('span.t-xs', { text: a.desc }), h('span.t-xs', { text: `辅材：${Object.entries(a.mats).map(([id, n]) => `${getItem(id)?.name} ×${n}`).join('、') || '无'} · 加费 ${a.cost} 灵石` })))),
    st.recipe ? h('div', null,
      h('div.btn-row.mb-2', null, h('span.tag.tag-ink', { text: `成功率 ${fmtPct(st.rate, 1)}` }), h('span.tag', { text: `每炉 ${fmtInt(st.cost)} 灵石` }), h('span.tag', { text: `最多可开 ${st.maxAttempts} 炉（未含反噬）` })),
      h('p.t-xs.t-dim', { text: `成功产出 ${st.recipe.qty} 枚 · 失败后反噬概率 ${fmtPct(st.tox, 1)} · 成功后优质 ${fmtPct(st.aux.fine, 0)} / 稀有 ${fmtPct(st.aux.rare, 0)}` }),
      h('p.t-xs.t-dimmer.mt-2', { text: pillDescription(st.recipe.out) }),
      h('p.t-xs.t-dimmer.mt-2', { text: '主辅材品质不改变开炉参数；优先消耗普通材料，普通材料用完后才使用更高品质。' }),
      h('div.btn-row.mt-3', null,
        h('button.btn.btn-sm', { text: '准备 1 炉', disabled: !st.ok, onclick: () => craftConfirmation(state, ctx, id, auxId, 1) }),
        h('button.btn.btn-sm.btn-solid', { text: '准备最多 5 炉', disabled: !st.ok, onclick: () => craftConfirmation(state, ctx, id, auxId, 5) })),
      !st.ok ? h('p.t-xs.t-rise.mt-2', { text: st.reason }) : null) : null,
    st.recipe ? h('details.mt-3', null, h('summary.t-sm',{text:'辅材长期产出比较'}),
      h('p.t-xs.t-dim.mt-2',{text:'以下是大量开炉的数学期望，不保证单次结果。灵石成本包含平均反噬，不包括材料价值；主辅材仍按上方实际数量消耗。品质强度是丹药基础强度，具体丹药按实际效果取整。'}),
      AUXILIARIES.map(aux=>{const e=alchemyEconomics(state,id,aux.id);return h('p.t-xs.mt-2',{text:`${aux.name}${e.locked?' · 尚未解锁':''}：平均每炉${e.expectedPills.toFixed(2)}枚 · 每成丹约${e.stonePerPill.toFixed(1)}灵石 · 成功后平均基础强度${(e.meanPotency*100).toFixed(1)}% · 每100炉约${e.rarePer100.toFixed(1)}炉出稀有`});})) : null,
    h('div.production-controls.mt-3', null,
      h('button.btn.btn-sm', { text: `自动炼丹：${state.crafting.autoAlchemy ? '开' : '关'}`, disabled: !fx.autoAlchemy, onclick: async () => await change({ on: !state.crafting.autoAlchemy }) }),
      reserveField(state.crafting.reserveStone || 0, '炼丹保留灵石', async reserveStone => await setAlchemyPlan(state, { reserveStone })),
      h('p.t-xs.t-dim', { live: 'alchemyAutoStatus' }),
      h('p.t-xs.t-dimmer', { text: `研究解锁后需手动开启；每 ${fmtDuration(AUTO_ALCHEMY_INTERVAL)} 世界时间最多开 3 炉。只用本页丹方和辅材，缺料或触及预算线则等待。反噬也不突破保留线；手动开炉不受此线限制。墨瑶的每日代炼独立于机器，同样遵守本页方案与预算。` })),
    h('details.mt-3', null, h('summary.t-sm', { text: '全部丹方与解锁' }),
      ALCHEMY_RECIPES.map(r => h('div.rowitem', null, h('div.rowitem-main', null, h('div.t-sm', { text: r.name }), h('div.t-xs.t-dim', { text: r.desc })), h('button.btn.btn-sm', { text: state.player.stage < r.unlockStage ? '境界不足' : '选择丹方', disabled: state.player.stage < r.unlockStage, onclick: async () => await change({ recipeId: r.id }) })))),
    state.crafting.history?.length ? h('details.mt-3', null, h('summary.t-sm', { text: '最近开炉记录（最多 10 批）' }), state.crafting.history.slice().reverse().map(r => h('p.t-xs.mt-2', { text: `${ALCHEMY_MAP[r.recipeId]?.name} · ${AUXILIARIES.find(a => a.id === r.auxId)?.name}：${r.attempts} 炉 / 成丹 ${r.made} / 失败 ${r.failed} / 反噬 ${fmtInt(r.extraLoss)} 灵石${Object.entries(r.grades).map(([q, n]) => ` · ${PILL_QUALITY[q]?.name} ${n}`).join('')}` }))) : null);
}

function forgeSection(state, ctx) {
  const attrs = computeAttrs(state);
  const fx = researchEffects(state);

  const slotPicker = h('div.btn-row.mb-3', null,
    SLOTS.map((s) => h('button.btn.btn-sm', {
      class: forgeSlot === s.id ? 'btn-solid' : '',
      text: s.name,
      onclick: () => { forgeSlot = s.id; ctx.rerender(); },
    })),
  );

  const rows = FORGE_RECIPES.map((r) => {
    const st = forgeStatus(state, r.id);
    const locked = state.player.stage < r.unlockStage;
    return h('div.rowitem', null,
      h('div.rowitem-main', null,
        h('div.rowitem-title', null,
          h('span.rowitem-name', { text: r.name }),
          h('span.tag', { class: 'q-epic', text: st.tierRange }),
          locked ? h('span.tag', { text: '境界不足' }) : null,
          h('span.tag', { text: `成功率 ${fmtPct(forgeRate(state, r), 0)}` }),
        ),
        h('div.rowitem-meta', null,
          h('span', {
            class: countOf(state, r.mat) >= r.qty ? '' : 't-rise',
            text: `${st.matName || getItem(r.mat)?.name || r.mat} ${countOf(state, r.mat)}/${r.qty}　`,
          }),
          h('span.t-dimmer', { text: `灵石 ${fmtInt(r.cost)}` }),
        ),
      ),
      h('div.rowitem-act', null,
        h('button.btn.btn-sm.btn-solid', {
          text: `锻造 ${SLOTS.find((s) => s.id === forgeSlot)?.name || ''}`,
          disabled: locked || !st.ok,
          onclick: async () => {
            const res = await forge(state, r.id, forgeSlot);
            if (!res.ok) showToast(res.reason, 'warn');
            ctx.rerender();
          },
        }),
      ),
    );
  });

  return panel('炼器', `器修加成 +${fmtPct(attrs.forge, 0)}　·　当前规模 ${fmtInt(forgeScale(state))}`,
    h('p.t-sm.t-dim.mb-2', { text: '选择要打造的部位，再选一份图谱。品阶由材料档位决定。' }),
    slotPicker,
    h('div', { style: 'margin:0 -16px -16px' }, ...rows),
    fx.forgeTierUp
      ? h('p.t-xs.t-dim.mt-3', { text: `灵科「合金融融」已启用：有 ${fmtPct(fx.forgeTierUp, 0)} 概率产出更高一阶。` })
      : null,
  );
}

function materialSection(state) {
  const rows = MATERIALS.filter((m) => countOf(state, m.id) > 0);
  return panelFlush('材料库', `${rows.length} 种`,
    rows.length
      ? rows.map((m) => h('div.rowitem', { style: 'padding:8px 16px' },
        h('div.rowitem-main', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name.t-sm', { text: m.name }),
            h('span.tag', { text: `T${m.tier}` }),
            h('span.tag', { text: `×${countOf(state, m.id)}` }),
          ),
          researchEffects(state).matInfo ? h('div.t-xs.t-dim', { text: m.desc }) : null,
        ),
      ))
      : h('div.empty', { text: '还没有材料。副本掉落与牧场产出都会进这里。' }),
    h('div', { style: 'padding:10px 16px;border-top:1px solid var(--line)' },
      h('div.t-xs.t-dim', { text: '材料可以在「灵科」里兑换研究点。' }),
    ),
  );
}

export function renderCraft(state, ctx) {
  return h('div.flex-col.gap-4', null,
    productionGoal(state, ctx, { showLink: false }),
    alchemySection(state, ctx),
    forgeSection(state, ctx),
    materialSection(state),
  );
}
