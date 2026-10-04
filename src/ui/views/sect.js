/**
 * views/sect.js —— 宗门（GDD 1.2 表世界职责）
 */

import { h, panel, panelFlush, bar, showToast } from '../dom.js';
import { SECTS, SECT_RANKS, SECT_TOURNAMENT, tributeValue } from '../../data/sects.js';
import { stageInfo } from '../../data/realms.js';
import { MATERIALS, MATERIAL_MAP } from '../../data/items.js';
import { sectSummary } from '../../systems/sect.js';
import { sect_joinSect as joinSect, sect_leaveSect as leaveSect, sect_promote as promote, sect_claimQuest as claimQuest, sect_claimAllQuests as claimAllQuests, sect_buySecret as buySecret, sect_tribute as tribute, sect_challengeTournament as challengeTournament } from '../commands.js';
import { countOf } from '../../systems/inventory.js';
import { fmtInt, fmtDuration, fmtPct } from '../../core/util.js';

function joinPanel(state, ctx) {
  return panel('宗门', '尚未拜师',
    h('p.t-sm.t-dim', { text: '宗门与道盟不同：道盟是松散的联盟，宗门是你要拜进去、从外门弟子做起、一辈一辈往上爬的地方。宗门灵气会直接加快你的修炼。' }),
    h('div.mt-3', null, SECTS.map((s) => h('div.rowitem', null,
      h('div.rowitem-main', null,
        h('div.rowitem-title', null,
          h('span.rowitem-name.t-serif', { text: `${s.accent} · ${s.name}` }),
          h('span.tag', { text: s.focus }),
        ),
        h('div.rowitem-meta.t-jade', { text: s.perk }),
        h('div.t-xs.t-dim', { text: s.desc }),
        h('div.t-xs.t-dimmer.mt-1', { text: `秘传：${s.secrets.map((x) => x.name).join('、')}` }),
      ),
      h('div.rowitem-act', null,
        h('button.btn.btn-sm.btn-solid', {
          text: '拜师',
          onclick: async () => { const r = await joinSect(state, s.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        }),
      ),
    ))),
  );
}

export function renderSect(state, ctx) {
  const s = sectSummary(state);
  if (!s.joined) return joinPanel(state, ctx);

  const sect = s.sect;
  const rank = s.rank;
  const ratio = rank.next
    ? Math.min(1, s.contribution / Math.max(1, rank.next.contribution))
    : 1;

  const head = panel('宗门', `${sect.name}　·　${rank.current.name}`,
    h('div.flex-between', null,
      h('div', null,
        h('div.t-serif.t-lg', { text: `${sect.accent} · ${sect.name}` }),
        h('div.t-sm.t-jade', { text: sect.perk }),
        h('div.t-xs.t-dim', { text: sect.desc }),
      ),
      h('button.btn.btn-sm.btn-ghost', { text: '离开宗门', onclick: async () => { await leaveSect(state); ctx.rerender(); } }),
    ),
    h('dl', { style: 'margin:12px 0 0' },
      h('dl.kv', null, h('dt', { text: '宗门贡献' }), h('dd.t-num', { text: fmtInt(s.contribution) })),
      h('dl.kv', null, h('dt', { text: '累计贡献' }), h('dd.t-num', { text: fmtInt(s.totalContribution) })),
      h('dl.kv', null, h('dt', { text: '宗门灵气' }), h('dd.t-num', { text: `修炼速度 +${fmtPct(rank.cultBonus, 0)}` })),
      h('dl.kv', null, h('dt', { text: '每日月俸' }), h('dd.t-num', { text: `${fmtInt(s.stipend)} 灵石` })),
    ),
    h('hr.hr'),
    h('div.flex-between', null,
      h('div', null,
        h('h3', { text: rank.next ? `晋阶：${rank.next.name}` : '你已是宗主' }),
        rank.next
          ? h('div.t-xs.t-dim', {
            text: `需 宗门贡献 ${fmtInt(rank.next.contribution)}（${rank.contributionOk ? '已满足' : '未满足'}）　·　境界达 ${stageInfo(rank.next.stage).stage.name}（${rank.stageOk ? '已满足' : '未满足'}）`,
          })
          : null,
        rank.next ? h('div.t-xs.t-dimmer', { text: rank.next.perk }) : null,
      ),
      rank.next
        ? h('button.btn', {
          class: rank.canPromote ? 'btn-solid' : '',
          text: rank.canPromote ? '晋阶' : '条件未满',
          disabled: !rank.canPromote,
          onclick: async () => { const r = await promote(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        })
        : null,
    ),
    rank.next ? h('div.mt-2', null,
      bar(ratio),
      h('div.bar-cap', null,
        h('span', { text: `贡献 ${fmtInt(s.contribution)} / ${fmtInt(rank.next.contribution)}` }),
        h('span', { text: rank.stageOk ? '境界已满足' : '境界未满足' }),
      ),
    ) : null,
  );

  /* ---- 宗门任务 ---- */
  const quests = panel('宗门任务', '每日刷新',
    h('div.btn-row.mb-2', null,
      h('button.btn.btn-sm', {
        text: '一键领取',
        onclick: async () => { const r = await claimAllQuests(state); if (!r.ok) showToast('暂无可领任务', 'warn'); ctx.rerender(); },
      }),
    ),
    ...s.quests.map((q) => {
      const p = q.progress;
      const r2 = p.goal > 0 ? Math.min(1, p.cur / p.goal) : 0;
      return h('div', { style: 'padding:10px 0;border-bottom:1px dashed var(--line)' },
        h('div.flex-between', null,
          h('div', null,
            h('span.t-sm.t-strong', { text: q.quest.name }),
            h('span.t-xs.t-dim', { text: `　${q.quest.desc}` }),
          ),
          q.claimed
            ? h('span.tag.tag-ink', { text: '已领' })
            : h('button.btn.btn-sm', {
              class: q.claimable ? 'btn-solid' : '',
              text: `+${q.quest.contribution} 贡献`,
              disabled: !q.claimable,
              onclick: async () => { const res = await claimQuest(state, q.quest.id); if (!res.ok) showToast(res.reason, 'warn'); ctx.rerender(); },
            }),
        ),
        h('div.mt-2', null, bar(r2)),
        h('div.bar-cap', null,
          h('span', { text: p.ratio ? `${(r2 * 100).toFixed(0)}%` : `${fmtInt(Math.min(p.cur, p.goal))} / ${fmtInt(p.goal)} ${p.unit}` }),
          h('span', { text: q.done ? '已完成' : '进行中' }),
        ),
      );
    }),
  );

  /* ---- 上缴材料 ---- */
  const mats = MATERIALS.filter((m) => countOf(state, m.id) > 0);
  const tributePanel = panelFlush('上缴材料', '换宗门贡献',
    mats.length
      ? mats.map((m) => h('div.rowitem', { style: 'padding:8px 16px' },
        h('div.rowitem-main', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name.t-sm', { text: m.name }),
            h('span.tag', { text: `×${countOf(state, m.id)}` }),
          ),
          h('div.t-xs.t-dim', { text: `1 份 = ${tributeValue(m)} 贡献` }),
        ),
        h('div.rowitem-act', null,
          h('button.btn.btn-sm', { text: '缴 1', onclick: async () => { await tribute(state, m.id, 1); ctx.rerender(); } }),
          h('button.btn.btn-sm.btn-solid', { text: '全缴', onclick: async () => { await tribute(state, m.id, countOf(state, m.id)); ctx.rerender(); } }),
        ),
      ))
      : h('div.empty', { text: '背包里没有可上缴的材料。' }),
  );

  /* ---- 宗门秘传 ---- */
  const secrets = panelFlush('宗门秘传', `贡献 ${fmtInt(s.contribution)}`,
    ...s.secrets.map((x) => h('div.rowitem', null,
      h('div.rowitem-main', null,
        h('div.rowitem-title', null,
          h('span.rowitem-name', { text: x.secret.name }),
          x.owned ? h('span.tag.tag-ink', { text: '已参悟' }) : h('span.tag', { text: `${x.secret.cost} 贡献` }),
          !x.rankOk && !x.owned ? h('span.tag', { text: '需更高辈分' }) : null,
        ),
        h('div.t-xs.t-dim', { text: x.secret.desc }),
      ),
      h('div.rowitem-act', null,
        x.owned
          ? h('span.t-xs.t-dim', { text: '✓' })
          : h('button.btn.btn-sm', {
            class: x.canBuy ? 'btn-solid' : '',
            text: '参悟',
            disabled: !x.canBuy,
            onclick: async () => { const r = await buySecret(state, x.secret.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
          }),
      ),
    )),
  );

  /* ---- 宗门大比 ---- */
  const t = s.tournament;
  const tournament = panel('宗门大比', t.ready ? '本周可战' : `${fmtDuration(t.remainMs)} 后可再战`,
    h('p.t-sm.t-dim', { text: '名次不看绝对战力，而看你比「同境界的裸装基准」强多少——这是 Build 质量的检验，不是境界的检验。' }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '当前战力比' }), h('dd.t-num', { text: `×${t.ratio.toFixed(2)}` })),
      h('dl.kv', null, h('dt', { text: '按此战力预计名次' }), h('dd', { text: `${t.tier.name} · ${t.tier.desc}` })),
      h('dl.kv', null, h('dt', { text: '体力消耗' }), h('dd.t-num', { text: `${SECT_TOURNAMENT.stamina}` })),
      t.best ? h('dl.kv', null, h('dt', { text: '上次名次' }), h('dd', { text: SECT_TOURNAMENT.tiers.find((x) => x.id === t.best)?.name || t.best })) : null,
    ),
    h('div.mt-3', null,
      t.ready
        ? h('button.btn.btn-solid', {
          text: '参加大比',
          disabled: state.player.stamina < SECT_TOURNAMENT.stamina,
          onclick: async () => {
            const r = await challengeTournament(state);
            if (!r.ok) { showToast(r.reason, 'warn'); return; }
            ctx.rerender();
            ctx.modal({
              title: `大比 · ${r.tier.name}`,
              subtitle: `战力为同境界基准的 ×${r.ratio.toFixed(2)}`,
              body: h('div', null,
                h('p.t-sm', { text: r.tier.desc }),
                h('dl', { style: 'margin:0' },
                  h('dl.kv', null, h('dt', { text: '宗门贡献' }), h('dd.t-num', { text: `+${fmtInt(r.contribution)}` })),
                  h('dl.kv', null, h('dt', { text: '灵石' }), h('dd.t-num', { text: `+${fmtInt(r.stone)}` })),
                ),
              ),
              actions: [{ label: '收功', primary: true }],
            });
          },
        })
        : h('span.t-xs.t-dim', { text: '本周已结束，下周再来。' }),
    ),
  );

  return h('div.flex-col.gap-4', null, head, tournament, quests, secrets, tributePanel);
}
