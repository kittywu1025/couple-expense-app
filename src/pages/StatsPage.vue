<script setup lang="ts">
import { computed, ref } from 'vue'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { rulesPageOpen, settlePageOpen } from '../composables/useUi'
import CategoryBreakdown from '../components/CategoryBreakdown.vue'
import PeriodPickerSheet from '../components/PeriodPickerSheet.vue'
import SharedRecordList from '../components/SharedRecordList.vue'
import AppIcon from '../components/AppIcon.vue'
import SkeletonList from '../components/SkeletonList.vue'
import { formatMoney } from '../utils/format'
import { inPeriod } from '../utils/settlement'
import { computeStats } from '../utils/stats'
import {
  PERIOD_MODES,
  initialPeriod,
  isLatest,
  rangeOf,
  shiftPeriod,
  subtitleOf,
  titleOf,
  type PeriodMode,
  type PeriodState,
} from '../utils/period'

const { currentBook, myUid, otherUid, nameOf, partner } = useBooks()
const { records, recordsLoading } = useRecords()

const settleDay = computed(() => currentBook.value?.settleDay ?? 1)

// 时间维度：周 / 月 / 年 / 自定义，默认月（按结算日划分）
const period = ref<PeriodState>(initialPeriod(settleDay.value))
const range = computed(() => rangeOf(period.value, settleDay.value))
const title = computed(() => titleOf(period.value))
const subtitle = computed(() => subtitleOf(period.value, settleDay.value))
const atLatest = computed(() => isLatest(period.value, settleDay.value))
const pickerOpen = ref(false)

const setMode = (mode: PeriodMode) => {
  if (mode === period.value.mode) return
  period.value = { ...period.value, mode }
  if (mode === 'custom') pickerOpen.value = true
}
const shift = (dir: 1 | -1) => {
  if (dir === 1 && atLatest.value) return
  period.value = shiftPeriod(period.value, dir)
}

const periodRecords = computed(() => records.value.filter((r) => inPeriod(r, range.value)))
const stats = computed(() => computeStats(periodRecords.value, myUid.value, otherUid))
const partnerName = computed(() => partner.value?.displayName ?? 'TA')
const myName = computed(() => nameOf(myUid.value))
const periodWord = computed(() => ({ week: '这周', month: '这个月', year: '今年', custom: '这段时间' })[period.value.mode])

// ── 结算：轻描淡写，请客比差额更值得说 ──
const EVEN_THRESHOLD = 1000
const isEven = computed(() => Math.abs(stats.value.diff) <= EVEN_THRESHOLD)
/** 先垫付得多的人（diff > 0 表示对方垫得多） */
const fronter = computed(() => (stats.value.diff > 0 ? partnerName.value : myName.value))
const other = computed(() => (stats.value.diff > 0 ? myName.value : partnerName.value))
const treatLine = computed(() => {
  const { myTreats, partnerTreats } = stats.value
  if (!myTreats && !partnerTreats) return `${periodWord.value}还没有请客记录`
  const parts = []
  if (myTreats) parts.push(`${myName.value}请客 ${myTreats} 次`)
  if (partnerTreats) parts.push(`${partnerName.value}请客 ${partnerTreats} 次`)
  return parts.join('，')
})
const settleSummary = computed(() => (isEven.value ? '基本扯平' : `${fronter.value}多垫了一些`))

const sharedCount = computed(() => periodRecords.value.filter((r) => r.kind === 'expense' && r.type === 'shared').length)

// 两个模块默认折叠
const openSettle = ref(false)
const openShared = ref(false)
</script>

<template>
  <div class="modes" role="tablist">
    <button
      v-for="m in PERIOD_MODES"
      :key="m.key"
      role="tab"
      :aria-selected="period.mode === m.key"
      :class="{ on: period.mode === m.key }"
      @click="setMode(m.key)"
    >
      {{ m.label }}
    </button>
  </div>

  <div class="month-bar">
    <button class="arrow" aria-label="上一个周期" @click="shift(-1)"><AppIcon name="chevronLeft" :size="18" :stroke="2.2" /></button>
    <button class="pill" aria-label="选择时间" @click="pickerOpen = true">
      <span class="pill-title">{{ title }}<AppIcon name="chevronRight" :size="12" :stroke="2.4" class="pill-caret" /></span>
      <small v-if="subtitle">{{ subtitle }}</small>
    </button>
    <button class="arrow" aria-label="下一个周期" :disabled="atLatest" @click="shift(1)"><AppIcon name="chevronRight" :size="18" :stroke="2.2" /></button>
  </div>

  <PeriodPickerSheet
    :open="pickerOpen"
    :period="period"
    @close="pickerOpen = false"
    @apply="(p) => ((period = p), (pickerOpen = false))"
  />

  <SkeletonList v-if="recordsLoading && !records.length" class="breakdown" />
  <CategoryBreakdown v-else :records="periodRecords" :period-word="periodWord" class="breakdown" />

  <section class="card fold">
    <button class="fold-head" :aria-expanded="openSettle" @click="openSettle = !openSettle">
      <span class="fold-title"><span class="fold-icon"><AppIcon name="heart" :size="15" :stroke="2" /></span>{{ period.mode === 'month' ? '月末结算明细' : '结算明细' }}</span>
      <span class="fold-summary">{{ settleSummary }}</span>
      <AppIcon name="chevronRight" :size="16" :class="['chev', { open: openSettle }]" />
    </button>
    <div v-if="openSettle" class="fold-body">
      <p class="treat"><AppIcon name="gift" :size="16" :stroke="2" />{{ treatLine }}</p>
      <div class="balance">
        <template v-if="isEven">
          <p class="balance-main">{{ periodWord }}基本扯平啦</p>
          <p class="balance-sub">相差 {{ formatMoney(Math.abs(stats.diff)) }}，不用特意处理</p>
        </template>
        <template v-else>
          <p class="balance-main">{{ fronter }} {{ periodWord }}先垫付得多一些</p>
          <p class="balance-sub">
            想对齐的话，{{ other }} 给 {{ fronter }} <b class="mono">{{ formatMoney(Math.abs(stats.diff)) }}</b> 就刚好
          </p>
        </template>
      </div>
      <div class="settle-links">
        <button class="rules" @click="rulesPageOpen = true">这个数是怎么算的？</button>
        <button class="go-settle" @click="settlePageOpen = true">去结清 ›</button>
      </div>
    </div>
  </section>

  <section class="card fold">
    <button class="fold-head" :aria-expanded="openShared" @click="openShared = !openShared">
      <span class="fold-title"><span class="fold-icon"><AppIcon name="receipt" :size="15" :stroke="2" /></span>共同消费清单</span>
      <span class="fold-summary">{{ sharedCount }} 笔 · {{ formatMoney(stats.sharedTotal) }}</span>
      <AppIcon name="chevronRight" :size="16" :class="['chev', { open: openShared }]" />
    </button>
    <div v-if="openShared" class="fold-body">
      <p class="lead">以下为{{ periodWord }}一起花的钱，下面的金额是两人各自承担的部分</p>
      <SharedRecordList :records="periodRecords" />
    </div>
  </section>
</template>

<style scoped>
.modes {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  background: rgba(0, 0, 0, 0.06);
  border-radius: 999px;
  padding: 3px;
  margin-bottom: 12px;
}
.modes button {
  padding: 6px 0;
  border-radius: 999px;
  font-size: 13px;
  color: var(--text-soft);
  transition: background 0.15s;
}
.modes button.on {
  background: var(--card);
  color: var(--text);
  font-weight: 600;
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.08);
}
.pill-title {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}
.pill-caret {
  transform: rotate(90deg);
  color: var(--text-faint);
}
.month-bar {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  margin-bottom: 16px;
}
.pill {
  background: var(--card);
  border-radius: 999px;
  padding: 8px 20px;
  font-weight: 600;
  text-align: center;
  display: flex;
  flex-direction: column;
  line-height: 1.2;
}
.pill small {
  font-weight: 400;
  font-size: 11px;
  color: var(--text-faint);
}
.arrow {
  width: 36px;
  height: 36px;
  border-radius: 50%;
  background: var(--card);
  display: grid;
  place-items: center;
  color: var(--primary);
}
.arrow:disabled {
  color: var(--text-faint);
  opacity: 0.5;
}
.breakdown {
  margin-top: 0 !important;
  margin-bottom: 12px;
}
.card {
  background: var(--card);
  border-radius: var(--radius);
}
.fold {
  margin-bottom: 12px;
  overflow: hidden;
}
.fold-head {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 15px 16px;
  font-weight: 600;
  text-align: left;
}
.fold-title {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: 1;
}
.fold-icon {
  width: 26px;
  height: 26px;
  border-radius: 8px;
  background: var(--primary-soft);
  color: var(--primary);
  display: grid;
  place-items: center;
}
.fold-summary {
  font-size: 12px;
  font-weight: 400;
  color: var(--text-faint);
}
.chev {
  color: var(--text-faint);
  transition: transform 0.2s;
}
.chev.open {
  transform: rotate(90deg);
}
.fold-body {
  padding: 0 16px 14px;
}
.treat {
  display: flex;
  align-items: center;
  gap: 6px;
  margin: 0 0 10px;
  padding: 10px 12px;
  border-radius: 12px;
  background: linear-gradient(120deg, var(--me-bg), var(--partner-bg));
  font-size: 14px;
  color: var(--text);
}
.balance {
  padding: 4px 2px;
}
.balance-main {
  margin: 0;
  font-size: 17px;
  font-weight: 600;
}
.balance-sub {
  margin: 4px 0 0;
  font-size: 13px;
  color: var(--text-soft);
}
.balance-sub b {
  color: var(--text);
}
.mono {
  font-family: var(--mono);
}
.settle-links {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-top: 10px;
}
.go-settle {
  font-size: 13px;
  font-weight: 600;
  color: var(--primary);
  padding: 4px 12px;
  border-radius: 999px;
  background: var(--primary-soft);
}
.rules {
  font-size: 12px;
  color: var(--primary);
}
.lead {
  margin: 0 0 4px;
  font-size: 12px;
  color: var(--text-faint);
}
</style>
