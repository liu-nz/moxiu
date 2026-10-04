/**
 * state.js —— 全局状态定义与初始化
 */

export const SAVE_VERSION = 4;
export const SAVE_KEY = 'moxiu.save.v4';

export const SIDE = { CULTIVATION: 'cultivation', MODERN: 'modern' };
export const SIDE_NAME = { cultivation: '修仙界', modern: '现代都市' };
export const SIDE_SUB = { cultivation: '表世界', modern: '里世界' };

export function createInitialState(nowMs) {
  return {
    version: SAVE_VERSION,
    createdAt: nowMs,
    savedAt: nowMs,
    playMs: 0,

    world: {
      clockMs: nowMs,
      speed: 1,
      /** 'standard' = 时钟对齐真实时间、界潮全服统一；'sandbox' = 可按倍率快进 */
      mode: 'standard',
    },

    side: SIDE.MODERN,

    path: null,

    player: {
      stage: 0,               // 全局阶段序号：0 = 炼气一层
      cultivation: 0,         // 当前阶段已积累修为
      totalCultivation: 0,
      hp: null,               // null 表示“满”，进入战斗时按上限补齐
      mp: null,
      stamina: 100,
      staminaAcc: 0,
      ascensionReady: false,
      autoBreakthrough: false,
      breakthroughFails: 0,
      breakthroughBuff: 0,    // 一次性突破加成（筑基丹）
      buffs: [],              // [{id, name, until, mods}]
      pillsUsed: 0,
    },

    currency: { stone: 0, cny: 2000 },

    rift: {
      day: null,
      startDay: null,
      toCultivation: 1,
      toModern: 1,
      banked: 0,
      gateLevel: 1,
      crossings: 0,
      lastCrossAt: 0,
    },

    cargo: { storage: { modern: [], cultivation: [] } },
    inventory: [],            // [{uid, itemId, qty, quality}]

    equipment: {
      weapon: null, helmet: null, armor: null,
      boots: null, ring1: null, ring2: null, artifact: null,
    },
    tech: [],                 // 现代跨界装备（随身携带，不占背包）
    bag: [],                  // 未装备的装备

    skills: { heart: null, move1: null, move2: null, special: null },
    skillBag: [],

    market: {
      day: null,
      eventId: 'calm',
      demand: { cultivation: {}, modern: {} },
      sold: { cultivation: {}, modern: {} },
      bought: { cultivation: {}, modern: {} },
      history: [],
    },

    modern: {
      job: null,
      jobLevel: 1,
      businessLevel: 0,
      workOn: true,
      reserveCny: 0,
      industries: {},
    },

    /* ---- 灵田（GDD 11.1）---- */
    farm: {
      plots: [],              // [{cropId, plantedAt, readyAt}] | null
      unlocked: 3,
      plan: {},
      autoHarvest: true,
      autoReplant: true,
      reserveStone: 0,
    },

    /* ---- 灵脉牧场（GDD 11.2）---- */
    ranch: {
      slots: [],              // [{beastId, lastAt}] | null
      unlocked: 2,
      autoCollect: true,
    },

    /* ---- 灵兽 ---- */
    beasts: {
      owned: [],              // [{uid, id, level}]
      deployed: [],           // uid 数组，最多 2
    },

    /* ---- 炼丹 / 炼器 ---- */
    crafting: {
      autoAlchemy: false,
      lastAutoAt: 0,
      autoAcc: 0,
      selectedRecipe: 'huiyuan',
      selectedAux: 'plain',
      reserveStone: 0,
      history: [],
      totalPills: 0,
      totalForged: 0,
      seen: {},               // 已炼过的丹方（药性分析仪首次提示用）
    },

    /* ---- 灵科研究（GDD 5）---- */
    research: {
      points: 0,
      done: {},
      labLevel: 0,
      labAcc: 0,
      lastMaterialAt: 0,
    },

    /* ---- 道侣（GDD 12）---- */
    companions: {},           // { [id]: { affection, gifts, met } }

    /* ---- 现代地产与店铺（GDD 13.3）---- */
    estate: {
      owned: {},              // { [estateId]: count }
      shops: 0,
      warehouseLevel: 0,
      autoSell: false,
      sellAcc: 0,
      saleMode: 'surplus',
      keep: {},
    },

    /* ---- 奇闻事件（GDD 14.1）---- */
    tales: {
      lastAt: 0,
      seen: {},
      count: 0,
      pending: null,
      history: [],
      schedule: null,
      flags: {},
    },

    /* ---- 轮回与天命（GDD 16）---- */
    reincarnation: {
      count: 0,
      points: 0,
      earned: 0,
      blessings: {},          // { [blessingId]: level }
      codex: {},
      fate: null,
      awaitingFate: false,
      freePathSwitchAt: 0,
    },

    /* ---- 社交：交易行 / 道盟 / 商会 / 排行榜（GDD 15）---- */
    social: {
      tradehouse: {
        listings: [],         // [{uid, itemId, qty, quality, price, currency, listedAt, sold, acc}]
        slots: 3,
        totalSold: 0,
        earned: { stone: 0, cny: 0 },
      },
      guild: {
        id: null,
        contribution: 0,
        totalContribution: 0,
        quests: {},           // { [questId]: {day, claimed} }
        shopBought: {},       // { [shopId]: 当日已购次数 }
        bossAt: 0,
        bossBest: 0,
      },
      chamber: {
        joined: false,
        joinedAt: 0,
      },
      ranking: {
        week: null,
        rivals: [],           // [{id, name, base:{power,wealth,trade,speed}, at}]
        titles: {},           // { [boardId]: {rank, name, mods} }
        lastSettleWeek: null,
        bestRanks: {},        // 历史最好名次
      },
    },

    /* ---- 宗门（GDD 1.2 表世界职责）---- */
    sect: {
      id: null,
      contribution: 0,
      totalContribution: 0,
      rank: 0,
      quests: {},
      secrets: {},
      stipendAt: 0,
      trialAt: 0,
      trialBest: null,
      tributes: 0,
    },

    /* ---- 现代休闲生活（GDD 1.2 里世界职责）---- */
    lifestyle: {
      levels: {},
    },

    /* ---- 城市灵改工程（GDD 1.3 后期反哺）---- */
    projects: {
      done: {},
      target: null,
    },

    /* ---- 玩家自选长期目标 ---- */
    objective: null,

    commissions: { day: null, completed: [], active: [], history: [], total: 0, sources: [] },
    collection: { beasts: [], ranch: [], crops: [], equipment: [] },

    /* ---- 每日 / 每周统计（用于道盟任务与排行榜）---- */
    daily: {
      day: null,
      dungeons: 0,
      trades: 0,
      soldQty: 0,
      crafts: 0,
      cultGained: 0,
      stoneEarned: 0,
      cnyEarned: 0,
    },

    /* ---- 自动战斗（GDD 2.1 的 30 秒循环）---- */
    auto: {
      battleOn: false,
      dungeonId: null,
      diffId: 'normal',
      acc: 0,
      runs: 0,
    },

    dungeon: {
      materialTargets: {},
      cleared: {},            // `${id}:${diff}` → 次数
      runs: 0,
      fails: 0,
      log: [],
    },

    tutorial: { step: 0, done: {}, skipped: false, journey: {} },

    stats: {
      profit: 0,
      tradeCount: 0,
      crossings: 0,
      battles: 0,
      wins: 0,
      maxStone: 0,
      maxCny: 0,
    },

    log: [],
  };
}

/** 计算该世界的收益系数（GDD 19：当前世界 100%，另一世界 50%） */
export function sideFactor(state, world) {
  return state.side === world ? 1 : 0.5;
}

export function isCultivationSide(state) { return state.side === SIDE.CULTIVATION; }

export function sideOf(state) { return state.side; }

export function otherSide(side) {
  return side === SIDE.CULTIVATION ? SIDE.MODERN : SIDE.CULTIVATION;
}
