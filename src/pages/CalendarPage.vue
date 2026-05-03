<script setup lang="ts">
import { computed } from 'vue'
import { useExpenses } from '../composables/useExpenses'
import { useChores } from '../composables/useChores'

const {
  expenses,
  selectedYearMonth,
} = useExpenses()

const { chores } = useChores()

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
  expenses.value.forEach((expense) => {
    if (expense.date.startsWith(selectedYearMonth.value)) {
      totals[expense.date] = (totals[expense.date] || 0) + expense.amount
    }
  })
  return totals
})

const dailyChores = computed(() => {
  const choresMap: Record<string, Array<{ title: string; performer: string }>> = {}
  chores.value.forEach((item) => {
    if (item.done && item.date.startsWith(selectedYearMonth.value)) {
      choresMap[item.date] = choresMap[item.date] || []
      choresMap[item.date].push({ title: item.title, performer: item.performer })
    }
  })
  return choresMap
})

const totalSpend = computed(() =>
  Object.values(dailyTotals.value).reduce((sum, value) => sum + value, 0)
)

const averageSpend = computed(() =>
  monthDays.value ? totalSpend.value / monthDays.value : 0
)

const bestDay = computed(() => {
  const entries = Object.entries(dailyTotals.value)
  if (!entries.length) return null
  return entries.reduce((best, current) =>
    current[1] > best[1] ? current : best
  )
})

const weekdayLabels = ['日', '一', '二', '三', '四', '五', '六']

const calendarCells = computed(() => {
  const cells: Array<{ day: number; date: string; amount: number; chores: Array<{ title: string; performer: string }> } | null> = []
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
        chores: dailyChores.value[date] || [],
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
</script>

<template>
  <section class="page-card">
    <div class="page-title-row">
      <div>
        <p class="eyebrow">日历</p>
        <h2>{{ monthLabel }} 花费日历</h2>
      </div>
      <label class="month-picker-inline">
        月份
        <input type="month" v-model="selectedYearMonth" />
      </label>
    </div>

    <div class="summary-row">
      <div class="mini-card">
        <span>本月总消费</span>
        <strong>{{ totalSpend.toFixed(2) }} 元</strong>
      </div>
      <div class="mini-card">
        <span>平均每日</span>
        <strong>{{ averageSpend.toFixed(2) }} 元</strong>
      </div>
      <div class="mini-card">
        <span>最高消费</span>
        <strong>{{ bestDay ? `${bestDay[0].slice(-2)} 日` : '暂无' }}</strong>
      </div>
    </div>

    <div class="calendar-grid">
      <div class="calendar-header" v-for="label in weekdayLabels" :key="label">{{ label }}</div>
      <div
        v-for="(cell, index) in calendarCells"
        :key="index"
        class="calendar-cell"
        :class="{
          empty: !cell,
          highlight: cell && cell.amount > 0,
          hasChore: cell && cell.chores.length > 0,
        }"
      >
        <template v-if="cell">
          <div class="calendar-day-row">
            <span class="calendar-day">{{ cell.day }}</span>
            <small>{{ cell.amount ? `${cell.amount.toFixed(0)}元` : '0元' }}</small>
          </div>
          <div class="chore-badges">
            <div
              v-for="(chore, index) in cell.chores.slice(0, 2)"
              :key="`${chore.title}-${index}`"
              :class="['chore-badge', chore.performer === 'me' ? 'chore-me' : 'chore-partner']"
            >
              {{ chore.title }} ✅
            </div>
            <div v-if="cell.chores.length > 2" class="chore-badge more-badge">
              +{{ cell.chores.length - 2 }} 项
            </div>
          </div>
        </template>
      </div>
    </div>

    <div class="compare-card">
      <h3>日均对比</h3>
      <p>当前月消费趋势已按天展示，绿色表示低于平均，紫色表示高于平均。</p>
      <div class="compare-line">
        <span>平均</span>
        <strong>{{ averageSpend.toFixed(2) }} 元</strong>
      </div>
    </div>
  </section>
</template>
