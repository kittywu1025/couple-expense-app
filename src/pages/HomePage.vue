<script setup lang="ts">
import { computed } from 'vue'
import type { Expense } from '../types'
import { useBooks } from '../composables/useBooks'
import { getEffectiveExpenseDate, useExpenses } from '../composables/useExpenses'
import { useSettings } from '../composables/useSettings'
import { formatCurrency, getExpenseAmountLabel } from '../utils/currency'

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'open', expenseId: string): void
  (e: 'open-calendar'): void
  (e: 'open-settings'): void
}>()

const { settings, categoryMap } = useSettings()
const { currentBook } = useBooks()
const { filteredExpenses, monthlySummary, selectedYearMonth } = useExpenses()

const monthLabel = computed(() => {
  const [year, month] = selectedYearMonth.value.split('-')
  return `${year}年${month}月`
})

const shiftMonth = (offset: number) => {
  const [year, month] = selectedYearMonth.value.split('-').map(Number)
  const next = new Date(year, month - 1 + offset, 1)
  selectedYearMonth.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

const recentExpenses = computed(() => filteredExpenses.value.slice(0, 8))
const formatGroupDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    weekday: 'short',
  })

const formatTime = (expense: Expense) => {
  if (expense.createdAt) {
    return new Date(expense.createdAt).toLocaleTimeString('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    })
  }

  return '00:00'
}

const recentExpenseGroups = computed(() => {
  const groups = new Map<string, { date: string; total: number; items: Expense[] }>()

  recentExpenses.value.forEach((expense) => {
    const date = getEffectiveExpenseDate(expense, selectedYearMonth.value)
    const current = groups.get(date)
    if (current) {
      current.items.push(expense)
      current.total += expense.amount
      return
    }

    groups.set(date, {
      date,
      total: expense.amount,
      items: [expense],
    })
  })

  return Array.from(groups.values())
})
const formatMonthCurrency = (value: number) => formatCurrency(value, settings.value.defaultCurrency)
const formatExpenseAmount = (expense: Expense) => getExpenseAmountLabel(expense)
</script>

<template>
  <section class="page-stack">
    <section class="home-app-header">
      <div class="home-app-bar home-app-bar-centered">
        <span class="home-app-leading-spacer" aria-hidden="true"></span>
        <div class="home-app-title">
          <h1>{{ currentBook?.name || '我们的账本' }}</h1>
        </div>
        <button type="button" class="ghost-icon-button" aria-label="打开设置" @click="emit('open-settings')">
          <svg viewBox="0 0 24 24" class="icon-gear" aria-hidden="true">
            <path d="M19.14 12.94a7.9 7.9 0 0 0 .05-.94 7.9 7.9 0 0 0-.05-.94l2.03-1.58a.5.5 0 0 0 .12-.63l-1.92-3.32a.5.5 0 0 0-.6-.22l-2.39.96a7.2 7.2 0 0 0-1.63-.94l-.36-2.54a.5.5 0 0 0-.5-.42h-3.84a.5.5 0 0 0-.5.42l-.36 2.54c-.58.23-1.12.54-1.63.94l-2.39-.96a.5.5 0 0 0-.6.22L2.71 8.85a.5.5 0 0 0 .12.63l2.03 1.58a7.9 7.9 0 0 0-.05.94c0 .32.02.63.05.94l-2.03 1.58a.5.5 0 0 0-.12.63l1.92 3.32a.5.5 0 0 0 .6.22l2.39-.96c.51.4 1.05.71 1.63.94l.36 2.54a.5.5 0 0 0 .5.42h3.84a.5.5 0 0 0 .5-.42l.36-2.54c.58-.23 1.12-.54 1.63-.94l2.39.96a.5.5 0 0 0 .6-.22l1.92-3.32a.5.5 0 0 0-.12-.63zm-7.14 2.56A3.5 3.5 0 1 1 12 8.5a3.5 3.5 0 0 1 0 7z" />
          </svg>
        </button>
      </div>

      <div class="home-month-row">
        <div class="home-month-group">
          <button type="button" class="round-nav-button" @click="shiftMonth(-1)">‹</button>
          <strong>{{ monthLabel }}</strong>
          <button type="button" class="round-nav-button" @click="shiftMonth(1)">›</button>
        </div>
        <button type="button" class="home-calendar-link" @click="emit('open-calendar')">
          <span>📅</span>
          <span>收支日历</span>
        </button>
      </div>
    </section>

    <section class="home-summary-card">
      <div class="home-summary-top">
        <span>总支出</span>
        <strong>{{ formatMonthCurrency(monthlySummary.totalAmount) }}</strong>
      </div>
    </section>

    <section class="home-ledger-section">
      <div class="section-heading compact">
        <div>
          <h2>最近记录</h2>
        </div>
      </div>

      <div v-if="!recentExpenseGroups.length" class="home-ledger-empty">
        <strong>暂无数据</strong>
        <p>点击右下角 + 添加第一笔消费</p>
      </div>

      <div v-else class="home-ledger-groups">
        <section v-for="group in recentExpenseGroups" :key="group.date" class="home-ledger-group">
          <header class="home-ledger-group-header">
            <span>{{ formatGroupDate(group.date) }}</span>
            <strong>{{ formatMonthCurrency(group.total) }}</strong>
          </header>

          <button
            v-for="item in group.items"
            :key="item.id"
            type="button"
            class="home-ledger-item"
            @click="emit('open', item.id)"
          >
            <span class="home-ledger-icon">
              {{ categoryMap[item.category]?.icon || '🧾' }}
            </span>
            <span class="home-ledger-copy">
              <strong>{{ item.title }}</strong>
              <span class="home-ledger-meta">
                {{ formatTime(item) }} · {{ categoryMap[item.category]?.name || item.category }}
              </span>
              <span v-if="item.note" class="home-ledger-note">{{ item.note }}</span>
            </span>
            <span class="home-ledger-amount">{{ formatExpenseAmount(item) }}</span>
          </button>
        </section>
      </div>
    </section>

    <button type="button" class="floating-action-button" @click="emit('add')">+</button>
  </section>
</template>
