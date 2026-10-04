/**
 * views/social.js —— 势力：宗门 / 道盟 / 跨界商会 / 排行榜（GDD 1.2 + 15）
 * 内层分页，避免单个视图过长。
 */

import { h, panel, panelFlush, bar, showToast } from '../dom.js';
import { GUILDS, GUILD_BOSS, CHAMBER } from '../../data/guild.js';
import { guildSummary } from '../../systems/guild.js';
import { guild_joinGuild as joinGuild, guild_leaveGuild as leaveGuild, guild_claimQuest as claimQuest, guild_claimAllQuests as claimAllQuests, guild_buyFromShop as buyFromShop, guild_challengeBoss as challengeBoss, guild_joinChamber as joinChamber } from '../commands.js';
import { renderArena } from './community.js';
import { rankingSummary } from '../../systems/ranking.js';
import { renderSect } from './sect.js';
import { fmtInt, fmtDuration, fmtPct } from '../../core/util.js';
import { cloudSession } from '../../core/cloud.js';
import { socialAction, socialData, socialError, socialBusy } from '../../core/social.js';
import { showAccount } from '../account.js';
import { titleBadge } from '../titles.js';
import { stageInfo } from '../../data/realms.js';
import { accountIdentity } from '../account.js';

let tab = 'sect';
let peersRequested = false;
let peerUidValue = '';
let draftOwner = null;
const peerDrafts = new Map();
const TABS = [
  { id: 'peers', name: '同行' },
  { id: 'sect', name: '宗门' },
  { id: 'guild', name: '道盟' },
  { id: 'chamber', name: '商会' },
  { id: 'rank', name: '排行榜' },
];

function peersPanel(ctx) {
  if (!cloudSession) return panel('异步同行', '邮箱账号功能', h('p.t-sm.t-dim', { text: '登录账号后，可添加好友、查看行者名片、互留留言，并送出让灵田或牧场缩短等待的照料。' }),
    h('button.btn.btn-sm.mt-2', { text: '登录 / 注册', onclick: () => showAccount() }));
  const data = socialData();
  if (draftOwner !== cloudSession.user.id) { peerDrafts.clear(); draftOwner = cloudSession.user.id; }
  const uid = h('input#peer-uid', { type: 'text', inputmode: 'numeric', pattern: '[0-9]*', maxlength: 8, value: peerUidValue, oninput: e => { peerUidValue = e.currentTarget.value; }, placeholder: '输入行者 UID', 'aria-label': '行者 UID' });
  const run = async (action, payload) => {
    try { await socialAction(action, payload); if (action === 'post') peerDrafts.delete(payload.uid); ctx.rerender(); }
    catch (e) { showToast(e.message, 'warn'); ctx.rerender(); }
  };
  const request = h('button.btn.btn-sm', { text: '发送好友申请', disabled: socialBusy, onclick: () => {
    const value = peerUidValue.trim();
    if (!/^\d{8}$/.test(value)) return showToast('请输入 8 位行者 UID', 'warn');
    run('request', { uid: Number(value) });
  } });
  if (!data && !socialBusy && !peersRequested) { peersRequested = true; run('read', {}); }
  const friendRows = (data?.friends || []).map(friend => {
    const content = h('textarea', { maxlength: 240, rows: 2, oninput: e => peerDrafts.set(friend.uid, e.currentTarget.value), placeholder: '写一段留言（最多 240 字）', 'aria-label': `给 ${friend.role_name} 留言` }, peerDrafts.get(friend.uid) || '');
    return h('div.shard-record', null,
      h('div.flex-between', null, h('strong.t-sm', { text: `${friend.role_name} · UID ${friend.uid}` }),
        h('button.btn.btn-sm.btn-ghost', { text: '解除同行', disabled: socialBusy, onclick: () => run('remove', { id: friend.id }) })),
      h('div.mt-2', null, titleBadge(friend.title)),
      h('p.t-xs.t-dim.mt-1', { text: friend.stage == null ? '行者尚未公布修行进度' : `${stageInfo(friend.stage).stage.name} · 参考战力 ${fmtInt(friend.power || 0)}` }),
      friend.updated_at ? h('p.t-xs.t-dimmer', { text: `最近活动 ${new Date(friend.updated_at).toLocaleString('zh-CN')}` }) : null,
      content,
      h('div.btn-row.mt-2', null,
        h('button.btn.btn-sm', { text: '留言', disabled: socialBusy, onclick: () => { if (!content.value.trim()) return showToast('先写下留言内容', 'warn'); run('post', { uid: friend.uid, kind: 'message', content: content.value.trim() }); } }),
        h('button.btn.btn-sm', { text: '送上修行祝福', disabled: socialBusy, onclick: () => run('post', { uid: friend.uid, kind: 'blessing', content: content.value.trim() || '愿道友修行顺遂。' }) }),
        h('button.btn.btn-sm', { text: friend.help_sent ? '今日已送照料' : '送出同行照料', disabled: socialBusy || friend.help_sent, onclick: () => run('help', { uid: friend.uid }) })));
  });
  return h('div.flex-col.gap-4', null,
    panel('我的行者名片', 'UID 用于添加同行', accountIdentity()),
    panel('异步同行', `${data?.friends.length || 0} 位好友`,
      h('p.t-xs.t-dim', { text: '通过 UID 添加好友，双方接受后可互留留言。每天最多为五位好友各送一份照料，接收方在首页领取；每天最多领取一次，缩短一块灵田或一个牧场栏位至多五分钟等待，24 小时有效。' }),
      h('div.btn-row.mt-2', null, uid, request,
        h('button.btn.btn-sm.btn-ghost', { text: '刷新', disabled: socialBusy, onclick: () => { peersRequested = true; run('read', {}); } })),
      socialError ? h('p.t-xs.t-fall.mt-2', { role: 'status', text: socialError }) : null,
      !data ? h('p.t-sm.t-dim.mt-2', { text: socialBusy ? '正在读取同行名册…' : '点击刷新读取名册。' }) : null,
      (data?.incoming || []).map(item => h('div.rowitem.mt-2', null, h('div.rowitem-main', { text: `${item.role_name} · UID ${item.uid} 请求同行` }),
        h('div.rowitem-act', null, h('button.btn.btn-sm', { text: '接受', disabled: socialBusy, onclick: () => run('accept', { id: item.id }) }),
          h('button.btn.btn-sm.btn-ghost', { text: '忽略', disabled: socialBusy, onclick: () => run('remove', { id: item.id }) })))),
      (data?.outgoing || []).map(item => h('p.t-xs.t-dim.mt-1', { text: `已向 ${item.role_name}（UID ${item.uid}）发送申请` })),
      friendRows.length ? friendRows : h('p.t-sm.t-dim.mt-2', { text: '还没有好友。登录并交换行者 UID 后即可开始。' })),
    panel('留言与祝福', '最近 50 条', data?.notes.length ? data.notes.map(note => h('div.shard-record', null,
      h('strong.t-sm', { text: `${note.author_name} · ${note.kind === 'blessing' ? '修行祝福' : '留言'}` }),
      h('p.t-xs.t-dim.mt-1', { text: note.content }),
      h('p.t-xs.t-dimmer', { text: `${note.author_uid} → ${note.owner_uid} · ${new Date(note.created_at).toLocaleString('zh-CN')}` }))) : h('p.t-sm.t-dim', { text: data ? '暂无留言。' : '登录后读取同行留言。' })),
  );
}

function guildPanel(state, ctx) {
  const s = guildSummary(state);

  if (!s.joined) {
    return panel('道盟', '尚未入盟',
      h('p.t-sm.t-dim', { text: '道盟是修士的松散联盟——不拜师、不排辈，入盟就能领每日集体任务攒贡献、用贡献换配给的丹药与材料。想找正式组织请去「宗门」页。' }),
      h('div.mt-3', null, GUILDS.map((g) => h('div.rowitem', null,
        h('div.rowitem-main', null,
          h('div.rowitem-title', null,
            h('span.rowitem-name.t-serif', { text: `${g.accent} · ${g.name}` }),
            h('span.tag', { text: g.focus }),
          ),
          h('div.rowitem-meta.t-jade', { text: g.perk }),
          h('div.t-xs.t-dim', { text: g.desc }),
        ),
        h('div.rowitem-act', null,
          h('div.rowitem-price', { text: `${fmtInt(g.joinCost.stone)} 灵石` }),
          h('button.btn.btn-sm.btn-solid', {
            text: '入盟',
            disabled: state.currency.stone < g.joinCost.stone,
            onclick: async () => { const r = await joinGuild(state, g.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
          }),
        ),
      ))),
    );
  }

  const g = s.guild;
  const quests = h('div', null, s.quests.map((q) => {
    const p = q.progress;
    const ratio = p.goal > 0 ? Math.min(1, p.cur / p.goal) : 0;
    const shown = p.ratio
      ? `${(ratio * 100).toFixed(0)}%`
      : `${fmtInt(Math.min(p.cur, p.goal))} / ${fmtInt(p.goal)} ${p.unit}`;
    return h('div', { style: 'padding:10px 0;border-bottom:1px dashed var(--line)' },
      h('div.flex-between', null,
        h('div', null,
          h('span.t-sm.t-strong', { text: q.quest.name }),
          h('span.t-xs.t-dim', { text: `　${q.quest.desc}` }),
        ),
        q.claimed
          ? h('span.tag.tag-ink', { text: '已领' })
          : h('button.btn.btn-sm', {
            class: q.claimable ? 'btn-solid' : '',
            text: `+${q.quest.contribution} 贡献`,
            disabled: !q.claimable,
            onclick: async () => { const r = await claimQuest(state, q.quest.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
          }),
      ),
      h('div.mt-2', null, bar(ratio)),
      h('div.bar-cap', null, h('span', { text: shown }), h('span', { text: q.done ? '已完成' : '进行中' })),
    );
  }));

  const shop = h('div', { style: 'margin:0 -16px' }, s.shop.map((x) => h('div.rowitem', null,
    h('div.rowitem-main', null,
      h('div.rowitem-title', null,
        h('span.rowitem-name', { text: x.item.name }),
        h('span.tag', { text: `×${x.item.qty}` }),
        x.locked ? h('span.tag', { text: '境界不足' }) : null,
        x.boughtToday ? h('span.tag', { text: `今日已换 ${x.boughtToday}/3` }) : null,
      ),
      h('div.t-xs.t-dim', { text: x.item.desc }),
    ),
    h('div.rowitem-act', null,
      h('div.rowitem-price', { text: `${x.item.contribution} 贡献` }),
      h('button.btn.btn-sm', {
        text: '兑换',
        disabled: x.locked || !x.affordable || x.boughtToday >= 3,
        onclick: async () => { const r = await buyFromShop(state, x.item.id); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
      }),
    ),
  )));

  const boss = s.boss;
  const bossPanel = h('div', { style: 'padding:12px 0' },
    h('div.flex-between', null,
      h('div', null,
        h('h3', { text: GUILD_BOSS.name }),
        h('div.t-xs.t-dim', { text: GUILD_BOSS.desc }),
        h('div.t-xs.t-dim.mt-1', { text: `消耗体力 ${GUILD_BOSS.stamina}　·　历史最高伤害 ${fmtInt(boss.best)}` }),
      ),
      h('div.t-right', null,
        boss.ready
          ? h('button.btn.btn-solid', {
            text: '挑战',
            disabled: state.player.stamina < GUILD_BOSS.stamina,
            onclick: () => bossModal(state, ctx),
          })
          : h('span.t-xs.t-dim', { text: `${fmtDuration(boss.remainMs)} 后可再战` }),
      ),
    ),
  );

  return h('div.flex-col.gap-4', null,
    panel('道盟', `${g.name}　·　贡献 ${fmtInt(s.contribution)}`,
      h('div.flex-between', null,
        h('div', null,
          h('div.t-serif.t-lg', { text: `${g.accent} · ${g.name}` }),
          h('div.t-sm.t-jade', { text: g.perk }),
          h('div.t-xs.t-dim', { text: g.desc }),
        ),
        h('button.btn.btn-sm.btn-ghost', { text: '退盟', onclick: async () => { await leaveGuild(state); ctx.rerender(); } }),
      ),
      h('dl', { style: 'margin:12px 0 0' },
        h('dl.kv', null, h('dt', { text: '当前贡献' }), h('dd.t-num', { text: fmtInt(s.contribution) })),
        h('dl.kv', null, h('dt', { text: '累计贡献' }), h('dd.t-num', { text: fmtInt(s.totalContribution) })),
      ),
      h('hr.hr'),
      bossPanel,
      h('hr.hr'),
      h('div.flex-between.mb-2', null,
        h('h3', { text: '每日集体任务' }),
        h('button.btn.btn-sm', {
          text: '一键领取',
          onclick: async () => { const r = await claimAllQuests(state); if (r.ok) showToast(`共获得 ${r.total} 贡献`, 'good'); ctx.rerender(); },
        }),
      ),
      quests,
    ),
    panelFlush('道盟商店', `贡献 ${fmtInt(s.contribution)}`, shop),
  );
}

function bossModal(state, ctx) {
  const body = h('div', null,
    h('p.t-sm', { text: '选一种打法。倍率越高，打出的伤害与贡献越多，但体力消耗不变——反正一周只有一次。' }),
    h('div.mt-3', null, GUILD_BOSS.ranks.map((r) => h('button.btn.btn-block.mt-2', {
      style: 'text-align:left',
      text: `${r.name}　伤害 ×${r.mul}`,
      onclick: async () => {
        const res = await challengeBoss(state, r.id);
        ctx.closeOverlay();
        if (!res.ok) { showToast(res.reason, 'warn'); return; }
        ctx.modal({
          title: '盟中试炼',
          subtitle: `${r.name}　·　伤害 ${fmtInt(res.damage)}`,
          body: h('p.t-sm', { text: `长老点了点头。你获得道盟贡献 ${res.contribution}。` }),
          actions: [{ label: '收功', primary: true }],
        });
        ctx.rerender();
      },
    }))),
  );
  ctx.modal({ title: GUILD_BOSS.name, subtitle: '一周一次，按伤害折算贡献', sticky: true, body, actions: [] });
}

function chamberPanel(state, ctx) {
  const s = guildSummary(state).chamber;
  return panel('跨界商会', s.joined ? '已入会' : `${fmtInt(s.cost)} 灵石`,
    h('p.t-sm.t-dim', { text: s.def.desc }),
    h('ul.plain.t-sm.mt-2', null, s.def.perkText.map((t) => h('li', { text: t }))),
    h('div.mt-3', null,
      s.joined
        ? h('p.t-xs.t-jade', { text: '商会专属商品已解锁：灵犀香、工业母机（在「坊市 / 商城」页可见）。' })
        : h('button.btn.btn-solid', {
          text: `入会（${fmtInt(s.cost)} 灵石）`,
          disabled: state.currency.stone < s.cost,
          onclick: async () => { const r = await joinChamber(state); if (!r.ok) showToast(r.reason, 'warn'); ctx.rerender(); },
        }),
    ),
  );
}

function rankingPanel(state) {
  const s = rankingSummary(state);
  const titles = Object.entries(s.titles || {});

  return h('div.flex-col.gap-4', null,
    panel('NPC 模拟排行榜', `第 ${s.week + 1} 周　·　${s.daysLeft} 天后结算`,
      h('p.t-sm.t-dim', { text: '榜单对手由本机游戏规则模拟生成，不是真实玩家排行，也不发放服务器竞技奖励。' }),
      titles.length
        ? h('div.mt-3', null,
          h('div.t-xs.t-dim.mb-1', { text: '当前称号' }),
          ...titles.map(([bid, t]) => h('div.flex-between', { style: 'padding:2px 0' },
            h('span.t-sm', { text: `${t.name}（第 ${t.rank} 名）` }),
            h('span.t-xs.t-dim', { text: Object.entries(t.mods || {}).map(([k, v]) => `${k} +${(v * 100).toFixed(0)}%`).join('　') }),
          )),
        )
        : h('p.t-xs.t-dimmer.mt-2', { text: '上周未进入前三，暂无称号。' }),
    ),
    ...s.boards.map((b) => panelFlush(b.board.name, `我的名次 ${b.myRank} / ${b.total}`,
      h('table.grid', null,
        h('thead', null, h('tr', null,
          h('th', { text: '名次' }),
          h('th', { text: '天选者' }),
          h('th', { style: 'text-align:right', text: b.board.unit }),
        )),
        h('tbody', null, b.rows.map((r) => h('tr', { style: r.me ? 'background:var(--bg-sunken)' : '' },
          h('td', { text: `#${r.rank}` }),
          h('td', null, r.me ? h('strong', { text: r.name }) : h('span', { text: r.name })),
          h('td.num', { text: fmtInt(r.value) }),
        ))),
      ),
      b.inTop ? null : h('div', { style: 'padding:10px 16px;border-top:1px solid var(--line)' },
        h('span.t-xs.t-dim', { text: `你在榜外（第 ${b.myRank} 名 / 共 ${b.total} 位）。` })),
    )),
  );
}

export function renderSocial(state, ctx) {
  const strip = h('div.subtabs', null, TABS.map((t) => h('button.subtab', {
    class: tab === t.id ? 'on' : '',
    text: t.name,
    onclick: () => { tab = t.id; ctx.rerender(); },
  })));

  let body = null;
  if (tab === 'peers') body = peersPanel(ctx);
  else if (tab === 'sect') body = renderSect(state, ctx);
  else if (tab === 'guild') body = guildPanel(state, ctx);
  else if (tab === 'chamber') body = chamberPanel(state, ctx);
  else body = h('div.flex-col.gap-4', null, renderArena(state,ctx), h('details',null,h('summary.t-sm',{text:'NPC演练榜与原称号'}),rankingPanel(state)));

  return h('div.flex-col.gap-4', null, strip, body);
}

export function setSocialTab(id) { tab = id; }
