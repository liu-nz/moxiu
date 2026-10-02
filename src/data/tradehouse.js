/**
 * tradehouse.js —— 玩家交易行配置（GDD 15）
 *
 * 「上架物品卖给其他天选者，灵石/人民币双货币交易。一期用 NPC 模拟价格波动。」
 *
 * 交易行的价值在于：不必跨界，也能把货换成另一侧的货币。
 * 代价是参考价相对本地市场打了折（refDiscount），并且卖得快不快取决于你的定价。
 */

export const TRADEHOUSE = {
  /** 初始挂单槽位，可花灵石扩充 */
  baseSlots: 3,
  maxSlots: 8,
  slotCostOf(owned) {
    return Math.round(2500 * Math.pow(2.3, Math.max(0, owned - TRADEHOUSE.baseSlots)));
  },

  /** 参考价 = 本地市场价 × 该折扣（不用跨界，所以要吃点亏） */
  refDiscount: 0.85,

  /** 每小时基准成交量（件） */
  baseThroughput: 2.2,

  /** 定价 / 参考价 → 成交速度系数 */
  speedFactor(ratio) {
    if (ratio <= 0.70) return 2.2;
    if (ratio <= 0.85) return 1.7;
    if (ratio <= 1.00) return 1.2;
    if (ratio <= 1.15) return 0.8;
    if (ratio <= 1.35) return 0.40;
    if (ratio <= 1.60) return 0.15;
    return 0.03;
  },

  /** 定价区间（相对参考价） */
  minRatio: 0.40,
  maxRatio: 3.00,

  /** 定价建议档位 */
  presets: [
    { label: '速出（7 折）', ratio: 0.70, hint: '成交最快，但每件少赚三成' },
    { label: '快出（8.5 折）', ratio: 0.85, hint: '当天基本能清完' },
    { label: '平价', ratio: 1.00, hint: '需要一点耐心' },
    { label: '溢价（1.2 倍）', ratio: 1.20, hint: '卖得慢，但每件多赚两成' },
    { label: '宰客（1.5 倍）', ratio: 1.50, hint: '只有冤大头会买，可能要挂很久' },
  ],
};

/** 上架税费（跨界商会可减免） */
export const LISTING_FEE = 0.02;
