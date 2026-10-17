import { ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { isDemoMode } from '../lib/demo'
import type { FixedExpense, FixedExpenseInput, NewRecord } from '../types'
import { formatSupabaseError, useBooks } from './useBooks'
import { useRecords } from './useRecords'
import { authUser } from './useSupabaseAuth'
import { toDateKey, todayKey } from '../utils/format'

const items = ref<FixedExpense[]>([])
const loading = ref(false)

const { currentBook } = useBooks()

const normalize = (row: Record<string, unknown>): FixedExpense => ({
  id: String(row.id),
  bookId: String(row.book_id),
  name: String(row.name),
  amount: Number(row.amount),
  category: String(row.category),
  subCategory: row.sub_category ? String(row.sub_category) : null,
  dayOfMonth: Number(row.day_of_month),
  payerUid: String(row.payer_uid),
  type: row.type === 'shared' ? 'shared' : 'personal',
  ratio: Number(row.ratio ?? 10),
  paused: !!row.paused,
  startDate: String(row.start_date),
  lastGeneratedDate: row.last_generated_date ? String(row.last_generated_date) : null,
  createdBy: String(row.created_by),
})

const toRow = (input: FixedExpenseInput) => ({
  name: input.name,
  amount: input.amount,
  category: input.category,
  sub_category: input.subCategory,
  day_of_month: input.dayOfMonth,
  payer_uid: input.payerUid,
  type: input.type,
  ratio: input.ratio,
})

/** 某个月的扣款日（超过当月天数按月底） */
export const dueDateIn = (year: number, monthIndex: number, day: number) => {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return toDateKey(new Date(year, monthIndex, Math.min(day, lastDay)))
}

/** 下一次扣款日期（含今天） */
export const nextDueDate = (f: FixedExpense, today = todayKey()) => {
  const base = new Date()
  for (let i = 0; i < 3; i++) {
    const due = dueDateIn(base.getFullYear(), base.getMonth() + i, f.dayOfMonth)
    if (due >= today && due >= f.startDate && (!f.lastGeneratedDate || due > f.lastGeneratedDate)) return due
  }
  return dueDateIn(base.getFullYear(), base.getMonth() + 1, f.dayOfMonth)
}

/** 演示模式下在本地模拟服务器端的生成逻辑 */
const generateLocally = (today: string) => {
  const created: NewRecord[] = []
  items.value = items.value.map((f) => {
    if (f.paused) return f
    let last = f.lastGeneratedDate
    const from = last && last >= f.startDate ? last : f.startDate
    const cursor = new Date(Number(from.slice(0, 4)), Number(from.slice(5, 7)) - 1, 1)
    for (let guard = 0; guard < 24; guard++) {
      const due = dueDateIn(cursor.getFullYear(), cursor.getMonth(), f.dayOfMonth)
      if (due > today) break
      if (due >= f.startDate && (!last || due > last)) {
        created.push({
          amount: f.amount,
          kind: 'expense',
          type: f.type,
          payerUid: f.payerUid,
          ratio: f.ratio,
          category: f.category,
          subCategory: f.subCategory,
          note: `${f.name}（固定扣款）`,
          date: due,
        })
        last = due
      }
      cursor.setMonth(cursor.getMonth() + 1)
    }
    return { ...f, lastGeneratedDate: last }
  })
  return created
}

const load = async () => {
  const bookId = currentBook.value?.id
  if (!bookId || isDemoMode || !supabase) {
    if (!bookId) items.value = []
    return
  }
  loading.value = true
  const { data, error } = await supabase
    .from('fixed_expenses')
    .select('*')
    .eq('book_id', bookId)
    .order('day_of_month', { ascending: true })
  loading.value = false
  if (error) {
    console.error('读取固定扣款失败：', error)
    return
  }
  items.value = (data ?? []).map(normalize)
}

/**
 * 打开 App 时调用：把今天及之前到期、还没生成的固定扣款写进账本。
 * 返回生成的笔数。
 */
const generateDue = async () => {
  const bookId = currentBook.value?.id
  if (!bookId) return 0
  const today = todayKey()
  if (isDemoMode || !supabase) {
    const created = generateLocally(today)
    if (created.length) await useRecords().addRecordsBulk(created)
    return created.length
  }
  const { data, error } = await supabase.rpc('generate_fixed_expenses', { p_book_id: bookId, p_today: today })
  if (error) {
    // 表还没建（没执行 SQL）时静默跳过，不影响记账
    console.warn('生成固定扣款失败：', error)
    return 0
  }
  const count = Number(data ?? 0)
  if (count > 0) {
    await Promise.all([useRecords().loadRecords(), load()])
  }
  return count
}

const add = async (input: FixedExpenseInput) => {
  const bookId = currentBook.value?.id
  const uid = authUser.value?.id
  if (!bookId || !uid) return { error: new Error('还没有加入账本。') }
  if (isDemoMode || !supabase) {
    items.value = [
      ...items.value,
      {
        ...input,
        id: crypto.randomUUID(),
        bookId,
        paused: false,
        startDate: todayKey(),
        lastGeneratedDate: null,
        createdBy: uid,
      },
    ]
    return { error: null }
  }
  const { data, error } = await supabase
    .from('fixed_expenses')
    .insert({ ...toRow(input), book_id: bookId, created_by: uid, start_date: todayKey() })
    .select()
    .single()
  if (error) return { error: new Error(formatSupabaseError(error, '保存失败，请稍后重试。')) }
  items.value = [...items.value, normalize(data)]
  return { error: null }
}

const patch = async (id: string, values: Record<string, unknown>, local: Partial<FixedExpense>) => {
  if (isDemoMode || !supabase) {
    items.value = items.value.map((f) => (f.id === id ? { ...f, ...local } : f))
    return { error: null }
  }
  const { data, error } = await supabase.from('fixed_expenses').update(values).eq('id', id).select().single()
  if (error) return { error: new Error(formatSupabaseError(error, '保存失败，请稍后重试。')) }
  const next = normalize(data)
  items.value = items.value.map((f) => (f.id === id ? next : f))
  return { error: null }
}

const update = (id: string, input: FixedExpenseInput) => patch(id, toRow(input), input)

/** 恢复时从今天重新开始算，暂停期间错过的不补 */
const setPaused = (id: string, paused: boolean) => {
  const values = paused ? { paused } : { paused, start_date: todayKey() }
  const local = paused ? { paused } : { paused, startDate: todayKey() }
  return patch(id, values, local)
}

const remove = async (id: string) => {
  if (!isDemoMode && supabase) {
    const { error } = await supabase.from('fixed_expenses').delete().eq('id', id)
    if (error) return { error: new Error(formatSupabaseError(error, '删除失败，请稍后重试。')) }
  }
  items.value = items.value.filter((f) => f.id !== id)
  return { error: null }
}

watch(
  () => currentBook.value?.id,
  async (id) => {
    items.value = []
    if (!id) return
    await load()
  },
  { immediate: true },
)

export function useFixedExpenses() {
  return { items, loading, load, generateDue, add, update, setPaused, remove }
}
