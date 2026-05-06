<script setup lang="ts">
import { computed } from 'vue'
import type { Expense } from '../types'
import { useSettings } from '../composables/useSettings'
import { getExpenseAmountLabel } from '../utils/currency'

const props = defineProps<{
  expenses: Expense[]
  effectiveDate?: (expense: Expense) => string
}>()

const emit = defineEmits<{
  (e: 'open', expense: Expense): void
}>()

const { settings, categoryMap } = useSettings()

const formatDate = (value: string) =>
  new Date(`${value}T00:00:00`).toLocaleDateString('zh-CN', {
    month: 'short',
    day: 'numeric',
    weekday: 'short',
  })

const payerLabels = computed(() => ({
  me: settings.value.meName,
  partner: settings.value.partnerName,
}))
const formatExpenseAmount = (expense: Expense) =>
  expense.recordType === 'income' ? `+ ${getExpenseAmountLabel(expense)}` : getExpenseAmountLabel(expense)
</script>

<template>
  <section class="expense-list">
    <div v-if="!props.expenses.length" class="empty-state">
      当前筛选条件下还没有记录。
    </div>

    <button
      v-for="item in props.expenses"
      :key="item.id"
      type="button"
      class="expense-item-card expense-item-card-button"
      @click="emit('open', item)"
    >
      <div class="expense-item-top">
        <div class="expense-item-main">
          <div class="expense-item-title-row">
            <div class="expense-title-group">
              <h3>{{ item.title }}</h3>
              <span class="expense-category-inline">
                {{ categoryMap[item.category]?.icon || '🧾' }} {{ categoryMap[item.category]?.name || item.category }}
              </span>
            </div>
            <span :class="['expense-amount', { 'income-amount': item.recordType === 'income' }]">
              {{ formatExpenseAmount(item) }}
            </span>
          </div>
          <div class="expense-item-meta">
            <span>{{ formatDate(props.effectiveDate ? props.effectiveDate(item) : item.date) }}</span>
            <span>{{ item.recordType === 'income' ? `${payerLabels.me}收入` : `${payerLabels[item.payer]}付款` }}</span>
          </div>
        </div>
      </div>

      <div class="expense-item-tags">
        <span class="info-pill soft">
          {{ item.recordType === 'income' ? '收入' : item.recurrence === 'monthly' ? '每月固定' : '单次消费' }}
        </span>
        <span v-if="item.originalCurrency !== item.baseCurrency" class="info-pill soft">
          按 {{ item.exchangeRateUsed }} 汇率计入 {{ item.baseCurrency }}
        </span>
        <template v-if="item.recordType === 'expense'">
          <span class="info-pill">{{ settings.meName }} {{ item.split.me }}%</span>
          <span class="info-pill">{{ settings.partnerName }} {{ item.split.partner }}%</span>
        </template>
      </div>

      <p v-if="item.note" class="expense-note">{{ item.note }}</p>
    </button>
  </section>
</template>
