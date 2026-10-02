/**
 * views/research.js —— 灵科融合研究树（GDD 5）
 */

import { h, panel, panelFlush, showToast } from '../dom.js';
import { BRANCHES, PROJECT_MAP, RESEARCH_LAB, materialToRP, projectsOf } from '../../data/research.js';
import { MATERIALS } from '../../data/items.js';
import { projectStatus, doResearch, upgradeLab, exchangeMaterial, rpPerHour } from '../../systems/research.js';
import { countOf } from '../../systems/inventory.js';
import { fmtInt, fmtPct } from '../../core/util.js';
import { investmentAllowed } from '../../systems/finance.js';
import { targetProject } from '../../systems/projects.js';
import { SIDE } from '../../core/state.js';

function exchangeConfirmation(state, ctx, material) {
  const qty = countOf(state, material.id), target = targetProject(state);
  const needed = target?.mats.find(m => m.id === material.id)?.need || 0;
  ctx.modal({ title: '兑换研究点确认', body: h('div', null,
    h('p.t-sm', { text: `消耗${material.name} ×${qty}，获得 ${materialToRP(material) * qty} 研究点。` }),
    needed ? h('p.t-xs.t-rise.mt-2', { text: `追踪中的${target.project.name}需要${material.name} ×${needed}，全部兑换会减少工程备料。` }) : null),
    actions: [{ label: '保留材料' }, { label: '确认兑换', primary: true, keepOpen: true, onClick: () => {
      if (qty !== countOf(state, material.id)) { ctx.closeOverlay(); exchangeConfirmation(state, ctx, material); return; }
      const r = exchangeMaterial(state, material.id, qty);
      if (!r.ok) { showToast(r.reason, 'warn'); return; }
      ctx.closeOverlay(); ctx.rerender();
    } }] });
}

export function renderResearch(state, ctx) {
  const pts = state.research.points || 0;
  const lab = state.research.labLevel || 0;

  const head = panel('灵科', `${fmtInt(pts)} 研究点`,
    h('p.t-sm.t-dim', { text: '现代科技不再提供简单的「+20% 属性」，而是解锁全新的玩法机制。这是《墨修》真正独特的地方。' }),
    h('dl', { style: 'margin:0' },
      h('dl.kv', null, h('dt', { text: '研究点' }), h('dd.t-num', { live: 'rp', text: fmtInt(pts) })),
      h('dl.kv', null, h('dt', { text: `研究所 Lv.${lab}` }), h('dd.t-num', { text: `${rpPerHour(state).toFixed(2)} / 时` })),
      h('dl.kv', null, h('dt', { text: '已完成研究' }), h('dd.t-num', { text: `${Object.keys(state.research.done).length} / 12` })),
    ),
    h('div.btn-row.mt-3', null,
      lab < RESEARCH_LAB.maxLevel
        ? h('button.btn', {
          text: `升级研究所（¥${fmtInt(RESEARCH_LAB.costOf(lab))}）`,
          disabled: !investmentAllowed(state, 'lab'), liveDisabled: 'investment:lab',
          onclick: () => { const r = upgradeLab(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        })
        : h('button.btn', { text: '研究所已满级', disabled: true }),
    ),
    state.side === SIDE.MODERN ? null : h('p.t-xs.t-dimmer.mt-2', { text: '研究所只在现代都市满速产出（当前你人在修仙界，按 50% 结算）。' }),
  );

  const exchange = panelFlush('材料兑换研究点', '把修仙材料交给实验室',
    MATERIALS.filter((m) => countOf(state, m.id) > 0).length
      ? MATERIALS.filter((m) => countOf(state, m.id) > 0).map((m) => h('div.rowitem', { style: 'padding:8px 16px' },
        h('div.rowitem-main', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name.t-sm', { text: m.name }),
            h('span.tag', { text: `×${countOf(state, m.id)}` }),
          ),
          h('div.t-xs.t-dim', { text: `1 份 = ${materialToRP(m)} 研究点` }),
        ),
        h('div.rowitem-act', null,
          h('button.btn.btn-sm', { text: '换 1', onclick: () => { exchangeMaterial(state, m.id, 1); ctx.rerender(); } }),
          h('button.btn.btn-sm.btn-solid', { text: '全换', onclick: () => exchangeConfirmation(state, ctx, m) }),
        ),
      ))
      : h('div.empty', { text: '还没有可兑换的材料。副本与牧场会产出。' }),
  );

  const branches = h('div.flex-col.gap-4', null, BRANCHES.map((b) => {
    const list = projectsOf(b.id).map((p) => projectStatus(state, p.id));
    const done = list.filter((x) => x.done).length;
    return panelFlush(b.name, `${b.dir}　·　${done}/${list.length}`,
      ...list.map((st) => {
        const p = st.project;
        const stateCls = st.done ? 'tag-ink' : st.available ? 'tag-outline-ink' : '';
        return h('div.rowitem', null,
          h('div.rowitem-main', null,
            h('div.rowitem-title', null,
              h('span.rowitem-name', { text: p.name }),
              h('span.tag', { class: stateCls, text: st.done ? '已完成' : `${p.cost} 点` }),
              !st.reqOk && !st.done ? h('span.tag', { text: '需前置' }) : null,
            ),
            h('div.rowitem-meta.t-jade', { text: p.effectDesc }),
            h('div.t-xs.t-dim', { text: p.desc }),
            !st.reqOk && !st.done
              ? h('div.t-xs.t-dimmer.mt-1', { text: `前置：${p.req.map(r => PROJECT_MAP[r]?.name || r).join('、')}` })
              : null,
          ),
          h('div.rowitem-act', null,
            st.done
              ? h('span.t-xs.t-dim', { text: '✓' })
              : h('button.btn.btn-sm', {
                class: st.available ? 'btn-solid' : '',
                text: '研究',
                disabled: !st.available, liveDisabled: `researchNotReady:${p.id}`,
                onclick: () => { const r = doResearch(state, p.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
              }),
          ),
        );
      }),
      h('div', { style: 'padding:10px 16px;border-top:1px solid var(--line)' },
        h('div.t-xs.t-dim', { text: b.desc }),
      ),
    );
  }));

  return h('div.flex-col.gap-4', null, head, exchange, branches);
}
