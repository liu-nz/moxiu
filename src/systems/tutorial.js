/**
 * tutorial.js —— 新手引导（GDD 17）
 * 四阶段主线（开局入场 → 学会修炼 → 第一次副本 → Build 认知与筑基）
 * 外加 GDD 新增引导点：第一次界潮跨界、第一次市场定价、第一次灵科研究。
 */

import { ITEM_MAP } from '../data/items.js';
import { emit, EV } from '../core/bus.js';

export const TUTORIAL_STEPS = [
  {
    id: 'path', title: '择道',
    text: '两界之门在你眼前裂开的那天，你先要决定自己怎么走。选一条道途——它不会限制你，但会决定你前期最舒服的活法。',
    done: (s) => !!s.path,
  },
  {
    id: 'job', title: '先活下去',
    text: '在里世界，钱是唯一的通行证。找一份工作，让它在你挂机的时候替你赚钱。',
    done: (s) => !!s.modern.job,
  },
  {
    id: 'buy', title: '第一次进货',
    text: '打开「商城」，用人民币买几件现代货。先在界门查看目的地行情，再决定进货。',
    done: (s) => !!s.tutorial.journey?.purchasedModern,
  },
  {
    id: 'cross', title: '第一次跨界',
    text: '每日界潮已至。进入「界门」，确认背包后开启穿越。载重有限，别贪。',
    done: (s) => !!s.tutorial.journey?.departed,
  },
  {
    id: 'sell', title: '第一次开张',
    text: '在这里，抗生素是解百毒之药。把带来的现代货全部卖掉，换成灵石——那是修仙界唯一认的东西。',
    done: (s) => !!s.tutorial.journey?.outboundSold,
  },
  { id: 'returnCargo', title: '回程也要带货', text: '出货所得灵石不要全花掉。进货灵米、黄精草或聚气丹，比较现代估价；也可带自产作物回程。无需等待第一茬作物成熟。', done: s => !!s.tutorial.journey?.loadedReturn },
  { id: 'return', title: '带货回到现代', text: '界潮双向分别计数。确认回程货物与载重，再从界门返回现代。', done: s => !!s.tutorial.journey?.returned },
  { id: 'reverseSell', title: '完成双向贸易', text: '在现代市场出售回程修仙货。记录本次人民币投入和回款，剩余灵石单独记账；不要把两种货币直接相加。', done: s => !!s.tutorial.journey?.inboundSold },
  {
    id: 'cultivate', title: '引气入体',
    text: '有了灵石，就可以安心修炼了。修为会自动增长，但只有身在修仙界才是满速。',
    done: (s) => s.player.stage >= 1,
  },
  {
    id: 'farm', title: '开一块田',
    text: '洞府里能种灵田。基础灵米和黄精草可进货；百年人参、冰莲和九转还魂草需种植。种植与市场是不同的备料渠道。',
    done: (s) => (s.farm?.plots || []).some((p) => p),
  },
  {
    id: 'dungeon', title: '初试身手',
    text: '炼气三层后，「山贼寨」对你开放。带上合金刀或者别的家伙，去试试你的 Build。',
    done: (s) => Object.values(s.dungeon.cleared || {}).some(n => n > 0),
  },
  {
    id: 'skill', title: 'Build 认知',
    text: '炼气五层解锁功法系统。心法、招式、特殊，四个槽位——这才是你和其他修士拉开差距的地方。',
    done: (s) => s.player.stage >= 4,
  },
  {
    id: 'research', title: '灵科融合',
    text: '「灵科」是《墨修》真正独特的地方：现代仪器 + 修仙术法。第一次研究解锁后，你会拿到机制型的能力，而不是几个百分比。',
    done: (s) => Object.keys(s.research?.done || {}).length >= 1,
  },
  {
    id: 'companion', title: '一个人走不远',
    text: '道侣不是装饰。好感度到「知己」之后，她们会在你下线的时候替你刷副本、炼丹、看店。',
    done: (s) => Object.values(s.companions || {}).some((c) => (c.affection || 0) >= 60),
  },
  {
    id: 'foundation', title: '筑基',
    text: '炼气大圆满之后，突破需要运气，也需要保底。失败了不掉境界，但会散掉一部分修为。筑基之后，界门会扩容。',
    done: (s) => s.player.stage >= 10,
  },
];

export const TUTORIAL_CHAPTERS = [
 {name:'第一章 · 两界开张',steps:['path','job','buy','cross','sell','returnCargo','return','reverseSell']},
 {name:'第二章 · 修行与洞府',steps:['cultivate','farm','dungeon','skill']},
 {name:'第三章 · 灵科与筑基',steps:['research','foundation']},
];
export function tutorialChapters(state) {
 return TUTORIAL_CHAPTERS.map(c=>({...c,tasks:c.steps.map(id=>{const step=TUTORIAL_STEPS.find(x=>x.id===id);return {...step,completed:!!state.tutorial.done?.[id] || step.done(state)};})}));
}

export function currentStep(state) {
  return TUTORIAL_STEPS[state.tutorial.step || 0] || null;
}

/** 按稳定步骤ID迁移；新增贸易步骤需要真实行为，不从货币余额猜测。 */
export function updateTutorial(state) {
  const t = state.tutorial;
  if (!t) return false;
  if (!t.done || typeof t.done !== 'object') t.done = {};
  if (t.skipped) { t.step = TUTORIAL_STEPS.length; return false; }
  const before = t.step;
  for (const step of TUTORIAL_STEPS) {
    if (t.done[step.id]) continue;
    try { if (step.done(state)) t.done[step.id] = true; } catch { /* 旧档缺失数据等待迁移 */ }
  }
  const index = TUTORIAL_STEPS.findIndex(step => step.id !== 'companion' && !t.done[step.id]);
  t.step = index < 0 ? TUTORIAL_STEPS.length : index;
  if (t.step !== before) emit(EV.TUTORIAL, { step: t.step });
  return t.step !== before;
}

/** 由成交与穿越调用；中途收入、赠礼和本地回收不能冒充双向贸易。 */
export function noteTutorialTrade(state, record) {
  if (!state.tutorial || record.channel !== '市场') return;
  const item = ITEM_MAP[record.itemId];
  if (!item) return;
  const j = state.tutorial.journey ??= {};
  if (j.inboundSold) return;
  if (record.type === 'buy' && record.currency === 'cny' && item.origin === 'modern') {
    j.purchasedModern = true; j.cnySpent = (j.cnySpent || 0) + record.amount;
  }
  if (record.type === 'sell' && record.currency === 'stone' && item.origin === 'modern' && j.departed && j.purchasedModern) j.outboundSold = true;
  if (record.type === 'buy' && record.currency === 'stone' && item.origin === 'cultivation' && j.outboundSold) j.loadedReturn = true;
  if (record.type === 'sell' && record.currency === 'cny' && item.origin === 'cultivation' && j.returned && j.loadedReturn) {
    j.cnyReturned = (j.cnyReturned || 0) + record.amount;
    j.inboundSold = true; j.completedAt = state.world.clockMs;
  }
}
export function noteTutorialCross(state, toSide) {
  const j = state.tutorial.journey ??= {};
  if (toSide === 'cultivation' && j.purchasedModern) j.departed = true;
  if (toSide === 'modern' && j.outboundSold && state.inventory.some(e => ITEM_MAP[e.itemId]?.origin === 'cultivation' && e.qty > 0)) {
    j.loadedReturn = true; j.returned = true;
  }
}

export function isTutorialFinished(state) {
  return (state.tutorial.step || 0) >= TUTORIAL_STEPS.length;
}

export function skipTutorial(state) {
  state.tutorial.skipped = true;
  state.tutorial.step = TUTORIAL_STEPS.length;
  emit(EV.TUTORIAL, { step: state.tutorial.step });
}

export function tutorialProgress(state) {
  return {
    step: state.tutorial.step || 0,
    total: TUTORIAL_STEPS.length,
    finished: isTutorialFinished(state),
  };
}
