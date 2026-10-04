/**
 * save.js —— SaveManager
 *
 * 上层只跟这里打交道；具体写到哪由 storage.js 的后端决定。
 * 一期是本地后端；二期云服务激活后换成云端后端，本文件与业务代码都不用改。
 *
 * 与旧版的区别：**写失败不再被静默吞掉**。
 * 隐私模式、配额超限这类情况以前只会让 save() 返回 false 而无人理会，
 * 玩家会在毫无察觉的情况下丢掉全部进度。现在会记账并通过事件上报。
 */

import { SAVE_KEY, SAVE_VERSION, createInitialState } from './state.js';
import { getProvider, DEFAULT_PROVIDER, probeLocal, listProviders, registerProvider } from './storage.js';
import { emit, EV } from './bus.js';

let _timer = null;
let _state = null;
let _providerId = DEFAULT_PROVIDER;
let _unloadPaused = false;

/** 存档运行状态（供 UI 展示） */
const status = {
  provider: DEFAULT_PROVIDER,
  lastSavedAt: 0,
  lastError: null,
  consecutiveFailures: 0,
  available: true,
};

export function bindState(state) { _state = state; }

export function getProviderId() { return _providerId; }

export function setProvider(id) {
  _providerId = id;
  status.provider = id;
  emit(EV.STATE);
}

export function statusSnapshot() {
  return { ...status, providers: listProviders().map((p) => ({ id: p.id, label: p.label, hint: p.hint })) };
}

/** 启动时自检：本地存储不可用要立刻让上层知道，而不是等到第一次保存失败 */
export function selfCheck() {
  const p = getProvider(_providerId);
  const res = p.available();
  status.available = res.ok;
  if (!res.ok) {
    status.lastError = res.message;
    console.warn('[save] 存档后端不可用：', res.message);
  }
  return res;
}

export function hasSave() {
  const p = getProvider(_providerId);
  return !!p.read(SAVE_KEY);
}

export function load() {
  const p = getProvider(_providerId);
  let raw = null;
  try { raw = p.read(SAVE_KEY); } catch (e) { console.warn('[save] 读取失败', e); }
  if (!raw) return null;
  try {
    return migrate(JSON.parse(raw));
  } catch (e) {
    console.error('[save] 解析失败，已忽略旧存档', e);
    return null;
  }
}

/** 版本迁移：把旧档补齐为新结构 */
function migrate(data) {
  const base = createInitialState(Date.now());
  const merged = deepMerge(base, data);
  merged.version = SAVE_VERSION;
  return merged;
}

function deepMerge(base, patch) {
  if (patch === null || patch === undefined) return base;
  if (Array.isArray(base) || typeof base !== 'object') return patch;
  if (typeof patch !== 'object' || Array.isArray(patch)) return patch;
  const out = Array.isArray(base) ? [...base] : { ...base };
  for (const k of Object.keys(patch)) {
    if (k in base && base[k] && typeof base[k] === 'object' && !Array.isArray(base[k])) {
      out[k] = deepMerge(base[k], patch[k]);
    } else {
      out[k] = patch[k];
    }
  }
  return out;
}

function recordResult(res) {
  if (res && res.ok) {
    status.lastSavedAt = Date.now();
    status.lastError = null;
    status.consecutiveFailures = 0;
    return { ok: true };
  }
  status.consecutiveFailures += 1;
  status.lastError = res?.message || '存档写入失败';
  // 第一次失败就提醒，之后每 10 次再提醒一次，避免刷屏
  if (status.consecutiveFailures === 1 || status.consecutiveFailures % 10 === 0) {
    emit(EV.TOAST, { message: `${status.lastError}（已连续失败 ${status.consecutiveFailures} 次）`, kind: 'warn' });
  }
  return { ok: false, reason: res?.reason, message: status.lastError };
}

/** 当前后端是否为异步后端（如云端） */
export function isAsyncProvider() {
  return !!getProvider(_providerId).isAsync;
}

export function save(state) {
  const s = state || _state;
  if (!s) return { ok: false, reason: 'no-state' };
  s.savedAt = Date.now();

  const p = getProvider(_providerId);
  if (p.isAsync) {
    // 异步后端不阻塞主循环：先记账，结果回来再更新状态
    if (typeof p.writeAsync !== 'function') return { ok: false, reason: 'unsupported' };
    Promise.resolve(p.writeAsync(SAVE_KEY, JSON.stringify(s)))
      .then(recordResult)
      .catch((e) => recordResult({ ok: false, reason: 'exception', message: e?.message || '存档写入异常' }));
    return { ok: true, pending: true };
  }

  let res;
  try {
    res = p.write(SAVE_KEY, JSON.stringify(s));
  } catch (e) {
    res = { ok: false, reason: 'exception', message: e?.message || '存档写入异常' };
  }
  return recordResult(res);
}

/** 异步落盘（用于「保存并等待」这类需要确认结果的场合） */
export async function saveAsync(state) {
  const s = state || _state;
  if (!s) return { ok: false, reason: 'no-state' };
  s.savedAt = Date.now();

  const p = getProvider(_providerId);
  if (!p.isAsync) return save(s);
  if (typeof p.writeAsync !== 'function') return { ok: false, reason: 'unsupported' };

  try {
    return recordResult(await p.writeAsync(SAVE_KEY, JSON.stringify(s)));
  } catch (e) {
    return recordResult({ ok: false, reason: 'exception', message: e?.message || '存档写入异常' });
  }
}

/**
 * 读取存档（异步）。
 * 同步后端直接返回本地档；异步后端读取失败时返回 null，
 * 由调用方决定回落策略——**不在这里静默降级**。
 */
export async function loadAsync() {
  const p = getProvider(_providerId);
  if (!p.isAsync) return load();
  if (typeof p.readAsync !== 'function') return null;

  try {
    const raw = await p.readAsync(SAVE_KEY);
    if (!raw) return null;
    return migrate(typeof raw === 'string' ? JSON.parse(raw) : raw);
  } catch (e) {
    if (p.strictRead) throw e;
    console.warn('[save] 远程存档读取失败', e);
    return null;
  }
}

/** 自动存档：每 intervalMs 落一次盘 */
export function startAutoSave(getState, intervalMs = 8000) {
  stopAutoSave();
  _unloadPaused = false;
  _timer = setInterval(() => save(getState()), intervalMs);
}

export function stopAutoSave({ pauseUnload = false } = {}) {
  if (pauseUnload) _unloadPaused = true;
  if (_timer) { clearInterval(_timer); _timer = null; }
}

export function reset() {
  const p = getProvider(_providerId);
  try { return p.remove(SAVE_KEY) || { ok: true }; }
  catch { return { ok: false }; }
}

/** 云端重置必须等待确认，失败时保留当前角色供导出。 */
export async function resetAsync() {
  stopAutoSave({ pauseUnload: true });
  if (!isAsyncProvider()) return reset();
  const result = await saveAsync(createInitialState(Date.now()));
  if (!result.ok) startAutoSave(() => _state, 30000);
  return result;
}

/* ---------------- 导出 / 导入（换设备或迁移到云端前的备份手段） ---------------- */
export function exportJSON(state) {
  return JSON.stringify(state || _state, null, 2);
}

export function importJSON(text) {
  return migrate(JSON.parse(text));
}

export function exportFileName() {
  const d = new Date();
  const p2 = (n) => String(n).padStart(2, '0');
  return `moxiu-save-${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}-${p2(d.getHours())}${p2(d.getMinutes())}.json`;
}

/** 页面关闭前落盘 */
export function installUnloadHook(getState) {
  window.addEventListener('beforeunload', () => { if (!_unloadPaused) save(getState()); });
  document.addEventListener('visibilitychange', () => {
    if (!_unloadPaused && document.visibilityState === 'hidden') save(getState());
  });
}

/**
 * 决定本次启动该用哪份存档。纯函数，便于单独验证。
 *
 * 返回 { pick, conflict }：
 *   pick      'new' | 'local' | 'cloud' | null（null 表示需要玩家裁决）
 *   conflict  两份都存在且不是同一次保存
 */
export function decideSaveSource(local, cloud) {
  if (!local && !cloud) return { pick: 'new', conflict: false };
  if (cloud && !local) return { pick: 'cloud', conflict: false };
  if (local && !cloud) return { pick: 'local', conflict: false };
  // 两边都有：savedAt 相同说明本地只是云端的缓存副本，直接取云端
  if (local.savedAt && local.savedAt === cloud.savedAt) return { pick: 'cloud', conflict: false };
  return { pick: null, conflict: true };
}

export { probeLocal, registerProvider };
