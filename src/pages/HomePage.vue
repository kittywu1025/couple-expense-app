<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useTweened } from '../composables/useTweened'
import WeekLineChart from '../components/WeekLineChart.vue'
import RecordList from '../components/RecordList.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonList from '../components/SkeletonList.vue'
import AppIcon from '../components/AppIcon.vue'
import PendingConfirmCard from '../components/PendingConfirmCard.vue'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { calendarPageOpen, inviteSheetOpen, openAddSheet } from '../composables/useUi'
import { HOME_CARDS, homeCardPref, type HomeCard } from '../composables/usePrefs'
import { toast } from '../composables/useToast'
import type { LedgerRecord } from '../types'
import { formatMoney, formatMoneyShort, toDateKey } from '../utils/format'
import { bearOf, currentPeriodMonth, inPeriod, periodRange, shiftMonth } from '../utils/settlement'

const { currentBook, partner, myUid } = useBooks()
const { records, recordsLoading, recordsError, loadRecords } = useRecords()

// ── 看哪个月：左上角左右切换，默认本月（按结算日算的周期） ──
const settleDay = computed(() => currentBook.value?.settleDay ?? 1)
const thisMonth = computed(() => currentPeriodMonth(settleDay.value))
const viewMonth = ref(thisMonth.value)
watch(thisMonth, (m) => (viewMonth.value = m))
const isThisMonth = computed(() => viewMonth.value === thisMonth.value)
const period = computed(() => periodRange(viewMonth.value, settleDay.value))
const monthLabel = computed(() => {
  const [y, m] = viewMonth.value.split('-').map(Number)
  return y === Number(thisMonth.value.slice(0, 4)) ? `${m}月` : `${y}年${m}月`
})
/** 「这个月」在看别的月份时换成「10月」 */
const monthWord = computed(() => (isThisMonth.value ? '这个月' : monthLabel.value))
/** 从当前看的月份回到本月要挪几个月 */
const thisMonthDelta = computed(() => {
  const [y1, m1] = viewMonth.value.split('-').map(Number)
  const [y2, m2] = thisMonth.value.split('-').map(Number)
  return (y2 - y1) * 12 + (m2 - m1)
})
const shiftView = (delta: number) => {
  const next = shiftMonth(viewMonth.value, delta)
  if (next > thisMonth.value) return
  viewMonth.value = next
  shown.value = PAGE
}

/**
 * 每张卡片怎么算一笔记录：
 * - 我们：双方全部支出（只用总额，对方个人明细不展示）
 * - 我：我的个人支出全额 + 共同支出里我承担的份额
 * - 我的收入：只算自己的收入
 */
const weightOf = (card: HomeCard, r: LedgerRecord) => {
  if (card === 'together') return r.kind === 'expense' ? r.amount : 0
  if (card === 'income') return r.kind === 'income' && r.payerUid === myUid.value ? r.amount : 0
  if (r.kind !== 'expense') return 0
  if (r.type === 'personal') return r.payerUid === myUid.value ? r.amount : 0
  return (r.amount * bearOf(r, myUid.value)) / 10
}

const monthRecords = computed(() => records.value.filter((r) => inPeriod(r, period.value)))

const cards = computed(() =>
  HOME_CARDS.map((c) => {
    const items = monthRecords.value.filter((r) => weightOf(c.key, r) > 0)
    const total = items.reduce((s, r) => s + weightOf(c.key, r), 0)
    const label = c.label.replace('这个月', monthWord.value)
    let sub = `${isThisMonth.value ? '本月' : monthLabel.value} ${items.length} 笔`
    if (c.key === 'mine') {
      const own = items.filter((r) => r.type === 'personal').reduce((s, r) => s + r.amount, 0)
      sub = `个人 ${formatMoneyShort(own)} · 共同里我的那份 ${formatMoneyShort(total - own)}`
    }
    if (c.key === 'income') sub = items.length ? `${sub}，只统计你自己的收入` : `${monthWord.value}还没有记收入`
    return { ...c, label, total, sub }
  }),
)

// ── 轮播 ──
const track = ref<HTMLDivElement | null>(null)
const active = ref(Math.max(0, HOME_CARDS.findIndex((c) => c.key === homeCardPref.value)))
const activeCard = computed(() => HOME_CARDS[active.value].key)

// 当前卡片的数字滚动到新值（切卡片、记账后都会有动画）
const activeTotal = computed(() => cards.value[active.value]?.total ?? 0)
const tweenedTotal = useTweened(activeTotal)
const displayTotal = (i: number) => (i === active.value ? tweenedTotal.value : cards.value[i].total)


onMounted(async () => {
  await nextTick()
  if (track.value) track.value.scrollLeft = active.value * track.value.clientWidth
})

const onScroll = () => {
  const el = track.value
  if (!el) return
  const i = Math.round(el.scrollLeft / el.clientWidth)
  if (i !== active.value && i >= 0 && i < HOME_CARDS.length) active.value = i
}
const goTo = (i: number) => {
  track.value?.scrollTo({ left: i * track.value.clientWidth, behavior: 'smooth' })
}

let swipeStart: { x: number; y: number; t: number } | null = null
const onChartDown = (e: PointerEvent) => {
  swipeStart = { x: e.clientX, y: e.clientY, t: Date.now() }
}
const onChartUp = (e: PointerEvent) => {
  const s = swipeStart
  swipeStart = null
  if (!s) return
  const dx = e.clientX - s.x
  if (Date.now() - s.t > 350 || Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(e.clientY - s.y)) return
  const next = active.value + (dx < 0 ? 1 : -1)
  if (next >= 0 && next < HOME_CARDS.length) goTo(next)
}

// 折线图跟着当前卡片
const weekPoints = computed(() => {
  const days: { key: string; label: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push({ key: toDateKey(d), label: i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}` })
  }
  return days.map((d) => {
    const items = records.value.filter((r) => r.date === d.key && weightOf(activeCard.value, r) > 0)
    return {
      label: d.label,
      value: items.reduce((s, r) => s + weightOf(activeCard.value, r), 0),
      count: items.length,
    }
  })
})

// 账单列表照常显示本月所有记录（包括对方的）；只是统计数字只算自己的
const monthList = computed(() => records.value.filter((r) => inPeriod(r, period.value)))

// 超过 20 条分页：滑到底自动再加载 20 条
const PAGE = 20
const shown = ref(PAGE)
const pagedList = computed(() => monthList.value.slice(0, shown.value))
const hasMore = computed(() => monthList.value.length > shown.value)
const sentinel = ref<HTMLDivElement | null>(null)
let observer: IntersectionObserver | null = null
watch(sentinel, (el) => {
  observer?.disconnect()
  if (!el) return
  observer = new IntersectionObserver((entries) => {
    if (entries.some((e) => e.isIntersecting) && hasMore.value) shown.value += PAGE
  })
  observer.observe(el)
})
onBeforeUnmount(() => observer?.disconnect())

const retrying = ref(false)
const retry = async () => {
  retrying.value = true
  await loadRecords()
  retrying.value = false
  if (!recordsError.value) toast.success('已重新加载')
}

</script>

<template>
  <header class="top">
    <div class="month-switch">
      <button class="arrow" aria-label="上个月" @click="shiftView(-1)">
        <AppIcon name="chevronLeft" :size="20" :stroke="2.2" />
      </button>
      <h1>{{ monthLabel }}</h1>
      <button class="arrow" aria-label="下个月" :disabled="isThisMonth" @click="shiftView(1)">
        <AppIcon name="chevronRight" :size="20" :stroke="2.2" />
      </button>
      <button v-if="!isThisMonth" class="back-now" @click="shiftView(thisMonthDelta)">回到本月</button>
    </div>
    <button class="icon-btn" aria-label="收支日历" @click="calendarPageOpen = true">
      <AppIcon name="calendar" :size="20" :stroke="2" />
    </button>
  </header>

  <section class="hero">
    <div ref="track" class="track" @scroll.passive="onScroll">
      <div v-for="(c, i) in cards" :key="c.key" class="slide">
        <p class="caption">{{ c.label }}</p>
        <p :class="['total', { income: c.key === 'income' }]">{{ formatMoney(displayTotal(i)) }}</p>
        <p class="sub">{{ c.sub }}</p>
      </div>
    </div>
    <!-- 图上快速左右一划也能切卡片（慢慢拖是看每天的数） -->
    <div @pointerdown="onChartDown" @pointerup="onChartUp">
      <WeekLineChart :points="weekPoints" />
    </div>
    <div class="dots" role="tablist" aria-label="切换卡片">
      <button
        v-for="(c, i) in cards"
        :key="c.key"
        :class="{ on: i === active }"
        role="tab"
        :aria-selected="i === active"
        :aria-label="c.label"
        @click="goTo(i)"
      />
    </div>
  </section>

  <button v-if="!partner" class="invite" @click="inviteSheetOpen = true">
    <span class="invite-icon"><AppIcon name="mail" :size="22" /></span>
    <span class="invite-text">
      <b>邀请 TA 一起记账</b>
      <small>把邀请码发给 TA，加入后就能一起记</small>
    </span>
    <span class="invite-code mono">{{ currentBook?.inviteCode }}</span>
  </button>

  <PendingConfirmCard />

  <div class="section-head">
    <h2>{{ isThisMonth ? '本月' : monthLabel }}账单</h2>
    <span v-if="monthList.length" class="hint">{{ monthList.length }} 笔 · 点击查看详情</span>
  </div>

  <SkeletonList v-if="recordsLoading && !records.length" />
  <div v-else-if="recordsError && !records.length" class="empty-card">
    <EmptyState
      icon="wifi"
      title="账单没加载出来"
      desc="可能是网络不太好，稍等一下再试试"
      :action="retrying ? '加载中…' : '重新加载'"
      @action="retry"
    />
  </div>
  <div v-else-if="!monthList.length" class="empty-card">
    <EmptyState
      icon="receipt"
      :title="isThisMonth ? '还没有记录，今天吃了什么？' : `${monthLabel}没有记录`"
      desc="一起吃的饭、一起买的菜，都可以记下来"
      action="记一笔"
      @action="openAddSheet"
    />
  </div>
  <template v-else>
    <RecordList :records="pagedList" />
    <div v-if="hasMore" ref="sentinel" class="more">
      <span class="spinner" />再往下看看…
    </div>
    <p v-else-if="monthList.length > PAGE" class="end">{{ isThisMonth ? '本月' : monthLabel }}的账单都在这里了</p>
  </template>
</template>

<style scoped>
.top {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin: 0 4px 10px;
}
.month-switch {
  display: flex;
  align-items: center;
  gap: 2px;
  margin-left: -8px;
}
.arrow {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 50%;
  color: var(--text-soft);
}
.arrow:active {
  background: rgba(0, 0, 0, 0.05);
}
.arrow:disabled {
  opacity: 0.25;
}
.back-now {
  margin-left: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  font-size: 12px;
  color: var(--primary);
  background: var(--primary-soft);
}
.top h1 {
  margin: 0;
  font-size: 22px;
}
.icon-btn {
  width: 38px;
  height: 38px;
  border-radius: 50%;
  background: var(--card);
  color: var(--primary);
  display: grid;
  place-items: center;
}
.icon-btn:active {
  transform: scale(0.94);
}
.hero {
  background: var(--card);
  border-radius: var(--radius);
  padding: 18px 0 10px;
  margin-bottom: 14px;
  overflow: hidden;
}
.hero :deep(.chart-wrap) {
  margin: 0 18px;
}
.track {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  scrollbar-width: none;
  overscroll-behavior-x: contain;
}
.track::-webkit-scrollbar {
  display: none;
}
.slide {
  flex: 0 0 100%;
  scroll-snap-align: start;
  padding: 0 18px;
}
.caption {
  margin: 0;
  font-size: 14px;
  color: var(--text-soft);
}
.total {
  margin: 4px 0 2px;
  font-family: var(--mono);
  font-size: 36px;
  font-weight: 700;
  letter-spacing: -1px;
}
.total.income {
  color: var(--income);
}
.sub {
  margin: 0;
  font-size: 12px;
  color: var(--text-faint);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.dots {
  display: flex;
  justify-content: center;
  margin: 2px 0 -6px;
}
/* 点本身很小，按钮留大一点的点击区域 */
.dots button {
  display: grid;
  place-items: center;
  height: 24px;
  padding: 0 4px;
}
.dots button::after {
  content: '';
  width: 6px;
  height: 6px;
  border-radius: 999px;
  background: #d1d1d6;
  transition: width 0.2s, background 0.2s;
}
.dots button.on::after {
  width: 18px;
  background: var(--primary);
}
.mono {
  font-family: var(--mono);
}
.invite {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 14px 16px;
  margin-bottom: 14px;
  border-radius: var(--radius);
  background: linear-gradient(120deg, var(--me-bg), var(--partner-bg));
  text-align: left;
}
.invite:active {
  opacity: 0.85;
}
.invite-icon {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--card);
  color: var(--me);
  display: grid;
  place-items: center;
}
.invite-text {
  flex: 1;
  display: flex;
  flex-direction: column;
}
.invite-text b {
  font-size: 14px;
}
.invite-text small {
  font-size: 12px;
  color: var(--text-soft);
}
.invite-code {
  font-weight: 700;
  letter-spacing: 2px;
  color: var(--primary);
  background: var(--card);
  padding: 4px 8px;
  border-radius: 8px;
}
.section-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin: 6px 4px 10px;
}
.section-head h2 {
  margin: 0;
  font-size: 17px;
}
.hint {
  font-size: 11px;
  color: var(--text-faint);
}
.more,
.end {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  padding: 14px 0 4px;
  font-size: 12px;
  color: var(--text-faint);
}
.spinner {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  border: 2px solid var(--primary-soft);
  border-top-color: var(--primary);
  animation: spin 0.8s linear infinite;
}
@keyframes spin {
  to {
    transform: rotate(360deg);
  }
}
.empty-card {
  background: var(--card);
  border-radius: var(--radius);
}
</style>
