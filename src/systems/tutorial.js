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
    done: (s) => s.inventory.some((e) => ITEM_MAP[e.itemId]?.origin === 'modern'),
  },
  {
    id: 'cross', title: '第一次跨界',
    text: '每日界潮已至。进入「界门」，确认背包后开启穿越。载重有限，别贪。',
    done: (s) => s.stats.crossings >= 1,
  },
  {
    id: 'sell', title: '第一次开张',
    text: '在这里，抗生素是解百毒之药。把带来的现代货全部卖掉，换成灵石——那是修仙界唯一认的东西。',
    done: (s) => s.currency.stone > 0,
  },
  {
    id: 'cultivate', title: '引气入体',
    text: '有了灵石，就可以安心修炼了。修为会自动增长，但只有身在修仙界才是满速。',
    done: (s) => s.player.stage >= 1,
  },
  {
    id: 'farm', title: '开一块田',
    text: '洞府里能种灵田。作物一茬比一茬值钱，而且只能种、不能买——这是你在修仙界真正的资产。',
    done: (s) => (s.farm?.plots || []).some((p) => p),
  },
  {
    id: 'dungeon', title: '初试身手',
    text: '炼气三层后，「山贼寨」对你开放。带上合金刀或者别的家伙，去试试你的 Build。',
    done: (s) => (s.stats.wins || 0) >= 1,
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
    done: (s) => Object.values(s.companions || {}).some((c) => (c.affection || 0) >= 40),
  },
  {
    id: 'foundation', title: '筑基',
    text: '炼气大圆满之后，突破需要运气，也需要保底。失败了不掉境界，但会散掉一部分修为。筑基之后，界门会扩容。',
    done: (s) => s.player.stage >= 10,
  },
];

export function currentStep(state) {
  const i = state.tutorial.step || 0;
  return TUTORIAL_STEPS[Math.min(i, TUTORIAL_STEPS.length - 1)] || null;
}

export function updateTutorial(state) {
  let changed = false;
  let guard = 0;
  while (guard++ < TUTORIAL_STEPS.length + 2) {
    const i = state.tutorial.step || 0;
    if (i >= TUTORIAL_STEPS.length) break;
    const step = TUTORIAL_STEPS[i];
    let ok = false;
    try { ok = step.done(state); } catch { ok = false; }
    if (!ok) break;
    state.tutorial.done[step.id] = true;
    state.tutorial.step = i + 1;
    changed = true;
  }
  if (changed) emit(EV.TUTORIAL, { step: state.tutorial.step });
  return changed;
}

export function isTutorialFinished(state) {
  return (state.tutorial.step || 0) >= TUTORIAL_STEPS.length;
}

export function skipTutorial(state) {
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
