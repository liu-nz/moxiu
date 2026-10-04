import { createInitialState } from './state.js';
import { syncWorldDay } from './loop.js';
import { applyOffline } from '../systems/offline.js';
import { updateTutorial } from '../systems/tutorial.js';
import { bindServerRights, bindServerTitle } from './shards.js';
import { actions } from './game-actions.js';
import { SHARED_COMMANDS, validateShared, runShared } from '../systems/player-community.js';
import { combatPower, cultivationRate } from '../systems/character.js';
import { bindActivity } from '../systems/daily.js';
import { markCollection } from '../systems/collection.js';
export { SHARED_COMMANDS };

const optionKeys = {
  'alchemy.craft': ['auxId', 'silent'],
  'alchemy.setAlchemyPlan': ['recipeId', 'auxId', 'on', 'reserveStone'],
  'farm.setFarmAutomation': ['autoHarvest', 'autoReplant', 'reserveStone'],
  'estate.setShopPolicy': ['mode', 'itemId', 'keepQty'],
  'dungeon.runDungeon': ['silent'],
};
export function initialGame(now) {
  const state = createInitialState(now);
  syncWorldDay(state);
  updateTutorial(state);
  return state;
}
export function validateCommand(action, args) {
  if (Object.hasOwn(SHARED_COMMANDS,action)) return validateShared(action,args);
  if (action === 'sync' || action === 'reset' || action === 'community') {
    if (!Array.isArray(args) || args.length) throw new Error('此操作不接受资产或时间参数');
    return;
  }
  const command = Object.hasOwn(actions, action) && actions[action];
  if (!command || !Array.isArray(args) || args.length < command.min || args.length > command.max) throw new Error('无效的操作或参数数量');
  for (const arg of args) {
    if (arg === null || typeof arg === 'boolean') continue;
    if (typeof arg === 'number') {
      if (!Number.isFinite(arg) || arg < 0 || arg > 1e12 || (action !== 'tradehouse.list' && !Number.isSafeInteger(arg))) throw new Error('数值参数无效');
    } else if (typeof arg === 'string') {
      if (arg.length > 160 || ['__proto__', 'prototype', 'constructor', 'toString', 'valueOf'].includes(arg)) throw new Error('编号无效');
    } else if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      const keys = optionKeys[action];
      if (!keys || Object.keys(arg).some(k => !keys.includes(k))) throw new Error('不允许设置奖励、随机数或跳过消耗');
      for (const value of Object.values(arg)) {
        if (!['string', 'number', 'boolean'].includes(typeof value) ||
            (typeof value === 'number' && (!Number.isSafeInteger(value) || value < 0 || value > 1e12)) ||
            (typeof value === 'string' && (value.length > 80 || ['__proto__', 'constructor', 'prototype'].includes(value)))) throw new Error('设置参数无效');
      }
    } else throw new Error('参数类型无效');
  }
}
export function publicProjection(state) {
  return {stage:state.player.stage,power:combatPower(state,{competitive:true}),wealth:state.currency.stone,speed:cultivationRate(state)};
}
export function settleShared(previous,action,args,now,owned,context,title = null) {
  validateShared(action,args);
  const own=settleGame(previous,'sync',[],now,owned,title);
  const other=context.target ? settleGame(context.target.state,'sync',[],Math.max(now,context.target.state.savedAt),context.target.owned,context.target.title) : null;
  const change=runShared(own.state,other?.state,action,args,context,now);
  return {...own,...change,targetState:other?.state};
}
export function settleGame(previous, action, args, now, owned = [], title = null, activity = null) {
  validateCommand(action, args);
  if (!Number.isSafeInteger(now) || now < previous.savedAt) throw new Error('服务器时间无效');
  let state = structuredClone(previous);
  bindServerRights(state, owned, title);
  state.world.mode = 'standard';
  state.world.speed = 1;
  const report = applyOffline(state, now);
  bindActivity(state, activity);
  for (const slot of state.ranch.slots) if (slot) markCollection(state, 'ranch', slot.beastId);
  let result = { ok: true };
  if (action === 'reset') { state = initialGame(now); bindActivity(state, activity); }
  else if (action !== 'sync') {
    result = actions[action].run(state, ...args) ?? { ok: true };
    if (action === 'gear.switchPath' && result.ok) state.tutorial.done.path = true;
    if (action === 'reincarnation.ascend') bindActivity(state, activity);
  }
  state.savedAt = now;
  updateTutorial(state);
  for (const balance of Object.values(state.currency)) {
    if (!Number.isFinite(balance) || balance < 0 || balance > 9e15) throw new Error('资产结算超出范围');
  }
  // Every result is produced here, including random drops; no client state is used.
  const safe = JSON.parse(JSON.stringify({ state, result, report }));
  bindServerTitle(safe.state, owned, title);
  return safe;
}
