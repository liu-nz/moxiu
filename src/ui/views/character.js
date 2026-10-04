import {affixDescription} from '../../data/affixes.js';
/**
 * views/character.js —— 人物：属性 / 装备 / 功法 / 背包（GDD 7 / 9）
 */

import { h, panel, panelFlush, showToast } from '../dom.js';
import {
  computeAttrs, CAPS, ATTR_NAME, ATTR_IS_PCT, SECONDARY_KEYS,
} from '../../systems/character.js';
import { SLOTS, SLOT_MAP, TIER_MAP, tierOf, effectiveStats, equipmentScore } from '../../data/equipment.js';
import { enhancePreview, previewBuildSwap, SKILL_SLOT_KEYS, SKILL_SLOT_LABEL, slotTypeOf } from '../../systems/gear.js';
import { gear_equipItem as equipItem, gear_unequip as unequip, gear_enhance as enhance, gear_scrapEquipment as scrapEquipment, gear_equipTech as equipTech, gear_unequipTech as unequipTech, gear_equipSkill as equipSkill, gear_unequipSkill as unequipSkill, gear_upgradeSkill as upgradeSkill, gear_scrapSkill as scrapSkill } from '../commands.js';
import { ITEM_MAP, CONSUMABLE_MAP, CATEGORIES, getItem } from '../../data/items.js';
import { QUALITY_MAP } from '../../data/dungeons.js';
import { researchEffects } from '../../data/research.js';
import { pillDescription } from '../../data/alchemy.js';
import { gear_useConsumable as useConsumable } from '../commands.js';
import { skillUpgradeCost } from '../../data/skills.js';
import {
  statusSnapshot, exportJSON, exportFileName, importJSON, resetAsync, saveAsync, stopAutoSave, startAutoSave,
} from '../../core/save.js';
import { showAccount, accountIdentity } from '../account.js';
import { fmtInt, fmtPct, fmtSigned, fmtKg } from '../../core/util.js';
import { collectionSections } from '../../systems/collection.js';
import { isAuthoritative } from '../../core/authority.js';
import { refreshGame, resetGame, gameBusy, gameError, gamePending, marketLinked } from '../../core/game.js';

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
    actions: [{ label: '取消' }, { label: '确认替换', primary: true, keepOpen: true, onClick: async () => {
      const current = previewBuildSwap(state, kind, uid, key);
      if (!current.ok) { showToast(current.reason, 'warn'); ctx.closeOverlay(); return; }
      if (signature(current) !== signature(p)) { p = current; draw(true); return; }
      const r = kind === 'skill' ? await equipSkill(state, uid, key) : await equipItem(state, uid);
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
        onClick: async () => {
          const r = await upgradeSkill(state, key);
          if (!r.ok) showToast(r.reason, 'warn');
          ctx.rerender();
        },
      },
    ],
  });
}

/* ---------------- 存档 ---------------- */
function saveSection(state, ctx) {
  if (isAuthoritative(state)) return panel('服务器角色', gameBusy ? '正在确认' : gameError ? '连接待确认' : '已保存',
    h('p.t-sm', {text:'所有页面共用同一份角色进度。操作成功即保存；生产与离线收益按服务器时间结算。'}),
    h('p.t-xs.t-dim.mt-2', {text:'服务器角色不接受本机存档导入，也不能使用沙盒快进。'}),
    marketLinked ? h('p.t-xs.mt-2', {text:'已参与玩家交易：清档不会再发放开局资金。有托管挂单时请先撤回；论道积分与每日次数绑定账号。'}) : null,
    gameError ? h('p.t-xs.t-fall.mt-2',{role:'alert',text:gameError}) : null,
    h('div.btn-row.mt-3',null,
      h('button.btn.btn-sm',{text:'刷新角色',disabled:gameBusy,onclick:async ()=>{try {await refreshGame();}catch(e){showToast(e.message,'warn');}ctx.rerender();}}),
      gamePending() ? h('button.btn.btn-sm',{text:'重试原操作',disabled:gameBusy,onclick:async ()=>{try {await refreshGame(true);}catch(e){showToast(e.message,'warn');}ctx.rerender();}}) : null,
      h('button.btn.btn-sm',{text:'邮箱账号',onclick:()=>showAccount()}),
      h('button.btn.btn-sm.btn-ghost',{text:'重置角色',disabled:gameBusy||!!gamePending(),onclick:()=>ctx.modal({
        title:'重置服务器角色',body:h('p',{text:'清空游戏进度，重新从现代都市开始。邮箱账号、UID、天道碎片和已购权益保留。'}),
        actions:[{label:'取消'},{label:'确认重置',primary:true,onClick:async()=>{const r=await resetGame();if(!r.ok)showToast(r.reason,'warn');ctx.rerender();}}]})})));
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
    reader.onload = async () => {
      try {
        const next = importJSON(String(reader.result));
        stopAutoSave({ pauseUnload: true });
        const result = await saveAsync(next);
        if (!result.ok) throw new Error(result.message);
        showToast('存档已导入，正在重新载入…', 'good');
        setTimeout(() => location.reload(), 600);
      } catch (e) {
        startAutoSave(() => state, st.provider === 'cloud' ? 30000 : 8000);
        showToast('导入失败：' + (e.message || '文件不是有效的存档'), 'warn');
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
        { label: '确认重置', primary: true, onClick: async () => {
          const result = await resetAsync();
          if (result.ok) location.reload();
          else showToast(result.message || '重置失败，原进度仍保留', 'warn');
        } },
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
      h('button.btn.btn-sm', { text: '云端账号', onclick: () => showAccount() }),
      h('button.btn.btn-sm', { text: '立即保存', onclick: async () => {
        const result = await saveAsync(state);
        showToast(result.ok ? '存档已保存' : result.message, result.ok ? 'good' : 'warn');
        ctx.rerender();
      } }),
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
            affixDescription(eq)?h('p.t-xs.t-jade',{text:affixDescription(eq)}):null,
            eq.set==='blackwater'?h('p.t-xs.t-dim',{text:'黑水套装：两件提高毒丹流持续毒伤25%。'}):null,
          )
          : h('div.t-sm.t-dimmer', { text: '空' }),
      ),
      h('div.rowitem-act', null,
        eq ? h('button.btn.btn-sm', {
          text: pv && pv.maxed ? '已满' : `强化 ${pv ? fmtInt(pv.cost) : ''}`,
          disabled: !pv || pv.maxed || state.currency.stone < pv.cost,
          title: pv ? `成功率 ${fmtPct(pv.rate, 0)}` : '',
          onclick: async () => { const r = await enhance(state, slot.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        }) : null,
        eq ? h('button.btn.btn-sm.btn-ghost', { text: '卸下', onclick: async () => { await unequip(state, slot.id); ctx.rerender(); } }) : null,
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
          h('button.btn.btn-sm.btn-ghost', { text: '收起', onclick: async () => { await unequipTech(state, t.itemId); ctx.rerender(); } }),
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
              onclick: async () => {
                if (fx.skillPreview) { skillPreviewModal(state, ctx, key); return; }
                const r = await upgradeSkill(state, key);
                if (!r.ok) showToast(r.reason, 'warn');
                ctx.rerender();
              },
            }) : null,
            sk ? h('button.btn.btn-sm.btn-ghost', { text: '取下', onclick: async () => { await unequipSkill(state, key); ctx.rerender(); } }) : null,
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
              h('button.btn.btn-sm.btn-ghost', { style: 'margin-left:8px', text: '散功', onclick: async () => { await scrapSkill(state, s.uid); ctx.rerender(); } }),
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
            affixDescription(eq)?h('p.t-xs.t-jade',{text:affixDescription(eq)}):null,
            eq.set==='blackwater'?h('p.t-xs.t-dim',{text:'黑水套装：两件提高毒丹流持续毒伤25%。'}):null,
          ),
          h('div.rowitem-act', null,
            h('button.btn.btn-sm.btn-solid', { text: '比较装备', onclick: () => confirmBuildSwap(state, ctx, 'equipment', eq.uid) }),
            h('button.btn.btn-sm.btn-ghost', { text: '分解', onclick: async () => { await scrapEquipment(state, eq.uid); ctx.rerender(); } }),
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
          e.quality !== 'common' ? h('span.tag', { class: q.cls, text: q.name }) : null,
          h('span.tag', { text: `×${e.qty}` }),
        ),
        h('div.rowitem-meta', { text: isConsumable ? pillDescription(e.itemId, e.quality) : `${it.weight} kg/件　共 ${(it.weight * e.qty).toFixed(2)} kg` }),
      ),
      h('div.rowitem-act', null,
        isConsumable ? h('button.btn.btn-sm.btn-solid', { text: '使用', onclick: async () => { const r = await useConsumable(state, e.itemId, e.uid); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); } }) : null,
        it.equip ? h('button.btn.btn-sm', { text: '随身带', onclick: async () => { const r = await equipTech(state, e.itemId); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); } }) : null,
      ),
    );
  }).filter(Boolean);

  const bagGoods = panelFlush('货物背包', '载重只算货物，不算装备',
    goodsRows.length ? goodsRows : h('div.empty', { text: '背包是空的。' }),
  );
  const collections = collectionSections(state);
  const collection = panel('收藏图鉴', '两界录 · 发现与世界记忆',
    h('p.t-xs.t-dim.mb-2', { text: '记录真实发现、客户往来、秘境难度与掉落、故事和灵科。物品售出后仍保留发现；两界录随轮回保留。灵兽、作物和装备品阶原有收集称号仍可获得，其他分类记录探索进度。' }),
    collections.map(section => h('details.mt-2', null,
      h('summary.t-sm', { text: `${section.label} · ${section.rows.filter(x => x.unlocked).length}/${section.rows.length}` }),
      section.reward ? h('p.t-xs.t-jade.mt-2', { text: `收藏奖励：${section.reward} · 纯展示` }) : null,
      section.rows.map(row => h('div.rowitem.mt-2', null,
        h('div.rowitem-main', null, h('strong.t-xs', { text: `${row.unlocked ? '✓' : '○'} ${row.name}` }),
          h('p.t-xs.t-dim', { text: row.unlocked ? row.note : '尚未发现' }), h('p.t-xs.t-dimmer', { text: row.source })),
        h('button.btn.btn-sm', { text: state.side === 'modern' && ['dungeon','farm','craft'].includes(row.view) ? '前往界门' : '前往发现', onclick: () => ctx.navigate(state.side === 'modern' && ['dungeon','farm','craft'].includes(row.view) ? 'gate' : row.view) }))))));

  return h('div.flex-col.gap-4', null,
    panel('账号身份', '轮回 / 重置后保留', accountIdentity()),
    panel('配装准备', '战力用于参考，副本机制同样重要',
      h('p.t-sm', { text: state.player.stage >= 4 ? `功法已装 ${SKILL_SLOT_KEYS.filter(k => state.skills[k]).length} / 4 槽 · 上阵灵兽 ${state.beasts.deployed.length} / 2` : '炼气五层解锁四功法槽，当前可先准备装备与随身科技。' }),
      state.side === 'cultivation'
        ? h('div.btn-row.mt-2', null, h('button.btn.btn-sm', { text: '查看秘境机制', onclick: () => ctx.navigate('dungeon') }), h('button.btn.btn-sm', { text: '调整灵兽', onclick: () => ctx.navigate('farm') }))
        : h('button.btn.btn-sm.mt-2', { text: '前往界门，准备秘境与灵兽', onclick: () => ctx.navigate('gate') })),
    h('div', { style: 'display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px' }, primary, secondary),
    equipPanel, techPanel, skillPanel, bagEquip, bagGoods, collection, saveSection(state, ctx),
  );
}
