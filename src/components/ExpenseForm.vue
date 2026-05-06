<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from 'vue'
import type { Expense, Payer, RecordType, SplitPreset, SplitRule, SupportedCurrency } from '../types'
import { useSettings } from '../composables/useSettings'
import { toast } from '../composables/useToast'
import { formatCurrency } from '../utils/currency'
import { getDefaultCategoryId, isPersonalExpenseCategory } from '../utils/categories'

type SaveIntent = 'continue' | 'exit'

const props = withDefaults(
  defineProps<{
    expense?: Expense | null
    submitLabel?: string
  }>(),
  {
    expense: null,
    submitLabel: '保存记录',
  }
)

const emit = defineEmits<{
  (e: 'save', expense: Expense, intent: SaveIntent): void
  (e: 'cancel'): void
}>()

const { settings } = useSettings()
const splitMode = ref<'equal' | 'personal' | 'treat' | 'custom'>('equal')
const amountInputRef = ref<HTMLInputElement | null>(null)
const exchangeRateInputRef = ref<HTMLInputElement | null>(null)
const customSplitInputRef = ref<HTMLInputElement | null>(null)
const originalAmountInput = ref('')
const recordTypeOptions = [
  { value: 'expense' as const, label: '支出' },
  { value: 'income' as const, label: '收入' },
]

function getFirstActiveCategory(recordType: RecordType) {
  return (
    settings.value.categories.find((item) => item.recordType === recordType && item.active) ||
    settings.value.categories.find((item) => item.recordType === recordType) || {
      id: getDefaultCategoryId(recordType),
    }
  ).id
}

function getSplitByPreset(preset: SplitPreset, payer: Payer, category: string): SplitRule {
  if (preset === 'payer-only') {
    return payer === 'me' ? { me: 100, partner: 0 } : { me: 0, partner: 100 }
  }

  if (preset === 'rent' || category === 'rent') {
    return { ...settings.value.defaultSplits.rent }
  }

  return { ...settings.value.defaultSplits.standard }
}

function createDefaultExpense(): Expense {
  return {
    id: '',
    recordType: 'expense',
    title: '',
    amount: 0,
    originalAmount: 0,
    originalCurrency: settings.value.defaultCurrency,
    baseCurrency: settings.value.defaultCurrency,
    exchangeRateUsed: 1,
    exchangeRateDate: new Date().toISOString().slice(0, 10),
    date: new Date().toISOString().slice(0, 10),
    category: getFirstActiveCategory('expense'),
    payer: 'me',
    split: { ...settings.value.defaultSplits.standard },
    splitPreset: 'equal',
    recurrence: 'none',
    note: '',
  }
}

const form = reactive<Expense>(createDefaultExpense())
const isCrossCurrency = computed(() => form.originalCurrency !== form.baseCurrency)
const isExpenseMode = computed(() => form.recordType === 'expense')
const categoryOptions = computed(() =>
  settings.value.categories.filter(
    (item) => item.recordType === form.recordType && (item.active || item.id === form.category)
  )
)
const convertedAmountPreview = computed(() =>
  formatCurrency(form.amount || 0, form.baseCurrency, { maximumFractionDigits: form.baseCurrency === 'JPY' ? 0 : 2 })
)
const exchangeRateHint = computed(() => `请输入 1 ${form.originalCurrency} = 多少 ${form.baseCurrency}`)
const validationMessage = computed(() => {
  if (!(form.originalAmount > 0)) return '请输入有效金额'
  if (!form.date) return '请选择消费日期。'
  if (!form.category) return '请选择消费类别。'
  if (isCrossCurrency.value && !(form.exchangeRateUsed > 0)) return exchangeRateHint.value
  if (form.split.me < 0 || form.split.partner < 0) return '分摊比例不能为负数。'
  if (Math.abs(form.split.me + form.split.partner - 100) > 0.01) return '分摊比例总和必须等于 100%。'
  return ''
})

const payers = computed(() => [
  { value: 'me' as Payer, label: settings.value.meName },
  { value: 'partner' as Payer, label: settings.value.partnerName },
])

const splitOptions = computed(() => [
  {
    value: 'equal' as const,
    label: '平摊',
  },
  { value: 'personal' as const, label: '个人消费' },
  { value: 'treat' as const, label: '我请客' },
  { value: 'custom' as const, label: '自定义比例' },
])

function syncSplitMode() {
  if (form.recordType === 'income') {
    splitMode.value = 'personal'
    return
  }

  if (form.splitPreset === 'custom') {
    splitMode.value = 'custom'
    return
  }

  if (form.splitPreset === 'payer-only') {
    splitMode.value = 'personal'
    return
  }

  splitMode.value = 'equal'
}

function syncRecordTypeState() {
  if (form.recordType === 'income') {
    form.payer = 'me'
    form.splitPreset = 'payer-only'
    form.split = { me: 100, partner: 0 }
    if (!categoryOptions.value.some((item) => item.id === form.category)) {
      form.category = getFirstActiveCategory('income')
    }
    return
  }

  if (!categoryOptions.value.some((item) => item.id === form.category)) {
    form.category = getFirstActiveCategory('expense')
  }
  if (form.splitPreset !== 'custom') {
    if (isPersonalExpenseCategory(form.category)) {
      form.splitPreset = 'payer-only'
    } else if (form.category === 'rent') {
      form.splitPreset = 'rent'
    } else {
      form.splitPreset = 'equal'
    }
    form.split = getSplitByPreset(form.category === 'rent' ? 'rent' : form.splitPreset, form.payer, form.category)
  }
}

function syncCurrencyFields() {
  form.baseCurrency = form.baseCurrency || settings.value.defaultCurrency || 'JPY'
  form.originalCurrency = form.originalCurrency || form.baseCurrency
  form.exchangeRateDate = form.date || form.exchangeRateDate || new Date().toISOString().slice(0, 10)
  const precision = form.baseCurrency === 'JPY' ? 0 : 2

  if (form.originalCurrency === form.baseCurrency) {
    form.exchangeRateUsed = 1
    form.amount = Number((Number(form.originalAmount) || 0).toFixed(precision))
    return
  }

  const safeRate = Number(form.exchangeRateUsed) || 0
  form.amount = Number(((Number(form.originalAmount) || 0) * safeRate).toFixed(precision))
}

function syncAmountInputField() {
  originalAmountInput.value = form.originalAmount > 0 ? String(form.originalAmount) : ''
}

function updateOriginalAmountInput(value: string) {
  originalAmountInput.value = value
  const trimmed = value.trim()
  form.originalAmount = trimmed ? Number(trimmed.replace(/,/g, '')) || 0 : 0
  syncCurrencyFields()
}

function updateOriginalCurrency(currency: SupportedCurrency) {
  const previousCurrency = form.originalCurrency
  form.originalCurrency = currency || settings.value.defaultCurrency || 'JPY'
  if (
    form.originalCurrency !== form.baseCurrency &&
    (previousCurrency === form.baseCurrency || form.exchangeRateUsed === 1)
  ) {
    form.exchangeRateUsed = 0
  }
  syncCurrencyFields()
}

function syncFromExpense(value?: Expense | null) {
  const nextExpense = value ? { ...value } : createDefaultExpense()
  if (!value) {
    nextExpense.recordType = 'expense'
    nextExpense.baseCurrency = settings.value.defaultCurrency || 'JPY'
    nextExpense.originalCurrency = settings.value.defaultCurrency || 'JPY'
    nextExpense.exchangeRateUsed = 1
    nextExpense.exchangeRateDate = nextExpense.date
  }
  Object.assign(form, nextExpense)
  if (!value) {
    form.recurrence = 'none'
  }
  syncRecordTypeState()
  syncCurrencyFields()
  syncSplitMode()
  syncAmountInputField()
}

function updateRecordType(recordType: RecordType) {
  form.recordType = recordType
  form.category = getFirstActiveCategory(recordType)
  if (recordType === 'income') {
    form.payer = 'me'
    form.splitPreset = 'payer-only'
    form.split = { me: 100, partner: 0 }
  } else {
    form.splitPreset = isPersonalExpenseCategory(form.category) ? 'payer-only' : form.category === 'rent' ? 'rent' : 'equal'
    form.split = getSplitByPreset(form.splitPreset, form.payer, form.category)
  }
  syncSplitMode()
}

function applySplitMode(mode: 'equal' | 'personal' | 'treat' | 'custom') {
  if (form.recordType === 'income') return
  const previousMode = splitMode.value
  splitMode.value = mode
  if (mode === 'custom') {
    form.splitPreset = 'custom'
    if (previousMode !== 'custom') {
      form.split = { me: 40, partner: 60 }
    }
    return
  }

  if (mode === 'personal' || mode === 'treat') {
    form.splitPreset = 'payer-only'
    form.split = getSplitByPreset('payer-only', form.payer, form.category)
    return
  }

  form.splitPreset = form.category === 'rent' ? 'rent' : 'equal'
  form.split = getSplitByPreset(form.splitPreset, form.payer, form.category)
}

function updateCategory(category: string) {
  form.category = category
  if (form.recordType === 'income') return
  if (form.splitPreset !== 'custom') {
    if (isPersonalExpenseCategory(category)) {
      applySplitMode('personal')
      return
    }
    applySplitMode('equal')
  }
}

function updatePayer(payer: Payer) {
  if (form.recordType === 'income') return
  form.payer = payer
  if (splitMode.value === 'personal' || splitMode.value === 'treat' || form.splitPreset === 'payer-only') {
    form.split = getSplitByPreset('payer-only', payer, form.category)
  }
}

function updateCustomSplitValue(value: number) {
  const rawValue = Number(value)
  if (!Number.isFinite(rawValue)) {
    toast.warning('请输入 0 到 100 之间的比例。')
    customSplitInputRef.value?.focus()
    return
  }
  if (rawValue < 0 || rawValue > 100) {
    toast.warning('我的承担比例需要在 0 到 100 之间。')
    customSplitInputRef.value?.focus()
    return
  }
  const safeValue = Math.round(rawValue * 100) / 100
  form.splitPreset = 'custom'
  splitMode.value = 'custom'
  form.split.me = safeValue
  form.split.partner = Number((100 - safeValue).toFixed(2))
}

watch(
  () => props.expense,
  (value) => {
    syncFromExpense(value)
  },
  { immediate: true }
)

watch(
  () => settings.value.defaultCurrency,
  (currency) => {
    if (props.expense) return
    form.baseCurrency = currency || 'JPY'
    if (!form.originalCurrency) {
      form.originalCurrency = currency || 'JPY'
    }
    syncCurrencyFields()
  }
)

watch(
  () => [form.originalAmount, form.exchangeRateUsed, form.date],
  () => {
    syncCurrencyFields()
  }
)

watch(
  () => [form.recordType, settings.value.categories],
  () => {
    syncRecordTypeState()
    syncSplitMode()
  },
  { deep: true }
)

function buildExpensePayload() {
  if (validationMessage.value) {
    toast.warning(validationMessage.value)
    void nextTick(() => {
      if (!(form.originalAmount > 0)) {
        amountInputRef.value?.focus()
        return
      }

      if (isCrossCurrency.value && !(form.exchangeRateUsed > 0)) {
        exchangeRateInputRef.value?.focus()
      }
    })
    return
  }

  syncCurrencyFields()

  return {
    ...form,
    title: form.title.trim(),
    note: '',
    amount: Number(form.amount),
    originalAmount: Number(form.originalAmount),
    exchangeRateUsed: Number(form.exchangeRateUsed),
    split: {
      me: Number(form.split.me.toFixed(2)),
      partner: Number(form.split.partner.toFixed(2)),
    },
  } satisfies Expense
}

function submit(intent: SaveIntent = 'exit') {
  const payload = buildExpensePayload()
  if (!payload) {
    return
  }

  emit('save', payload, intent)
}

function resetForNextEntry() {
  const preserved = {
    recordType: form.recordType,
    baseCurrency: form.baseCurrency,
    originalCurrency: form.originalCurrency,
    exchangeRateUsed: form.exchangeRateUsed,
    exchangeRateDate: form.exchangeRateDate,
    date: form.date,
    category: form.category,
    payer: form.payer,
    splitPreset: form.splitPreset,
    split: { ...form.split },
  }

  Object.assign(form, createDefaultExpense(), preserved, {
    id: '',
    title: '',
    note: '',
    amount: 0,
    originalAmount: 0,
    createdAt: undefined,
    updatedAt: undefined,
    bookId: undefined,
    createdBy: undefined,
  })

  if (form.recordType === 'income') {
    form.payer = 'me'
    form.splitPreset = 'payer-only'
    form.split = { me: 100, partner: 0 }
  }

  syncCurrencyFields()
  syncSplitMode()
  syncAmountInputField()
  void nextTick(() => amountInputRef.value?.focus())
}

defineExpose({
  resetForNextEntry,
})
</script>

<template>
  <form class="expense-form" @submit.prevent="submit('exit')">
    <section class="section-card">
      <div class="section-heading">
        <div>
          <h2>{{ props.expense ? '编辑记录' : '添加记录' }}</h2>
        </div>
        <button type="button" class="secondary-button" @click="emit('cancel')">取消</button>
      </div>

      <div class="segment-row">
        <button
          v-for="option in recordTypeOptions"
          :key="option.value"
          type="button"
          :class="['segment-button', { active: form.recordType === option.value }]"
          @click="updateRecordType(option.value)"
        >
          {{ option.label }}
        </button>
      </div>

      <label class="field-group amount-field">
        <span class="field-label">金额</span>
        <div class="amount-input-wrap">
          <button
            type="button"
            class="currency-inline-pill"
            @click="updateOriginalCurrency(form.originalCurrency === 'JPY' ? 'CNY' : 'JPY')"
          >
            {{ form.originalCurrency }}
          </button>
          <input
            ref="amountInputRef"
            :value="originalAmountInput"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            :placeholder="form.originalCurrency === 'JPY' ? '0' : '输入金额'"
            @input="updateOriginalAmountInput(($event.target as HTMLInputElement).value)"
          />
        </div>
      </label>

      <label class="field-group">
        <span class="field-label">日期</span>
        <input v-model="form.date" type="date" />
      </label>

      <div v-if="isCrossCurrency" class="exchange-panel">
        <div class="exchange-panel-head">
          <strong>汇率换算</strong>
          <span class="info-pill soft">保存到 {{ form.baseCurrency }}</span>
        </div>
        <div class="field-row">
          <label class="field-group">
            <span class="field-label">汇率</span>
            <input
              ref="exchangeRateInputRef"
              v-model.number="form.exchangeRateUsed"
              type="number"
              min="0"
              step="0.0001"
              inputmode="decimal"
              :placeholder="form.baseCurrency === 'JPY' ? '例如：20.35' : '例如：0.049'"
            />
          </label>
          <label class="field-group">
            <span class="field-label">汇率日期</span>
            <input v-model="form.exchangeRateDate" type="date" />
          </label>
        </div>
        <p class="exchange-hint">{{ exchangeRateHint }}</p>
        <p class="exchange-result">按当前汇率将计入 {{ convertedAmountPreview }}</p>
      </div>

      <label class="field-group">
        <span class="field-label">说明（可选）</span>
        <input
          v-model="form.title"
          type="text"
          :placeholder="isExpenseMode ? '例如：晚餐、超市采购、5 月房租' : '例如：5 月兼职、妈妈转生活费'"
        />
      </label>
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <h3>分类</h3>
        </div>
      </div>

      <div class="chip-grid">
        <button
          v-for="category in categoryOptions"
          :key="category.id"
          type="button"
          :class="['chip-button', { active: form.category === category.id }]"
          @click="updateCategory(category.id)"
        >
          <span>{{ category.icon }}</span>
          <span>{{ category.name }}</span>
        </button>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <h3>{{ isExpenseMode ? '付款人' : '收入归属' }}</h3>
        </div>
      </div>

      <div v-if="isExpenseMode" class="segment-row">
        <button
          v-for="payer in payers"
          :key="payer.value"
          type="button"
          :class="['segment-button', { active: form.payer === payer.value }]"
          @click="updatePayer(payer.value)"
        >
          {{ payer.label }}
        </button>
      </div>
      <div v-else class="sync-card">
        <span>本笔收入会记到当前登录用户名下</span>
        <strong>{{ settings.meName }}</strong>
      </div>
    </section>

    <section v-if="isExpenseMode" class="section-card">
      <div class="section-heading compact">
        <div>
          <h3>分摊方式</h3>
        </div>
      </div>

      <div class="split-chip-row">
        <button
          v-for="option in splitOptions"
          :key="option.value"
          type="button"
          :class="['split-pill', { active: splitMode === option.value }]"
          @click="applySplitMode(option.value)"
        >
          <strong>{{ option.label }}</strong>
        </button>
      </div>

      <div v-if="splitMode === 'custom'" class="custom-split-inline">
        <label class="field-group compact-inline-field">
          <span class="field-label">我的承担比例</span>
          <div class="custom-split-input-row">
            <input
              ref="customSplitInputRef"
              :value="form.split.me"
              type="number"
              min="0"
              max="100"
              step="1"
              inputmode="decimal"
              @input="updateCustomSplitValue(Number(($event.target as HTMLInputElement).value))"
            />
            <span>%</span>
          </div>
        </label>
        <p class="custom-split-result">{{ settings.partnerName }}承担：{{ form.split.partner }}%</p>
      </div>

    </section>

    <section class="section-card">
      <div class="form-actions">
        <button type="button" class="secondary-button" @click="emit('cancel')">取消</button>
        <div class="save-actions">
          <button
            v-if="!props.expense"
            type="button"
            class="secondary-button"
            @click="submit('continue')"
          >
            保存并继续
          </button>
          <button type="submit" class="primary-button">{{ props.submitLabel }}</button>
        </div>
      </div>
    </section>
  </form>
</template>
