import { h } from './dom.js';
const styles = new Set(['ink','jade','azure','violet','gold','rainbow']);
export function titleBadge(title) {
  if (!title?.name) return null;
  return h('span.title-badge', { class: `title-${styles.has(title.style) ? title.style : 'ink'}`, title: title.description || title.name },
    h('span', { 'aria-hidden': 'true', text: title.symbol || '◇' }), h('span', { text: title.name }));
}
