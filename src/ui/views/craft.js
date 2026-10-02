/**
 * views/craft.js —— 丹器：炼丹 / 炼器 / 材料库（GDD 11 / 9.2）
 */

import { h, panel, panelFlush, showToast } from '../dom.js';
import { ALCHEMY_RECIPES, FORGE_RECIPES } from '../../data/recipes.js';
import { MATERIALS, CONSUMABLE_MAP, MATERIAL_MAP, getItem } from '../../data/items.js';
import { SLOTS, TIER_MAP, TIERS } from '../../data/equipment.js';
import { recipeStatus as alchemyStatus, craft, alchemyRate, isFirstCraft, sideEffectRate } from '../../systems/alchemy.js';
import { recipeStatus as forgeStatus, forge, forgeRate, forgeScale } from '../../systems/forging.js';
import { computeAttrs } from '../../systems/character.js';
import { countOf } from '../../systems/inventory.js';
import { researchEffects } from '../../data/research.js';
import { fmtInt, fmtPct } from '../../core/util.js';

let forgeSlot = 'weapon';

/** 药性分析仪（GDD 5.2）：首次炼制某种丹药时显示预计成功率、主要属性、副作用概率 */
function firstCraftModal(state, ctx, recipe, onConfirm) {
  const rate = alchemyRate(state, recipe);
  const tox = sideEffectRate(state);
  const out = CONSUMABLE_MAP[recipe.out];

  const effectText = (() => {
    const e = out?.effect;
    if (!e) return '—';
    if (e.type === 'breakthrough') return `突破成功率 +${fmtPct(e.add, 0)}`;
    if (e.type === 'stamina') return `恢复体力 ${e.add}`;
    if (e.type === 'cultivation_boost') return `${(e.durationMs / 3600000).toFixed(0)} 小时内修炼速度 +${fmtPct(e.add, 0)}`;
    if (e.type === 'pity') return `直接推进 ${e.add} 次突破保底`;
    return e.type;
  })();

  ctx.modal({
    title: '药性分析仪',
    subtitle: `首次炼制「${recipe.name}」`,
    body: h('div', null,
      h('p.t-xs.t-dim.mb-2', { text: '灵科「分析丹毒」已接入。先看清数据再开炉——这是现代仪器第一次真正帮上修仙的忙。' }),
      h('dl', { style: 'margin:0' },
        h('dl.kv', null, h('dt', { text: '预计成功率' }), h('dd.t-num.t-strong', { text: fmtPct(rate, 1) })),
        h('dl.kv', null, h('dt', { text: '主要属性' }), h('dd', { text: effectText })),
        h('dl.kv', null, h('dt', { text: '单次产出' }), h('dd', { text: `${out?.name || recipe.out} ×${recipe.qty}` })),
        h('dl.kv', null, h('dt', { text: '失败副作用概率' }), h('dd.t-num', { text: fmtPct(tox, 0) })),
        h('dl.kv', null, h('dt', { text: '副作用内容' }), h('dd', { text: '额外损失一半灵石成本' })),
        h('dl.kv', null, h('dt', { text: '单次灵石成本' }), h('dd.t-num', { text: fmtInt(recipe.cost) })),
      ),
      h('p.t-xs.t-dimmer.mt-3', { text: '提示：丹修道途与「药性数据库」研究都能提高成功率。' }),
    ),
    actions: [
      { label: '再想想', onClick: () => {} },
      { label: '开炉', primary: true, onClick: onConfirm },
    ],
  });
}

function alchemySection(state, ctx) {
  const attrs = computeAttrs(state);
  const fx = researchEffects(state);
  const hasAnalyzer = (fx.alchemyTox ?? 1) < 1;

  const doCraft = (recipe, n) => {
    const run = () => {
      const res = craft(state, recipe.id, n);
      if (!res.ok) showToast(res.reason, 'warn');
      ctx.rerender();
    };
    if (hasAnalyzer && isFirstCraft(state, recipe.id)) {
      firstCraftModal(state, ctx, recipe, () => { ctx.closeOverlay(); run(); });
      return;
    }
    run();
  };

  const rows = ALCHEMY_RECIPES.map((r) => {
    const st = alchemyStatus(state, r.id);
    const locked = state.player.stage < r.unlockStage;
    return h('div.rowitem', null,
      h('div.rowitem-main', null,
        h('div.rowitem-title', null,
          h('span.rowitem-name', { text: r.name }),
          h('span.tag', { class: 'q-rare', text: CONSUMABLE_MAP[r.out]?.name || r.out }),
          locked ? h('span.tag', { text: '境界不足' }) : null,
          h('span.tag', { text: `成功率 ${fmtPct(alchemyRate(state, r), 0)}` }),
          hasAnalyzer && !locked && isFirstCraft(state, r.id) ? h('span.tag.tag-outline-ink', { text: '可分析' }) : null,
        ),
        h('div.rowitem-meta', null,
          ...Object.entries(r.mats).map(([mid, qty]) => h('span', {
            class: countOf(state, mid) >= qty ? '' : 't-rise',
            text: `${MATERIAL_MAP[mid]?.name || mid} ${countOf(state, mid)}/${qty}　`,
          })),
          h('span.t-dimmer', { text: `灵石 ${fmtInt(r.cost)}` }),
        ),
        h('div.t-xs.t-dimmer', { text: r.desc }),
      ),
      h('div.rowitem-act', null,
        h('button.btn.btn-sm', {
          text: '炼 1',
          disabled: locked || !st.ok,
          onclick: () => doCraft(r, 1),
        }),
        h('button.btn.btn-sm.btn-solid', {
          text: '炼 5',
          disabled: locked || !st.matOk || !st.stoneOk,
          onclick: () => doCraft(r, 5),
        }),
      ),
    );
  });

  return panelFlush('炼丹', `丹修加成 +${fmtPct(attrs.alchemy, 0)}　·　药性数据库 +${fmtPct(fx.alchemySuccess, 0)}`,
    ...rows,
    fx.autoAlchemy
      ? h('div', { style: 'padding:10px 16px;border-top:1px solid var(--line)' },
        h('span.t-xs.t-dim', { text: '灵科「自动炼丹机」已启用：每次界潮刷新时自动炼制一批。' }))
      : null,
  );
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
            text: `${st.matName} ${countOf(state, r.mat)}/${r.qty}　`,
          }),
          h('span.t-dimmer', { text: `灵石 ${fmtInt(r.cost)}` }),
        ),
      ),
      h('div.rowitem-act', null,
        h('button.btn.btn-sm.btn-solid', {
          text: `锻造 ${SLOTS.find((s) => s.id === forgeSlot)?.name || ''}`,
          disabled: locked || !st.ok,
          onclick: () => {
            const res = forge(state, r.id, forgeSlot);
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
    alchemySection(state, ctx),
    forgeSection(state, ctx),
    materialSection(state),
  );
}
