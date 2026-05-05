<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Expense } from '../types'
import { useSettings } from '../composables/useSettings'
import { formatCurrency, getExpenseAmountLabel } from '../utils/currency'
import { toast } from '../composables/useToast'
import { toUserMessage } from '../utils/userMessage'
import { useExpenses } from '../composables/useExpenses'

const props = defineProps<{
  expense: Expense
}>()

const emit = defineEmits<{
  (e: 'close'): void
  (e: 'edit', expenseId: string): void
  (e: 'deleted', expenseId: string): void
}>()

const { settings, categoryMap } = useSettings()
const { deleteExpense } = useExpenses()
const confirmingDelete = ref(false)
const deleting = ref(false)

const payerLabel = computed(() => (props.expense.payer === 'me' ? settings.value.meName : settings.value.partnerName))
const amountLabel = computed(() => getExpenseAmountLabel(props.expense))
const convertedAmountLabel = computed(() => formatCurrency(props.expense.amount, props.expense.baseCurrency))
const splitLabel = computed(() => `${settings.value.meName} ${props.expense.split.me}% · ${settings.value.partnerName} ${props.expense.split.partner}%`)
const createdAtLabel = computed(() => {
  if (!props.expense.createdAt) return ''
  return new Date(props.expense.createdAt).toLocaleString('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
})

const closeDelete = () => {
  if (deleting.value) return
  confirmingDelete.value = false
}

const confirmDelete = async () => {
  deleting.value = true
  const { error } = await deleteExpense(props.expense.id)
  deleting.value = false

  if (error) {
    console.error('删除账单失败：', error)
    toast.error(toUserMessage(error, '云端删除失败，请稍后重试。'))
    return
  }

  confirmingDelete.value = false
  emit('deleted', props.expense.id)
}
</script>

<template>
  <div class="expense-detail-overlay" @click.self="emit('close')">
    <section class="expense-detail-card" role="dialog" aria-modal="true" aria-labelledby="expense-detail-title">
      <div class="expense-detail-head">
        <div>
          <p class="section-kicker">账单详情</p>
          <h2 id="expense-detail-title">{{ expense.title || '未命名消费' }}</h2>
        </div>
        <button type="button" class="ghost-icon-button" aria-label="关闭详情" @click="emit('close')">×</button>
      </div>

      <div class="expense-detail-hero">
        <strong>{{ amountLabel }}</strong>
        <span v-if="expense.originalCurrency !== expense.baseCurrency">记账金额 {{ convertedAmountLabel }}</span>
      </div>

      <div class="expense-detail-grid">
        <div class="expense-detail-item">
          <span>分类</span>
          <strong>{{ categoryMap[expense.category]?.icon || '🧾' }} {{ categoryMap[expense.category]?.name || expense.category }}</strong>
        </div>
        <div class="expense-detail-item">
          <span>付款人</span>
          <strong>{{ payerLabel }}</strong>
        </div>
        <div class="expense-detail-item">
          <span>日期</span>
          <strong>{{ expense.date }}</strong>
        </div>
        <div class="expense-detail-item">
          <span>分摊方式</span>
          <strong>{{ splitLabel }}</strong>
        </div>
        <div v-if="expense.originalCurrency !== expense.baseCurrency" class="expense-detail-item">
          <span>汇率</span>
          <strong>1 {{ expense.originalCurrency }} = {{ expense.exchangeRateUsed }} {{ expense.baseCurrency }}</strong>
        </div>
        <div v-if="createdAtLabel" class="expense-detail-item">
          <span>创建时间</span>
          <strong>{{ createdAtLabel }}</strong>
        </div>
      </div>

      <div v-if="expense.note" class="expense-detail-note">
        <span>备注</span>
        <p>{{ expense.note }}</p>
      </div>

      <div class="expense-detail-actions">
        <button type="button" class="secondary-button" @click="emit('edit', expense.id)">编辑</button>
        <button type="button" class="secondary-button danger-button" @click="confirmingDelete = true">删除</button>
      </div>
    </section>

    <div v-if="confirmingDelete" class="expense-delete-overlay" @click.self="closeDelete">
      <section class="expense-delete-card" role="dialog" aria-modal="true" aria-labelledby="expense-delete-title">
        <h3 id="expense-delete-title">确定删除这笔记录吗？</h3>
        <p>删除后无法恢复。</p>
        <div class="expense-delete-actions">
          <button type="button" class="secondary-button" :disabled="deleting" @click="closeDelete">取消</button>
          <button type="button" class="primary-button danger-button" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? '删除中...' : '删除' }}
          </button>
        </div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.expense-detail-overlay,
.expense-delete-overlay {
  position: fixed;
  inset: 0;
  display: grid;
  place-items: center;
  padding: 16px;
  background: rgba(15, 23, 42, 0.24);
  backdrop-filter: blur(8px);
  z-index: 45;
}

.expense-delete-overlay {
  z-index: 46;
}

.expense-detail-card,
.expense-delete-card {
  width: min(100%, 420px);
  border-radius: 20px;
  background: rgba(255, 255, 255, 0.97);
  border: 1px solid rgba(255, 255, 255, 0.84);
  box-shadow: 0 24px 48px rgba(15, 23, 42, 0.14);
}

.expense-detail-card {
  padding: 16px;
  display: grid;
  gap: 14px;
}

.expense-delete-card {
  padding: 16px;
  display: grid;
  gap: 10px;
}

.expense-detail-head,
.expense-delete-actions {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 10px;
}

.expense-detail-head h2,
.expense-delete-card h3 {
  margin: 0;
  font-size: 1.08rem;
}

.expense-delete-card p {
  margin: 0;
  color: var(--text-soft);
  font-size: 0.84rem;
}

.expense-detail-hero {
  display: grid;
  gap: 4px;
  padding: 14px;
  border-radius: 16px;
  background: linear-gradient(180deg, #ffffff 0%, #f7faff 100%);
  border: 1px solid rgba(15, 23, 42, 0.06);
}

.expense-detail-hero strong {
  font-size: 1.5rem;
  line-height: 1.05;
  letter-spacing: -0.04em;
}

.expense-detail-hero span,
.expense-detail-item span,
.expense-detail-note span {
  color: var(--text-faint);
  font-size: 0.78rem;
}

.expense-detail-grid {
  display: grid;
  gap: 8px;
}

.expense-detail-item {
  display: grid;
  gap: 2px;
  padding: 10px 12px;
  border-radius: 14px;
  background: rgba(249, 251, 253, 0.86);
  border: 1px solid rgba(15, 23, 42, 0.05);
}

.expense-detail-item strong {
  font-size: 0.88rem;
  line-height: 1.35;
}

.expense-detail-note {
  display: grid;
  gap: 6px;
  padding: 12px;
  border-radius: 14px;
  background: rgba(249, 251, 253, 0.86);
  border: 1px solid rgba(15, 23, 42, 0.05);
}

.expense-detail-note p {
  margin: 0;
  font-size: 0.86rem;
  line-height: 1.5;
  color: var(--text);
}

.expense-detail-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  flex-wrap: wrap;
}

.danger-button {
  background: linear-gradient(180deg, #f47c73 0%, #e35d54 100%);
  color: #fff;
  border-color: rgba(227, 93, 84, 0.26);
  box-shadow: none;
}

@media (max-width: 640px) {
  .expense-detail-overlay,
  .expense-delete-overlay {
    padding: 12px;
  }

  .expense-detail-card,
  .expense-delete-card {
    width: 100%;
  }

  .expense-detail-hero strong {
    font-size: 1.3rem;
  }
}
</style>
