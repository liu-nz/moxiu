import { h, panel, showToast } from '../dom.js';
import { cloudSession, playerProfile } from '../../core/cloud.js';
import { shardAccount, shardAction, shardError, RECHARGE_AMOUNTS } from '../../core/shards.js';
import { accountIdentity, showAccount } from '../account.js';
import { titleBadge } from '../titles.js';
import { refreshGame } from '../../core/game.js';

const qr = new URL('../../../assets/images/appreciation-code.png', import.meta.url).href;
const statusName = { pending: '待核对收款', approved: '已到账', rejected: '已驳回', cancelled: '已取消', refunded: '已退款' };
const dateText = value => new Date(value).toLocaleString('zh-CN');
let busy = false;

async function run(ctx, action, payload, done) {
  if (busy) return;
  busy = true;
  ctx.rerender();
  try {
    const result = await shardAction(action, payload);
    if (action === 'equip') await refreshGame();
    done?.();
    if (action === 'read' && result.arrivals.length) {
      result.arrivals.forEach(order => showToast(`充值到账：+${order.amount * 10} 天道碎片`, 'good'));
    } else showToast(action === 'read' ? '余额与记录已刷新' : '操作已确认', 'good');
  }
  catch (e) { showToast(e.message, 'warn'); }
  finally { busy = false; ctx.rerender(); }
}

function cancelRequest(ctx, order) {
  ctx.modal({ title: '取消充值申请', subtitle: `¥${order.amount} · ${order.amount * 10} 天道碎片`,
    body: h('p.t-sm', { text: '仅在尚未付款时取消。若你已经付款，请不要取消，联系作者核对收款；取消申请不会触发退款。' }),
    actions: [{ label: '返回' }, { label: '确认未付款并取消', primary: true, keepOpen: true,
      onClick: () => run(ctx, 'cancel', { id: order.id }, () => ctx.closeOverlay()) }] });
}

function payment(ctx, order) {
  ctx.modal({ title: `赞赏 ¥${order.amount} · ${order.amount * 10} 天道碎片`,
    subtitle: '付款后由作者核对微信实际收款，审核通过才会到账。',
    body: h('div.shard-payment', null, accountIdentity(),
      h('p.t-sm.mt-2', { text: `请务必在付款备注中填写 UID：${playerProfile.uid}` }),
      h('img.shard-qr.mt-3', { src: qr, alt: '西门吹雪的微信赞赏码，请备注账户 UID' }),
      h('p.t-xs.t-dim.mt-2', { text: '微信扫一扫，选择对应金额。手机可保存图片后在微信识别；若无法识别，请使用另一台设备扫码。' }),
      h('a.btn.btn-sm.mt-2', { href: qr, download: '墨修赞赏码.png', text: '保存赞赏码' }),
      h('p.t-xs.t-dimmer.mt-2', { text: `申请号：${order.id}；请勿重复付款。付款后可在下方记录查看审核结果，未付款申请不会发放碎片。` })),
    actions: [{ label: '返回查看申请' }] });
}

function purchase(ctx, item) {
  const id = crypto.randomUUID();
  ctx.modal({ title: `购买「${item.name}」`, subtitle: `${item.price} 天道碎片 · 每个账号限购一次 · 永久保留`,
    body: h('p.t-sm', { text: item.description }), actions: [{ label: '取消' },
      { label: '确认购买', primary: true, keepOpen: true, onClick: () => run(ctx, 'purchase', { id, sku: item.sku }, () => ctx.closeOverlay()) }] });
}

function review(ctx, order) {
  const amount = h('input', { type: 'number', inputmode: 'numeric', min: 1, step: 1, 'aria-label': '微信实收金额', placeholder: '填写微信实收金额' });
  const receipt = h('input', { type: 'text', maxlength: 80, 'aria-label': '微信交易单号', placeholder: '微信真实交易单号，8–80 位' });
  const reason = h('input', { type: 'text', maxlength: 120, 'aria-label': '驳回原因', placeholder: '未收款、金额或 UID 不符等' });
  const confirmed = h('input', { type: 'checkbox', 'aria-label': '已核对真实收款及 UID' });
  ctx.modal({ title: '人工核对充值', subtitle: `${order.role_name} · UID ${order.uid} · ¥${order.amount} → ${order.amount * 10} 碎片`,
    body: h('div.flex-col.gap-3.shard-form', null,
      h('p.t-sm', { text: '请在微信收款记录核对：付款备注 UID、实收金额、真实交易单号。申请或截图不能代替实际收款。每个交易单号只能入账一次。' }),
      h('p.t-xs.t-dim', { text: `申请时间：${dateText(order.created_at)} · 申请号：${order.id}` }),
      amount, receipt, h('label', null, confirmed, ' 已核对真实收款及 UID'), reason),
    actions: [{ label: '返回' }, { label: '驳回申请', keepOpen: true, onClick: () => {
      if (!reason.value.trim()) return showToast('请填写驳回原因', 'warn');
      run(ctx, 'reject', { id: order.id, note: reason.value.trim() }, () => ctx.closeOverlay());
    } }, { label: '确认收款并发放', primary: true, keepOpen: true, onClick: () => {
      if (!confirmed.checked || Number(amount.value) !== order.amount || !/^[0-9A-Za-z_-]{8,80}$/.test(receipt.value.trim())) return showToast('请核对 UID，填写匹配的实收金额和真实交易单号，并勾选确认', 'warn');
      run(ctx, 'approve', { id: order.id, amount: Number(amount.value), receipt: receipt.value.trim() }, () => ctx.closeOverlay());
    } }] });
}

function refund(ctx, order) {
  const receipt = h('input', { type: 'text', maxlength: 80, 'aria-label': '微信退款交易单号', placeholder: '微信真实退款交易单号，8–80 位' });
  const confirmed = h('input', { type: 'checkbox', 'aria-label': '已在微信完成全额退款' });
  ctx.modal({ title: '登记全额退款', subtitle: `UID ${order.uid} · ¥${order.amount} · 冲回 ${order.amount * 10} 碎片`,
    body: h('div.flex-col.gap-3', null,
      h('p.t-sm', { text: '先在微信完成实际全额退款，再登记真实退款交易单号。系统会尝试冲回本次发放的全部碎片；充值后已消费碎片或余额不足时会拒绝自动退款，需先人工核对权益。' }),
      receipt, h('label', null, confirmed, ' 已在微信完成全额退款')),
    actions: [{ label: '返回' }, { label: '登记退款', primary: true, keepOpen: true, onClick: () => {
      if (!confirmed.checked || !/^[0-9A-Za-z_-]{8,80}$/.test(receipt.value.trim())) return showToast('请确认实际退款并填写真实退款单号', 'warn');
      run(ctx, 'refund', { id: order.id, receipt: receipt.value.trim() }, () => ctx.closeOverlay());
    } }] });
}

function adjust(ctx) {
  const id = crypto.randomUUID();
  const uid = h('input', { type: 'number', min: 10000001, step: 1, 'aria-label': '玩家 UID', placeholder: '玩家 UID' });
  const delta = h('input', { type: 'number', min: -1000000, max: 1000000, step: 1, 'aria-label': '碎片调整数量', placeholder: '增加填正数，扣回填负数' });
  const reason = h('input', { type: 'text', maxlength: 120, 'aria-label': '调整原因', placeholder: '例如：更正重复发放的碎片' });
  ctx.modal({ title: '人工更正碎片', subtitle: '所有调整记录都会写入服务器账本',
    body: h('div.flex-col.gap-3', null,
      h('p.t-sm', { text: '仅用于修正误发或漏发。扣回不能超过当前余额；若碎片已消费，请先核对已购权益，勿重复补发。' }), uid, delta, reason),
    actions: [{ label: '返回' }, { label: '确认调整', primary: true, keepOpen: true, onClick: () => {
      if (!Number.isInteger(Number(uid.value)) || !Number.isInteger(Number(delta.value)) || Number(delta.value) === 0 || !reason.value.trim()) return showToast('请填写有效 UID、非零整数和调整原因', 'warn');
      run(ctx, 'adjust', { id, uid: Number(uid.value), delta: Number(delta.value), note: reason.value.trim() }, () => ctx.closeOverlay());
    } }] });
}

export function renderShards(state, ctx) {
  if (!cloudSession) return panel('天道碎片', '账号永久权益',
    h('p.t-sm', { text: '登录后可赞赏获得碎片，购买展示称号和少量休闲扩容。免费玩法与原有上限完整保留。' }),
    h('button.btn.btn-solid.mt-3', { text: '登录账号', onclick: () => showAccount() }));
  const data = shardAccount();
  const header = panel('天道碎片', data ? `${data.balance} 碎片` : '尚未载入', accountIdentity(),
    h('p.t-xs.t-dim.mt-2', { text: '¥1 = 10 天道碎片 · 人工核对到账 · 余额、称号和扩容权益绑定账号，清档与轮回保留。' }),
    shardError ? h('p.t-sm.t-fall.mt-2', { role: 'status', text: shardError }) : null,
    h('button.btn.btn-sm.mt-3', { text: '刷新余额与记录', disabled: busy, onclick: () => run(ctx, 'read') }));
  if (!data) return header;
  return h('div.flex-col.gap-4', null, header,
    panel('赞赏充值', '选择档位后扫码', h('p.t-sm.mb-3', { text: '先创建申请，再扫码支付并备注 UID；同一付款只申请一次。没有自动到账回调，请等待作者核对。' }),
      h('div.shard-tiers', null, RECHARGE_AMOUNTS.map(amount => h('button.btn.shard-tier', {
        text: `¥${amount} → ${amount * 10} 碎片`, disabled: busy || !!shardError, onclick: () => {
          const id = crypto.randomUUID();
          run(ctx, 'request', { id, amount }, () => payment(ctx, { id, amount }));
        } })))),
    panel('碎片商店', '永久权益 · 每项限购一次',
      h('p.t-xs.t-dim.mb-3', { text: '商店称号只有展示效果，聊天中也会显示。扩容仍需游戏内资金建造；不提高修炼速度、突破概率或战斗灵兽上阵数量。' }),
      h('div.production-grid', null, data.catalog.filter(item => !item.availability || item.availability === 'shop').map(item => {
        const owned = data.owned.includes(item.sku);
        return h('div.production-tile', null, h('h3.t-sm', item.kind === 'title' ? null : { text: item.name }, item.kind === 'title' ? titleBadge(item) : null),
          h('p.t-xs.t-dim.mt-2', { text: item.description }),
          h('p.t-xs.mt-2', { text: owned ? '已拥有 · 永久' : `${item.price} 天道碎片` }),
          owned && item.kind === 'title' ? h('button.btn.btn-sm.mt-2', { text: data.title === item.sku ? '取消展示' : '展示称号', disabled: busy || !!shardError,
            onclick: () => run(ctx, 'equip', { sku: data.title === item.sku ? '' : item.sku }) }) :
            h('button.btn.btn-sm.mt-2', { text: owned ? '已拥有' : '购买', disabled: owned || busy || !!shardError || data.balance < item.price, onclick: () => purchase(ctx, item) }));
      }))),
    panel('称号收藏', '免费成就 · 专属授予 · 清档保留',
      h('p.t-xs.t-dim.mb-3',{text:'服务器核验成就后自动解锁。选择一个称号佩戴，之后的发言会显示它的专属颜色与符号。'}),
      h('div.production-grid',null,data.catalog.filter(item=>item.kind==='title'&&item.availability&&item.availability!=='shop').map(item=>{
        const owned=data.owned.includes(item.sku);
        return h('div.production-tile',null,titleBadge(item),h('p.t-xs.t-dim.mt-2',{text:item.description}),
          h('p.t-xs.mt-2',{text:owned?'已获得 · 永久保留':item.availability==='exclusive'?'专属授予':'尚未达成'}),
          owned?h('button.btn.btn-sm.mt-2',{text:data.title===item.sku?'取消展示':'展示称号',disabled:busy||!!shardError,
            onclick:()=>run(ctx,'equip',{sku:data.title===item.sku?'':item.sku})}):null);
      }))),
    panel('充值申请', '最近 30 笔', data.orders.length ? data.orders.map(order =>
      h('div.shard-record', null, h('strong.t-sm', { text: `¥${order.amount} · ${order.amount * 10} 碎片 · ${statusName[order.status] || '状态未知'}` }),
        h('p.t-xs.t-dimmer', { text: `${dateText(order.created_at)} · ${order.id}` }),
        order.note ? h('p.t-xs.t-dim', { text: `原因：${order.note}` }) : null,
        order.status === 'approved' ? h('p.t-xs.t-jade.mt-1', { text: `已到账 +${order.amount * 10} 天道碎片` }) : null,
        order.status === 'refunded' ? h('p.t-xs.t-dim.mt-1', { text: `已登记退款 ${dateText(order.refunded_at)}` }) : null,
        order.status === 'pending' ? h('div.btn-row.mt-1', null,
          h('button.btn.btn-sm', { text: `查看赞赏码 · ¥${order.amount}`, onclick: () => payment(ctx, order) }),
          h('button.btn.btn-sm.btn-ghost', { text: '未付款，取消申请', disabled: busy || !!shardError, onclick: () => cancelRequest(ctx, order) })) : null)) : h('p.t-sm.t-dim', { text: '暂无申请。' })),
    panel('碎片明细', '最近 30 笔', data.ledger.length ? data.ledger.map(entry => h('div.shard-record.t-xs', { text: `${dateText(entry.created_at)} · ${entry.delta > 0 ? '+' : ''}${entry.delta} · ${entry.adjustment_note || (entry.delta > 0 ? '充值到账' : data.catalog.find(i => i.sku === entry.sku)?.name || '商店购买')}` })) : h('p.t-sm.t-dim', { text: '暂无入账或消费。' })),
    data.admin ? panel('充值审核', `待核对 ${data.review.length} 笔（最多显示最早 100 笔）`,
      h('p.t-xs.t-dim.mb-2', { text: '仅审核管理员可见。先核对微信真实收款，切勿仅凭玩家申请发放。' }),
      data.review.length ? data.review.map(order => h('div.shard-record', null,
        h('p.t-sm', { text: `UID ${order.uid} · ${order.role_name} · ¥${order.amount}` }),
        h('p.t-xs.t-dimmer', { text: dateText(order.created_at) }),
        h('button.btn.btn-sm.mt-1', { text: '核对收款', disabled: busy || !!shardError, onclick: () => review(ctx, order) }))) : h('p.t-sm.t-dim', { text: '暂无待核对申请。' }),
      panel('已审核记录', '最近 100 笔', data.history.length ? data.history.map(order => h('div.shard-record', null,
        h('strong.t-sm', { text: `UID ${order.uid} · ${order.role_name} · ¥${order.amount} · ${statusName[order.status] || order.status}` }),
        h('p.t-xs.t-dimmer', { text: `申请 ${dateText(order.created_at)} · 审核 ${dateText(order.reviewed_at)}` }),
        order.receipt ? h('p.t-xs.t-dim', { text: `收款单号：${order.receipt}` }) : null,
        order.refund_receipt ? h('p.t-xs.t-dim', { text: `退款单号：${order.refund_receipt}` }) : null,
        order.note ? h('p.t-xs.t-dim', { text: `原因：${order.note}` }) : null,
        order.status === 'approved' ? h('button.btn.btn-sm.mt-1', { text: '登记已完成的全额退款', disabled: busy || !!shardError, onclick: () => refund(ctx, order) }) : null)) : h('p.t-sm.t-dim', { text: '暂无已审核记录。' })),
      panel('管理员碎片更正', '有审计记录', h('p.t-xs.t-dim', { text: '仅用于更正误发或漏发，后台会保存操作者、原因和数量。' }),
        h('button.btn.btn-sm.mt-2', { text: '调整玩家碎片', disabled: busy || !!shardError, onclick: () => adjust(ctx) }))) : null);
}
