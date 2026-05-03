<script setup lang="ts">
import { computed } from 'vue'
import { useSettings } from '../composables/useSettings'

const props = defineProps<{
  selectedMonth: string
  totalAmount: number
  mePaid: number
  partnerPaid: number
  meShouldPay: number
  partnerShouldPay: number
  meNet: number
  categoryTotals: Record<string, number>
}>()

const { settings, categoryMap } = useSettings()

const settlementText = computed(() => {
  if (Math.abs(props.meNet) < 0.01) return '本月分摊比较均衡'
  if (props.meNet > 0) return `${settings.value.partnerName} 参考补给 ${settings.value.meName}`
  return `${settings.value.meName} 参考补给 ${settings.value.partnerName}`
})

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value)

const categoryEntries = computed(() =>
  Object.entries(props.categoryTotals).sort((left, right) => right[1] - left[1])
)
</script>

<template>
  <section class="summary-card">
    <div class="summary-hero">
      <div>
        <p class="section-kicker">{{ props.selectedMonth }}</p>
        <h2>本月总览</h2>
        <p class="summary-hero-text">{{ settlementText }}</p>
      </div>
      <div class="summary-total">
        <span>分摊参考</span>
        <strong>{{ formatCurrency(Math.abs(props.meNet)) }}</strong>
      </div>
    </div>

    <div class="stats-grid summary-stats-grid">
      <div class="stat-card stat-card-emphasis">
        <span>本月总支出</span>
        <strong>{{ formatCurrency(props.totalAmount) }}</strong>
      </div>
      <div class="stat-card">
        <span>{{ settings.meName }}已付</span>
        <strong>{{ formatCurrency(props.mePaid) }}</strong>
      </div>
      <div class="stat-card">
        <span>{{ settings.partnerName }}已付</span>
        <strong>{{ formatCurrency(props.partnerPaid) }}</strong>
      </div>
      <div class="stat-card">
        <span>{{ settings.meName }}应承担</span>
        <strong>{{ formatCurrency(props.meShouldPay) }}</strong>
      </div>
      <div class="stat-card">
        <span>{{ settings.partnerName }}应承担</span>
        <strong>{{ formatCurrency(props.partnerShouldPay) }}</strong>
      </div>
    </div>

    <div class="category-board">
      <div class="section-heading compact">
        <div>
          <p class="section-kicker">分类统计</p>
          <h3>按类别查看本月支出</h3>
        </div>
      </div>

      <div class="category-list">
        <div v-for="[categoryId, amount] in categoryEntries" :key="categoryId" class="category-row">
          <div class="category-name">
            <span>{{ categoryMap[categoryId]?.icon || '🧾' }}</span>
            <span>{{ categoryMap[categoryId]?.name || categoryId }}</span>
          </div>
          <strong>{{ formatCurrency(amount) }}</strong>
        </div>
      </div>
    </div>
  </section>
</template>
