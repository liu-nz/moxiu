/**
 * views/dungeon.js —— 秘境：副本、自动战斗与战斗回放（GDD 10 / 2.1）
 */

import { h, panel, panelFlush, bar, showToast } from '../dom.js';
import { DIFFICULTIES, DIFF_MAP, DUNGEONS, STAMINA } from '../../data/dungeons.js';
import {
  unlockedDungeons, runDungeon, staminaEta, recommendPower, staminaMax,
  autoBattleView, setAutoBattle, dungeonPreparation,
} from '../../systems/dungeon.js';
import { combatPower } from '../../systems/combat.js';
import { computeAttrs, techEffects } from '../../systems/character.js';
import { deployedBeasts, beastBonuses } from '../../systems/beasts.js';
import { researchEffects } from '../../data/research.js';
import { stageInfo } from '../../data/realms.js';
import { getItem } from '../../data/items.js';
import { QUALITY_MAP } from '../../data/dungeons.js';
import { fmtInt, fmtDuration, fmtPct } from '../../core/util.js';

function preparationModal(state, ctx, dungeonId, diffId, automatic = false) {
  let p = dungeonPreparation(state, dungeonId, diffId);
  if (!p.ok) { showToast(p.reason, 'warn'); return; }
  const body = h('div');
  const draw = (changed = false) => body.replaceChildren(...[
    h('p.t-sm', { text: `${p.dungeon.name} · ${p.diff.name} · 每次消耗 ${p.diff.stamina} 体力` }),
    h('p.t-xs.t-dim.mt-2', { text: `当前战力 ${fmtInt(p.power)} / 推荐 ${fmtInt(p.recommended)}，仅作参考，不代表通关概率。` }),
    h('h3.mt-3', { text: '机制与配装' }),
    ...p.counters.map((c) => h('p.t-sm.mt-1', { text: `${c.equipped ? '已携带' : '缺少'} ${c.name}：${c.text}` })),
    ...p.tips.map((t) => h('p.t-xs.t-dim.mt-2', { text: t })),
    h('p.t-xs.mt-2', { text: `上阵灵兽：${p.pets.map(x => `${x.name} Lv.${x.level}`).join('、') || '无'}` }),
    h('h3.mt-3', { text: '通关收益' }),
    h('p.t-sm', { text: `灵石 ${p.stone.map(fmtInt).join('–')} · 修为 ${p.cultivation.map(fmtInt).join('–')}` }),
    h('p.t-xs.t-dim.mt-1', { text: `单次装备判定 ${fmtPct(p.equipChance, 0)} · 功法判定 ${fmtPct(p.skillChance, 0)}；货物、材料、灵兽均为概率掉落。失败不发奖励，体力仍消耗。` }),
    automatic ? h('p.t-xs.t-dim.mt-2', { text: '每 30 秒世界时间尝试一次。体力不足等待；人在现代界暂停；连续三败降档，普通难度三败停止。' }) : null,
    !p.check.ok ? h('p.t-xs.t-rise.mt-2', { text: p.check.reason }) : null,
    changed ? h('p.t-xs.t-rise.mt-2', { text: '配装或世界已变化，准备信息已更新，请再次确认。' }) : null,
  ].filter(Boolean));
  draw();
  ctx.modal({ title: automatic ? '自动战斗准备' : '战前准备', body,
    actions: [{ label: '返回' }, { label: '调整配装', onClick: () => ctx.navigate('character') },
      { label: automatic ? '确认开启自动战斗' : '确认进入秘境', primary: true, keepOpen: true, onClick: () => {
        const current = dungeonPreparation(state, dungeonId, diffId);
        if (!current.ok) { showToast(current.reason, 'warn'); return; }
        if (p.signature !== current.signature) { p = current; draw(true); return; }
        if (!current.check.ok && !automatic) { p = current; draw(); showToast(current.check.reason, 'warn'); return; }
        const res = automatic ? setAutoBattle(state, true, dungeonId, diffId) : runDungeon(state, dungeonId, diffId);
        if (!res.ok) { showToast(res.reason, 'warn'); return; }
        ctx.closeOverlay(); ctx.rerender();
        if (!automatic) battleModal(state, ctx, res);
      } }],
  });
}

function battleModal(state, ctx, result) {
  const last = result.waves.at(-1);
  const totals = result.waves.reduce((out, w) => {
    for (const k of Object.keys(out)) out[k] += w.metrics?.[k] || 0;
    return out;
  }, { playerDamage: 0, petDamage: 0, incomingDamage: 0, healing: 0, crits: 0, dodges: 0 });
  const diagnosis = result.win ? '通关成功。可比较新装备与功法，再尝试更高难度。'
    : last.outcome === 'timeout' ? '达到 60 回合上限，输出未能击败敌人。建议提高攻击、功法威力或补齐科技克制。'
    : `气血耗尽，败于第 ${result.clearedAtWave} 波。${last.chargeRounds.length ? '本波承受了 BOSS 大招。' : ''}可提升气血、减伤与吸血，或降低难度。`;
  const r = result.rewards;
  const drops = [
    ...r.equipment.map(e => `装备 · ${e.name}`), ...r.skills.map(s => `功法 · ${s.name}`),
    ...r.goods.map(g => `货物 · ${getItem(g.itemId)?.name || g.itemId} ×${g.qty}（${QUALITY_MAP[g.quality]?.name || g.quality}）`),
    ...r.materials.map(m => `材料 · ${getItem(m.id)?.name || m.id} ×${m.qty}`),
    ...(r.beast ? [`灵兽 · ${r.beast.name || '已捕获'}`] : []),
  ];
  ctx.modal({ title: result.win ? '通关' : '败退', subtitle: `${result.dungeon.name} · ${result.diff.name}`,
    body: h('div', null,
      h('p.t-sm.mb-2', { text: diagnosis }),
      h('p.t-xs.t-dim', { text: `消耗 ${result.diff.stamina} 体力 · 灵石 +${fmtInt(r.stone)} · 修为 +${fmtInt(r.cultivation)}` }),
      h('h3.mt-3', { text: '战斗反馈' }),
      h('p.t-xs.mt-1', { text: `人物伤害 ${fmtInt(totals.playerDamage)} · 灵兽伤害 ${fmtInt(totals.petDamage)} · 承受伤害 ${fmtInt(totals.incomingDamage)}` }),
      h('p.t-xs.mt-1', { text: `有效吸血 ${fmtInt(totals.healing)} · 人物暴击 ${totals.crits} 次 · 闪避 ${totals.dodges} 次（伤害包含溢出部分）` }),
      h('div.mt-3', null, ...result.waves.map((w, i) => h('details', { style: 'padding:8px 0;border-top:1px solid var(--line)' },
        h('summary.t-sm', { text: `第 ${i + 1} 波 · ${w.enemy}${w.boss ? ' · BOSS' : ''} · ${w.win ? '胜' : w.outcome === 'timeout' ? '超时' : '败'} · ${w.rounds} 回合` }),
        h('p.t-xs.t-dim.mt-2', { text: `结束气血：你 ${fmtInt(w.playerHp)} / ${fmtInt(w.playerHpMax)} · 敌人 ${fmtInt(w.enemyHp)} / ${fmtInt(w.enemyHpMax)}` }),
        h('div.t-xs.t-dim.mt-2', { style: 'max-height:220px;overflow:auto' }, ...w.log.map(t => h('div', { text: t }))),
      ))),
      drops.length ? h('div.mt-3', null, h('h3', { text: '实际掉落' }), ...drops.map(t => h('p.t-sm', { text: t }))) : null,
    ), actions: [{ label: '知道了', primary: true }, { label: '比较配装', onClick: () => ctx.navigate('character') }],
  });
}

function autoPanel(state, ctx) {
  const a = autoBattleView(state);
  const selected = a.dungeonId || a.dungeons.find(d => d.unlocked)?.id;
  const cur = a.dungeons.find((d) => d.id === a.dungeonId);
  const diff = DIFF_MAP[a.diffId];

  return panel('自动战斗', a.on ? '运行中' : '已停止',
    h('p.t-sm.t-dim', { text: a.status }),
    h('p.t-xs.t-dim.mt-1', { text: '每 30 秒世界时间尝试一次，离线同样结算；连续三败降档或停止。' }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '当前目标' }), h('dd', { text: cur ? `${cur.name} · ${diff?.name || ''}` : '未选择' })),
      h('dl.kv', null, h('dt', { text: '本世自动战斗' }), h('dd.t-num', { text: `${fmtInt(a.runs)} 次 · 胜 ${a.wins} / 败 ${a.losses}` })),
      h('dl.kv', null, h('dt', { text: '体力' }), h('dd.t-num', { text: `${Math.floor(state.player.stamina)} / ${staminaMax(state)}` })),
    ),
    h('div.t-xs.t-dim.mt-3.mb-1', { text: '目标副本' }),
    h('div.btn-row', null, a.dungeons.filter((d) => d.unlocked).map((d) => h('button.btn.btn-sm', {
      class: a.dungeonId === d.id ? 'btn-solid' : '',
      text: d.name,
      onclick: () => { if (a.on) preparationModal(state, ctx, d.id, a.diffId, true); else { setAutoBattle(state, false, d.id, a.diffId); ctx.rerender(); } },
    }))),
    h('div.t-xs.t-dim.mt-3.mb-1', { text: '难度' }),
    h('div.btn-row', null, a.diffs.map((x) => h('button.btn.btn-sm', {
      class: a.diffId === x.id ? 'btn-solid' : '',
      text: `${x.name}（体 ${x.stamina}）`,
      onclick: () => { if (a.on) preparationModal(state, ctx, selected, x.id, true); else { setAutoBattle(state, false, selected, x.id); ctx.rerender(); } },
    }))),
    h('div.mt-3', null,
      h('button.btn', {
        class: a.on ? 'btn-solid' : 'btn-solid',
        text: a.on ? '停止自动战斗' : '开启自动战斗',
        onclick: () => {
          if (!a.on) { preparationModal(state, ctx, selected, a.diffId, true); return; }
          const r = setAutoBattle(state, false, a.dungeonId, a.diffId);
          if (!r.ok) showToast(r.reason, 'warn');
          ctx.rerender();
        },
      }),
    ),
    a.lastResult ? h('p.t-xs.t-dim.mt-2', { text: `最近一次：${a.lastResult.dungeon} · ${a.lastResult.diff} · ${a.lastResult.win ? '通关' : `败于第 ${a.lastResult.wave} 波`} · 灵石 +${fmtInt(a.lastResult.stone)}` }) : null,
    a.fails ? h('p.t-xs.t-rise.mt-2', { text: `已连续败退 ${a.fails} 次，连败 3 次会自动降档或停机。` }) : null,
  );
}

export function renderDungeon(state, ctx) {
  const power = combatPower(state);
  const list = unlockedDungeons(state);
  const eta = staminaEta(state, true);
  const fx = techEffects(state);
  const intel = researchEffects(state).dungeonIntel;
  const pets = deployedBeasts(state);
  const bb = beastBonuses(state);
  const maxStam = staminaMax(state);

  const head = panel('秘境',
    h('span', { text: `战力 ${fmtInt(power)}` }),
    h('div.flex-between', null,
      h('div', null,
        h('h3', { text: '体力' }),
        h('div.t-xs.t-dim', { live: 'staminaRecovery', text: eta > 0 ? `${fmtDuration(eta)} 后恢复 1 点 · ${fmtDuration(staminaEta(state))} 后回满（世界时间）` : '体力已满' }),
      ),
      h('div.t-right', null, h('div.t-num.t-lg', { live: 'staminaText' })),
    ),
    h('div.mt-2', null, bar(state.player.stamina / maxStam, { thick: true, liveBar: 'staminaBar' })),
    h('div.mt-3', null,
      h('div.t-xs.t-dim', { text: '随身科技' }),
      fx.size
        ? h('div.t-sm', {
          text: [...fx].map((f) => ({
            light_boost: '强光手电（阴系副本伤害 ×2）',
            poison_immunity: '抗生素（毒系伤害 ×1.35，额外减伤 20%）',
            heat_shield: '防火服（炼狱系副本受伤 -25%）',
            flat_atk: '合金刀（攻击加成）',
          }[f] || f)).join('　'),
        })
        : h('div.t-sm.t-dimmer', { text: '无。现代货里的抗生素、强光手电、防火服、合金刀都可以随身携带。' }),
      intel ? h('div.t-sm.t-jade.mt-1', { text: '阵法传感器已解锁：副本列表显示普通难度的敌方完整数据。' }) : null,
    ),
    h('div.mt-3', null,
      h('div.t-xs.t-dim', { text: `上阵灵兽（${pets.length}/2）` }),
      pets.length
        ? h('div.t-sm', { text: pets.map((p) => `${p.name} Lv.${p.level}（${p.trait}）`).join('　') })
        : h('div.t-sm.t-dimmer', { text: '无。副本通关后有概率捕捉到战斗灵兽。' }),
      bb.dmgReduce || bb.stoneBonus || bb.battleDamage
        ? h('div.t-xs.t-jade.mt-1', {
          text: [
            bb.dmgReduce ? `护主减伤 +${fmtPct(bb.dmgReduce, 0)}` : '',
            bb.stoneBonus ? `灵石收益 +${fmtPct(bb.stoneBonus, 0)}` : '',
            bb.battleDamage ? `战斗伤害 +${fmtPct(bb.battleDamage, 0)}` : '',
          ].filter(Boolean).join('　'),
        })
        : null,
    ),
  );

  const dungeons = panelFlush('副本列表', `八大副本　·　已通关 ${Object.values(state.dungeon.cleared).reduce((a, b) => a + b, 0)} 次`,
    ...list.map((d) => h('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--line)' },
      h('div.flex-between', null,
        h('div', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name.t-serif', { style: 'font-size:15px', text: d.name }),
            d.unlocked ? null : h('span.tag', { text: `需 ${d.unlockLabel}` }),
            d.tags.includes('dark') ? h('span.tag', { text: '阴系' }) : null,
            d.tags.includes('poison') ? h('span.tag', { text: '毒系' }) : null,
            d.tags.includes('fire') ? h('span.tag', { text: '炼狱' }) : null,
          ),
          h('div.t-xs.t-dim.mt-1', { text: d.desc }),
          intel
            ? h('div.t-xs.t-dimmer.mt-1', {
              text: d.waves.map((w) => `${w.name}（气血 ${fmtInt(w.hp)} / 攻 ${fmtInt(w.atk)} / 防 ${fmtInt(w.def)} / 速 ${w.spd}）`).join('　'),
            })
            : h('div.t-xs.t-dimmer.mt-1', { text: `波次：${d.waves.map((w) => w.name).join(' → ')}` }),
        ),
        h('div.t-right.t-xs.t-dim', null,
          h('div', { text: `体力 ${DIFFICULTIES.map((x) => x.stamina).join(' / ')}` }),
          h('div', { text: `推荐战力 ${DIFFICULTIES.map((x) => fmtInt(recommendPower(d.id, x.id))).join(' / ')}` }),
        ),
      ),
      h('div.btn-row.mt-2', null,
        DIFFICULTIES.map((diff) => {
          const ok = d.unlocked;
          const rec = recommendPower(d.id, diff.id);
          const risky = power < rec * 0.8;
          return h('button.btn', {
            class: risky ? 'btn-ghost' : '',
            disabled: !ok,
            text: `${diff.name}准备（体 ${diff.stamina}）${risky ? ' ⚠' : ''}`,
            title: risky ? '战力偏低，建议先提升 Build' : '',
            onclick: () => preparationModal(state, ctx, d.id, diff.id),
          });
        }),
      ),
    )),
  );

  const history = panelFlush('最近战绩', null,
    state.dungeon.log.length
      ? state.dungeon.log.slice(0, 8).map((r) => h('div.rowitem', null,
        h('div.rowitem-main', null, h('div.t-sm', { text: `${r.dungeon} · ${r.diff}` })),
        h('div.rowitem-act', null,
          h('span.tag', { class: r.win ? 'tag-outline-ink' : '', text: r.win ? `通关 +${fmtInt(r.stone)} 灵石` : '败退' }),
        ),
      ))
      : h('div.empty', { text: '还没有战绩。炼气三层后可以去山贼寨试试。' }),
  );

  return h('div.flex-col.gap-4', null, head, autoPanel(state, ctx), dungeons, history);
}
