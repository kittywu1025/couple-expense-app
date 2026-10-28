import { computed, ref, watch } from 'vue'
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
  intervalMonths: Number(row.interval_months ?? 1) || 1,
  payerUid: String(row.payer_uid),
  type: row.type === 'shared' ? 'shared' : 'personal',
  ratio: Number(row.ratio ?? 10),
  paused: !!row.paused,
  startDate: String(row.start_date),
  lastGeneratedDate: row.last_generated_date ? String(row.last_generated_date) : null,
  createdBy: String(row.created_by),
})

const toRow = (input: FixedExpenseInput) => ({
  ...(input.startDate ? { start_date: input.startDate } : {}),
  name: input.name,
  amount: input.amount,
  category: input.category,
  sub_category: input.subCategory,
  day_of_month: input.dayOfMonth,
  interval_months: input.intervalMonths,
  payer_uid: input.payerUid,
  type: input.type,
  ratio: input.ratio,
})

/** 某个月的扣款日（超过当月天数按月底） */
export const dueDateIn = (year: number, monthIndex: number, day: number) => {
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  return toDateKey(new Date(year, monthIndex, Math.min(day, lastDay)))
}

/**
 * 依次给出扣款日期（和数据库 generate_fixed_expenses 同一套算法）：
 * 以 start_date 所在的月份为第一个周期，每隔 intervalMonths 个月一次；早于 start_date 的那次跳过。
 * 比如 10/28 加「每 2 个月 1 号」：10/1 算这个月已经扣过了，下次是 12/1。
 */
export function* dueDates(f: Pick<FixedExpense, 'startDate' | 'dayOfMonth' | 'intervalMonths'>) {
  let y = Number(f.startDate.slice(0, 4))
  let m = Number(f.startDate.slice(5, 7)) - 1
  for (let guard = 0; guard < 240; guard++) {
    const due = dueDateIn(y, m, f.dayOfMonth)
    if (due >= f.startDate) yield due
    m += Math.max(1, f.intervalMonths)
    y += Math.floor(m / 12)
    m %= 12
  }
}

/** 下一次扣款日期（含今天） */
export const nextDueDate = (f: Pick<FixedExpense, 'startDate' | 'dayOfMonth' | 'intervalMonths' | 'lastGeneratedDate'>, today = todayKey()) => {
  for (const due of dueDates(f)) {
    if (due >= today && (!f.lastGeneratedDate || due > f.lastGeneratedDate)) return due
  }
  return today
}

export const intervalLabel = (n: number) =>
  n === 1 ? '每月' : n === 3 ? '每季度' : n === 6 ? '每半年' : n === 12 ? '每年' : `每 ${n} 个月`

/** 演示模式下在本地模拟服务器端的生成逻辑 */
const generateLocally = (today: string) => {
  const created: NewRecord[] = []
  items.value = items.value.map((f) => {
    if (f.paused) return f
    let last = f.lastGeneratedDate
    for (const due of dueDates(f)) {
      if (due > today) break
      if (last && due <= last) continue
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
        startDate: input.startDate ?? todayKey(),
        lastGeneratedDate: null,
        createdBy: uid,
      },
    ]
    return { error: null }
  }
  const { data, error } = await supabase
    .from('fixed_expenses')
    .insert({ start_date: todayKey(), ...toRow(input), book_id: bookId, created_by: uid })
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

/** 隐私：对方的个人固定扣款不显示（共同的两人都能看） */
const visibleItems = computed(() => items.value.filter((f) => f.type === 'shared' || f.payerUid === authUser.value?.id))

export function useFixedExpenses() {
  return { items, visibleItems, loading, load, generateDue, add, update, setPaused, remove }
}
