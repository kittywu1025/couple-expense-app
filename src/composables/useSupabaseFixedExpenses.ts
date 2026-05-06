import type { FixedExpense, FixedExpenseRun } from '../types'
import { normalizeCurrency } from '../utils/currency'
import { supabase } from '../lib/supabase'

const mapFixedExpense = (row: Record<string, unknown>): FixedExpense => ({
  id: String(row.id),
  bookId: row.book_id ? String(row.book_id) : undefined,
  createdBy: row.created_by ? String(row.created_by) : undefined,
  name: String(row.name ?? ''),
  amount: Number(row.amount ?? 0),
  currency: normalizeCurrency(String(row.currency ?? 'JPY')),
  category: String(row.category ?? 'misc'),
  cycle: 'monthly',
  dayOfMonth: Number(row.day_of_month ?? 1),
  startDate: String(row.start_date ?? new Date().toISOString().slice(0, 10)),
  endDate: row.end_date ? String(row.end_date) : null,
  payer: row.payer === 'partner' ? 'partner' : 'me',
  splitPreset: (row.split_type as FixedExpense['splitPreset']) || 'equal',
  split: {
    me: Number(row.my_share ?? 50),
    partner: Number(row.partner_share ?? 50),
  },
  enabled: typeof row.enabled === 'boolean' ? row.enabled : true,
  createdAt: row.created_at ? String(row.created_at) : undefined,
  updatedAt: row.updated_at ? String(row.updated_at) : undefined,
})

const toFixedExpenseRecord = (item: FixedExpense) => ({
  id: item.id || crypto.randomUUID(),
  book_id: item.bookId,
  created_by: item.createdBy,
  name: item.name,
  amount: item.amount,
  currency: item.currency,
  category: item.category,
  day_of_month: item.dayOfMonth,
  start_date: item.startDate,
  end_date: item.endDate || null,
  split_type: item.splitPreset,
  payer: item.payer,
  my_share: item.split.me,
  partner_share: item.split.partner,
  enabled: item.enabled,
})

const mapRun = (row: Record<string, unknown>): FixedExpenseRun => ({
  id: String(row.id),
  fixedExpenseId: String(row.fixed_expense_id),
  bookId: row.book_id ? String(row.book_id) : undefined,
  generatedMonth: String(row.generated_month),
  expenseId: row.expense_id ? String(row.expense_id) : null,
  generatedAt: row.generated_at ? String(row.generated_at) : undefined,
})

export async function fetchFixedExpensesRemote(bookId: string) {
  if (!supabase) return { data: null, error: null }
  const { data, error } = await supabase
    .from('fixed_expenses')
    .select('*')
    .eq('book_id', bookId)
    .order('day_of_month', { ascending: true })

  return {
    data: data ? data.map((row) => mapFixedExpense(row as Record<string, unknown>)) : null,
    error,
  }
}

export async function upsertFixedExpenseRemote(item: FixedExpense) {
  if (!supabase) return { data: null, error: null }
  return supabase.from('fixed_expenses').upsert(toFixedExpenseRecord(item)).select().single()
}

export async function deleteFixedExpenseRemote(id: string, bookId: string) {
  if (!supabase) return { data: null, error: null }
  return supabase.from('fixed_expenses').delete().eq('id', id).eq('book_id', bookId)
}

export async function fetchFixedExpenseRunsRemote(bookId: string) {
  if (!supabase) return { data: null, error: null }
  const { data, error } = await supabase
    .from('fixed_expense_runs')
    .select('*')
    .eq('book_id', bookId)
    .order('generated_at', { ascending: false })

  return {
    data: data ? data.map((row) => mapRun(row as Record<string, unknown>)) : null,
    error,
  }
}

export async function insertFixedExpenseRunRemote(run: FixedExpenseRun) {
  if (!supabase) return { data: null, error: null }
  return supabase
    .from('fixed_expense_runs')
    .insert({
      id: run.id || crypto.randomUUID(),
      fixed_expense_id: run.fixedExpenseId,
      book_id: run.bookId,
      generated_month: run.generatedMonth,
      expense_id: run.expenseId || null,
    })
    .select()
    .single()
}

export async function deleteFixedExpenseRunRemote(id: string) {
  if (!supabase) return { data: null, error: null }
  return supabase.from('fixed_expense_runs').delete().eq('id', id)
}

