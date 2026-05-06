import { computed, ref, watch } from 'vue'
import type { Expense, FixedExpense, FixedExpenseRun, SplitPreset, SplitRule } from '../types'
import { loadJSON, saveJSON } from '../utils/storage'
import { authUser } from './useSupabaseAuth'
import { useBooks } from './useBooks'
import { useSettings } from './useSettings'
import { toast } from './useToast'
import {
  deleteFixedExpenseRemote,
  deleteFixedExpenseRunRemote,
  fetchFixedExpenseRunsRemote,
  fetchFixedExpensesRemote,
  insertFixedExpenseRunRemote,
  upsertFixedExpenseRemote,
} from './useSupabaseFixedExpenses'
import { normalizeCurrency } from '../utils/currency'
import { isPersonalExpenseCategory, isSharedExpenseCategory, normalizeCategoryId } from '../utils/categories'
import {
  formatMonthKey,
  getExpenseRunMonth,
  getFixedExpenseNextDate,
  getRunDateForMonth,
  shouldGenerateFixedExpense,
} from '../utils/fixedExpenses'
import { useExpenses } from './useExpenses'

const FIXED_EXPENSES_STORAGE_KEY = 'couple-expense-app-fixed-expenses'
const FIXED_EXPENSE_RUNS_STORAGE_KEY = 'couple-expense-app-fixed-expense-runs'

const { settings } = useSettings()
const { currentBookId, isLocalBookMode } = useBooks()
const { addExpense } = useExpenses()

const formatFixedExpenseError = (error: unknown, fallback: string) => {
  const message =
    error instanceof Error
      ? error.message
      : typeof (error as { message?: unknown })?.message === 'string'
        ? String((error as { message?: string }).message)
        : ''
  const normalized = message.toLowerCase()
  if (normalized.includes('relation') && normalized.includes('does not exist')) {
    return '固定消费数据表还没有创建，请先在 Supabase 执行 SQL。'
  }
  if (normalized.includes('permission denied') || normalized.includes('row-level security')) {
    return '当前账号没有权限操作固定消费，请检查 Supabase RLS 策略。'
  }
  return fallback
}

const normalizeSplit = (split: Partial<SplitRule> | undefined, fallback: SplitRule): SplitRule => {
  const meValue = Number(split?.me)
  const partnerValue = Number(split?.partner)
  if (Number.isFinite(meValue) && Number.isFinite(partnerValue) && meValue + partnerValue > 0) {
    const total = meValue + partnerValue
    return {
      me: Number(((meValue / total) * 100).toFixed(2)),
      partner: Number(((partnerValue / total) * 100).toFixed(2)),
    }
  }
  return fallback
}

const personalSplit = (payer: FixedExpense['payer']): SplitRule =>
  payer === 'me' ? { me: 100, partner: 0 } : { me: 0, partner: 100 }

const getDefaultSplitForCategory = (category: string): { split: SplitRule; splitPreset: SplitPreset } => {
  if (category === 'rent') {
    return {
      split: normalizeSplit(settings.value.defaultSplits.rent, { me: 60, partner: 40 }),
      splitPreset: 'rent',
    }
  }
  if (isPersonalExpenseCategory(category)) {
    return {
      split: personalSplit('me'),
      splitPreset: 'payer-only',
    }
  }
  if (isSharedExpenseCategory(category)) {
    return {
      split: normalizeSplit(settings.value.defaultSplits.standard, { me: 50, partner: 50 }),
      splitPreset: 'equal',
    }
  }
  return {
    split: normalizeSplit(settings.value.defaultSplits.standard, { me: 50, partner: 50 }),
    splitPreset: 'equal',
  }
}

const normalizeFixedExpense = (item?: Partial<FixedExpense>): FixedExpense => {
  const category = normalizeCategoryId(item?.category, 'expense')
  const baseRule = getDefaultSplitForCategory(category)
  return {
    id: item?.id || crypto.randomUUID(),
    bookId: item?.bookId,
    createdBy: item?.createdBy,
    name: item?.name?.trim() || '',
    amount: Math.max(0, Number(item?.amount) || 0),
    currency: normalizeCurrency(item?.currency || settings.value.defaultCurrency),
    category,
    cycle: 'monthly',
    dayOfMonth: Math.max(1, Math.min(31, Number(item?.dayOfMonth) || new Date().getDate())),
    startDate: item?.startDate || new Date().toISOString().slice(0, 10),
    endDate: item?.endDate || null,
    payer: item?.payer === 'partner' ? 'partner' : 'me',
    splitPreset: item?.splitPreset || baseRule.splitPreset,
    split: normalizeSplit(item?.split, baseRule.split),
    enabled: item?.enabled ?? true,
    createdAt: item?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

const normalizeRun = (item?: Partial<FixedExpenseRun>): FixedExpenseRun => ({
  id: item?.id || crypto.randomUUID(),
  fixedExpenseId: item?.fixedExpenseId || '',
  bookId: item?.bookId,
  generatedMonth: item?.generatedMonth || formatMonthKey(new Date()),
  expenseId: item?.expenseId || null,
  generatedAt: item?.generatedAt || new Date().toISOString(),
})

const fixedExpenses = ref<FixedExpense[]>(
  loadJSON<FixedExpense[]>(FIXED_EXPENSES_STORAGE_KEY, []).map((item) => normalizeFixedExpense(item))
)
const fixedExpenseRuns = ref<FixedExpenseRun[]>(
  loadJSON<FixedExpenseRun[]>(FIXED_EXPENSE_RUNS_STORAGE_KEY, []).map((item) => normalizeRun(item))
)
const fixedExpensesLoaded = ref(false)
const fixedExpensesGenerating = ref(false)

const sortFixedExpenses = (items: FixedExpense[]) =>
  [...items].sort((left, right) => {
    if (left.enabled !== right.enabled) return left.enabled ? -1 : 1
    if (left.dayOfMonth !== right.dayOfMonth) return left.dayOfMonth - right.dayOfMonth
    return left.name.localeCompare(right.name, 'zh-CN')
  })

const loadFixedExpensesRemote = async () => {
  if (!authUser.value?.id || !currentBookId.value || isLocalBookMode.value) {
    fixedExpensesLoaded.value = true
    return
  }

  const [{ data: expenseData, error: expenseError }, { data: runData, error: runError }] = await Promise.all([
    fetchFixedExpensesRemote(currentBookId.value),
    fetchFixedExpenseRunsRemote(currentBookId.value),
  ])

  if (expenseError) throw expenseError
  if (runError) throw runError

  fixedExpenses.value = sortFixedExpenses((expenseData || []).map((item) => normalizeFixedExpense(item)))
  fixedExpenseRuns.value = (runData || []).map((item) => normalizeRun(item))
  fixedExpensesLoaded.value = true
}

const refreshFixedExpenses = async () => {
  if (authUser.value?.id && currentBookId.value && !isLocalBookMode.value) {
    try {
      await loadFixedExpensesRemote()
    } catch (error) {
      console.error('加载固定消费失败：', error)
      toast.error(formatFixedExpenseError(error, '固定消费读取失败，请稍后重试。'))
    }
    return
  }

  fixedExpenses.value = sortFixedExpenses(
    loadJSON<FixedExpense[]>(FIXED_EXPENSES_STORAGE_KEY, []).map((item) => normalizeFixedExpense(item))
  )
  fixedExpenseRuns.value = loadJSON<FixedExpenseRun[]>(FIXED_EXPENSE_RUNS_STORAGE_KEY, []).map((item) => normalizeRun(item))
  fixedExpensesLoaded.value = true
}

watch(
  [authUser, currentBookId],
  () => {
    void refreshFixedExpenses()
  },
  { immediate: true }
)

watch(
  fixedExpenses,
  (value) => {
    saveJSON(FIXED_EXPENSES_STORAGE_KEY, value.map((item) => normalizeFixedExpense(item)))
  },
  { deep: true }
)

watch(
  fixedExpenseRuns,
  (value) => {
    saveJSON(FIXED_EXPENSE_RUNS_STORAGE_KEY, value.map((item) => normalizeRun(item)))
  },
  { deep: true }
)

const buildExpenseFromFixedExpense = (fixedExpense: FixedExpense, expenseId: string, date: string): Expense => ({
  id: expenseId,
  recordType: 'expense',
  title: fixedExpense.name.trim(),
  amount: fixedExpense.amount,
  originalAmount: fixedExpense.amount,
  originalCurrency: fixedExpense.currency,
  baseCurrency: fixedExpense.currency,
  exchangeRateUsed: 1,
  exchangeRateDate: date,
  date,
  category: fixedExpense.category,
  payer: fixedExpense.payer,
  bookId: currentBookId.value || fixedExpense.bookId,
  createdBy: authUser.value?.id || fixedExpense.createdBy,
  split: { ...fixedExpense.split },
  splitPreset: fixedExpense.splitPreset,
  recurrence: 'none',
  note: `由固定消费自动生成（${fixedExpense.id}）`,
})

const saveFixedExpense = async (item: FixedExpense) => {
  const normalized = normalizeFixedExpense({
    ...item,
    bookId: currentBookId.value || item.bookId,
    createdBy: authUser.value?.id || item.createdBy,
  })

  if (authUser.value?.id && currentBookId.value && !isLocalBookMode.value) {
    const { data, error } = await upsertFixedExpenseRemote(normalized)
    if (error) return { error, data: null }
    const next = normalizeFixedExpense(data as FixedExpense)
    fixedExpenses.value = sortFixedExpenses(
      fixedExpenses.value.some((fixedExpense) => fixedExpense.id === next.id)
        ? fixedExpenses.value.map((fixedExpense) => (fixedExpense.id === next.id ? next : fixedExpense))
        : [...fixedExpenses.value, next]
    )
    return { error: null, data: next }
  }

  fixedExpenses.value = sortFixedExpenses(
    fixedExpenses.value.some((fixedExpense) => fixedExpense.id === normalized.id)
      ? fixedExpenses.value.map((fixedExpense) => (fixedExpense.id === normalized.id ? normalized : fixedExpense))
      : [...fixedExpenses.value, normalized]
  )
  return { error: null, data: normalized }
}

const deleteFixedExpense = async (item: FixedExpense) => {
  if (authUser.value?.id && currentBookId.value && !isLocalBookMode.value) {
    const { error } = await deleteFixedExpenseRemote(item.id, currentBookId.value)
    if (error) return { error }
  }

  fixedExpenses.value = fixedExpenses.value.filter((fixedExpense) => fixedExpense.id !== item.id)
  fixedExpenseRuns.value = fixedExpenseRuns.value.filter((run) => run.fixedExpenseId !== item.id)
  return { error: null }
}

const toggleFixedExpense = async (item: FixedExpense, enabled: boolean) =>
  saveFixedExpense({
    ...item,
    enabled,
  })

const ensureFixedExpensesGenerated = async (today = new Date()) => {
  if (fixedExpensesGenerating.value) return
  if (!currentBookId.value) return

  fixedExpensesGenerating.value = true
  try {
    if (!fixedExpensesLoaded.value) {
      await refreshFixedExpenses()
    }

    const month = getExpenseRunMonth(today)
    for (const fixedExpense of fixedExpenses.value) {
      if (!shouldGenerateFixedExpense(fixedExpense, fixedExpenseRuns.value, today)) continue

      const effectiveDate = getRunDateForMonth(month, fixedExpense.dayOfMonth)

      const expenseId = crypto.randomUUID()
      const run = normalizeRun({
        fixedExpenseId: fixedExpense.id,
        bookId: currentBookId.value,
        generatedMonth: month,
        expenseId,
      })

      if (authUser.value?.id && !isLocalBookMode.value) {
        const { error: runError } = await insertFixedExpenseRunRemote(run)
        if (runError) {
          const code = (runError as { code?: string }).code
          if (code === '23505') {
            await refreshFixedExpenses()
            continue
          }
          console.error('固定消费生成记录失败：', runError)
          toast.warning('固定消费生成失败，请稍后重试。')
          continue
        }
      }

      const result = await addExpense(buildExpenseFromFixedExpense(fixedExpense, expenseId, effectiveDate))

      if (result.status === 'synced' || result.status === 'local_only') {
        fixedExpenseRuns.value = [run, ...fixedExpenseRuns.value.filter((item) => item.id !== run.id)]
        continue
      }

      if (authUser.value?.id && !isLocalBookMode.value) {
        await deleteFixedExpenseRunRemote(run.id)
      }
      toast.warning('固定消费已尝试生成，但云端同步失败，请稍后重试。')
    }
  } finally {
    fixedExpensesGenerating.value = false
  }
}

const fixedExpenseList = computed(() =>
  sortFixedExpenses(
    fixedExpenses.value.map((item) => ({
      ...item,
      split: normalizeSplit(item.split, getDefaultSplitForCategory(item.category).split),
    }))
  )
)

const fixedExpenseNextDates = computed(() =>
  fixedExpenseList.value.reduce<Record<string, string | null>>((result, item) => {
    result[item.id] = getFixedExpenseNextDate(item, fixedExpenseRuns.value)
    return result
  }, {})
)

export function useFixedExpenses() {
  return {
    fixedExpenses: fixedExpenseList,
    fixedExpenseRuns,
    fixedExpenseNextDates,
    fixedExpensesGenerating,
    saveFixedExpense,
    deleteFixedExpense,
    toggleFixedExpense,
    refreshFixedExpenses,
    ensureFixedExpensesGenerated,
    getDefaultSplitForCategory,
  }
}
