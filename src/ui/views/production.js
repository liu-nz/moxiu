/** 洞府与炼丹共享同一份目标和材料来源。 */
import { h, panel, showToast } from '../dom.js';
import { ALCHEMY_RECIPES } from '../../data/recipes.js';
import { alchemyPlan, setAlchemyPlan } from '../../systems/alchemy.js';
import { fmtInt } from '../../core/util.js';
export function productionGoal(state, ctx, { showLink = true } = {}) {
  const st = alchemyPlan(state);
  return panel('备料目标', st.recipe?.name || '请选择丹方',
    h('label.production-field', null, h('span.t-xs.t-dim', { text: '准备下一炉' }),
      h('select', { 'aria-label': '备料丹方', onchange: e => { const r = setAlchemyPlan(state, { recipeId: e.target.value }); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); } },
        ALCHEMY_RECIPES.map(r => h('option', { value: r.id, selected: r.id === (state.crafting.selectedRecipe || 'huiyuan'), disabled: state.player.stage < r.unlockStage, text: `${r.name}${state.player.stage < r.unlockStage ? ' · 尚未解锁' : ''}` })))),
    st.mats ? h('div.production-materials.mt-2', null, ...st.mats.map(m => h('div', null,
      h('span.t-sm', { class: m.have >= m.need ? 't-dim' : 't-rise', text: `${m.name} ${fmtInt(m.have)} / ${m.need}${m.have < m.need ? ` · 缺 ${m.need - m.have}` : ' · 已备齐'}` }),
      h('div.t-xs.t-dimmer', { text: m.source })))) : h('p.t-xs', { text: st.reason }),
    showLink ? h('div.btn-row.mt-3', null, h('button.btn.btn-sm', { text: '前往炼丹配置', onclick: () => ctx.navigate('craft') })) : null,
    h('p.t-xs.t-dimmer.mt-2', { text: '备料包含当前辅材方案。选择目标只作提示；自动补种和养殖仍由你安排。' }),
  );
}
export function reserveField(value, label, save) {
  return h('label.production-field', null,
    h('span.t-xs.t-dim', { text: label }),
    h('input', { type: 'number', min: 0, step: 1, value, 'aria-label': label, onchange: e => { const r = save(Number(e.target.value)); if (!r.ok) { showToast(r.reason, 'warn'); e.target.value = value; } } }));
}
