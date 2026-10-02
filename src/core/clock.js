/**
 * clock.js —— 游戏世界时钟与「界潮日」计算
 *
 * GDD 3.1：界潮每日 05:00（UTC+8）刷新，刷新后 24 小时内均可使用。
 * 世界时钟 world.clockMs 会按时间倍率推进；界潮日完全由它推导，
 * 因此 1x / 10x / 60x 倍率下都能完整体验「每日界潮」的节奏。
 */

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;
const TZ = 8 * HOUR;        // UTC+8
const REFRESH_AT = 5 * HOUR; // 每日 05:00

/** 当前属于第几个界潮日（整数，跨日即 +1） */
export function riftDayIndex(clockMs) {
  return Math.floor((clockMs + TZ - REFRESH_AT) / DAY);
}

/** 该界潮日的开始时间戳（游戏世界时间） */
export function riftDayStart(dayIndex) {
  return dayIndex * DAY + REFRESH_AT - TZ;
}

/** 下一次界潮刷新时间戳 */
export function nextRiftAt(clockMs) {
  return riftDayStart(riftDayIndex(clockMs) + 1);
}

/** 距下次刷新的毫秒数 */
export function msToNextRift(clockMs) {
  return Math.max(0, nextRiftAt(clockMs) - clockMs);
}

/** 世界时钟 → UTC+8 的 HH:MM */
export function clockHM(clockMs) {
  const t = ((clockMs + TZ) % DAY + DAY) % DAY;
  const h = Math.floor(t / HOUR);
  const m = Math.floor((t % HOUR) / 60000);
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** 世界时钟 → MM-DD */
export function clockDate(clockMs) {
  const d = new Date(clockMs + TZ);
  return String(d.getUTCMonth() + 1).padStart(2, '0') + '-' + String(d.getUTCDate()).padStart(2, '0');
}

/** 第几个界潮日转为可读的“第 N 日” */
export function dayLabel(clockMs) {
  return `第 ${riftDayIndex(clockMs) + 1} 日`;
}

export { HOUR, DAY, TZ };
