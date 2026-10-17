<script setup lang="ts">
import { computed } from 'vue'
import WeekLineChart from '../components/WeekLineChart.vue'
import RecordList from '../components/RecordList.vue'
import EmptyState from '../components/EmptyState.vue'
import SkeletonList from '../components/SkeletonList.vue'
import AppIcon from '../components/AppIcon.vue'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { openAddSheet } from '../composables/useUi'
import { toast } from '../composables/useToast'
import { formatMoney, toDateKey } from '../utils/format'
import { currentPeriodMonth, inPeriod, periodRange } from '../utils/settlement'

const { currentBook, partner } = useBooks()
const { records, recordsLoading } = useRecords()

const expenses = computed(() => records.value.filter((r) => r.kind === 'expense'))

const period = computed(() => {
  const settleDay = currentBook.value?.settleDay ?? 1
  return periodRange(currentPeriodMonth(settleDay), settleDay)
})
const monthExpenses = computed(() => expenses.value.filter((r) => inPeriod(r, period.value)))
const monthTotal = computed(() => monthExpenses.value.reduce((s, r) => s + r.amount, 0))

const weekPoints = computed(() => {
  const days: { key: string; label: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push({ key: toDateKey(d), label: i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}` })
  }
  return days.map((d) => {
    const items = expenses.value.filter((r) => r.date === d.key)
    return { label: d.label, value: items.reduce((s, r) => s + r.amount, 0), count: items.length }
  })
})

const weekTotal = computed(() => weekPoints.value.reduce((s, p) => s + p.value, 0))
const recent = computed(() => records.value.slice(0, 30))

const copyInvite = async () => {
  const code = currentBook.value?.inviteCode
  if (!code) return
  try {
    await navigator.clipboard.writeText(code)
    toast.success('邀请码已复制，发给 TA 吧')
  } catch {
    toast.info(`邀请码：${code}`)
  }
}
</script>

<template>
  <section class="hero">
    <p class="caption">本月一起花了</p>
    <p class="total">{{ formatMoney(monthTotal) }}</p>
    <p class="sub">
      本月 {{ monthExpenses.length }} 笔 · 近 7 天 <span class="mono">{{ formatMoney(weekTotal) }}</span>
    </p>
    <WeekLineChart :points="weekPoints" />
  </section>

  <button v-if="!partner" class="invite" @click="copyInvite">
    <span class="invite-icon"><AppIcon name="mail" :size="22" /></span>
    <span class="invite-text">
      <b>邀请 TA 一起记账</b>
      <small>把邀请码发给 TA，加入后就能记共同账</small>
    </span>
    <span class="invite-code mono">{{ currentBook?.inviteCode }}</span>
  </button>

  <div class="section-head">
    <h2>最近账单</h2>
    <span v-if="records.length" class="hint">点击查看详情</span>
  </div>

  <SkeletonList v-if="recordsLoading && !records.length" />
  <div v-else-if="!records.length" class="empty-card">
    <EmptyState
      icon="receipt"
      title="还没有账单"
      desc="记下第一笔开销吧，共同账会自动算好 AA"
      action="记一笔"
      @action="openAddSheet"
    />
  </div>
  <RecordList v-else :records="recent" />
</template>

<style scoped>
.hero {
  background: var(--card);
  border-radius: var(--radius);
  padding: 20px 18px 10px;
  margin-bottom: 14px;
}
.caption {
  margin: 0;
  font-size: 14px;
  color: var(--text-soft);
}
.total {
  margin: 4px 0 2px;
  font-family: var(--mono);
  font-size: 38px;
  font-weight: 700;
  letter-spacing: -1px;
}
.sub {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-faint);
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
  background: linear-gradient(120deg, rgba(255, 143, 171, 0.16), rgba(116, 192, 252, 0.16));
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
.empty-card {
  background: var(--card);
  border-radius: var(--radius);
}
</style>
