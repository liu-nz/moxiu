/**
 * views/companion.js —— 道侣（GDD 12）
 */

import { h, panel, panelFlush, bar, showToast } from '../dom.js';
import { COMPANIONS, AFFECTION_STAGES } from '../../data/companions.js';
import { companionView, gift, companionTotals, dutyMultiplier } from '../../systems/companion.js';
import { fmtInt, fmtPct } from '../../core/util.js';

export function renderCompanion(state, ctx) {
  const totals = companionTotals(state);

  const head = panel('道侣', `双修加成 +${fmtPct(totals.cultSpeed, 0)}`,
    h('p.t-sm.t-dim', { text: '好感度五阶段：相识 → 好友 → 知己 → 道侣 → 同心。到了「知己」，她们会在你下线的时候替你干活。' }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '修炼速度加成' }), h('dd.t-num', { text: `+${fmtPct(totals.cultSpeed, 0)}` })),
      h('dl.kv', null, h('dt', { text: '所在世界收益' }), h('dd.t-num', { text: `+${fmtPct(totals.sideIncome, 0)}` })),
      h('dl.kv', null, h('dt', { text: '替伤减免' }), h('dd.t-num', { text: `+${fmtPct(totals.damageTaken, 0)}` })),
      h('dl.kv', null, h('dt', { text: '在岗道侣' }), h('dd.t-num', { text: `${totals.duties.length} 位` })),
    ),
    h('div.mt-3', null,
      h('div.t-xs.t-dim.mb-2', { text: '好感度阶段' }),
      h('div', null, AFFECTION_STAGES.map((s) => h('div.flex-between', { style: 'padding:3px 0' },
        h('span.t-sm', { text: `${s.name}（${s.min}-${s.max}）` }),
        h('span.t-xs.t-dim', { text: s.effect || '—' }),
      ))),
    ),
  );

  const list = panelFlush('可攻略角色', `${COMPANIONS.length} 位`,
    ...COMPANIONS.map((c) => {
      const v = companionView(state, c.id);
      if (!v.unlocked) {
        return h('div.rowitem', null,
          h('div.rowitem-main', null,
            h('div.rowitem-title', null, h('span.rowitem-name.t-dimmer', { text: '？？？' })),
            h('div.rowitem-meta.t-dimmer', { text: '缘分未到。提升境界后再来。' }),
          ),
        );
      }
      return h('div', { style: 'padding:14px 16px;border-bottom:1px solid var(--line)' },
        h('div.flex-between', null,
          h('div', null,
            h('div.rowitem-title', null,
              h('span.rowitem-name.t-serif', { style: 'font-size:15px', text: `${v.def.name} · ${v.def.title}` }),
              h('span.tag.tag-outline-ink', { text: v.stage.name }),
              v.dutyOn ? h('span.tag.tag-ink', { text: '在岗' }) : null,
            ),
            h('div.t-xs.t-dim.mt-1', { text: v.def.desc }),
            h('div.t-xs.t-jade.mt-1', { text: `专长：${v.def.trait}${v.bonus.dutiesDoubled ? '（同心 · 效果翻倍）' : ''}` }),
            c.id === 'moyao' && v.affection >= 40
              ? h('div.t-xs.t-jade', { text: `炼丹加成：成功率 +${fmtPct(v.affection >= 80 ? 0.16 : 0.08, 0)}` })
              : null,
            v.dutyOn ? h('div.t-xs.t-dim', { text: v.def.duties.idle }) : null,
          ),
          h('div.t-right', null,
            h('div.t-xs.t-dim', { text: '好感度' }),
            h('div.t-num.t-lg', { text: `${v.affection}` }),
          ),
        ),
        h('div.mt-2', null, bar(v.affection / 100)),
        h('div.bar-cap', null,
          h('span', { text: v.stage.effect || '尚无特效' }),
          h('span', { text: v.next ? `距「${v.next.name}」还差 ${v.next.min - v.affection}` : '已至同心' }),
        ),
        h('div.btn-row.mt-3', null,
          h('button.btn.btn-sm.btn-solid', {
            text: `送礼（${v.giftName} ×1 + ${fmtInt(v.stoneCost)} 灵石）`,
            disabled: v.giftHave < 1 || state.currency.stone < v.stoneCost,
            title: v.giftHave < 1 ? `需要「${v.giftName}」，背包里没有` : '',
            onclick: () => { const r = gift(state, c.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
          }),
          h('span.t-xs.t-dimmer', { text: `信物持有 ${v.giftHave}　·　已送礼 ${v.gifts} 次` }),
        ),
        h('div.t-xs.t-dimmer.mt-1', { text: `信物：${v.giftName}　—　${v.giftHint}` }),
      );
    }),
  );

  const dutyPanel = panelFlush('在岗事务', '每次界潮刷新时结算',
    totals.duties.length
      ? totals.duties.map((d) => h('div.rowitem', { style: 'padding:10px 16px' },
        h('div.rowitem-main', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name.t-sm', { text: d.name }),
            d.doubled ? h('span.tag.tag-ink', { text: '效果翻倍' }) : null,
          ),
          h('div.t-xs.t-dim', { text: d.trait }),
        ),
        h('div.rowitem-act', null, h('span.t-xs.t-dim', { text: `×${dutyMultiplier(state, d.id)}` })),
      ))
      : h('div.empty', { text: '还没有道侣在岗。好感度到「知己」（40）即可开始替你干活。' }),
  );

  return h('div.flex-col.gap-4', null, head, list, dutyPanel);
}
