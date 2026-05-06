import { normalizeCurrency } from '../utils/currency'
import type { Expense } from '../types'
import { supabase } from '../lib/supabase'
import { isDefaultIncomeCategory, normalizeCategoryId } from '../utils/categories'

type ExpenseRecord = ReturnType<typeof mapExpenseRecord>

const getRowRecordType = (row: Record<string, unknown>): Expense['recordType'] => {
  if (row.record_type === 'income') return 'income'
  const category = normalizeCategoryId(String(row.category ?? ''), 'income')
  return isDefaultIncomeCategory(category) ? 'income' : 'expense'
}

const mapExpenseRow = (row: Record<string, unknown>): Expense => {
  const recordType = getRowRecordType(row)

  return {
    id: String(row.id),
    recordType,
    title: String(row.title ?? ''),
    amount: Number(row.amount ?? 0),
    originalAmount: Number(row.original_amount ?? row.amount ?? 0),
    originalCurrency: normalizeCurrency(String(row.original_currency ?? row.base_currency ?? 'JPY')),
    baseCurrency: normalizeCurrency(String(row.base_currency ?? 'JPY')),
    exchangeRateUsed: Number(row.exchange_rate_used ?? 1),
    exchangeRateDate: String(row.exchange_rate_date ?? row.date ?? new Date().toISOString().slice(0, 10)),
    date: String(row.date ?? ''),
    category: normalizeCategoryId(String(row.category ?? 'misc'), recordType),
    payer: (row.payer as Expense['payer']) || 'me',
    split: (row.split as Expense['split']) || { me: 50, partner: 50 },
    splitPreset: (row.split_preset as Expense['splitPreset']) || (row.splitPreset as Expense['splitPreset']) || 'equal',
    recurrence: (row.recurrence as Expense['recurrence']) || 'none',
    note: row.note ? String(row.note) : '',
    shared: typeof row.shared === 'boolean' ? row.shared : undefined,
    syncStatus: 'synced',
    bookId: row.book_id ? String(row.book_id) : undefined,
    createdBy: row.created_by ? String(row.created_by) : row.user_id ? String(row.user_id) : undefined,
    createdAt: row.created_at ? String(row.created_at) : undefined,
    updatedAt: row.updated_at ? String(row.updated_at) : undefined,
  }
}

const mapExpenseRecord = (expense: Expense) => ({
  id: expense.id || crypto.randomUUID(),
  title: expense.title,
  record_type: expense.recordType,
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
  user_id: expense.createdBy,
  created_by: expense.createdBy,
  created_at: expense.createdAt,
  updated_at: expense.updatedAt,
})

const MISSING_COLUMN_RE = /Could not find the '([^']+)' column/i

const omitColumn = (record: ExpenseRecord, column: string): ExpenseRecord => {
  const next = { ...record }
  delete next[column as keyof ExpenseRecord]
  return next
}

const getMissingColumn = (error: unknown) => {
  const message = (error as { message?: string })?.message
  if (!message) {
    return null
  }

  const matched = message.match(MISSING_COLUMN_RE)
  return matched?.[1] || null
}

const saveExpenseRecord = async (
  stage: 'insert' | 'update',
  record: ExpenseRecord,
  expense: Expense
): Promise<{ data: unknown; error: unknown }> => {
  if (!supabase) {
    return { data: null, error: null }
  }

  let payload = { ...record }

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response =
      stage === 'insert'
        ? await supabase.from('expenses').insert(payload).select().single()
        : await supabase
            .from('expenses')
            .update(payload)
            .eq('id', expense.id)
            .eq('book_id', expense.bookId || '')
            .select()
            .single()

    if (!response.error) {
      return response
    }

    const missingColumn = getMissingColumn(response.error)
    if (!missingColumn || !(missingColumn in payload)) {
      return response
    }

    payload = omitColumn(payload, missingColumn)
  }

  return { data: null, error: new Error('Expense save retry exhausted.') }
}

export async function fetchExpenses(bookId: string) {
  if (!supabase) {
    return { data: null, error: null }
  }

  const { data, error } = await supabase
    .from('expenses')
    .select('*')
    .eq('book_id', bookId)
    .order('date', { ascending: false })

  return {
    data: data ? data.map((row) => mapExpenseRow(row as Record<string, unknown>)) : null,
    error,
  }
}

export async function insertExpenseRemote(expense: Expense) {
  if (!supabase) {
    return { data: null, error: null }
  }

  const record = mapExpenseRecord(expense)
  return saveExpenseRecord('insert', record, expense)
}

export async function updateExpenseRemote(expense: Expense) {
  if (!supabase) {
    return { data: null, error: null }
  }

  const record = mapExpenseRecord(expense)
  return saveExpenseRecord('update', record, expense)
}

export async function deleteExpenseRemote(expenseId: string, bookId: string) {
  if (!supabase) {
    return { data: null, error: null }
  }

  return supabase
    .from('expenses')
    .delete()
    .eq('id', expenseId)
    .eq('book_id', bookId)
}
