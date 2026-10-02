/**
 * log.js —— 事件日志与提示
 */

import { emit, EV } from '../core/bus.js';

const MAX_LOG = 120;

export function pushLog(state, message, kind = '') {
  const entry = {
    t: state.world.clockMs,
    m: message,
    kind,          // '' | 'good' | 'warn' | 'hl'
  };
  state.log.push(entry);
  if (state.log.length > MAX_LOG) state.log.splice(0, state.log.length - MAX_LOG);
  emit(EV.LOG, entry);
  return entry;
}

export function toast(message, kind = '') {
  emit(EV.TOAST, { message, kind });
}

export function logGood(state, m) { return pushLog(state, m, 'good'); }
export function logWarn(state, m) { return pushLog(state, m, 'warn'); }
export function logHl(state, m) { return pushLog(state, m, 'hl'); }
