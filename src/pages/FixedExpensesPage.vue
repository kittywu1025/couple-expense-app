<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { FixedExpense, Payer, SplitPreset } from '../types'
import { useFixedExpenses } from '../composables/useFixedExpenses'
import { useSettings } from '../composables/useSettings'
import { toast } from '../composables/useToast'
import { formatCurrency } from '../utils/currency'
import { isPersonalExpenseCategory, isSharedExpenseCategory } from '../utils/categories'

const emit = defineEmits<{
  (e: 'back'): void
}>()

const { settings, categoryMap } = useSettings()
const {
  fixedExpenses,
  fixedExpenseNextDates,
  saveFixedExpense,
  deleteFixedExpense,
  toggleFixedExpense,
  ensureFixedExpensesGenerated,
  getDefaultSplitForCategory,
} = useFixedExpenses()

const toFixedExpenseMessage = (error: unknown, fallback: string) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === 'string'
        ? String((error as { message?: string }).message)
        : ''
  const normalized = message.toLowerCase()
  if (normalized.includes('fixed_expenses') && normalized.includes('schema cache')) {
    return '固定消费数据表还没有创建，请先在 Supabase 执行 SQL。'
  }
  return fallback
}

const editingId = ref<string | null>(null)
const confirmDeleteId = ref<string | null>(null)
const saving = ref(false)
const deleting = ref(false)

const createDraft = (): FixedExpense => {
  const defaultCategory = settings.value.categories.find((item) => item.recordType === 'expense' && item.active)?.id || 'rent'
  const baseRule = getDefaultSplitForCategory(defaultCategory)
  return {
    id: '',
    name: '',
    amount: 0,
    currency: settings.value.defaultCurrency,
    category: defaultCategory,
    cycle: 'monthly',
    dayOfMonth: new Date().getDate(),
    startDate: new Date().toISOString().slice(0, 10),
    endDate: null,
    payer: 'me',
    splitPreset: baseRule.splitPreset,
    split: { ...baseRule.split },
    enabled: true,
  }
}

const form = reactive<FixedExpense>(createDraft())

const expenseCategories = computed(() =>
  settings.value.categories.filter((item) => item.recordType === 'expense' && item.active)
)

const splitOptions = computed(() => [
  { value: 'equal' as const, label: '平摊' },
  { value: 'payer-only' as const, label: '个人消费' },
  { value: 'rent' as const, label: '房租比例' },
  { value: 'custom' as const, label: '自定义' },
])

const nextRunLabel = computed(() => {
  if (!form.enabled) return '已停用'
  const preview = {
    ...form,
    id: editingId.value || 'preview',
  }
  return fixedExpenseNextDates.value[preview.id] || '保存后生成'
})

const amountInput = computed({
  get: () => (form.amount > 0 ? String(form.amount) : ''),
  set: (value: string | number) => {
    const raw = typeof value === 'number' ? String(value) : value
    form.amount = raw.trim() ? Number(raw) || 0 : 0
  },
})

const resetForm = () => {
  editingId.value = null
  Object.assign(form, createDraft())
}

const loadIntoForm = (item: FixedExpense) => {
  editingId.value = item.id
  Object.assign(form, {
    ...item,
    split: { ...item.split },
  })
}

const applyCategoryDefaults = (category: string) => {
  form.category = category
  if (form.splitPreset === 'custom') return
  if (category === 'rent') {
    form.splitPreset = 'rent'
  } else if (isPersonalExpenseCategory(category)) {
    form.splitPreset = 'payer-only'
  } else if (isSharedExpenseCategory(category)) {
    form.splitPreset = 'equal'
  }
  form.split = { ...getDefaultSplitForCategory(category).split }
}

const updateSplitPreset = (preset: SplitPreset) => {
  form.splitPreset = preset
  if (preset === 'custom') return
  if (preset === 'payer-only') {
    form.split = form.payer === 'me' ? { me: 100, partner: 0 } : { me: 0, partner: 100 }
    return
  }
  if (preset === 'rent') {
    form.split = { ...settings.value.defaultSplits.rent }
    return
  }
  form.split = { ...settings.value.defaultSplits.standard }
}

const updatePayer = (payer: Payer) => {
  form.payer = payer
  if (form.splitPreset === 'payer-only') {
    form.split = payer === 'me' ? { me: 100, partner: 0 } : { me: 0, partner: 100 }
  }
}

const updateCustomShare = (value: string) => {
  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed < 0 || parsed > 100) {
    toast.warning('我的承担比例需要在 0 到 100 之间。')
    return
  }
  form.splitPreset = 'custom'
  form.split.me = parsed
  form.split.partner = Number((100 - parsed).toFixed(2))
}

const saveForm = async () => {
  if (!form.name.trim()) {
    toast.warning('请填写固定消费名称。')
    return
  }
  if (!(form.amount > 0)) {
    toast.warning('请输入有效金额')
    return
  }
  if (!(form.dayOfMonth >= 1 && form.dayOfMonth <= 31)) {
    toast.warning('每月日期需要在 1 到 31 之间。')
    return
  }
  if (!form.startDate) {
    toast.warning('请选择开始日期。')
    return
  }

  saving.value = true
  const { error } = await saveFixedExpense({
    ...form,
    id: editingId.value || form.id,
  })
  saving.value = false

  if (error) {
    console.error('保存固定消费失败：', error)
    toast.error(toFixedExpenseMessage(error, '固定消费保存失败，请稍后重试。'))
    return
  }

  await ensureFixedExpensesGenerated()
  toast.success(editingId.value ? '固定消费已更新。' : '固定消费已保存。')
  resetForm()
}

const handleToggle = async (item: FixedExpense, enabled: boolean) => {
  const { error } = await toggleFixedExpense(item, enabled)
  if (error) {
    console.error('切换固定消费失败：', error)
    toast.error(toFixedExpenseMessage(error, '固定消费状态更新失败，请稍后重试。'))
    return
  }
  toast.success(enabled ? '已启用固定消费。' : '已停用固定消费。')
}

const confirmDelete = async () => {
  const target = fixedExpenses.value.find((item) => item.id === confirmDeleteId.value)
  if (!target) return
  deleting.value = true
  const { error } = await deleteFixedExpense(target)
  deleting.value = false
  if (error) {
    console.error('删除固定消费失败：', error)
    toast.error(toFixedExpenseMessage(error, '删除失败，请稍后重试。'))
    return
  }
  confirmDeleteId.value = null
  if (editingId.value === target.id) {
    resetForm()
  }
  toast.success('固定消费已删除。')
}

watch(
  () => form.category,
  (category, previous) => {
    if (!previous || category === previous) return
    applyCategoryDefaults(category)
  }
)
</script>

<template>
  <section class="page-stack">
    <section class="section-card">
      <div class="section-heading">
        <div>
          <h2>固定消费</h2>
          <p>管理每月自动提醒或自动生成的固定账单</p>
        </div>
        <button type="button" class="secondary-button compact-button" @click="emit('back')">返回</button>
      </div>

      <div class="field-row">
        <label class="field-group">
          <span class="field-label">名称</span>
          <input v-model="form.name" type="text" placeholder="例如：房租" />
        </label>
        <label class="field-group">
          <span class="field-label">金额</span>
          <div class="amount-input-wrap">
            <button type="button" class="currency-inline-pill" @click="form.currency = form.currency === 'JPY' ? 'CNY' : 'JPY'">
              {{ form.currency }}
            </button>
            <input v-model="amountInput" type="number" min="0" step="0.01" inputmode="decimal" placeholder="输入金额" />
          </div>
        </label>
      </div>

      <div class="field-row">
        <label class="field-group">
          <span class="field-label">分类</span>
          <select v-model="form.category">
            <option v-for="category in expenseCategories" :key="category.id" :value="category.id">
              {{ category.name }}
            </option>
          </select>
        </label>
        <label class="field-group">
          <span class="field-label">循环周期</span>
          <input value="每月一次" type="text" readonly />
        </label>
      </div>

      <div class="field-row">
        <label class="field-group">
          <span class="field-label">每月日期</span>
          <input v-model.number="form.dayOfMonth" type="number" min="1" max="31" />
        </label>
        <label class="field-group">
          <span class="field-label">开始日期</span>
          <input v-model="form.startDate" type="date" />
        </label>
      </div>

      <div class="field-row">
        <label class="field-group">
          <span class="field-label">结束日期（可选）</span>
          <input v-model="form.endDate" type="date" />
        </label>
        <label class="field-group">
          <span class="field-label">下次生成</span>
          <input :value="nextRunLabel || '—'" type="text" readonly />
        </label>
      </div>

      <div class="section-heading compact">
        <div>
          <h3>分摊方式</h3>
        </div>
      </div>

      <div class="segment-row">
        <button
          v-for="option in splitOptions"
          :key="option.value"
          type="button"
          :class="['segment-button', { active: form.splitPreset === option.value }]"
          @click="updateSplitPreset(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <div class="segment-row">
        <button
          type="button"
          :class="['segment-button', { active: form.payer === 'me' }]"
          @click="updatePayer('me')"
        >
          {{ settings.meName }}
        </button>
        <button
          type="button"
          :class="['segment-button', { active: form.payer === 'partner' }]"
          @click="updatePayer('partner')"
        >
          {{ settings.partnerName }}
        </button>
      </div>

      <div v-if="form.splitPreset === 'custom'" class="custom-split-inline">
        <label class="field-group compact-inline-field">
          <span class="field-label">我的承担比例</span>
          <div class="custom-split-input-row">
            <input :value="form.split.me" type="number" min="0" max="100" @input="updateCustomShare(($event.target as HTMLInputElement).value)" />
            <span>%</span>
          </div>
        </label>
        <p class="custom-split-result">{{ settings.partnerName }}承担：{{ form.split.partner }}%</p>
      </div>

      <label class="field-group checkbox-row">
        <span class="field-label">是否启用</span>
        <input v-model="form.enabled" type="checkbox" />
      </label>

      <div class="form-actions">
        <button type="button" class="secondary-button" @click="resetForm">清空</button>
        <button type="button" class="primary-button" :disabled="saving" @click="saveForm">
          {{ saving ? '保存中...' : editingId ? '保存修改' : '新增固定消费' }}
        </button>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <h3>固定消费列表</h3>
        </div>
      </div>

      <div v-if="!fixedExpenses.length" class="empty-state">
        <strong>还没有固定消费</strong>
        <p>例如房租、水费、订阅费，都可以在这里按月自动生成。</p>
      </div>

      <div v-else class="settings-list">
        <article v-for="item in fixedExpenses" :key="item.id" class="category-row fixed-expense-row">
          <div class="fixed-expense-copy">
            <strong>{{ item.name }}</strong>
            <span>{{ formatCurrency(item.amount, item.currency) }} · {{ categoryMap[item.category]?.name || item.category }}</span>
            <span>每月 {{ item.dayOfMonth }} 日 · 下次 {{ fixedExpenseNextDates[item.id] || '已结束' }}</span>
            <span>{{ item.enabled ? '已启用' : '已停用' }} · {{ settings.meName }} {{ item.split.me }}% / {{ settings.partnerName }} {{ item.split.partner }}%</span>
          </div>
          <div class="settings-inline-actions">
            <button type="button" class="secondary-button compact-button" @click="loadIntoForm(item)">编辑</button>
            <button
              type="button"
              class="secondary-button compact-button"
              @click="handleToggle(item, !item.enabled)"
            >
              {{ item.enabled ? '停用' : '启用' }}
            </button>
            <button type="button" class="secondary-button compact-button" @click="confirmDeleteId = item.id">删除</button>
          </div>
        </article>
      </div>
    </section>

    <div v-if="confirmDeleteId" class="expense-delete-overlay" @click.self="confirmDeleteId = null">
      <section class="expense-delete-card" role="dialog" aria-modal="true">
        <h3>确定删除这条固定消费吗？</h3>
        <p>删除后不会再自动生成后续账单。</p>
        <div class="expense-delete-actions">
          <button type="button" class="secondary-button" :disabled="deleting" @click="confirmDeleteId = null">取消</button>
          <button type="button" class="primary-button danger-button" :disabled="deleting" @click="confirmDelete">
            {{ deleting ? '删除中...' : '删除' }}
          </button>
        </div>
      </section>
    </div>
  </section>
</template>
