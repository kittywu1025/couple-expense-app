import { computed, ref, watch } from 'vue'
import type { Expense, Payer, SplitPreset, SplitRule } from '../types'
import { loadJSON, saveJSON } from '../utils/storage'
import { authUser } from './useSupabaseAuth'
import { useBooks } from './useBooks'
import { useSettings } from './useSettings'
import { deleteExpenseRemote, fetchExpenses, upsertExpense } from './useSupabaseExpenses'
import { clearSyncWarning, setSyncWarning } from './useRuntimeStatus'
import { normalizeCurrency } from '../utils/currency'

const STORAGE_KEY = 'couple-expense-app-expenses'
const selectedYearMonth = ref(new Date().toISOString().slice(0, 7))
const { settings } = useSettings()
const { currentBookId, isLocalBookMode } = useBooks()

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

  return {
    split: normalizeSplit(settings.value.defaultSplits.standard, { me: 50, partner: 50 }),
    preset: 'equal',
  }
}

const normalizeExpense = (expense: Partial<Expense>): Expense => {
  const payer = expense.payer === 'partner' ? 'partner' : 'me'
  const baseRule = defaultSplitForCategory(expense.category || 'others')
  const isLegacyShared = typeof expense.shared === 'boolean'
  const sharedEnabled = isLegacyShared ? expense.shared : undefined
  const normalizedTitle = expense.title?.trim() || '未命名消费'

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

  return {
    id: expense.id || crypto.randomUUID(),
    title: normalizedTitle,
    amount: Math.max(0, Number(expense.amount) || 0),
    originalAmount: Math.max(0, Number(expense.originalAmount ?? expense.amount) || 0),
    originalCurrency: normalizeCurrency(expense.originalCurrency || expense.baseCurrency || settings.value.defaultCurrency),
    baseCurrency: normalizeCurrency(expense.baseCurrency || settings.value.defaultCurrency),
    exchangeRateUsed: Math.max(0, Number(expense.exchangeRateUsed) || 1),
    exchangeRateDate: expense.exchangeRateDate || expense.date || new Date().toISOString().slice(0, 10),
    date: expense.date || new Date().toISOString().slice(0, 10),
    category: expense.category || 'others',
    payer,
    bookId: expense.bookId,
    createdBy: expense.createdBy,
    split,
    splitPreset,
    recurrence: expense.recurrence === 'monthly' ? 'monthly' : 'none',
    note: expense.note?.trim() || '',
    shared: split.me !== 100 && split.partner !== 100,
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

const mergeExpenseLists = (remoteItems: Expense[], localItems: Expense[]) => {
  const merged = new Map<string, Expense>()

  localItems.forEach((expense) => {
    merged.set(expense.id, expense)
  })

  remoteItems.forEach((expense) => {
    const existing = merged.get(expense.id)
    if (!existing) {
      merged.set(expense.id, expense)
      return
    }

    const existingUpdatedAt = existing.updatedAt || existing.createdAt || ''
    const remoteUpdatedAt = expense.updatedAt || expense.createdAt || ''
    merged.set(expense.id, remoteUpdatedAt >= existingUpdatedAt ? expense : existing)
  })

  return sortExpenses(Array.from(merged.values()))
}

const loadRemoteExpenses = async () => {
  if (!authUser.value?.id || !currentBookId.value) return
  try {
    const { data, error } = await fetchExpenses(currentBookId.value)
    if (error) {
      throw error
    }
    if (data) {
      const localCached = loadJSON<Expense[]>(STORAGE_KEY, []).map((expense) => normalizeExpense(expense))
      const remoteNormalized = data.map((expense) => normalizeExpense(expense))
      expenses.value = mergeExpenseLists(remoteNormalized, localCached)
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

const recurringExpenses = computed(() =>
  sortExpenses(expenses.value.filter((item) => item.recurrence === 'monthly'))
)

const totalAmount = computed(() =>
  filteredExpenses.value.reduce((sum, item) => sum + item.amount, 0)
)

const paidTotals = computed(() =>
  filteredExpenses.value.reduce(
    (result, item) => {
      result[item.payer] += item.amount
      return result
    },
    { me: 0, partner: 0 }
  )
)

const owedTotals = computed(() =>
  filteredExpenses.value.reduce(
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
  filteredExpenses.value.reduce<Record<string, number>>((result, item) => {
    result[item.category] = (result[item.category] || 0) + item.amount
    return result
  }, {})
)

const rentTotal = computed(() =>
  filteredExpenses.value
    .filter((item) => item.category === 'rent')
    .reduce((sum, item) => sum + item.amount, 0)
)

const sharedTotal = computed(() =>
  filteredExpenses.value
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
}))

const syncRemoteExpense = async (expense: Expense) => {
  if (!authUser.value?.id || !currentBookId.value || isLocalBookMode.value) return

  const { error } = await upsertExpense(expense)
  if (error) {
    console.error('同步远程开销失败：', {
      code: error.code,
      message: error.message,
      details: error.details,
      hint: error.hint,
    })
    setSyncWarning('云端保存失败，但这笔记录已经保存在当前设备。')
  }
}

const addExpense = (expense: Expense) => {
  const normalized = normalizeExpense({
    ...expense,
    bookId: currentBookId.value || expense.bookId,
    createdBy: authUser.value?.id || expense.createdBy,
  })
  expenses.value = sortExpenses([normalized, ...expenses.value])
  void syncRemoteExpense(normalized)
}

const updateExpense = (expense: Expense) => {
  const normalized = normalizeExpense({
    ...expense,
    bookId: currentBookId.value || expense.bookId,
    createdBy: expense.createdBy || authUser.value?.id,
  })
  expenses.value = sortExpenses(
    expenses.value.map((item) => (item.id === normalized.id ? normalized : item))
  )
  void syncRemoteExpense(normalized)
}

const deleteExpense = (expenseId: string) => {
  expenses.value = expenses.value.filter((item) => item.id !== expenseId)
  if (authUser.value?.id && currentBookId.value && !isLocalBookMode.value) {
    deleteExpenseRemote(expenseId, currentBookId.value).then(({ error }) => {
      if (error) {
        console.error('删除远程开销失败：', error.message)
      }
    })
  }
}

export function useExpenses() {
  return {
    expenses,
    selectedYearMonth,
    filteredExpenses,
    recurringExpenses,
    totalAmount,
    paidTotals,
    owedTotals,
    categoryTotals,
    monthlySummary,
    addExpense,
    updateExpense,
    deleteExpense,
    refreshExpenses,
  }
}
