/**
 * views/character.js —— 人物：属性 / 装备 / 功法 / 背包（GDD 7 / 9）
 */

import { h, panel, panelFlush, showToast } from '../dom.js';
import {
  computeAttrs, CAPS, ATTR_NAME, ATTR_IS_PCT, SECONDARY_KEYS,
} from '../../systems/character.js';
import { SLOTS, SLOT_MAP, TIER_MAP, tierOf, effectiveStats, equipmentScore } from '../../data/equipment.js';
import {
  equipItem, unequip, enhance, enhancePreview, scrapEquipment, previewBuildSwap,
  equipTech, unequipTech, equipSkill, unequipSkill, upgradeSkill, scrapSkill,
  SKILL_SLOT_KEYS, SKILL_SLOT_LABEL, slotTypeOf,
} from '../../systems/gear.js';
import { ITEM_MAP, CONSUMABLE_MAP, CATEGORIES, getItem } from '../../data/items.js';
import { QUALITY_MAP } from '../../data/dungeons.js';
import { researchEffects } from '../../data/research.js';
import { useConsumable } from '../../systems/gear.js';
import { skillUpgradeCost } from '../../data/skills.js';
import {
  statusSnapshot, exportJSON, exportFileName, importJSON, reset, save,
} from '../../core/save.js';
import { fmtInt, fmtPct, fmtSigned, fmtKg } from '../../core/util.js';

function statText(k, v) {
  if (ATTR_IS_PCT.has(k)) return fmtPct(v, 1);
  return fmtInt(v);
}

function statLines(stats) {
  return Object.entries(stats || {})
    .filter(([, v]) => v)
    .map(([k, v]) => h('span.t-xs.t-dim', null,
      h('span', { text: (ATTR_NAME[k] || k) + ' ' }),
      h('span.t-num', { text: fmtSigned(v, ATTR_IS_PCT.has(k) ? 2 : 0) }),
      h('span.t-dimmer', { text: '　' }),
    ));
}

function buildChanges(p) {
  return h('div', null,
    h('dl.kv', null, h('dt', { text: '估算战力' }), h('dd.t-num', { text: `${fmtInt(p.powerBefore)} → ${fmtInt(p.powerAfter)}` })),
    ...p.changes.filter((x) => ATTR_NAME[x.key]).map((x) => h('dl.kv', null,
      h('dt', { text: ATTR_NAME[x.key] }),
      h('dd.t-num', { text: `${statText(x.key, x.before)} → ${statText(x.key, x.after)}` }))),
    !p.changes.length ? h('p.t-xs.t-dim', { text: '总属性没有变化，可能已达到属性上限。' }) : null,
  );
}

function confirmBuildSwap(state, ctx, kind, uid, key) {
  let p = previewBuildSwap(state, kind, uid, key);
  if (!p.ok) { showToast(p.reason, 'warn'); return; }
  const body = h('div');
  const draw = (changed = false) => body.replaceChildren(
    h('p.t-sm.mb-2', { text: `${p.old?.name || '空槽位'} → ${p.item.name}` }),
    buildChanges(p),
    h('p.t-xs.t-dim.mt-2', { text: changed ? '配装已变化，预览已更新，请再次确认。' : '按整套属性与当前上限比较；估算战力用于参考，原配装会回到库中。' }));
  draw();
  const signature = (v) => JSON.stringify([v.old, v.item, v.before, v.after]);
  ctx.modal({ title: kind === 'skill' ? '功法替换预览' : '装备替换预览', body,
    actions: [{ label: '取消' }, { label: '确认替换', primary: true, keepOpen: true, onClick: () => {
      const current = previewBuildSwap(state, kind, uid, key);
      if (!current.ok) { showToast(current.reason, 'warn'); ctx.closeOverlay(); return; }
      if (signature(current) !== signature(p)) { p = current; draw(true); return; }
      const r = kind === 'skill' ? equipSkill(state, uid, key) : equipItem(state, uid);
      if (!r.ok) { showToast(r.reason, 'warn'); return; }
      ctx.closeOverlay(); ctx.rerender();
    } }],
  });
}

function skillPicker(state, ctx, key) {
  const candidates = state.skillBag.filter((s) => s.slot === slotTypeOf(key));
  ctx.modal({ title: `选择功法 · ${SKILL_SLOT_LABEL[key]}`,
    subtitle: '先比较整套收益，再选择替换',
    body: h('div', null, ...candidates.map((sk) => {
      const p = previewBuildSwap(state, 'skill', sk.uid, key);
      return h('div.rowitem', null,
        h('div.rowitem-main', null,
          h('div.rowitem-name', { text: `${sk.name} · 第 ${sk.level} 重` }),
          h('div.rowitem-meta', { text: `战力 ${fmtInt(p.powerBefore)} → ${fmtInt(p.powerAfter)}` })),
        h('button.btn.btn-sm', { text: '比较此功法', onclick: () => {
          ctx.closeOverlay(); confirmBuildSwap(state, ctx, 'skill', sk.uid, key);
        } }));
    })), actions: [{ label: '返回' }],
  });
}

function skillPreviewModal(state, ctx, key) {
  const sk = state.skills[key];
  if (!sk) return;
  const cur = sk.level;
  const next = cur + 1;
  const curMul = 1 + (cur - 1) * 0.18;
  const nextMul = 1 + (next - 1) * 0.18;
  const cost = skillUpgradeCost(sk);
  const rows = Object.entries(sk.stats || {}).map(([k, v]) => {
    const a = v * curMul;
    const b = v * nextMul;
    return h('dl.kv', null,
      h('dt', { text: ATTR_NAME[k] || k }),
      h('dd', null,
        h('span.t-num.t-dim', { text: ATTR_IS_PCT.has(k) ? fmtPct(a, 1) : fmtInt(a) }),
        h('span.t-dimmer', { text: ' → ' }),
        h('span.t-num.t-strong', { text: ATTR_IS_PCT.has(k) ? fmtPct(b, 1) : fmtInt(b) }),
      ),
    );
  });

  ctx.modal({
    title: '功法模拟',
    subtitle: `${sk.name}　第 ${cur} 重 → 第 ${next} 重`,
    body: h('div', null,
      h('p.t-xs.t-dim.mb-2', { text: '灵科「功法模拟」：先跑一遍模型，再决定要不要把这条经脉走通。' }),
      h('dl', { style: 'margin:0' }, rows),
      h('hr.hr'),
      h('dl', { style: 'margin:0' },
        h('dl.kv', null, h('dt', { text: '消耗灵石' }), h('dd.t-num', { text: fmtInt(cost) })),
        h('dl.kv', null, h('dt', { text: '当前灵石' }), h('dd.t-num', { text: fmtInt(state.currency.stone) })),
      ),
    ),
    actions: [
      { label: '再想想', onClick: () => {} },
      {
        label: '参悟',
        primary: true,
        onClick: () => {
          const r = upgradeSkill(state, key);
          if (!r.ok) showToast(r.reason, 'warn');
          ctx.rerender();
        },
      },
    ],
  });
}

/* ---------------- 存档 ---------------- */
function saveSection(state, ctx) {
  const st = statusSnapshot();
  const ok = !st.lastError;

  const doExport = () => {
    try {
      const text = exportJSON(state);
      const blob = new Blob([text], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = exportFileName();
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      showToast('存档已导出', 'good');
    } catch (e) {
      showToast('导出失败：' + (e?.message || e), 'warn');
    }
  };

  const doImport = (file) => {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const next = importJSON(String(reader.result));
        save(next);
        showToast('存档已导入，正在重新载入…', 'good');
        setTimeout(() => location.reload(), 600);
      } catch (e) {
        showToast('导入失败：文件不是有效的存档', 'warn');
      }
    };
    reader.readAsText(file);
  };

  const confirmReset = () => {
    ctx.modal({
      title: '重置存档',
      subtitle: '此操作不可撤销',
      body: h('div', null,
        h('p.t-sm', { text: '将清空当前存档，从「现代都市 · 开局」重新开始。所有境界、货币、装备、灵田、宗门、轮回点都会丢失。' }),
        h('p.t-xs.t-dim.mt-2', { text: '建议先导出备份。' }),
      ),
      actions: [
        { label: '取消' },
        { label: '确认重置', primary: true, onClick: () => { reset(); location.reload(); } },
      ],
    });
  };

  return panel('存档', st.providers.find((p) => p.id === st.provider)?.label || '本地存档',
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '存档后端' }), h('dd', { text: st.providers.find((p) => p.id === st.provider)?.label || st.provider })),
      h('dl.kv', null, h('dt', { text: '最近保存' }), h('dd.t-num', {
        text: st.lastSavedAt ? new Date(st.lastSavedAt).toLocaleTimeString('zh-CN') : '尚未保存',
      })),
      h('dl.kv', null, h('dt', { text: '保存状态' }), h('dd', {
        class: ok ? 't-fall' : 't-rise',
        text: ok ? '正常' : `失败 ${st.consecutiveFailures} 次：${st.lastError}`,
      })),
    ),
    h('p.t-xs.t-dim.mt-2', { text: st.providers.find((p) => p.id === st.provider)?.hint || '' }),
    !ok ? h('p.t-xs.t-rise.mt-1', { text: '⚠ 存档没有写进去。若是隐私模式请换普通窗口，或先导出备份。' }) : null,
    h('div.btn-row.mt-3', null,
      h('button.btn.btn-sm', { text: '导出存档', onclick: doExport }),
      h('label.btn.btn-sm', { style: 'cursor:pointer' },
        '导入存档',
        h('input', {
          type: 'file',
          accept: 'application/json,.json',
          style: 'display:none',
          onchange: (e) => doImport(e.target.files && e.target.files[0]),
        }),
      ),
      h('button.btn.btn-sm.btn-ghost', { text: '重置存档', onclick: confirmReset }),
    ),
  );
}

export function renderCharacter(state, ctx) {
  const a = computeAttrs(state);
  const fx = researchEffects(state);

  /* ---- 属性 ---- */
  const primary = panel('基础属性', '随境界成长', 
    h('dl', { style: 'margin:0' },
      ['hpMax', 'mpMax', 'atk', 'def', 'spd'].map((k) => h('dl.kv', null,
        h('dt', { text: ATTR_NAME[k] }),
        h('dd.t-num', { text: statText(k, a[k]) }),
      )),
    ),
  );

  const capRow = (k) => {
    const cap = CAPS[k];
    const atCap = a[k] >= cap - 1e-6;
    return h('dl.kv', null,
      h('dt', null,
        h('span', { text: ATTR_NAME[k] }),
        cap ? h('span.t-dimmer', { text: `　上限 ${fmtPct(cap, 0)}` }) : null,
      ),
      h('dd.t-num', { class: atCap ? 't-strong' : '', text: statText(k, a[k]) }),
    );
  };

  const secondary = panel('二级属性', '不随境界自动提升',
    h('dl', { style: 'margin:0' },
      SECONDARY_KEYS.filter((k) => k !== 'hit').map(capRow),
      h('dl.kv', null,
        h('dt', { text: '强化加成' }),
        h('dd.t-num', { text: fmtPct(a.enhanceBonus, 0) }),
      ),
      h('dl.kv', null,
        h('dt', { text: '贸易利润' }),
        h('dd.t-num', { text: fmtPct(a.tradeProfit, 0) }),
      ),
    ),
    h('p.t-xs.t-dimmer.mt-2', { text: '这些词条完全来自装备、功法、道途与研究——这才是 Build 的战场。' }),
  );

  /* ---- 装备 ---- */
  const equipRows = SLOTS.map((slot) => {
    const eq = state.equipment[slot.id];
    const pv = enhancePreview(state, slot.id);
    return h('div.rowitem', null,
      h('div', { style: 'flex:0 0 42px' }, h('span.tag', { text: slot.short })),
      h('div.rowitem-main', null,
        eq
          ? h('div', null,
            h('div.rowitem-title', null,
              h('span.rowitem-name', { class: tierOf(eq).cls, text: eq.name }),
              eq.enhance > 0 ? h('span.tag.tag-outline-ink', { text: `+${eq.enhance}` }) : null,
              h('span.tag', { class: tierOf(eq).cls, text: tierOf(eq).name }),
            ),
            h('div.rowitem-meta', null, ...statLines(effectiveStats(eq, a.enhanceBonus))),
          )
          : h('div.t-sm.t-dimmer', { text: '空' }),
      ),
      h('div.rowitem-act', null,
        eq ? h('button.btn.btn-sm', {
          text: pv && pv.maxed ? '已满' : `强化 ${pv ? fmtInt(pv.cost) : ''}`,
          disabled: !pv || pv.maxed || state.currency.stone < pv.cost,
          title: pv ? `成功率 ${fmtPct(pv.rate, 0)}` : '',
          onclick: () => { const r = enhance(state, slot.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        }) : null,
        eq ? h('button.btn.btn-sm.btn-ghost', { text: '卸下', onclick: () => { unequip(state, slot.id); ctx.rerender(); } }) : null,
      ),
    );
  });

  const equipPanel = panelFlush('装备 · 七部位', `灵石 ${fmtInt(state.currency.stone)}`, ...equipRows);

  /* ---- 现代跨界装备 ---- */
  const techPanel = panelFlush('随身科技装备', '不占背包载重',
    state.tech.length
      ? state.tech.map((t) => h('div.rowitem', null,
        h('div.rowitem-main', null,
          h('div.rowitem-title', null, h('span.rowitem-name', { text: t.name })),
          h('div.rowitem-meta', {
            text: { light_boost: '阴系副本伤害 ×2', poison_immunity: '毒系伤害 ×1.35，额外减伤 20%', heat_shield: '炼狱系额外减伤 25%', flat_atk: `攻击 +${t.stats.atk || 0}` }[t.tech] || '',
          }),
        ),
        h('div.rowitem-act', null,
          h('button.btn.btn-sm.btn-ghost', { text: '收起', onclick: () => { unequipTech(state, t.itemId); ctx.rerender(); } }),
        ),
      ))
      : h('div.empty', { text: '还没有随身科技装备。现代货里的抗生素、强光手电、合金刀可以直接带在身上。' }),
  );

  /* ---- 功法 ---- */
  const skillPanel = state.player.stage >= 4
    ? panelFlush('功法 · 四槽位', `炼气五层已解锁`,
      ...SKILL_SLOT_KEYS.map((key) => {
        const sk = state.skills[key];
        const type = slotTypeOf(key);
        const candidates = state.skillBag.filter((s) => s.slot === type);
        return h('div.rowitem', null,
          h('div', { style: 'flex:0 0 56px' }, h('span.tag', { text: SKILL_SLOT_LABEL[key] })),
          h('div.rowitem-main', null,
            sk
              ? h('div', null,
                h('div.rowitem-title', null,
                  h('span.rowitem-name', { class: TIER_MAP.rare.cls, text: sk.name }),
                  h('span.tag', { text: `第 ${sk.level} 重` }),
                ),
                h('div.rowitem-meta', null, ...statLines(Object.fromEntries(Object.entries(sk.stats).map(([k, v]) => [k, v * (1 + (sk.level - 1) * 0.18)])))),
              )
              : h('div.t-sm.t-dimmer', { text: '空' }),
          ),
          h('div.rowitem-act', null,
            sk ? h('button.btn.btn-sm', {
              text: sk.level >= sk.maxLevel ? '圆满' : (fx.skillPreview ? '预览参悟' : '参悟'),
              disabled: sk.level >= sk.maxLevel,
              onclick: () => {
                if (fx.skillPreview) { skillPreviewModal(state, ctx, key); return; }
                const r = upgradeSkill(state, key);
                if (!r.ok) showToast(r.reason, 'warn');
                ctx.rerender();
              },
            }) : null,
            sk ? h('button.btn.btn-sm.btn-ghost', { text: '取下', onclick: () => { unequipSkill(state, key); ctx.rerender(); } }) : null,
            candidates.length
              ? h('button.btn.btn-sm.btn-solid', {
                text: `换（${candidates.length}）`,
                onclick: () => skillPicker(state, ctx, key),
              })
              : null,
          ),
        );
      }),
      state.skillBag.length
        ? h('div', { style: 'padding:12px 16px;border-top:1px solid var(--line)' },
          h('div.t-xs.t-dim.mb-2', { text: `功法库（${state.skillBag.length}）` }),
          ...state.skillBag.map((s) => h('div.flex-between', { style: 'padding:3px 0' },
            h('span.t-sm', { text: s.name }),
            h('span', null,
              h('span.t-xs.t-dimmer', { text: slotTypeOf('move1') === s.slot ? '招式' : s.slot === 'heart' ? '心法' : '特殊' }),
              h('button.btn.btn-sm.btn-ghost', { style: 'margin-left:8px', text: '散功', onclick: () => { scrapSkill(state, s.uid); ctx.rerender(); } }),
            ),
          )),
        )
        : null,
    )
    : panel('功法', null, h('p.t-sm.t-dim', { text: '炼气五层解锁功法系统（心法 ×1、招式 ×2、特殊 ×1）。' }));

  /* ---- 背包 ---- */
  const bagEquip = panelFlush('装备库', `${state.bag.length} 件`,
    state.bag.length
      ? state.bag
        .slice()
        .sort((x, y) => equipmentScore(y) - equipmentScore(x))
        .map((eq) => h('div.rowitem', null,
          h('div.rowitem-main', null,
            h('div.rowitem-title', null,
              h('span.rowitem-name', { class: tierOf(eq).cls, text: eq.name }),
              eq.enhance > 0 ? h('span.tag.tag-outline-ink', { text: `+${eq.enhance}` }) : null,
              h('span.tag', { class: tierOf(eq).cls, text: tierOf(eq).name }),
              h('span.tag', { text: SLOT_MAP[eq.slot]?.name || eq.slot }),
            ),
            h('div.rowitem-meta', null, ...statLines(effectiveStats(eq, a.enhanceBonus))),
          ),
          h('div.rowitem-act', null,
            h('button.btn.btn-sm.btn-solid', { text: '比较装备', onclick: () => confirmBuildSwap(state, ctx, 'equipment', eq.uid) }),
            h('button.btn.btn-sm.btn-ghost', { text: '分解', onclick: () => { scrapEquipment(state, eq.uid); ctx.rerender(); } }),
          ),
        ))
      : h('div.empty', { text: '装备库是空的。去副本里打点东西回来。' }),
  );

  const goodsRows = state.inventory.map((e) => {
    const it = getItem(e.itemId);
    if (!it) return null;
    const isConsumable = !!CONSUMABLE_MAP[e.itemId];
    const q = QUALITY_MAP[e.quality] || QUALITY_MAP.common;
    return h('div.rowitem', null,
      h('div.rowitem-main', null,
        h('div.rowitem-title', null,
          h('span.rowitem-name', { text: it.name }),
          isConsumable ? h('span.tag', { class: 'q-rare', text: '丹药' }) : null,
          !isConsumable && e.quality !== 'common' ? h('span.tag', { class: q.cls, text: q.name }) : null,
          h('span.tag', { text: `×${e.qty}` }),
        ),
        h('div.rowitem-meta', { text: `${it.weight} kg/件　共 ${(it.weight * e.qty).toFixed(2)} kg` }),
      ),
      h('div.rowitem-act', null,
        isConsumable ? h('button.btn.btn-sm.btn-solid', { text: '使用', onclick: () => { const r = useConsumable(state, e.itemId); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); } }) : null,
        it.equip ? h('button.btn.btn-sm', { text: '随身带', onclick: () => { const r = equipTech(state, e.itemId); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); } }) : null,
      ),
    );
  }).filter(Boolean);

  const bagGoods = panelFlush('货物背包', '载重只算货物，不算装备',
    goodsRows.length ? goodsRows : h('div.empty', { text: '背包是空的。' }),
  );

  return h('div.flex-col.gap-4', null,
    panel('配装准备', '战力用于参考，副本机制同样重要',
      h('p.t-sm', { text: state.player.stage >= 4 ? `功法已装 ${SKILL_SLOT_KEYS.filter(k => state.skills[k]).length} / 4 槽 · 上阵灵兽 ${state.beasts.deployed.length} / 2` : '炼气五层解锁四功法槽，当前可先准备装备与随身科技。' }),
      state.side === 'cultivation'
        ? h('div.btn-row.mt-2', null, h('button.btn.btn-sm', { text: '查看秘境机制', onclick: () => ctx.navigate('dungeon') }), h('button.btn.btn-sm', { text: '调整灵兽', onclick: () => ctx.navigate('farm') }))
        : h('button.btn.btn-sm.mt-2', { text: '前往界门，准备秘境与灵兽', onclick: () => ctx.navigate('gate') })),
    h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px' }, primary, secondary),
    equipPanel, techPanel, skillPanel, bagEquip, bagGoods, saveSection(state, ctx),
  );
}
