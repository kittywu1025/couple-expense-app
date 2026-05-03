<script setup lang="ts">
import { computed, reactive, ref, watch } from 'vue'
import type { Expense, Payer, SplitPreset, SplitRule } from '../types'
import { useSettings } from '../composables/useSettings'

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
  (e: 'save', expense: Expense): void
  (e: 'cancel'): void
}>()

const { settings, categoryMap } = useSettings()
const splitMode = ref<'equal' | 'personal' | 'treat' | 'custom'>('equal')

const getSplitByPreset = (preset: SplitPreset, payer: Payer, category: string): SplitRule => {
  if (preset === 'payer-only') {
    return payer === 'me' ? { me: 100, partner: 0 } : { me: 0, partner: 100 }
  }

  if (preset === 'rent' || category === 'rent') {
    return { ...settings.value.defaultSplits.rent }
  }

  return { ...settings.value.defaultSplits.standard }
}

const createDefaultExpense = (): Expense => ({
  id: '',
  title: '',
  amount: 0,
  date: new Date().toISOString().slice(0, 10),
  category: settings.value.categories.find((item) => item.id !== 'rent')?.id || 'food',
  payer: 'me',
  split: { ...settings.value.defaultSplits.standard },
  splitPreset: 'equal',
  recurrence: 'none',
  note: '',
})

const form = reactive<Expense>(createDefaultExpense())
const validationMessage = computed(() => {
  if (!form.title.trim()) return '请填写这笔消费的说明，例如“晚餐”或“5 月房租”。'
  if (!(form.amount > 0)) return '请输入大于 0 的金额。'
  if (!form.date) return '请选择消费日期。'
  if (!form.category) return '请选择消费类别。'
  if (form.split.me < 0 || form.split.partner < 0) return '分摊比例不能为负数。'
  if (Math.abs(form.split.me + form.split.partner - 100) > 0.01) return '分摊比例总和必须等于 100%。'
  return ''
})

const payers = computed(() => [
  { value: 'me' as Payer, label: settings.value.meName },
  { value: 'partner' as Payer, label: settings.value.partnerName },
])

const categoryOptions = computed(() => settings.value.categories)

const splitOptions = computed(() => [
  {
    value: 'equal' as const,
    label: '平摊',
    description:
      form.category === 'rent'
        ? `房租默认 ${settings.value.defaultSplits.rent.me}/${settings.value.defaultSplits.rent.partner}`
        : '默认一起承担',
  },
  { value: 'personal' as const, label: '个人消费', description: '付款人承担 100%' },
  { value: 'treat' as const, label: '我请客', description: '由付款人全部承担' },
  { value: 'custom' as const, label: '自定义比例', description: '拖动滑条调整' },
])

const splitSummary = computed(() => `${settings.value.meName}承担 ${form.split.me}% · ${settings.value.partnerName}承担 ${form.split.partner}%`)

const syncSplitMode = () => {
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

const syncFromExpense = (value?: Expense | null) => {
  const nextExpense = value ? { ...value } : createDefaultExpense()
  Object.assign(form, nextExpense)
  if (!value) {
    form.recurrence = 'none'
  }
  syncSplitMode()
}

watch(
  () => props.expense,
  (value) => {
    syncFromExpense(value)
  },
  { immediate: true }
)

const applySplitMode = (mode: 'equal' | 'personal' | 'treat' | 'custom') => {
  splitMode.value = mode
  if (mode === 'custom') {
    form.splitPreset = 'custom'
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

const updateCategory = (category: string) => {
  form.category = category
  if (form.splitPreset !== 'custom') {
    applySplitMode(splitMode.value === 'custom' ? 'custom' : splitMode.value)
  }
}

const updatePayer = (payer: Payer) => {
  form.payer = payer
  if (splitMode.value === 'personal' || splitMode.value === 'treat' || form.splitPreset === 'payer-only') {
    form.split = getSplitByPreset('payer-only', payer, form.category)
  }
}

const updateSplitValue = (field: 'me' | 'partner', value: number) => {
  const safeValue = Math.max(0, Math.min(100, Number(value) || 0))
  form.splitPreset = 'custom'
  splitMode.value = 'custom'
  form.split[field] = safeValue
  form.split[field === 'me' ? 'partner' : 'me'] = Number((100 - safeValue).toFixed(2))
}

const submit = () => {
  if (validationMessage.value) return

  emit('save', {
    ...form,
    title: form.title.trim(),
    note: form.note?.trim() || '',
    amount: Number(form.amount),
    split: {
      me: Number(form.split.me.toFixed(2)),
      partner: Number(form.split.partner.toFixed(2)),
    },
  })
}
</script>

<template>
  <form class="expense-form" @submit.prevent="submit">
    <section class="section-card">
      <div class="section-heading">
        <div>
          <p class="section-kicker">记一笔消费</p>
          <h2>{{ props.expense ? '编辑记录' : '添加消费' }}</h2>
        </div>
        <button type="button" class="secondary-button" @click="emit('cancel')">取消</button>
      </div>

      <label class="field-group amount-field">
        <span class="field-label">金额</span>
        <div class="amount-input-wrap">
          <span class="currency-label">¥</span>
          <input
            v-model.number="form.amount"
            type="number"
            min="0"
            step="0.01"
            inputmode="decimal"
            placeholder="0"
          />
        </div>
      </label>

      <label class="field-group">
        <span class="field-label">消费说明</span>
        <input v-model="form.title" type="text" placeholder="例如：晚餐、超市采购、5 月房租" />
      </label>

      <div class="field-row">
        <label class="field-group">
          <span class="field-label">日期</span>
          <input v-model="form.date" type="date" />
        </label>

        <div class="field-group expense-mode-card">
          <span class="field-label">记账类型</span>
          <strong>普通单次消费</strong>
          <small>每月固定消费后续会放到单独入口管理。</small>
        </div>
      </div>
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <p class="section-kicker">分类</p>
          <h3>这笔钱花在哪</h3>
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
          <p class="section-kicker">付款人</p>
          <h3>默认已选当前使用者，可手动切换</h3>
        </div>
      </div>

      <div class="segment-row">
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
    </section>

    <section class="section-card">
      <div class="section-heading compact">
        <div>
          <p class="section-kicker">分摊方式</p>
          <h3>{{ categoryMap[form.category]?.name || '当前分类' }} 默认规则可手动调整</h3>
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
          <span>{{ option.description }}</span>
        </button>
      </div>

      <div class="split-slider-card">
        <div class="split-summary-row">
          <strong>{{ splitSummary }}</strong>
          <span class="info-pill soft">
            {{ splitMode === 'treat' ? '请客语义' : splitMode === 'personal' ? '个人承担' : '当前比例' }}
          </span>
        </div>

        <div v-if="splitMode === 'custom'" class="slider-block">
          <div class="split-slider-labels">
            <span>{{ settings.meName }} {{ form.split.me }}%</span>
            <span>{{ settings.partnerName }} {{ form.split.partner }}%</span>
          </div>
          <input
            class="split-slider"
            :value="form.split.me"
            type="range"
            min="0"
            max="100"
            step="1"
            @input="updateSplitValue('me', Number(($event.target as HTMLInputElement).value))"
          />
        </div>

        <div v-else class="split-hint">
          <span v-if="form.category === 'rent' && splitMode === 'equal'">房租会自动套用设置页里的默认比例。</span>
          <span v-else>需要单独调整时，切换到“自定义比例”即可。</span>
        </div>
      </div>

      <div v-if="splitMode === 'custom'" class="field-row split-input-row">
        <label class="field-group">
          <span class="field-label">{{ settings.meName }}承担 %</span>
          <input
            :value="form.split.me"
            type="number"
            min="0"
            max="100"
            step="1"
            @input="updateSplitValue('me', Number(($event.target as HTMLInputElement).value))"
          />
        </label>

        <label class="field-group">
          <span class="field-label">{{ settings.partnerName }}承担 %</span>
          <input
            :value="form.split.partner"
            type="number"
            min="0"
            max="100"
            step="1"
            @input="updateSplitValue('partner', Number(($event.target as HTMLInputElement).value))"
          />
        </label>
      </div>
    </section>

    <section class="section-card">
      <label class="field-group">
        <span class="field-label">备注（可选）</span>
        <textarea v-model="form.note" rows="3" placeholder="晚餐、5月房租、超市购物" />
      </label>

      <p v-if="validationMessage" class="error-message">{{ validationMessage }}</p>

      <div class="form-actions">
        <button type="button" class="secondary-button" @click="emit('cancel')">取消</button>
        <button type="submit" class="primary-button">{{ props.submitLabel }}</button>
      </div>
    </section>
  </form>
</template>
