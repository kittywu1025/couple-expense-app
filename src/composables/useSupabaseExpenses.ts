import type { Expense } from '../types'
import { supabase } from '../lib/supabase'

const mapExpenseRow = (row: Record<string, unknown>): Expense => ({
  id: String(row.id),
  title: String(row.title ?? ''),
  amount: Number(row.amount ?? 0),
  date: String(row.date ?? ''),
  category: String(row.category ?? 'others'),
  payer: (row.payer as Expense['payer']) || 'me',
  split: (row.split as Expense['split']) || { me: 50, partner: 50 },
  splitPreset: (row.split_preset as Expense['splitPreset']) || (row.splitPreset as Expense['splitPreset']) || 'equal',
  recurrence: (row.recurrence as Expense['recurrence']) || 'none',
  note: row.note ? String(row.note) : '',
  shared: typeof row.shared === 'boolean' ? row.shared : undefined,
  bookId: row.book_id ? String(row.book_id) : undefined,
  createdBy: row.created_by ? String(row.created_by) : undefined,
  createdAt: row.created_at ? String(row.created_at) : undefined,
  updatedAt: row.updated_at ? String(row.updated_at) : undefined,
})

const mapExpenseRecord = (expense: Expense) => ({
  id: expense.id || crypto.randomUUID(),
  title: expense.title,
  amount: expense.amount,
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
  created_at: expense.createdAt,
  updated_at: expense.updatedAt,
})

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

export async function upsertExpense(expense: Expense) {
  if (!supabase) {
    return { data: null, error: null }
  }

  const record = mapExpenseRecord(expense)

  return supabase.from('expenses').upsert(record)
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
