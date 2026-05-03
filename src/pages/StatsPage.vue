<script setup lang="ts">
import { computed } from 'vue'
import SummaryPanel from '../components/SummaryPanel.vue'
import { useExpenses } from '../composables/useExpenses'
import { useSettings } from '../composables/useSettings'
import { formatCurrency } from '../utils/currency'

const { settings, categoryMap } = useSettings()
const { categoryTotals, monthlySummary, selectedYearMonth } = useExpenses()

const monthLabel = computed(() => {
  const [year, month] = selectedYearMonth.value.split('-')
  return `${year}年${month}月`
})

const topCategories = computed(() =>
  Object.entries(categoryTotals.value)
    .sort((left, right) => right[1] - left[1])
    .slice(0, 3)
)

const formatAmount = (value: number) => formatCurrency(value, settings.value.defaultCurrency)
</script>

<template>
  <section class="page-stack">
    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="section-kicker">统计</p>
          <h2>按月份看整体支出</h2>
        </div>
        <label class="field-group compact-field">
          <span class="field-label">月份</span>
          <input v-model="selectedYearMonth" type="month" />
        </label>
      </div>
    </section>

    <SummaryPanel
      :selected-month="monthLabel"
      :total-amount="monthlySummary.totalAmount"
      :me-paid="monthlySummary.mePaid"
      :partner-paid="monthlySummary.partnerPaid"
      :me-should-pay="monthlySummary.meShouldPay"
      :partner-should-pay="monthlySummary.partnerShouldPay"
      :me-net="monthlySummary.meNet"
      :category-totals="categoryTotals"
    />

    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="section-kicker">重点观察</p>
          <h3>这个月花得最多的类别</h3>
        </div>
      </div>

      <div class="highlight-list">
        <div v-for="[categoryId, amount] in topCategories" :key="categoryId" class="highlight-item">
          <div>
            <strong>{{ categoryMap[categoryId]?.icon || '🧾' }} {{ categoryMap[categoryId]?.name || categoryId }}</strong>
            <p>{{ settings.meName }} / {{ settings.partnerName }} 当前月累计</p>
          </div>
          <span>{{ formatAmount(amount) }}</span>
        </div>
      </div>
    </section>
  </section>
</template>
