<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Expense } from '../types'
import { getEffectiveExpenseDate, useExpenses } from '../composables/useExpenses'
import { useSettings } from '../composables/useSettings'
import { formatCurrency } from '../utils/currency'

const emit = defineEmits<{
  (e: 'back'): void
  (e: 'edit', expenseId: string): void
}>()

const { filteredExpenses, selectedYearMonth } = useExpenses()
const { categoryMap, settings } = useSettings()

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

type DailyTotal = {
  expense: number
  income: number
}

const createDailyTotal = (): DailyTotal => ({ expense: 0, income: 0 })

const dailyTotals = computed(() => {
  const totals: Record<string, DailyTotal> = {}
  filteredExpenses.value.forEach((expense) => {
    const date = getEffectiveExpenseDate(expense, selectedYearMonth.value)
    const total = totals[date] || createDailyTotal()
    if (expense.recordType === 'income') {
      total.income += expense.amount
    } else {
      total.expense += expense.amount
    }
    totals[date] = total
  })
  return totals
})

const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']
const selectedDate = ref<string | null>(null)

const monthExpenseTotal = computed(() =>
  Object.values(dailyTotals.value).reduce((sum, value) => sum + value.expense, 0)
)
const monthIncomeTotal = computed(() =>
  Object.values(dailyTotals.value).reduce((sum, value) => sum + value.income, 0)
)
const maxDailyExpenseAmount = computed(() => Math.max(0, ...Object.values(dailyTotals.value).map((item) => item.expense)))

const shiftMonth = (offset: number) => {
  const [year, month] = selectedYearMonth.value.split('-').map(Number)
  const next = new Date(year, month - 1 + offset, 1)
  selectedYearMonth.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
  selectedDate.value = null
}

const formatAmount = (value: number) => formatCurrency(value, settings.value.defaultCurrency)
const formatCompactAmount = (value: number) => {
  if (value >= 10000) {
    return `${Number((value / 10000).toFixed(value >= 100000 ? 0 : 1))}万`
  }
  if (value >= 1000) {
    return `${Number((value / 1000).toFixed(value >= 10000 ? 0 : 1))}k`
  }
  return new Intl.NumberFormat('zh-CN', {
    maximumFractionDigits: 0,
  }).format(value)
}

const calendarCells = computed(() => {
  const cells: Array<{ day: number; date: string; total: DailyTotal } | null> = []
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
        total: dailyTotals.value[date] || createDailyTotal(),
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

const selectedDayRecords = computed(() => {
  if (!selectedDate.value) return []
  return filteredExpenses.value.filter(
    (record) => getEffectiveExpenseDate(record, selectedYearMonth.value) === selectedDate.value
  )
})

const selectedDayExpenseTotal = computed(() =>
  selectedDayRecords.value
    .filter((record) => record.recordType === 'expense')
    .reduce((sum, record) => sum + record.amount, 0)
)

const selectedDayIncomeTotal = computed(() =>
  selectedDayRecords.value
    .filter((record) => record.recordType === 'income')
    .reduce((sum, record) => sum + record.amount, 0)
)

const activeDateLabel = computed(() => {
  if (!selectedDate.value) return ''
  return new Date(`${selectedDate.value}T00:00:00`).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })
})

const formatRecordAmount = (record: Expense) =>
  record.recordType === 'income' ? `+ ${formatAmount(record.amount)}` : `- ${formatAmount(record.amount)}`

const cellTone = (expenseAmount: number) => {
  if (expenseAmount <= 0 || maxDailyExpenseAmount.value <= 0) {
    return {
      backgroundColor: 'rgba(255, 255, 255, 0.78)',
      borderColor: 'rgba(15, 23, 42, 0.05)',
    }
  }

  const ratio = expenseAmount / maxDailyExpenseAmount.value
  const alpha = 0.08 + ratio * 0.26
  return {
    backgroundColor: `rgba(227, 93, 84, ${alpha.toFixed(3)})`,
    borderColor: `rgba(227, 93, 84, ${(0.12 + ratio * 0.18).toFixed(3)})`,
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
        <div class="calendar-total-pill">
          <span class="calendar-total-expense">支出 {{ formatAmount(monthExpenseTotal) }}</span>
          <span v-if="monthIncomeTotal" class="calendar-total-income">收入 {{ formatAmount(monthIncomeTotal) }}</span>
        </div>
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
          :style="cell ? cellTone(cell.total.expense) : undefined"
          :disabled="!cell"
          @click="selectedDate = cell?.date || null"
        >
          <template v-if="cell">
            <span class="calendar-day">{{ cell.day }}</span>
            <span class="calendar-cell-amounts">
              <small v-if="cell.total.expense" class="calendar-expense-amount">
                -{{ formatCompactAmount(cell.total.expense) }}
              </small>
              <small v-if="cell.total.income" class="calendar-income-amount">
                +{{ formatCompactAmount(cell.total.income) }}
              </small>
            </span>
          </template>
        </button>
      </div>

      <div v-if="monthExpenseTotal === 0 && monthIncomeTotal === 0" class="calendar-empty-state">
        <strong>暂无数据</strong>
        <p>这个月还没有收支记录。</p>
      </div>

      <div v-else-if="selectedDate" class="calendar-day-sheet">
        <div class="calendar-day-sheet-header">
          <div>
            <p class="section-kicker">当日流水</p>
            <h3>{{ activeDateLabel }}</h3>
          </div>
          <strong>
            <span v-if="selectedDayExpenseTotal" class="calendar-total-expense">支出 {{ formatAmount(selectedDayExpenseTotal) }}</span>
            <span v-if="selectedDayIncomeTotal" class="calendar-total-income">收入 {{ formatAmount(selectedDayIncomeTotal) }}</span>
          </strong>
        </div>

        <div v-if="!selectedDayRecords.length" class="calendar-day-empty">
          <p>当天暂无记录。</p>
        </div>

        <button
          v-for="record in selectedDayRecords"
          :key="record.id"
          type="button"
          :class="['calendar-day-expense', { 'calendar-day-income': record.recordType === 'income' }]"
          @click="emit('edit', record.id)"
        >
          <span class="home-ledger-icon">{{ categoryMap[record.category]?.icon || '🧾' }}</span>
          <span class="home-ledger-copy">
            <strong>{{ record.title }}</strong>
            <span class="home-ledger-meta">
              {{ record.recordType === 'income' ? '收入' : '支出' }} · {{ categoryMap[record.category]?.name || record.category }}
            </span>
            <span v-if="record.note" class="home-ledger-note">{{ record.note }}</span>
          </span>
          <span :class="['home-ledger-amount', record.recordType === 'income' ? 'income-amount' : 'expense-out-amount']">
            {{ formatRecordAmount(record) }}
          </span>
        </button>
      </div>
    </section>
  </section>
</template>
