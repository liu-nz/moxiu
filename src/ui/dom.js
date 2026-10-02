/**
 * dom.js —— 极简 DOM 构建工具 + 实时数值刷新 + 浮层/提示
 *
 * 为了避免每帧重建 DOM，数值型节点用 live() 注册，
 * 主循环只更新这些节点的 textContent / 宽度。
 */

import { emit, EV } from '../core/bus.js';

/* ---------------- 构建 ---------------- */
const liveNodes = [];

export function resetLive() { liveNodes.length = 0; }

export function refreshLive(getValue) {
  for (const n of liveNodes) {
    let v;
    try { v = getValue(n.key, n.el); } catch { continue; }
    if (v === undefined || v === null) continue;
    if (n.kind === 'text') {
      if (n.el.textContent !== v) n.el.textContent = v;
    } else if (n.kind === 'bar') {
      const pct = Math.max(0, Math.min(1, Number(v) || 0)) * 100;
      const s = pct.toFixed(2) + '%';
      if (n.el.style.width !== s) n.el.style.width = s;
    } else if (n.kind === 'cls') {
      if (n.el.className !== v) n.el.className = v;
    } else if (n.kind === 'disabled') {
      const d = !!v;
      if (n.el.disabled !== d) n.el.disabled = d;
    }
  }
}

function parseTag(tag) {
  const m = /^([a-zA-Z0-9]+)?((?:[.#][^.#]+)*)$/.exec(tag);
  const name = (m && m[1]) || 'div';
  const rest = (m && m[2]) || '';
  const classes = [];
  let id = null;
  const parts = rest.split(/(?=[.#])/).filter(Boolean);
  for (const p of parts) {
    if (p[0] === '.') classes.push(p.slice(1));
    else if (p[0] === '#') id = p.slice(1);
  }
  return { name, classes, id };
}

/**
 * h('div.panel', { class:'mt-2', text:'x', onclick:fn, live:'stone' }, child1, child2)
 */
export function h(tag, props, ...children) {
  const { name, classes, id } = parseTag(tag);
  const el = document.createElement(name);
  if (id) el.id = id;
  const cls = [...classes];

  const p = props || {};
  for (const [k, v] of Object.entries(p)) {
    if (v === null || v === undefined || v === false) continue;
    switch (k) {
      case 'class': cls.push(v); break;
      case 'text': el.textContent = String(v); break;
      case 'html': el.innerHTML = v; break;
      case 'style': el.setAttribute('style', v); break;
      case 'dataset': for (const [dk, dv] of Object.entries(v)) el.dataset[dk] = dv; break;
      case 'live': liveNodes.push({ el, key: v, kind: 'text' }); break;
      case 'liveBar': liveNodes.push({ el, key: v, kind: 'bar' }); break;
      case 'liveClass': liveNodes.push({ el, key: v, kind: 'cls' }); break;
      case 'liveDisabled': liveNodes.push({ el, key: v, kind: 'disabled' }); break;
      case 'onclick': el.addEventListener('click', v); break;
      case 'oninput': el.addEventListener('input', v); break;
      case 'onchange': el.addEventListener('change', v); break;
      default:
        if (k.startsWith('on') && typeof v === 'function') {
          el.addEventListener(k.slice(2).toLowerCase(), v);
        } else if (v === true) {
          el.setAttribute(k, '');
        } else {
          el.setAttribute(k, String(v));
        }
    }
  }
  if (cls.length) el.className = cls.join(' ');
  append(el, children);
  return el;
}

export function append(parent, children) {
  for (const c of children.flat(4)) {
    if (c === null || c === undefined || c === false) continue;
    if (Array.isArray(c)) { append(parent, c); continue; }
    parent.appendChild(c instanceof Node ? c : document.createTextNode(String(c)));
  }
  return parent;
}

export function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
  return el;
}

export function mount(el, ...children) {
  clear(el);
  append(el, children);
  return el;
}

/* ---------------- 常用片段 ---------------- */
export function bar(ratio, opts = {}) {
  const { thick, dashed, liveKey } = opts;
  const cls = ['bar'];
  if (thick) cls.push('thick');
  if (dashed) cls.push('dashed');
  const inner = h('i', liveKey
    ? { liveBar: liveKey, style: `width:${Math.max(0, Math.min(1, ratio)) * 100}%` }
    : { style: `width:${Math.max(0, Math.min(1, ratio)) * 100}%` });
  return h('div', { class: cls.join(' ') }, inner);
}

export function panel(title, right, ...body) {
  return h('section.panel', null,
    title !== null ? h('div.panel-head', null,
      h('h2', { text: title }),
      right ? h('div.t-xs.t-dim', null, right) : null,
    ) : null,
    h('div.panel-body', null, body),
  );
}

export function panelFlush(title, right, ...body) {
  return h('section.panel', null,
    title !== null ? h('div.panel-head', null,
      h('h2', { text: title }),
      right ? h('div.t-xs.t-dim', null, right) : null,
    ) : null,
    h('div.panel-body.flush', null, body),
  );
}

export function kv(label, value) {
  return h('dl.kv', null, h('dt', { text: label }), h('dd', null, value));
}

/* ---------------- Toast ---------------- */
export function showToast({ message, kind }) {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const el = h('div.toast', { class: kind || '', text: message });
  root.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity .3s ease';
    el.style.opacity = '0';
    setTimeout(() => el.remove(), 320);
  }, 2400);
}

/* ---------------- 浮层 ---------------- */
export function openOverlay(node) {
  const root = document.getElementById('overlay-root');
  if (!root) return;
  const wrap = h('div.overlay', null, node);
  wrap.addEventListener('click', (e) => { if (e.target === wrap && wrap.dataset.sticky !== '1') closeOverlay(); });
  root.appendChild(wrap);
  return wrap;
}

export function closeOverlay() {
  const root = document.getElementById('overlay-root');
  if (!root) return;
  const last = root.lastElementChild;
  if (last) last.remove();
}

export function closeAllOverlays() {
  const root = document.getElementById('overlay-root');
  if (root) clear(root);
}

export function modal({ title, subtitle, body, actions, sticky }) {
  const foot = h('div.modal-foot', null,
    (actions || []).map((a) => h('button.btn', {
      class: a.primary ? 'btn-solid' : '',
      text: a.label,
      onclick: () => { if (!a.keepOpen) closeOverlay(); a.onClick && a.onClick(); },
    })),
  );
  const node = h('div.modal', { dataset: { sticky: sticky ? '1' : '0' } },
    h('div.modal-head', null,
      h('h1.t-serif', { text: title }),
      subtitle ? h('p.t-sm.t-dim.mt-1', { text: subtitle }) : null,
    ),
    h('div.modal-body', null, body),
    foot,
  );
  return openOverlay(node);
}
