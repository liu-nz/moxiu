/**
 * storage.js —— 存档后端抽象
 *
 * 把「存档写到哪」和「存档写什么」分开。上层只认 SaveManager，
 * 换后端不需要改任何业务代码。
 *
 * 目前只有本地后端。云服务激活后，在 PROVIDERS 里注册 cloud 实现即可
 * （见 docs/online-迁移脚本.md 与 docs/开发计划.md 第五部分）。
 */

const PROBE_KEY = 'moxiu.probe';

function store() {
  try {
    return globalThis.localStorage || null;
  } catch {
    // 某些浏览器在隐私模式下访问 localStorage 本身就会抛
    return null;
  }
}

/** 探测本地存储是否真的能用（隐私模式、被策略禁用都会在这里露出来） */
export function probeLocal() {
  const s = store();
  if (!s) return { ok: false, reason: 'unavailable', message: '浏览器未提供本地存储' };
  try {
    s.setItem(PROBE_KEY, '1');
    s.removeItem(PROBE_KEY);
    return { ok: true };
  } catch (e) {
    const quota = e?.name === 'QuotaExceededError' || e?.code === 22;
    return {
      ok: false,
      reason: quota ? 'quota' : 'unavailable',
      message: quota ? '浏览器存储配额已满' : '浏览器存储不可用（可能是隐私模式或已被禁用）',
    };
  }
}

export const localProvider = {
  id: 'local',
  label: '本地存档',
  hint: '保存在这台设备的浏览器里。换设备或清缓存会丢失。',
  isAsync: false,

  available() { return probeLocal(); },

  read(key) {
    const s = store();
    if (!s) return null;
    try { return s.getItem(key); } catch { return null; }
  },

  write(key, text) {
    const s = store();
    if (!s) return { ok: false, reason: 'unavailable', message: '浏览器未提供本地存储' };
    try {
      s.setItem(key, text);
      return { ok: true };
    } catch (e) {
      const quota = e?.name === 'QuotaExceededError' || e?.code === 22;
      return {
        ok: false,
        reason: quota ? 'quota' : 'unavailable',
        message: quota ? '浏览器存储配额已满，存档未写入' : '浏览器存储不可用，存档未写入',
      };
    }
  },

  remove(key) {
    const s = store();
    if (!s) return { ok: false, reason: 'unavailable' };
    try { s.removeItem(key); return { ok: true }; }
    catch { return { ok: false, reason: 'unavailable' }; }
  },
};

/** 后端注册表。云服务接入时在此追加 cloud 实现。 */
export const PROVIDERS = {
  local: localProvider,
};

export const DEFAULT_PROVIDER = 'local';

/**
 * 注册一个存档后端。
 *
 * 同步后端需要：available() / read(key) / write(key, text) / remove(key)
 * 异步后端（如云端）需要：isAsync: true / readAsync(key) / writeAsync(key, text)
 *
 * 云服务激活后，cloud 实现就通过这里挂进来——SaveManager 与业务代码都不用改。
 */
export function registerProvider(id, impl) {
  if (!id || !impl) throw new Error('registerProvider 需要 id 与实现');
  PROVIDERS[id] = { id, ...impl };
  return PROVIDERS[id];
}

export function getProvider(id) {
  return PROVIDERS[id] || PROVIDERS[DEFAULT_PROVIDER];
}

export function listProviders() {
  return Object.values(PROVIDERS);
}
