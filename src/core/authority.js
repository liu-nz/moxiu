const managed = new WeakSet();
let dispatch;
export function bindAuthority(state, handler) { managed.add(state); dispatch = handler; }
export function isAuthoritative(state) { return managed.has(state); }
export function dispatchAction(state, action, args) { return dispatch(state, action, args); }
