<script setup lang="ts">
import { computed } from 'vue'
import WeekLineChart from '../components/WeekLineChart.vue'
import RecordList from '../components/RecordList.vue'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { formatMoney, toDateKey } from '../utils/format'
import { currentPeriodMonth, inPeriod, periodRange } from '../utils/settlement'

const { currentBook, partner } = useBooks()
const { records } = useRecords()

const expenses = computed(() => records.value.filter((r) => r.kind === 'expense'))

const monthTotal = computed(() => {
  const settleDay = currentBook.value?.settleDay ?? 1
  const range = periodRange(currentPeriodMonth(settleDay), settleDay)
  return expenses.value.filter((r) => inPeriod(r, range)).reduce((s, r) => s + r.amount, 0)
})

const weekPoints = computed(() => {
  const days: { key: string; label: string }[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date()
    d.setDate(d.getDate() - i)
    days.push({ key: toDateKey(d), label: i === 0 ? '今天' : `${d.getMonth() + 1}/${d.getDate()}` })
  }
  return days.map((d) => ({
    label: d.label,
    value: expenses.value.filter((r) => r.date === d.key).reduce((s, r) => s + r.amount, 0),
  }))
})

const weekTotal = computed(() => weekPoints.value.reduce((s, p) => s + p.value, 0))
const recent = computed(() => records.value.slice(0, 30))
</script>

<template>
  <section class="hero">
    <p class="caption">本月一起花了</p>
    <p class="total">{{ formatMoney(monthTotal) }}</p>
    <p class="sub">
      近 7 天 <span class="mono">{{ formatMoney(weekTotal) }}</span>
      <span v-if="!partner" class="waiting">· 等待 TA 加入</span>
    </p>
    <WeekLineChart :points="weekPoints" />
  </section>

  <h2 class="section-title">最近账单</h2>
  <RecordList :records="recent" />
</template>

<style scoped>
.hero {
  background: var(--card);
  border-radius: var(--radius);
  padding: 20px 18px 10px;
  margin-bottom: 20px;
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
.waiting {
  color: var(--primary);
}
.mono {
  font-family: var(--mono);
}
.section-title {
  font-size: 17px;
  margin: 0 4px 10px;
}
</style>
