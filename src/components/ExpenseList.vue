<script setup lang="ts">
import { computed } from 'vue'
import type { Expense } from '../types'
import { useSettings } from '../composables/useSettings'

const props = defineProps<{
  expenses: Expense[]
  effectiveDate?: (expense: Expense) => string
  showDelete?: boolean
}>()

const emit = defineEmits<{
  (e: 'edit', expense: Expense): void
  (e: 'delete', expenseId: string): void
}>()

const { settings, categoryMap } = useSettings()

const formatCurrency = (value: number) =>
  new Intl.NumberFormat('ja-JP', {
    style: 'currency',
    currency: 'JPY',
    maximumFractionDigits: 0,
  }).format(value)

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
</script>

<template>
  <section class="expense-list">
    <div v-if="!props.expenses.length" class="empty-state">
      当前筛选条件下还没有记录。
    </div>

    <article v-for="item in props.expenses" :key="item.id" class="expense-item-card">
      <div class="expense-item-top">
        <div class="expense-item-main">
          <div class="expense-item-title-row">
            <div class="expense-title-group">
              <h3>{{ item.title }}</h3>
              <span class="expense-category-inline">
                {{ categoryMap[item.category]?.icon || '🧾' }} {{ categoryMap[item.category]?.name || item.category }}
              </span>
            </div>
            <span class="expense-amount">{{ formatCurrency(item.amount) }}</span>
          </div>
          <div class="expense-item-meta">
            <span>{{ formatDate(props.effectiveDate ? props.effectiveDate(item) : item.date) }}</span>
            <span>{{ payerLabels[item.payer] }}付款</span>
          </div>
        </div>
      </div>

      <div class="expense-item-tags">
        <span class="info-pill soft">{{ item.recurrence === 'monthly' ? '每月固定' : '单次消费' }}</span>
        <span class="info-pill">{{ settings.meName }} {{ item.split.me }}%</span>
        <span class="info-pill">{{ settings.partnerName }} {{ item.split.partner }}%</span>
      </div>

      <p v-if="item.note" class="expense-note">{{ item.note }}</p>

      <div class="expense-item-actions">
        <button type="button" class="text-button" @click="emit('edit', item)">编辑</button>
        <button
          v-if="props.showDelete !== false"
          type="button"
          class="text-button danger"
          @click="emit('delete', item.id)"
        >
          删除
        </button>
      </div>
    </article>
  </section>
</template>
