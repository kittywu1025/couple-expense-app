import { computed, ref, watch } from 'vue'
import type { Expense, Payer, SplitPreset, SplitRule } from '../types'
import { loadJSON, saveJSON } from '../utils/storage'
import { authUser } from './useSupabaseAuth'
import { useBooks } from './useBooks'
import { useSettings } from './useSettings'
import {
  deleteExpenseRemote,
  fetchExpenses,
  insertExpenseRemote,
  updateExpenseRemote,
} from './useSupabaseExpenses'
import { clearSyncWarning, setSyncWarning } from './useRuntimeStatus'
import { normalizeCurrency } from '../utils/currency'
import {
  isPersonalExpenseCategory,
  isSharedExpenseCategory,
  normalizeCategoryId,
} from '../utils/categories'

const STORAGE_KEY = 'couple-expense-app-expenses'
const selectedYearMonth = ref(new Date().toISOString().slice(0, 7))
const { settings } = useSettings()
const { currentBookId, isLocalBookMode } = useBooks()

type ExpenseMutationResult = {
  status: 'synced' | 'local_fallback' | 'local_only'
  expense: Expense
  stage: 'insert' | 'update'
  error?: unknown
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

const personalSplit = (payer: Payer): SplitRule =>
  payer === 'me' ? { me: 100, partner: 0 } : { me: 0, partner: 100 }

const defaultSplitForCategory = (category: string): { split: SplitRule; preset: SplitPreset } => {
  if (category === 'rent') {
    return {
      split: normalizeSplit(settings.value.defaultSplits.rent, { me: 60, partner: 40 }),
      preset: 'rent',
    }
  }

  if (isPersonalExpenseCategory(category)) {
    return {
      split: personalSplit('me'),
      preset: 'payer-only',
    }
  }

  if (isSharedExpenseCategory(category)) {
    return {
      split: normalizeSplit(settings.value.defaultSplits.standard, { me: 50, partner: 50 }),
      preset: 'equal',
    }
  }

  return {
    split: normalizeSplit(settings.value.defaultSplits.standard, { me: 50, partner: 50 }),
    preset: 'equal',
  }
}

const normalizeExpense = (expense: Partial<Expense>): Expense => {
  const recordType = expense.recordType === 'income' ? 'income' : 'expense'
  const payer = expense.payer === 'partner' ? 'partner' : 'me'
  const category = normalizeCategoryId(expense.category, recordType)
  const baseRule = defaultSplitForCategory(category)
  const isLegacyShared = typeof expense.shared === 'boolean'
  const sharedEnabled = isLegacyShared ? expense.shared : undefined
  const normalizedTitle = expense.title?.trim() || (recordType === 'income' ? '未命名收入' : '未命名消费')

  let split = baseRule.split
  let splitPreset: SplitPreset = expense.splitPreset || baseRule.preset

  if (expense.split) {
    split = normalizeSplit(expense.split, baseRule.split)
  } else if (sharedEnabled === false) {
    split = personalSplit(payer)
    splitPreset = 'payer-only'
  } else if (sharedEnabled === true) {
    split = baseRule.split
  }

  if (split.me === 100 || split.partner === 100) {
    splitPreset = 'payer-only'
  }

  if (recordType === 'income') {
    split = { me: 100, partner: 0 }
    splitPreset = 'payer-only'
  }

  return {
    id: expense.id || crypto.randomUUID(),
    recordType,
    title: normalizedTitle,
    amount: Math.max(0, Number(expense.amount) || 0),
    originalAmount: Math.max(0, Number(expense.originalAmount ?? expense.amount) || 0),
    originalCurrency: normalizeCurrency(expense.originalCurrency || expense.baseCurrency || settings.value.defaultCurrency),
    baseCurrency: normalizeCurrency(expense.baseCurrency || settings.value.defaultCurrency),
    exchangeRateUsed: Math.max(0, Number(expense.exchangeRateUsed) || 1),
    exchangeRateDate: expense.exchangeRateDate || expense.date || new Date().toISOString().slice(0, 10),
    date: expense.date || new Date().toISOString().slice(0, 10),
    category,
    payer: recordType === 'income' ? 'me' : payer,
    bookId: expense.bookId,
    createdBy: expense.createdBy,
    split,
    splitPreset,
    recurrence: expense.recurrence === 'monthly' ? 'monthly' : 'none',
    note: expense.note?.trim() || '',
    shared: recordType === 'expense' && split.me !== 100 && split.partner !== 100,
    syncStatus: expense.syncStatus || 'synced',
    createdAt: expense.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
}

const expenses = ref<Expense[]>(
  loadJSON<Expense[]>(STORAGE_KEY, []).map((expense) => normalizeExpense(expense))
)

const sortExpenses = (items: Expense[]) =>
  [...items].sort((left, right) => {
    if (left.date !== right.date) {
      return right.date.localeCompare(left.date)
    }
    return right.createdAt?.localeCompare(left.createdAt || '') ?? 0
  })

const loadRemoteExpenses = async () => {
  if (!authUser.value?.id || !currentBookId.value) return
  try {
    const { data, error } = await fetchExpenses(currentBookId.value)
    if (error) {
      throw error
    }
    if (data) {
      const remoteExpenses = data.map((expense) => normalizeExpense(expense))
      const localPendingExpenses = expenses.value.filter(
        (expense) => expense.syncStatus === 'pending' && expense.bookId === currentBookId.value
      )
      const merged = new Map<string, Expense>()
      remoteExpenses.forEach((expense) => merged.set(expense.id, expense))
      localPendingExpenses.forEach((expense) => {
        if (!merged.has(expense.id)) {
          merged.set(expense.id, expense)
        }
      })
      expenses.value = sortExpenses(Array.from(merged.values()))
      saveJSON(STORAGE_KEY, expenses.value)
    }
    clearSyncWarning()
  } catch (error) {
    console.error('加载远程开销失败：', error)
    setSyncWarning('云端账本读取失败，当前继续使用本地缓存数据。')
  }
}

const refreshExpenses = async () => {
  if (authUser.value?.id && currentBookId.value && !isLocalBookMode.value) {
    await loadRemoteExpenses()
    return
  }

  expenses.value = sortExpenses(
    loadJSON<Expense[]>(STORAGE_KEY, []).map((expense) => normalizeExpense(expense))
  )
  clearSyncWarning()
}

watch(
  [authUser, currentBookId],
  ([user, bookId]) => {
    if (user?.id && bookId && !isLocalBookMode.value) {
      loadRemoteExpenses()
    } else {
      expenses.value = sortExpenses(
        loadJSON<Expense[]>(STORAGE_KEY, []).map((expense) => normalizeExpense(expense))
      )
    }
  },
  { immediate: true }
)

watch(
  expenses,
  (value) => {
    saveJSON(STORAGE_KEY, value.map((expense) => normalizeExpense(expense)))
  },
  { deep: true }
)

export const getEffectiveExpenseDate = (expense: Expense, yearMonth: string) => {
  if (expense.recurrence !== 'monthly') {
    return expense.date
  }

  const day = expense.date.slice(-2)
  return `${yearMonth}-${day}`
}

const filteredExpenses = computed(() =>
  sortExpenses(
    expenses.value.filter((item) => {
      if (item.recurrence === 'monthly') return true
      return item.date.startsWith(selectedYearMonth.value)
    })
  )
)

const expenseRecords = computed(() => filteredExpenses.value.filter((item) => item.recordType === 'expense'))
const incomeRecords = computed(() => filteredExpenses.value.filter((item) => item.recordType === 'income'))

const recurringExpenses = computed(() =>
  sortExpenses(expenses.value.filter((item) => item.recurrence === 'monthly'))
)

const totalAmount = computed(() =>
  expenseRecords.value.reduce((sum, item) => sum + item.amount, 0)
)

const paidTotals = computed(() =>
  expenseRecords.value.reduce(
    (result, item) => {
      result[item.payer] += item.amount
      return result
    },
    { me: 0, partner: 0 }
  )
)

const owedTotals = computed(() =>
  expenseRecords.value.reduce(
    (result, item) => {
      result.me += (item.amount * item.split.me) / 100
      result.partner += (item.amount * item.split.partner) / 100
      return result
    },
    { me: 0, partner: 0 }
  )
)

const settlement = computed(() => ({
  meNet: paidTotals.value.me - owedTotals.value.me,
  partnerNet: paidTotals.value.partner - owedTotals.value.partner,
}))

const categoryTotals = computed(() =>
  expenseRecords.value.reduce<Record<string, number>>((result, item) => {
    result[item.category] = (result[item.category] || 0) + item.amount
    return result
  }, {})
)

const incomeCategoryTotals = computed(() =>
  incomeRecords.value.reduce<Record<string, number>>((result, item) => {
    result[item.category] = (result[item.category] || 0) + item.amount
    return result
  }, {})
)

const incomeTotal = computed(() =>
  incomeRecords.value.reduce((sum, item) => sum + item.amount, 0)
)

const rentTotal = computed(() =>
  expenseRecords.value
    .filter((item) => item.category === 'rent')
    .reduce((sum, item) => sum + item.amount, 0)
)

const sharedTotal = computed(() =>
  expenseRecords.value
    .filter((item) => item.split.me > 0 && item.split.partner > 0)
    .reduce((sum, item) => sum + item.amount, 0)
)

const monthlySummary = computed(() => ({
  totalAmount: totalAmount.value,
  mePaid: paidTotals.value.me,
  partnerPaid: paidTotals.value.partner,
  meShouldPay: owedTotals.value.me,
  partnerShouldPay: owedTotals.value.partner,
  meNet: settlement.value.meNet,
  partnerNet: settlement.value.partnerNet,
  sharedTotal: sharedTotal.value,
  rentTotal: rentTotal.value,
  incomeTotal: incomeTotal.value,
}))

const syncRemoteExpense = async (expense: Expense, stage: 'insert' | 'update') => {
  if (!authUser.value?.id || !currentBookId.value || isLocalBookMode.value) return

  const { error } =
    stage === 'insert' ? await insertExpenseRemote(expense) : await updateExpenseRemote(expense)
  if (error) {
    throw error
  }

  clearSyncWarning()
}

const buildSaveDebugPayload = (expense: Expense) => ({
  id: expense.id,
  record_type: expense.recordType,
  title: expense.title,
  amount: expense.amount,
  original_amount: expense.originalAmount,
  original_currency: expense.originalCurrency,
  base_currency: expense.baseCurrency,
  exchange_rate_used: expense.exchangeRateUsed,
  exchange_rate_date: expense.exchangeRateDate,
  date: expense.date,
  category: expense.category,
  payer: expense.payer,
  split: expense.split,
  split_preset: expense.splitPreset,
  recurrence: expense.recurrence,
  note: expense.note || '',
  shared: expense.shared,
  book_id: expense.bookId,
  created_by: expense.createdBy,
  user_id: authUser.value?.id ?? expense.createdBy ?? null,
  created_at: expense.createdAt,
  updated_at: expense.updatedAt,
})

const logSaveFailure = (stage: 'insert' | 'update', error: unknown, expense: Expense) => {
  const supabaseError = error as { code?: string; message?: string; details?: string | null; hint?: string | null }
  console.error(`开销${stage === 'insert' ? '新增' : '更新'}失败：`, {
    stage,
    code: supabaseError?.code ?? null,
    message: supabaseError?.message ?? null,
    details: supabaseError?.details ?? null,
    hint: supabaseError?.hint ?? null,
    payload: buildSaveDebugPayload(expense),
    book_id: currentBookId.value ?? expense.bookId ?? null,
    user_id: authUser.value?.id ?? expense.createdBy ?? null,
    default_currency: settings.value.defaultCurrency,
    original_currency: expense.originalCurrency,
    base_currency: expense.baseCurrency,
    is_cloud_mode: Boolean(authUser.value?.id && currentBookId.value && !isLocalBookMode.value),
  })
}

const persistPendingExpense = (expense: Expense, stage: 'insert' | 'update') => {
  const pendingExpense = normalizeExpense({
    ...expense,
    syncStatus: 'pending',
  })

  if (stage === 'insert') {
    expenses.value = sortExpenses([pendingExpense, ...expenses.value.filter((item) => item.id !== pendingExpense.id)])
  } else {
    expenses.value = sortExpenses(
      expenses.value.map((item) => (item.id === pendingExpense.id ? pendingExpense : item))
    )
  }

  return pendingExpense
}

const addExpense = async (expense: Expense): Promise<ExpenseMutationResult> => {
  const normalized = normalizeExpense({
    ...expense,
    bookId: currentBookId.value || expense.bookId,
    createdBy: authUser.value?.id || expense.createdBy,
    syncStatus: 'synced',
  })

  if (authUser.value?.id && currentBookId.value && !isLocalBookMode.value) {
    try {
      await syncRemoteExpense(normalized, 'insert')
      expenses.value = sortExpenses([normalized, ...expenses.value])
      return { status: 'synced', expense: normalized, stage: 'insert' }
    } catch (error) {
      logSaveFailure('insert', error, normalized)
      const pendingExpense = persistPendingExpense(normalized, 'insert')
      return { status: 'local_fallback', expense: pendingExpense, stage: 'insert', error }
    }
  }

  expenses.value = sortExpenses([normalized, ...expenses.value])
  return { status: 'local_only', expense: normalized, stage: 'insert' }
}

const updateExpense = async (expense: Expense): Promise<ExpenseMutationResult> => {
  const normalized = normalizeExpense({
    ...expense,
    bookId: currentBookId.value || expense.bookId,
    createdBy: expense.createdBy || authUser.value?.id,
    syncStatus: 'synced',
  })

  if (authUser.value?.id && currentBookId.value && !isLocalBookMode.value) {
    try {
      await syncRemoteExpense(normalized, 'update')
      expenses.value = sortExpenses(
        expenses.value.map((item) => (item.id === normalized.id ? normalized : item))
      )
      return { status: 'synced', expense: normalized, stage: 'update' }
    } catch (error) {
      logSaveFailure('update', error, normalized)
      const pendingExpense = persistPendingExpense(normalized, 'update')
      return { status: 'local_fallback', expense: pendingExpense, stage: 'update', error }
    }
  }

  expenses.value = sortExpenses(
    expenses.value.map((item) => (item.id === normalized.id ? normalized : item))
  )
  return { status: 'local_only', expense: normalized, stage: 'update' }
}

const deleteExpense = async (expenseId: string) => {
  const target = expenses.value.find((item) => item.id === expenseId)
  if (!target) {
    return { error: null }
  }

  if (authUser.value?.id && currentBookId.value && !isLocalBookMode.value) {
    const { error } = await deleteExpenseRemote(expenseId, currentBookId.value)
    if (error) {
      console.error('删除远程开销失败：', {
        code: error.code,
        message: error.message,
        details: error.details,
        hint: error.hint,
      })
      return { error }
    }
  }

  expenses.value = expenses.value.filter((item) => item.id !== expenseId)
  clearSyncWarning()
  return { error: null }
}

export function useExpenses() {
  return {
    expenses,
    selectedYearMonth,
    filteredExpenses,
    expenseRecords,
    incomeRecords,
    recurringExpenses,
    totalAmount,
    paidTotals,
    owedTotals,
    categoryTotals,
    incomeCategoryTotals,
    incomeTotal,
    monthlySummary,
    addExpense,
    updateExpense,
    deleteExpense,
    refreshExpenses,
  }
}
