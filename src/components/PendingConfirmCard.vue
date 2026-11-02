<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import AppIcon from './AppIcon.vue'
import CategoryIcon from './CategoryIcon.vue'
import RecordDetailSheet from './RecordDetailSheet.vue'
import DisputeSheet from './DisputeSheet.vue'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { useLoans } from '../composables/useLoans'
import { haptic, loansPageOpen, settlePageOpen } from '../composables/useUi'
import { toast } from '../composables/useToast'
import type { ConfirmStatus, DiscussionEntry } from '../types'
import type { IconName } from '../utils/icons'
import { recordColor, recordIcon } from '../utils/categories'
import { disputedByPartner, waitingForMe, waitingForPartner } from '../utils/confirm'
import { formatDateLabel, formatMoney } from '../utils/format'
import { amountSplitText, isAgreed, isAmountSplit, isFullyOwed, isTreat, otherPart, shareOf, treaterOf } from '../utils/settlement'

/**
 * 首页「待你确认」：TA 记的共同账单 / 借款 / 还款要我点过才算数，
 * 免得一方把个人花销随手记成共同。
 */
const { myUid, nameOf, otherUid, currentBook } = useBooks()
const { records, respondRecords, bouncedClaims } = useRecords()
const { loans, repayments, respondLoans, respondRepayments } = useLoans()

type Kind = 'record' | 'loan' | 'repayment'
interface Row {
  kind: Kind
  id: string
  title: string
  sub: string
  amount: number
  currency?: string
  icon: IconName
  color: string
  disputed: boolean
  /** 最近一条留言（TA 的疑问 / 回复） */
  last: string
}

const loanTitle = (lenderUid: string) => (lenderUid === myUid.value ? `借给${nameOf(otherUid(lenderUid))}` : `向${nameOf(lenderUid)}借`)

const recordSub = (r: (typeof records.value)[number]) => {
  if (isTreat(r)) return `${nameOf(treaterOf(r, otherUid))}请客`
  if (isFullyOwed(r)) return `${nameOf(otherUid(r.payerUid))}全出 · ${nameOf(r.payerUid)}先垫`
  if (isAmountSplit(r)) return `${nameOf(r.payerUid)}付 · ${amountSplitText(r, myUid.value, nameOf(otherUid(myUid.value)))}`
  const mine = shareOf(r, myUid.value)
  return `${nameOf(r.payerUid)}付 · 我承担 ${mine * 10}%`
}

/** 别人说的最后一句话（自己说的不用提醒自己） */
const lastWord = (d: DiscussionEntry[]) => {
  const e = d[d.length - 1]
  return e && e.by !== myUid.value ? `${nameOf(e.by)}：${e.text}` : ''
}

const rows = computed<Row[]>(() => {
  const uid = myUid.value
  const out: Row[] = []
  for (const r of records.value) {
    const disputed = disputedByPartner(r, uid)
    if (!waitingForMe(r, uid) && !disputed) continue
    out.push({
      kind: 'record',
      id: r.id,
      title: r.note || r.subCategory || r.category,
      sub: `${formatDateLabel(r.date)} · ${recordSub(r)}`,
      amount: r.amount,
      icon: recordIcon(r.category, r.subCategory),
      color: recordColor(r.category),
      disputed,
      last: lastWord(r.discussion),
    })
  }
  for (const l of loans.value) {
    const disputed = disputedByPartner(l, uid)
    if (!waitingForMe(l, uid) && !disputed) continue
    out.push({
      kind: 'loan',
      id: l.id,
      title: `借款 · ${loanTitle(l.lenderUid)}`,
      sub: `${formatDateLabel(l.date)}${l.note ? ` · ${l.note}` : ''}`,
      amount: l.amount,
      currency: l.currency,
      icon: 'wallet',
      color: '#7c6cf0',
      disputed,
      last: lastWord(l.discussion),
    })
  }
  for (const p of repayments.value) {
    const disputed = disputedByPartner(p, uid)
    if (!waitingForMe(p, uid) && !disputed) continue
    const loan = loans.value.find((l) => l.id === p.loanId)
    out.push({
      kind: 'repayment',
      id: p.id,
      title: loan ? `还款 · ${nameOf(loan.borrowerUid)}还给${nameOf(loan.lenderUid)}` : '还款',
      sub: formatDateLabel(p.date),
      amount: p.amount,
      currency: loan?.currency,
      icon: 'transfer',
      color: '#34b38a',
      disputed,
      last: lastWord(p.discussion),
    })
  }
  return out
})

const toConfirm = computed(() => rows.value.filter((r) => !r.disputed))
/** TA 申请删除的借款：要我同意才删 */
const deleteRequests = computed(() =>
  [...loans.value, ...repayments.value].filter((x) => x.deleteRequestedBy && x.deleteRequestedBy !== myUid.value),
)
const disputed = computed(() => rows.value.filter((r) => r.disputed))
/** TA 说 AA 的那份给我了：等我在「结清」里确认收到 */
const paidClaims = computed(() =>
  records.value.filter(
    // 和「结清」页同样的范围：确认过的 AA 支出
    (r) => r.paidClaimedAt && !r.settledOnSpot && r.payerUid === myUid.value && r.kind === 'expense' && r.type === 'shared' && isAgreed(r) && !isTreat(r),
  ),
)
const paidClaimsTotal = computed(() => paidClaims.value.reduce((s, r) => s + otherPart(r), 0))
const waitingCount = computed(
  () =>
    [...records.value, ...loans.value, ...repayments.value].filter((x) => waitingForPartner(x, myUid.value)).length,
)

const expanded = ref(false)
const LIMIT = 3
const shownRows = computed(() => (expanded.value ? toConfirm.value : toConfirm.value.slice(0, LIMIT)))

const busy = ref(false)
const respond = async (list: Row[], status: Exclude<ConfirmStatus, 'pending'>) => {
  if (busy.value) return
  busy.value = true
  const ids = (k: Kind) => list.filter((r) => r.kind === k).map((r) => r.id)
  const results = await Promise.all([
    respondRecords(ids('record'), status),
    respondLoans(ids('loan'), status),
    respondRepayments(ids('repayment'), status),
  ])
  busy.value = false
  const error = results.find((r) => r.error)?.error
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  if (status === 'disputed') toast.info('已告诉 TA 这笔有疑问，当面聊聊吧')
  else toast.success(list.length > 1 ? `已确认 ${list.length} 笔` : '已确认')
}

// ── 默认收成一行（只显示数字），不挡住下面的账单；点标题展开。展开 / 收起记在本机 ──
const EXPAND_KEY = 'couple-expense-confirm-expanded'
const readExpanded = (): Record<string, boolean> => {
  try {
    return JSON.parse(localStorage.getItem(EXPAND_KEY) ?? '{}') ?? {}
  } catch {
    return {}
  }
}
const expandedCards = ref(readExpanded())
const toggle = (key: 'confirm' | 'disputed' | 'news') => {
  expandedCards.value = { ...expandedCards.value, [key]: !expandedCards.value[key] }
  try {
    localStorage.setItem(EXPAND_KEY, JSON.stringify(expandedCards.value))
  } catch {
    // 无痕模式存不了就只在这次生效
  }
}
const confirmCollapsed = computed(() => !expandedCards.value.confirm)
const disputedCollapsed = computed(() => !expandedCards.value.disputed)
const newsCollapsed = computed(() => !expandedCards.value.news)

// ── 提醒：TA 新记 / 改了钱的共同账单（记了就入账），点「知道了」就清掉；不对的点进去「有疑问」退回 ──
// 看过到哪儿记在这台手机上；第一次用时从现在开始算，不翻旧账
const seenKey = computed(() => `couple-expense-seen:${currentBook.value?.id ?? ''}:${myUid.value}`)
const readSeen = (key: string) => {
  try {
    const v = localStorage.getItem(key)
    if (v) return v
    const now = new Date().toISOString()
    localStorage.setItem(key, now)
    return now
  } catch {
    return new Date().toISOString()
  }
}
const seenAt = ref(readSeen(seenKey.value))
watch(seenKey, (k) => (seenAt.value = readSeen(k)))
const news = computed(() =>
  records.value
    .filter(
      (r) =>
        r.type === 'shared' &&
        r.confirmStatus === 'confirmed' &&
        r.lastEditedBy !== myUid.value &&
        (r.editedAt || r.createdAt) > seenAt.value,
    )
    .map<Row>((r) => ({
      kind: 'record',
      id: r.id,
      title: r.note || r.subCategory || r.category,
      sub: `${formatDateLabel(r.date)} · ${recordSub(r)}${r.createdAt > seenAt.value ? '' : ' · 改过'}`,
      amount: r.amount,
      icon: recordIcon(r.category, r.subCategory),
      color: recordColor(r.category),
      disputed: false,
      last: '',
    })),
)
// ── 提醒：TA 把借款互相抵消了（马上生效，不用确认），点一下去借款页看，看过就不再提醒 ──
const offsetSeenKey = computed(() => `couple-expense-offset-seen:${currentBook.value?.id ?? ''}:${myUid.value}`)
const offsetSeenAt = ref(readSeen(offsetSeenKey.value))
watch(offsetSeenKey, (k) => (offsetSeenAt.value = readSeen(k)))
const offsetNews = computed(() => {
  const groups = new Map<string, { amount: number; currency?: string }>()
  for (const p of repayments.value) {
    if (!p.offsetId || p.createdBy === myUid.value || p.createdAt <= offsetSeenAt.value) continue
    const loan = loans.value.find((l) => l.id === p.loanId)
    // 两边金额一样，只算我借出去那边的，就是抵消的金额
    const g = groups.get(p.offsetId) ?? { amount: 0, currency: loan?.currency }
    if (loan?.lenderUid === myUid.value) g.amount += p.amount
    groups.set(p.offsetId, g)
  }
  return [...groups.values()]
})
const offsetNewsText = computed(() => {
  const byCur = new Map<string | undefined, number>()
  for (const g of offsetNews.value) byCur.set(g.currency, (byCur.get(g.currency) ?? 0) + g.amount)
  return [...byCur.entries()].map(([c, v]) => formatMoney(v, c)).join(' · ')
})
const openOffsetNews = () => {
  offsetSeenAt.value = new Date().toISOString()
  try {
    localStorage.setItem(offsetSeenKey.value, offsetSeenAt.value)
  } catch {
    // 存不了就只在这次生效
  }
  loansPageOpen.value = true
}
/** 有改过的就不只是「新记了」 */
const newsHasEdits = computed(() => news.value.some((n) => n.sub.endsWith('改过')))
const confirmDesc = computed(() => {
  const kinds = new Set(toConfirm.value.map((r) => r.kind))
  if (!kinds.has('record')) return kinds.has('loan') ? '借款 / 还款你确认后才算' : 'TA 记的还款，你确认后才从「还剩」里扣掉'
  if (kinds.size === 1) return 'TA 回复了你的疑问，你同意了就入账'
  return '你同意了才算：账单是 TA 回复了你的疑问，还款同意后才从「还剩」里扣掉'
})
const markSeen = () => {
  seenAt.value = new Date().toISOString()
  try {
    localStorage.setItem(seenKey.value, seenAt.value)
  } catch {
    // 存不了就只在这次生效
  }
}

// 有疑问：先写留言（账单还能提议比例）再发
const disputing = ref<Row | null>(null)
const disputingRecord = computed(() =>
  disputing.value?.kind === 'record' ? (records.value.find((r) => r.id === disputing.value?.id) ?? null) : null,
)
const disputingDiscussion = computed(() => {
  const row = disputing.value
  if (!row) return []
  const list = row.kind === 'record' ? records.value : row.kind === 'loan' ? loans.value : repayments.value
  return list.find((x) => x.id === row.id)?.discussion ?? []
})
const sendDispute = async (msg: { text: string; ratio: number | null }) => {
  const row = disputing.value
  if (!row || busy.value) return
  busy.value = true
  const { error } =
    row.kind === 'record'
      ? await respondRecords([row.id], 'disputed', msg)
      : row.kind === 'loan'
        ? await respondLoans([row.id], 'disputed', msg.text)
        : await respondRepayments([row.id], 'disputed', msg.text)
  busy.value = false
  if (error) {
    toast.error(error.message)
    return
  }
  haptic()
  disputing.value = null
  toast.info('已经告诉 TA 了，等 TA 回复')
}

const detailId = ref<string | null>(null)
const detail = computed(() => records.value.find((r) => r.id === detailId.value) ?? null)
const open = (row: Row) => {
  if (row.kind === 'record') detailId.value = row.id
  else loansPageOpen.value = true
}
</script>

<template>
  <section v-if="toConfirm.length" :class="['card', { collapsed: confirmCollapsed }]">
    <div class="head">
      <button class="title" :aria-expanded="!confirmCollapsed" @click="toggle('confirm')">
        <AppIcon name="bell" :size="16" :stroke="2.2" />待你确认 <b>{{ toConfirm.length }}</b>
        <AppIcon name="chevronRight" :size="15" :stroke="2.2" :class="['arrow', { open: !confirmCollapsed }]" />
      </button>
      <button v-if="confirmCollapsed" class="later" @click="toggle('confirm')">展开</button>
      <button v-else-if="toConfirm.length > 1" class="all" :disabled="busy" @click="respond(toConfirm, 'confirmed')">全部同意</button>
    </div>
    <template v-if="!confirmCollapsed">
    <p class="desc">{{ confirmDesc }}</p>
    <div v-for="row in shownRows" :key="row.kind + row.id" class="row">
      <button class="main" @click="open(row)">
        <CategoryIcon :name="row.icon" :color="row.color" :size="36" />
        <span class="info">
          <span class="line"><span class="name">{{ row.title }}</span><span class="mono amount">{{ formatMoney(row.amount, row.currency) }}</span></span>
          <span class="sub">{{ row.sub }}</span>
          <span v-if="row.last" class="last">{{ row.last }}</span>
        </span>
      </button>
      <div class="btns">
        <button class="ask" :disabled="busy" @click="disputing = row">不同意</button>
        <button class="ok" :disabled="busy" @click="respond([row], 'confirmed')">同意</button>
      </div>
    </div>
    <button v-if="toConfirm.length > LIMIT" class="more" @click="expanded = !expanded">
      {{ expanded ? '收起' : `还有 ${toConfirm.length - LIMIT} 笔` }}
    </button>
    </template>
  </section>

  <section v-if="news.length" :class="['card', 'news', { collapsed: newsCollapsed }]">
    <div class="head">
      <button class="title" :aria-expanded="!newsCollapsed" @click="toggle('news')">
        <AppIcon name="receipt" :size="16" :stroke="2.2" />TA {{ newsHasEdits ? '记 / 改了' : '新记了' }} {{ news.length }} 笔共同账单
        <AppIcon name="chevronRight" :size="15" :stroke="2.2" :class="['arrow', { open: !newsCollapsed }]" />
      </button>
      <button class="all" @click="markSeen">知道了</button>
    </div>
    <template v-if="!newsCollapsed">
      <p class="desc">已经入账；不对的话点进去「有疑问」，那笔就退回成未入账</p>
      <button v-for="row in news" :key="row.id" class="row main" @click="open(row)">
        <CategoryIcon :name="row.icon" :color="row.color" :size="36" />
        <span class="info">
          <span class="line"><span class="name">{{ row.title }}</span><span class="mono amount">{{ formatMoney(row.amount) }}</span></span>
          <span class="sub">{{ row.sub }}</span>
        </span>
        <AppIcon name="chevronRight" :size="16" class="chev" />
      </button>
    </template>
  </section>

  <section v-if="disputed.length" :class="['card', 'warn', { collapsed: disputedCollapsed }]">
    <div class="head">
      <button class="title" :aria-expanded="!disputedCollapsed" @click="toggle('disputed')">
        <AppIcon name="mail" :size="16" :stroke="2.2" />TA 对 {{ disputed.length }} 笔有疑问
        <AppIcon name="chevronRight" :size="15" :stroke="2.2" :class="['arrow', { open: !disputedCollapsed }]" />
      </button>
      <button v-if="disputedCollapsed" class="later" @click="toggle('disputed')">展开</button>
    </div>
    <template v-if="!disputedCollapsed">
    <p class="desc">改一下或者当面说清楚；改过之后会再请 TA 确认</p>
    <button v-for="row in disputed" :key="row.kind + row.id" class="row main" @click="open(row)">
      <CategoryIcon :name="row.icon" :color="row.color" :size="36" />
      <span class="info">
        <span class="line"><span class="name">{{ row.title }}</span><span class="mono amount">{{ formatMoney(row.amount, row.currency) }}</span></span>
        <span class="sub">{{ row.sub }}</span>
        <span v-if="row.last" class="last">{{ row.last }}</span>
      </span>
      <AppIcon name="chevronRight" :size="16" class="chev" />
    </button>
    </template>
  </section>

  <button v-if="deleteRequests.length" class="card warn del-line" @click="loansPageOpen = true">
    <span class="title"><AppIcon name="wallet" :size="16" :stroke="2.2" />TA 想删除 {{ deleteRequests.length }} 笔借款 / 还款</span>
    <span class="later">去看看 ›</span>
  </button>

  <button v-if="offsetNews.length" class="card news del-line" @click="openOffsetNews">
    <span class="title"><AppIcon name="swap" :size="16" :stroke="2.2" />TA 把借款互相抵消了 <b class="mono">{{ offsetNewsText }}</b></span>
    <span class="later">去看看 ›</span>
  </button>

  <button v-if="paidClaims.length" class="card news del-line" @click="settlePageOpen = true">
    <span class="title"><AppIcon name="check" :size="16" :stroke="2.2" />TA 说给了你 {{ paidClaims.length }} 笔 AA · <b class="mono">{{ formatMoney(paidClaimsTotal) }}</b></span>
    <span class="later">去确认 ›</span>
  </button>

  <button v-if="bouncedClaims.length" class="card warn del-line" @click="settlePageOpen = true">
    <span class="title"><AppIcon name="wallet" :size="16" :stroke="2.2" />TA 没确认收到你给的 {{ bouncedClaims.length }} 笔 AA</span>
    <span class="later">去看看 ›</span>
  </button>

  <p v-if="waitingCount" class="waiting">
    <AppIcon name="check" :size="13" :stroke="2.4" />你记的 {{ waitingCount }} 笔已保存，等 TA 同意后入账
  </p>

  <RecordDetailSheet :record="detail" @close="detailId = null" />
  <DisputeSheet
    :open="!!disputing"
    mode="dispute"
    :label="disputing?.title ?? ''"
    :amount="disputing?.amount ?? 0"
    :currency="disputing?.currency"
    :record="disputingRecord"
    :quick-options="disputing?.kind === 'repayment' ? ['还没收到', '金额不对', '日期不对'] : ['金额不对', '日期不对', '借的方向反了', '没有这笔']"
    :discussion="disputingDiscussion"
    :saving="busy"
    @close="disputing = null"
    @submit="sendDispute"
  />
</template>

<style scoped>
.card {
  background: var(--card);
  border-radius: var(--radius);
  padding: 14px 14px 6px;
  margin-bottom: 14px;
  box-shadow: inset 0 0 0 1.5px var(--primary-soft);
}
.card.collapsed {
  padding-bottom: 12px;
}
.arrow {
  color: var(--text-faint);
  transition: transform 0.2s ease;
}
.arrow.open {
  transform: rotate(90deg);
}
.later {
  font-size: 13px;
  color: var(--text-soft);
  padding: 4px 10px;
}
.del-line {
  display: flex;
  align-items: center;
  justify-content: space-between;
  width: 100%;
  padding-bottom: 12px;
}
.card.news {
  box-shadow: inset 0 0 0 1.5px rgba(52, 179, 138, 0.35);
}
.news .title {
  color: #2a9b76;
}
.card.warn {
  box-shadow: inset 0 0 0 1.5px rgba(255, 149, 0, 0.35);
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-weight: 600;
  font-size: 15px;
  color: var(--primary);
}
.warn .title {
  color: #e08600;
}
.title b {
  font-family: var(--mono);
}
.all {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  padding: 4px 10px;
  border-radius: 999px;
  background: var(--primary-soft);
}
.desc {
  margin: 2px 0 6px;
  font-size: 12px;
  color: var(--text-faint);
}
.row {
  padding: 8px 0;
  border-top: 1px solid var(--line);
}
.main {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  text-align: left;
}
.info {
  flex: 1;
  min-width: 0;
}
.line {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.name {
  font-size: 14px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.amount {
  font-weight: 600;
  flex-shrink: 0;
}
.sub {
  display: block;
  font-size: 12px;
  color: var(--text-faint);
  margin-top: 2px;
}
.last {
  display: block;
  margin-top: 4px;
  padding: 4px 8px;
  border-radius: 8px;
  background: var(--bg);
  font-size: 12px;
  color: var(--text-soft);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.btns {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 8px;
}
.btns button {
  height: 32px;
  padding: 0 16px;
  border-radius: 999px;
  font-size: 13px;
  font-weight: 600;
}
.ask {
  background: rgba(0, 0, 0, 0.05);
  color: var(--text-soft);
}
.ok {
  background: var(--primary);
  color: #fff;
}
button:disabled {
  opacity: 0.5;
}
.more {
  width: 100%;
  padding: 8px 0;
  font-size: 13px;
  color: var(--text-soft);
  border-top: 1px solid var(--line);
}
.chev {
  color: var(--text-faint);
}
.mono {
  font-family: var(--mono);
}
.waiting {
  display: flex;
  align-items: center;
  gap: 4px;
  margin: -4px 4px 12px;
  font-size: 12px;
  color: var(--text-faint);
}
</style>
