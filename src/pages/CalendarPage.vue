<script setup lang="ts">
import { computed, ref } from 'vue'
import { getEffectiveExpenseDate, useExpenses } from '../composables/useExpenses'
import { useSettings } from '../composables/useSettings'

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'edit', expenseId: string): void
}>()

const { filteredExpenses, selectedYearMonth } = useExpenses()
const { categoryMap } = useSettings()

const monthLabel = computed(() => {
  const [year, month] = selectedYearMonth.value.split('-')
  return `${year}年${month}月`
})

const parsedMonth = computed(() => {
  const [year, month] = selectedYearMonth.value.split('-').map(Number)
  return { year, month }
})

const monthDays = computed(() => new Date(parsedMonth.value.year, parsedMonth.value.month, 0).getDate())
const firstWeekday = computed(() => new Date(parsedMonth.value.year, parsedMonth.value.month - 1, 1).getDay())

const dailyTotals = computed(() => {
  const totals: Record<string, number> = {}
  filteredExpenses.value.forEach((expense) => {
    const date = getEffectiveExpenseDate(expense, selectedYearMonth.value)
    totals[date] = (totals[date] || 0) + expense.amount
  })
  return totals
})

const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
const selectedDate = ref<string | null>(null)

const monthTotal = computed(() => Object.values(dailyTotals.value).reduce((sum, value) => sum + value, 0))
const maxDailyAmount = computed(() => Math.max(0, ...Object.values(dailyTotals.value)))

const shiftMonth = (offset: number) => {
  const [year, month] = selectedYearMonth.value.split('-').map(Number)
  const next = new Date(year, month - 1 + offset, 1)
  selectedYearMonth.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
  selectedDate.value = null
}

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value)

const calendarCells = computed(() => {
  const cells: Array<{ day: number; date: string; amount: number } | null> = []
  const totalCells = firstWeekday.value + monthDays.value
  for (let i = 0; i < totalCells; i += 1) {
    if (i < firstWeekday.value) {
      cells.push(null)
    } else {
      const day = i - firstWeekday.value + 1
      const date = `${selectedYearMonth.value}-${String(day).padStart(2, '0')}`
      cells.push({
        day,
        date,
        amount: dailyTotals.value[date] || 0,
      })
    }
  }
  const extra = 7 - (cells.length % 7)
  if (extra < 7) {
    for (let i = 0; i < extra; i += 1) {
      cells.push(null)
    }
  }
  return cells
})

const selectedDayExpenses = computed(() => {
  if (!selectedDate.value) return []
  return filteredExpenses.value.filter(
    (expense) => getEffectiveExpenseDate(expense, selectedYearMonth.value) === selectedDate.value
  )
})

const selectedDayTotal = computed(() =>
  selectedDayExpenses.value.reduce((sum, expense) => sum + expense.amount, 0)
)

const activeDateLabel = computed(() => {
  if (!selectedDate.value) return ''
  return new Date(`${selectedDate.value}T00:00:00`).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })
})

const cellTone = (amount: number) => {
  if (amount <= 0 || maxDailyAmount.value <= 0) {
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.78)',
      borderColor: 'rgba(15, 23, 42, 0.05)',
    }
  }

  const ratio = amount / maxDailyAmount.value
  const alpha = 0.14 + ratio * 0.42
  return {
    backgroundColor: `rgba(76, 141, 255, ${alpha.toFixed(3)})`,
    borderColor: `rgba(76, 141, 255, ${(0.12 + ratio * 0.18).toFixed(3)})`,
  }
}
</script>

<template>
  <section class="page-stack">
    <section class="calendar-shell">
      <div class="calendar-topbar">
        <button type="button" class="ghost-icon-button" @click="emit('back')">‹</button>
        <div class="calendar-title-block">
          <p class="section-kicker">收支日历</p>
          <h2>{{ monthLabel }}</h2>
        </div>
        <div class="calendar-total-pill">{{ formatCurrency(monthTotal) }}</div>
      </div>

      <div class="calendar-month-toolbar">
        <div class="home-month-group">
          <button type="button" class="round-nav-button" @click="shiftMonth(-1)">‹</button>
          <strong>{{ monthLabel }}</strong>
          <button type="button" class="round-nav-button" @click="shiftMonth(1)">›</button>
        </div>
      </div>

      <div class="calendar-grid calendar-grid-heatmap">
        <div class="calendar-header" v-for="label in weekdayLabels" :key="label">{{ label }}</div>
        <button
          v-for="(cell, index) in calendarCells"
          :key="index"
          type="button"
          class="calendar-cell"
          :class="{
            empty: !cell,
            selected: cell && cell.date === selectedDate,
          }"
          :style="cell ? cellTone(cell.amount) : undefined"
          :disabled="!cell"
          @click="selectedDate = cell?.date || null"
        >
          <template v-if="cell">
            <span class="calendar-day">{{ cell.day }}</span>
            <small>{{ cell.amount ? formatCurrency(cell.amount) : '' }}</small>
          </template>
        </button>
      </div>

      <div v-if="monthTotal === 0" class="calendar-empty-state">
        <strong>暂无数据</strong>
        <p>这个月还没有消费记录。</p>
      </div>

      <div v-else-if="selectedDate" class="calendar-day-sheet">
        <div class="calendar-day-sheet-header">
          <div>
            <p class="section-kicker">当日流水</p>
            <h3>{{ activeDateLabel }}</h3>
          </div>
          <strong>{{ formatCurrency(selectedDayTotal) }}</strong>
        </div>

        <div v-if="!selectedDayExpenses.length" class="calendar-day-empty">
          <p>当天暂无记录。</p>
        </div>

        <button
          v-for="expense in selectedDayExpenses"
          :key="expense.id"
          type="button"
          class="calendar-day-expense"
          @click="emit('edit', expense.id)"
        >
          <span class="home-ledger-icon">{{ categoryMap[expense.category]?.icon || '🧾' }}</span>
          <span class="home-ledger-copy">
            <strong>{{ expense.title }}</strong>
            <span class="home-ledger-meta">{{ categoryMap[expense.category]?.name || expense.category }}</span>
            <span v-if="expense.note" class="home-ledger-note">{{ expense.note }}</span>
          </span>
          <span class="home-ledger-amount">{{ formatCurrency(expense.amount) }}</span>
        </button>
      </div>
    </section>
  </section>
</template>
