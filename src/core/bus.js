/**
 * bus.js —— 极简事件总线
 * systems 层通过 bus 抛事件，ui 层订阅后重绘，避免直接耦合。
 */
const listeners = new Map();

export function on(type, fn) {
  if (!listeners.has(type)) listeners.set(type, new Set());
  listeners.get(type).add(fn);
  return () => off(type, fn);
}

export function off(type, fn) {
  const set = listeners.get(type);
  if (set) set.delete(fn);
}

export function emit(type, payload) {
  const set = listeners.get(type);
  if (set) {
    for (const fn of [...set]) {
      try { fn(payload); } catch (e) { console.error('[bus]', type, e); }
    }
  }
  const all = listeners.get('*');
  if (all) {
    for (const fn of [...all]) {
      try { fn({ type, payload }); } catch (e) { console.error('[bus:*]', e); }
    }
  }
}

export const EV = {
  TICK: 'tick',
  STATE: 'state',
  LOG: 'log',
  TOAST: 'toast',
  WORLD: 'world',
  RIFT: 'rift',
  BREAKTHROUGH: 'breakthrough',
  BATTLE: 'battle',
  MARKET: 'market',
  TUTORIAL: 'tutorial',
  OVERLAY: 'overlay',
};
