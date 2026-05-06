<script setup lang="ts">
import { computed, ref } from 'vue'
import ExpenseForm from '../components/ExpenseForm.vue'
import { useExpenses } from '../composables/useExpenses'
import { useSettings } from '../composables/useSettings'
import { toast } from '../composables/useToast'
import type { Expense } from '../types'
import { parseQuickExpenseText } from '../utils/quickEntry'
import { toUserMessage } from '../utils/userMessage'

type SaveIntent = 'continue' | 'exit'

const props = defineProps<{
  expenseId?: string | null
}>()

const emit = defineEmits<{
  (e: 'saved', message: string): void
  (e: 'cancel'): void
}>()

const { expenses, addExpense, updateExpense } = useExpenses()
const { settings } = useSettings()
const formRef = ref<InstanceType<typeof ExpenseForm> | null>(null)
const quickEntryOpen = ref(false)
const quickEntryText = ref('')

const editingExpense = computed(() =>
  props.expenseId ? expenses.value.find((item) => item.id === props.expenseId) || null : null
)

const quickPreview = computed(() =>
  parseQuickExpenseText(quickEntryText.value, { defaultCurrency: settings.value.defaultCurrency })
)

const hasQuickPreviewIssues = computed(() => quickPreview.value.some((item) => item.issues.length > 0))

const formatDebugError = (error: unknown) => {
  const supabaseError = error as { code?: string; message?: string; details?: string | null; hint?: string | null }
  const parts = [
    supabaseError?.code ? `code=${supabaseError.code}` : '',
    supabaseError?.message ? `message=${supabaseError.message}` : '',
    supabaseError?.details ? `details=${supabaseError.details}` : '',
    supabaseError?.hint ? `hint=${supabaseError.hint}` : '',
  ].filter(Boolean)

  return parts.length ? `（${parts.join(' | ')}）` : ''
}

const buildWarningMessage = (error: unknown) =>
  `本地已保存，但云端同步失败，对方暂时看不到${import.meta.env.DEV ? formatDebugError(error) : ''}`

const saveSingleExpense = async (expense: Expense) => {
  try {
    if (editingExpense.value) {
      const result = await updateExpense(expense)
      if (result.status === 'local_fallback') {
        return { status: 'local_fallback' as const, error: result.error }
      }
      return { status: 'synced' as const }
    }

    const result = await addExpense(expense)
    if (result.status === 'local_fallback') {
      return { status: 'local_fallback' as const, error: result.error }
    }
    return { status: 'synced' as const }
  } catch (error) {
    console.error('保存消费失败：', error)
    const fallback = `保存失败，请稍后重试。${import.meta.env.DEV ? formatDebugError(error) : ''}`
    toast.error(toUserMessage(error, fallback))
    return { status: 'error' as const }
  }
}

const handleSave = async (expense: Expense, intent: SaveIntent) => {
  const result = await saveSingleExpense(expense)
  if (result.status === 'error') {
    return
  }

  if (editingExpense.value) {
    if (result.status === 'local_fallback') {
      toast.warning(buildWarningMessage(result.error))
      return
    }
    emit('saved', '记录已更新。')
    return
  }

  if (result.status === 'local_fallback') {
    toast.warning(buildWarningMessage(result.error))
    if (intent === 'continue') {
      formRef.value?.resetForNextEntry()
    }
    return
  }

  if (intent === 'continue') {
    formRef.value?.resetForNextEntry()
    toast.success('已保存，可以继续记下一笔')
    return
  }

  emit('saved', '已保存')
}

const explainQuickIssue = (issue: string) => {
  if (issue === 'unsupported-income') return '快速输入暂不支持收入'
  if (issue === 'missing-rate') return '跨货币需要补充汇率'
  if (issue === 'missing-date') return '缺少日期'
  if (issue === 'missing-title') return '缺少说明'
  return '缺少金额'
}

const resetQuickEntry = () => {
  quickEntryText.value = ''
}

const saveQuickEntries = async (intent: SaveIntent) => {
  if (!quickPreview.value.length) {
    toast.warning('请先输入要快速记录的内容')
    return
  }

  if (hasQuickPreviewIssues.value) {
    toast.warning('有内容未能识别，请检查金额或日期')
    return
  }

  let hasFallback = false

  for (const item of quickPreview.value) {
    const result = await addExpense({
      id: '',
      recordType: 'expense',
      title: item.title,
      amount: item.originalAmount ?? 0,
      originalAmount: item.originalAmount ?? 0,
      originalCurrency: item.originalCurrency,
      baseCurrency: settings.value.defaultCurrency,
      exchangeRateUsed: 1,
      exchangeRateDate: item.date || new Date().toISOString().slice(0, 10),
      date: item.date || new Date().toISOString().slice(0, 10),
      category: item.category,
      payer: 'me',
      split: { me: 0, partner: 0 },
      splitPreset: 'equal',
      recurrence: 'none',
      note: '',
    } as Expense)

    if (result.status === 'local_fallback') {
      hasFallback = true
    }
  }

  resetQuickEntry()
  quickEntryOpen.value = false

  if (hasFallback) {
    toast.warning('本地已保存，但云端同步失败，对方暂时看不到')
    return
  }

  if (intent === 'continue') {
    toast.success('已保存，可以继续记下一笔')
    return
  }

  emit('saved', '已保存')
}
</script>

<template>
  <section class="page-card">
    <section v-if="!editingExpense" class="section-card quick-entry-card">
      <div class="section-heading compact">
        <div>
          <h3>快速输入</h3>
        </div>
        <button type="button" class="secondary-button compact-button" @click="quickEntryOpen = !quickEntryOpen">
          {{ quickEntryOpen ? '收起' : '展开' }}
        </button>
      </div>

      <div v-if="quickEntryOpen" class="quick-entry-shell">
        <textarea
          v-model="quickEntryText"
          class="quick-entry-textarea"
          placeholder="例如：5月3日 药店买药 1078，超市 2000"
        />

        <div v-if="quickPreview.length" class="quick-entry-preview">
          <button
            v-for="item in quickPreview"
            :key="`${item.source}-${item.title}`"
            type="button"
            class="quick-preview-item"
            disabled
          >
            <strong>
              {{ item.date ? item.date.replace(/-/g, '/') : '需要补充' }}
              {{ item.title || '需要补充说明' }}
              {{ item.originalCurrency }}
              {{ item.originalAmount ?? '需要补充金额' }}
            </strong>
            <span v-if="item.issues.length">
              {{ item.issues.map(explainQuickIssue).join(' / ') }}
            </span>
          </button>
        </div>

        <div class="quick-entry-actions">
          <button type="button" class="secondary-button" @click="saveQuickEntries('continue')">保存全部并继续</button>
          <button type="button" class="primary-button" @click="saveQuickEntries('exit')">保存全部并退出</button>
        </div>
      </div>
    </section>

    <ExpenseForm
      ref="formRef"
      :expense="editingExpense"
      :submit-label="editingExpense ? '更新记录' : '保存并退出'"
      @save="handleSave"
      @cancel="emit('cancel')"
    />
  </section>
</template>
