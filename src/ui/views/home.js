import {worldStatePanel} from './world-state.js';
/** 第一阶段首页：用现有系统状态引导行动，不改变收益或解锁规则。 */
import { h, panel, bar, kv } from '../dom.js';
import { SIDE, SIDE_NAME } from '../../core/state.js';
import { FLAT_STAGES, stageInfo } from '../../data/realms.js';
import { stageProgress, cultivationRate, breakthroughInfo } from '../../systems/cultivation.js';
import { pathModal, breakthroughModal } from './cultivation.js';
import { totalIncomePerHour } from '../../systems/modern.js';
import { rentPerHour } from '../../systems/estate.js';
import { farm_harvestAll as harvestAll } from '../commands.js';
import { ranch_collectAll as collectAll } from '../commands.js';
import { tutorialChapters, TUTORIAL_STEPS } from '../../systems/tutorial.js';
import { growthPanel, offlineProduction, objectivePanel } from './progression.js';
import { taleStats, pendingTale } from '../../systems/tales.js';
import { journeyPanel } from './journey.js';
import { fmtInt, fmtShort, fmtDuration } from '../../core/util.js';
import { dailyPanel, commissionsPanel, storiesPanel } from './activity.js';

export function progressEta(s) {
  const p = stageProgress(s), rate = cultivationRate(s);
  return p.cur >= p.need ? (p.isTop ? '修为圆满 · 可检查突破' : '即将晋层')
    : rate > 0 ? `预计 ${fmtDuration((p.need - p.cur) / rate * 1000)} 后修为圆满` : '修炼暂停';
}
const guideRoutes = { job:'modern', buy:'market', cargo:'market', cross:'gate', sell:'market', returnCargo:'market', return:'gate', reverseSell:'market', cultivate:'cultivation', farm:'farm', dungeon:'dungeon', skill:'character', research:'research', companion:'companion', foundation:'cultivation' };

export function renderHome(s, ctx) {
  const p = stageProgress(s), cur = stageInfo(s.player.stage), bt = breakthroughInfo(s);
  const next = FLAT_STAGES[s.player.stage + 1];
  const target = p.isTop ? (bt.ascension ? '飞升轮回' : bt.toRealm?.name || '当前境界圆满') : next?.stage.name || '当前境界圆满';
  const step = TUTORIAL_STEPS[s.tutorial.step || 0];
  const ready = s.farm.plots.filter(x => x && x.readyAt <= s.world.clockMs).length;
  const pending = s.ranch.slots.reduce((sum,x) => sum + (x?.pending || 0), 0);
  const action = (label, view) => h('button.btn', {text:label, onclick:()=>ctx.navigate(view)});
  const hero = h('section.home-hero', null,
    h('div.eyebrow', {text:`${SIDE_NAME[s.side]} / ${s.side === SIDE.CULTIVATION ? '静坐 · 引气入体' : '日常 · 两界之间'}`}),
    h('div.hero-heading', null, h('h1', {text:cur.stage.name}), h('span.tag', {text:'自动修炼中'})),
    h('p.t-sm.t-dim', {text:s.side === SIDE.CULTIVATION ? '灵气沿经脉流转。此刻每一点积累，都在走向下一重境界。' : '都市照常运转，修为仍在积累。准备好物资，再踏入另一片天地。'}),
    h('div.hero-rate', null, h('span', {live:'cultRate', text:fmtShort(cultivationRate(s))}), h('small', {text:'修为 / 秒'})),
    bar(p.ratio, {thick:true, liveKey:'cultBar'}),
    h('div.bar-cap', null, h('span', {live:'cultText',text:`${fmtInt(p.cur)} / ${fmtInt(p.need)}`}),h('span',{text:s.side===SIDE.CULTIVATION?'修仙界 · 满速':'现代都市 · 半速'})),
    h('div.goal-block', null,
      h('div.eyebrow', {text:'下一步 / 成长目标'}),h('h2',{text:target}),
      h('p.t-sm.t-dim.mt-2',{live:'goalEta',text:progressEta(s)}),
      h('p.t-sm',{live:'goalMissing',text:`还需 ${fmtInt(Math.max(0,p.need-p.cur))} 修为${p.isTop?' · 跨境界需手动突破':''}`}),
      h('div.btn-row.mt-3', null,
        p.isTop && bt.full && !bt.locked ? h('button.btn.btn-solid', {text:bt.ascension?'查看渡劫':'准备突破',onclick:()=>breakthroughModal(s,ctx)}) : action('查看修炼与功法', 'cultivation'),
        action('整理跨界背包', 'gate'),
      ),
    ),
  );
  const guide = step ? panel('当前引导', `${s.tutorial.step + 1} / ${TUTORIAL_STEPS.length}`,
    h('h3',{text:step.title}),h('p.t-sm.t-dim.mt-2',{text:step.text}),
    h('button.btn.btn-solid.mt-2',{text:step.id==='path'?'选择道途':'前往处理',onclick:()=>step.id==='path'?pathModal(s,ctx):ctx.navigate(guideRoutes[step.id] || 'home')}),
  ) : null;
  const leisure = panel('洞府日常', '灵田 · 牧场 · 灵兽',
    h('p.t-sm.t-dim',{live:'leisureStatus',text:`${ready} 块灵田可收获 · 牧场待收 ${pending} 件`}),
    h('div.btn-row.mt-3', null,
      h('button.btn',{text:'收获灵田',liveDisabled:'noHarvest',disabled:!ready,onclick:async ()=>{ const r=await harvestAll(s); if(!r.ok) ctx.showToast('暂时没有成熟的作物'); ctx.rerender(); }}),
      h('button.btn',{text:'收取牧场',liveDisabled:'noRanch',disabled:!pending,onclick:async ()=>{ const r=await collectAll(s); if(!r.ok) ctx.showToast('暂时没有牧场产出'); ctx.rerender(); }}),
      action('管理洞府与灵兽','farm'),
    ),
  );
  const income = panel('现代生活', '经营仍在继续',
    kv('工资与商业',`¥${fmtInt(totalIncomePerHour(s))} / 时`),kv('地产租金',`¥${fmtInt(rentPerHour(s))} / 时`),
    h('div.btn-row.mt-3',null,action('管理事业','modern'),action('地产与店铺','estate'),action('休闲生活','lifestyle')),
  );
  const ts = taleStats(s), pendingTaleItem = pendingTale(s);
  const tales = panel('奇闻手记', `见闻 ${ts.seen}/${ts.total} · 今日 ${ts.today}/${ts.quota}`,
    h('p.t-xs.t-dim', { text: '每界潮日2次机会，福缘与生活、宗门、城市加成可提高至3–4次。只保留一条待处理事件，离线不堆弹窗；付费选择须备足资金。' }),
    pendingTaleItem ? h('button.btn.btn-sm.mt-2', { text: `处理奇闻：${pendingTaleItem.name}`, onclick: () => ctx.taleModal() }) : null,
    h('details.mt-2', null, h('summary.t-xs', { text: '最近选择与结果' }), (s.tales?.history || []).map(e => h('div.mt-2', null, h('p.t-xs', { text: `${e.name} · ${e.choice}` }), h('p.t-xs.t-dim', { text: e.text }), h('p.t-xs', { text: e.notes.join(' · ') || '无资源变动' })))));
  const report = ctx.offlineReport;
  const signed = n => `${n < 0 ? '−' : '+'}${fmtInt(Math.abs(n))}`;
  return h('div.flex-col.gap-4',null,
    report ? panel('你不在的时候',fmtDuration(report.elapsedReal),h('p.t-sm',{text:`修为 ${signed(report.cult)} · 灵石 ${signed(report.stone)} · ¥${signed(report.cny)}`}),report.capped?h('p.t-xs.t-dim',{text:'本次最多结算三天。'}):null,offlineProduction(report)):null,
    hero, panel('今日界报','先处理紧急事项',
      h('p.t-sm',{text:`${ready} 块灵田成熟 · 牧场待收 ${pending} 件 · ${s.commissions.active.length} 份委托进行中`}),
      h('div.btn-row.mt-2',null,pendingTaleItem ? h('button.btn.btn-sm',{text:'处理当前奇闻',onclick:()=>ctx.taleModal()}) : null,
        ready || pending ? action('收取洞府产出',s.side === 'cultivation' ? 'farm' : 'gate') : null,
        s.commissions.active.length ? action('交付或查看委托','gate') : null)),
    worldStatePanel(s,ctx),dailyPanel(s,ctx),guide,
    !s.tutorial.skipped && s.player.stage < 10 ? panel('新手章节','章节内任务可同时推进',tutorialChapters(s).map(c=>h('details.mt-2',null,h('summary',{text:`${c.name} · ${c.tasks.filter(x=>x.completed).length}/${c.tasks.length}`}),c.tasks.map(t=>t.completed ? h('p.t-xs.mt-1',{text:`✓ ${t.title}`}) : h('button.btn.btn-sm.mt-1',{text:`○ ${t.title}`,onclick:()=>t.id==='path'?pathModal(s,ctx):ctx.navigate(guideRoutes[t.id] || 'home')}))))) : null,journeyPanel(s,ctx),objectivePanel(s,ctx),commissionsPanel(s,ctx,true),growthPanel(s,ctx),leisure,income,h('details',null,h('summary',{text:'连续故事与同行手记'}),storiesPanel(s,ctx)),tales,
  );
}
