/**
 * views/dungeon.js —— 秘境：副本、自动战斗与战斗回放（GDD 10 / 2.1）
 */

import { h, panel, panelFlush, bar, showToast } from '../dom.js';
import { DIFFICULTIES, DIFF_MAP, DUNGEONS, STAMINA } from '../../data/dungeons.js';
import {
  unlockedDungeons, runDungeon, staminaEta, recommendPower, staminaMax,
  autoBattleView, setAutoBattle,
} from '../../systems/dungeon.js';
import { combatPower } from '../../systems/combat.js';
import { computeAttrs, techEffects } from '../../systems/character.js';
import { deployedBeasts, beastBonuses } from '../../systems/beasts.js';
import { researchEffects } from '../../data/research.js';
import { stageInfo } from '../../data/realms.js';
import { fmtInt, fmtDuration, fmtPct } from '../../core/util.js';

function hpBar(battle, state) {
  if (!battle.boss) return null;
  return h('div.mt-2', null,
    bar(battle.enemyHpMax > 0 ? battle.enemyHp / battle.enemyHpMax : 0, { thin: true }),
    h('div.bar-cap', null,
      h('span', { text: `BOSS 气血 ${fmtInt(battle.enemyHp)} / ${fmtInt(battle.enemyHpMax)}` }),
      battle.nextChargeIn !== null && battle.nextChargeIn !== undefined
        ? h('span.t-rise', { text: `大招蓄力：${battle.nextChargeIn} 回合` })
        : null,
    ),
  );
}

function battleModal(state, ctx, result) {
  const intel = !!result.waves[0]?.intel;

  const body = h('div', null,
    h('div.flex-between.mb-3', null,
      h('div', null,
        h('h3.t-serif', { text: `${result.dungeon.name} · ${result.diff.name}` }),
        h('div.t-xs.t-dim', { text: result.win ? '通关' : `败于第 ${result.clearedAtWave} 波` }),
      ),
      h('div.t-right', null,
        h('div.t-xs.t-dim', { text: '奖励' }),
        h('div.t-num', { text: result.win ? `灵石 +${fmtInt(result.rewards.stone)}` : '无' }),
      ),
    ),
    intel ? h('p.t-xs.t-jade.mb-2', { text: '阵法传感器已接入：以下为实时战况。' }) : null,
    h('div', { style: 'max-height:320px;overflow:auto;border-top:1px solid var(--line)' },
      result.waves.map((w) => h('div', { style: 'padding:8px 0;border-bottom:1px dashed var(--line)' },
        h('div.flex-between', null,
          h('span', null,
            h('span', { class: w.boss ? 't-strong' : '', text: w.enemy }),
            w.boss ? h('span.tag.tag-outline-ink', { text: 'BOSS' }) : null,
          ),
          h('span.t-num.t-xs', { class: w.win ? 't-fall' : 't-rise', text: w.win ? `胜 · ${w.rounds} 回合` : `败 · ${w.rounds} 回合` }),
        ),
        hpBar(w, state),
        h('div.t-xs.t-dimmer.mt-1', { text: w.log.slice(-3).join('　') }),
      )),
    ),
  );

  const r = result.rewards;
  const drops = [];
  for (const e of r.equipment) drops.push(`装备 · ${e.name}`);
  for (const s of r.skills) drops.push(`功法 · ${s.name}`);
  for (const g of r.goods) drops.push(`货物 · ${g.itemId} ×${g.qty}（${g.quality}）`);
  for (const m of r.materials) drops.push(`材料 · ${m.id} ×${m.qty}`);
  if (r.beast) drops.push(`灵兽 · 已捕获`);

  if (result.win && drops.length) {
    body.appendChild(h('div.mt-3', null,
      h('div.t-xs.t-dim', { text: '掉落' }),
      ...drops.map((d) => h('div.t-sm', { text: d })),
    ));
  }

  ctx.modal({
    title: result.win ? '通关' : '败退',
    subtitle: `${result.dungeon.name} · ${result.diff.name}`,
    body,
    actions: [{ type: 'close', label: '知道了', primary: true }],
  });
}

function autoPanel(state, ctx) {
  const a = autoBattleView(state);
  const cur = a.dungeons.find((d) => d.id === a.dungeonId);
  const diff = DIFF_MAP[a.diffId];

  return panel('自动战斗', a.on ? '运行中' : '已停止',
    h('p.t-sm.t-dim', { text: 'GDD 的 30 秒循环里，战斗也是后台跑的。选好副本与难度，它会按体力自动循环，离线同样结算。' }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '当前目标' }), h('dd', { text: cur ? `${cur.name} · ${diff?.name || ''}` : '未选择' })),
      h('dl.kv', null, h('dt', { text: '本轮已打' }), h('dd.t-num', { text: `${fmtInt(a.runs)} 次` })),
      h('dl.kv', null, h('dt', { text: '体力' }), h('dd.t-num', { text: `${Math.floor(state.player.stamina)} / ${staminaMax(state)}` })),
    ),
    h('div.t-xs.t-dim.mt-3.mb-1', { text: '目标副本' }),
    h('div.btn-row', null, a.dungeons.filter((d) => d.unlocked).map((d) => h('button.btn.btn-sm', {
      class: a.dungeonId === d.id ? 'btn-solid' : '',
      text: d.name,
      onclick: () => { setAutoBattle(state, a.on, d.id, a.diffId); ctx.rerender(); },
    }))),
    h('div.t-xs.t-dim.mt-3.mb-1', { text: '难度' }),
    h('div.btn-row', null, a.diffs.map((x) => h('button.btn.btn-sm', {
      class: a.diffId === x.id ? 'btn-solid' : '',
      text: `${x.name}（体 ${x.stamina}）`,
      onclick: () => { setAutoBattle(state, a.on, a.dungeonId, x.id); ctx.rerender(); },
    }))),
    h('div.mt-3', null,
      h('button.btn', {
        class: a.on ? 'btn-solid' : 'btn-solid',
        text: a.on ? '停止自动战斗' : '开启自动战斗',
        onclick: () => {
          const r = setAutoBattle(state, !a.on, a.dungeonId, a.diffId);
          if (!r.ok) showToast(r.reason, 'warn');
          ctx.rerender();
        },
      }),
    ),
    a.fails ? h('p.t-xs.t-rise.mt-2', { text: `已连续败退 ${a.fails} 次，连败 3 次会自动降档或停机。` }) : null,
  );
}

export function renderDungeon(state, ctx) {
  const attrs = computeAttrs(state);
  const power = combatPower(state);
  const list = unlockedDungeons(state);
  const eta = staminaEta(state);
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
        h('div.t-xs.t-dim', { text: eta > 0 ? `${fmtDuration(eta)} 后恢复 1 点` : '体力已满' }),
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
            poison_immunity: '抗生素（毒系副本自动解毒，受伤 -20%）',
            heat_shield: '防火服（炼狱系副本受伤 -25%）',
            flat_atk: '合金刀（攻击加成）',
          }[f] || f)).join('　'),
        })
        : h('div.t-sm.t-dimmer', { text: '无。现代货里的抗生素、强光手电、防火服、合金刀都可以随身携带。' }),
      intel ? h('div.t-sm.t-jade.mt-1', { text: '阵法传感器已解锁：副本列表显示敌方完整数据，战斗中显示 BOSS 气血与蓄力倒计时。' }) : null,
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
          const ok = d.unlocked && state.player.stamina >= diff.stamina;
          const rec = recommendPower(d.id, diff.id);
          const risky = power < rec * 0.8;
          return h('button.btn', {
            class: risky ? 'btn-ghost' : '',
            disabled: !ok,
            text: `${diff.name}（体 ${diff.stamina}）${risky ? ' ⚠' : ''}`,
            title: risky ? '战力偏低，建议先提升 Build' : '',
            onclick: () => {
              const res = runDungeon(state, d.id, diff.id);
              if (!res.ok) { showToast(res.reason, 'warn'); return; }
              ctx.rerender();
              battleModal(state, ctx, res);
            },
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
