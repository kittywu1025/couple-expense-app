<script setup lang="ts">
import { computed } from 'vue'
import ExpenseList from '../components/ExpenseList.vue'
import { getEffectiveExpenseDate, useExpenses } from '../composables/useExpenses'
import { useSettings } from '../composables/useSettings'

const emit = defineEmits<{
  (e: 'add'): void
  (e: 'edit', expenseId: string): void
  (e: 'open-settings'): void
}>()

const { settings, categoryMap } = useSettings()
const { categoryTotals, filteredExpenses, monthlySummary, selectedYearMonth } = useExpenses()

const monthLabel = computed(() => {
  const [year, month] = selectedYearMonth.value.split('-')
  return `${year}年${month}月`
})

const shiftMonth = (offset: number) => {
  const [year, month] = selectedYearMonth.value.split('-').map(Number)
  const next = new Date(year, month - 1 + offset, 1)
  selectedYearMonth.value = `${next.getFullYear()}-${String(next.getMonth() + 1).padStart(2, '0')}`
}

const recentExpenses = computed(() => filteredExpenses.value.slice(0, 4))
const recordCount = computed(() => filteredExpenses.value.length)
const topCategories = computed(() =>
  Object.entries(categoryTotals.value)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
)
const topCategoryName = computed(() => {
  const topCategoryId = topCategories.value[0]?.[0]
  return topCategoryId ? categoryMap.value[topCategoryId]?.name || topCategoryId : ''
})
const topCategoryIcon = computed(() => {
  const topCategoryId = topCategories.value[0]?.[0]
  return topCategoryId ? categoryMap.value[topCategoryId]?.icon || '🧾' : ''
})

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value)
</script>

<template>
  <section class="page-stack">
    <section class="hero-card">
      <div class="app-page-head">
        <div>
          <p class="section-kicker">默认账本</p>
          <h2>我们的账本</h2>
        </div>
        <button type="button" class="ghost-icon-button" @click="emit('open-settings')">⋯</button>
      </div>

      <div class="month-switch-row">
        <button type="button" class="round-nav-button" @click="shiftMonth(-1)">‹</button>
        <div class="month-switch-copy">
          <strong>{{ monthLabel }}</strong>
          <p>本月账本总览</p>
        </div>
        <button type="button" class="round-nav-button" @click="shiftMonth(1)">›</button>
      </div>

      <div class="hero-balance-card">
        <span>总支出</span>
        <strong>{{ formatCurrency(monthlySummary.totalAmount) }}</strong>
        <div class="hero-balance-meta">
          <span>记录 {{ recordCount }} 笔</span>
          <span>共同支出 {{ formatCurrency(monthlySummary.sharedTotal) }}</span>
        </div>
      </div>

      <div class="stats-grid home-stats-grid">
        <div class="stat-card stat-card-emphasis">
          <span>本月支出重点</span>
          <strong>{{ topCategories[0] ? `${topCategoryIcon} ${topCategoryName}` : '暂无重点分类' }}</strong>
        </div>
        <div class="stat-card">
          <span>已记录笔数</span>
          <strong>{{ recordCount }} 笔</strong>
        </div>
        <div class="stat-card">
          <span>一起分摊的消费</span>
          <strong>{{ formatCurrency(monthlySummary.sharedTotal) }}</strong>
        </div>
        <div class="stat-card">
          <span>{{ settings.meName }}本月已付</span>
          <strong>{{ formatCurrency(monthlySummary.mePaid) }}</strong>
        </div>
        <div class="stat-card">
          <span>{{ settings.partnerName }}本月已付</span>
          <strong>{{ formatCurrency(monthlySummary.partnerPaid) }}</strong>
        </div>
      </div>
    </section>

    <section class="section-card" v-if="topCategories.length">
      <div class="section-heading">
        <div>
          <p class="section-kicker">分类概览</p>
          <h3>这个月主要花在这些地方</h3>
        </div>
      </div>

      <div class="highlight-list">
        <div v-for="[categoryId, amount] in topCategories" :key="categoryId" class="highlight-item">
          <div>
            <strong>{{ categoryMap[categoryId]?.icon || '🧾' }} {{ categoryMap[categoryId]?.name || categoryId }}</strong>
            <p>本月累计</p>
          </div>
          <span>{{ formatCurrency(amount) }}</span>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="section-kicker">最近记录</p>
          <h3>最近消费</h3>
        </div>
      </div>

      <ExpenseList
        :expenses="recentExpenses"
        :effective-date="(expense) => getEffectiveExpenseDate(expense, selectedYearMonth)"
        :show-delete="false"
        @edit="emit('edit', $event.id)"
        @delete="() => undefined"
      />
    </section>

    <button type="button" class="floating-action-button" @click="emit('add')">+</button>
  </section>
</template>
