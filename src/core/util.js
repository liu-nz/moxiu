/**
 * util.js —— 数值格式化 / 随机数 / 通用小工具
 */

/* ---------------- 随机数 ---------------- */
let _seed = 1;

export function setSeed(s) { _seed = s >>> 0 || 1; }

/** mulberry32：可复现随机，用于每日行情等需要“同一天同一结果”的场景 */
export function rand() {
  _seed |= 0; _seed = (_seed + 0x6D2B79F5) | 0;
  let t = Math.imul(_seed ^ (_seed >>> 15), 1 | _seed);
  t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

export function rint(a, b) { return Math.floor(Math.random() * (b - a + 1)) + a; }
export function rfloat(a, b) { return Math.random() * (b - a) + a; }
export function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
export function chance(p) { return Math.random() < p; }

/** 基于字符串种子生成稳定伪随机序列（每日行情用） */
export function seededRand(seedStr) {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return function () {
    h |= 0; h = (h + 0x6D2B79F5) | 0;
    let t = Math.imul(h ^ (h >>> 15), 1 | h);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/* ---------------- 数值格式化 ---------------- */
export function fmtInt(n) {
  if (!isFinite(n)) return '—';
  return Math.round(n).toLocaleString('zh-CN');
}

export function fmtMoney(n) {
  if (!isFinite(n)) return '—';
  return Math.round(n).toLocaleString('zh-CN');
}

/** 大数简写：12345 → 1.23万，1.2e9 → 12.00亿，1.2e13 → 12.00万亿 */
export function fmtShort(n) {
  if (!isFinite(n)) return '—';
  const abs = Math.abs(n);
  const sign = n < 0 ? '-' : '';
  const a = Math.abs(n);
  if (a >= 1e16) return sign + (a / 1e16).toFixed(2) + '亿亿';
  if (a >= 1e12) return sign + (a / 1e12).toFixed(2) + '万亿';
  if (a >= 1e8) return sign + (a / 1e8).toFixed(2) + '亿';
  if (a >= 1e4) return sign + (a / 1e4).toFixed(2) + '万';
  return sign + Math.round(a).toLocaleString('zh-CN');
}

/** 修为等极大数值专用（避免出现 12345.67万亿 这种读不动的写法） */
export function fmtCult(n) {
  if (!isFinite(n)) return '—';
  const a = Math.abs(n);
  if (a >= 1e16) return (n / 1e16).toFixed(3) + '亿亿';
  if (a >= 1e12) return (n / 1e12).toFixed(3) + '万亿';
  if (a >= 1e8) return (n / 1e8).toFixed(3) + '亿';
  if (a >= 1e4) return (n / 1e4).toFixed(2) + '万';
  return Math.round(n).toLocaleString('zh-CN');
}

export function fmtPct(n, digits = 1) {
  if (!isFinite(n)) return '—';
  return (n * 100).toFixed(digits) + '%';
}

export function fmtKg(n) {
  if (n >= 1000) return (n / 1000).toFixed(2) + ' t';
  return (Math.round(n * 100) / 100).toFixed(2) + ' kg';
}

export function fmtDuration(ms) {
  if (!isFinite(ms) || ms <= 0) return '00:00';
  const s = Math.floor(ms / 1000);
  const d = Math.floor(s / 86400);
  const h = Math.floor((s % 86400) / 3600);
  const m = Math.floor((s % 3600) / 60);
  const ss = s % 60;
  const p2 = (x) => String(x).padStart(2, '0');
  if (d > 0) return `${d}天${p2(h)}:${p2(m)}:${p2(ss)}`;
  return `${p2(h)}:${p2(m)}:${p2(ss)}`;
}

export function fmtSigned(n, digits = 0) {
  const v = digits ? n.toFixed(digits) : Math.round(n);
  return (n > 0 ? '+' : '') + v;
}

/* ---------------- 杂项 ---------------- */
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
export function uid(prefix = 'u') {
  return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}
export function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
export function sum(arr, f = (x) => x) { return arr.reduce((a, b) => a + f(b), 0); }

/** 权重抽取：entries = [[value, weight], ...] */
export function weightedPick(entries) {
  const total = entries.reduce((a, e) => a + e[1], 0);
  let r = Math.random() * total;
  for (const [v, w] of entries) {
    r -= w;
    if (r <= 0) return v;
  }
  return entries[entries.length - 1][0];
}

/** 中文数字（用于层数展示） */
const CN = ['零', '一', '二', '三', '四', '五', '六', '七', '八', '九', '十'];
export function cnNum(n) {
  if (n <= 10) return CN[n] || String(n);
  if (n < 20) return '十' + CN[n - 10];
  return String(n);
}
