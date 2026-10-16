import { ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import type { LedgerRecord, NewRecord } from '../types'
import { formatSupabaseError, useBooks } from './useBooks'
import { authUser } from './useSupabaseAuth'
import { setSyncWarning } from './useRuntimeStatus'

const records = ref<LedgerRecord[]>([])
const recordsLoading = ref(false)

const normalizeRecord = (row: Record<string, unknown>): LedgerRecord => ({
  id: String(row.id),
  bookId: String(row.book_id),
  amount: Number(row.amount),
  kind: row.kind === 'income' ? 'income' : 'expense',
  type: row.type === 'shared' ? 'shared' : 'personal',
  payerUid: String(row.payer_uid),
  ratio: Number(row.ratio ?? 5),
  category: String(row.category ?? '其他'),
  subCategory: row.sub_category ? String(row.sub_category) : null,
  note: row.note ? String(row.note) : null,
  date: String(row.date),
  createdBy: String(row.created_by),
  createdAt: String(row.created_at ?? ''),
})

const sortRecords = (list: LedgerRecord[]) =>
  [...list].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))

const { currentBook } = useBooks()

const loadRecords = async () => {
  const bookId = currentBook.value?.id
  if (!supabase || !bookId) {
    records.value = []
    return
  }

  recordsLoading.value = true
  try {
    const { data, error } = await supabase
      .from('records')
      .select('*')
      .eq('book_id', bookId)
      .order('date', { ascending: false })
      .order('created_at', { ascending: false })
    if (error) throw error
    records.value = (data ?? []).map(normalizeRecord)
  } catch (error) {
    console.error('加载账单失败：', error)
    setSyncWarning(formatSupabaseError(error, '账单读取失败，请稍后重试。'))
  } finally {
    recordsLoading.value = false
  }
}

const addRecord = async (input: NewRecord) => {
  const bookId = currentBook.value?.id
  const uid = authUser.value?.id
  if (!supabase || !bookId || !uid) return { error: new Error('还没有加入账本。') }

  const { data, error } = await supabase
    .from('records')
    .insert({
      book_id: bookId,
      amount: input.amount,
      kind: input.kind,
      type: input.type,
      payer_uid: input.payerUid,
      ratio: input.ratio,
      category: input.category,
      sub_category: input.subCategory,
      note: input.note,
      date: input.date,
      created_by: uid,
    })
    .select()
    .single()

  if (error) {
    console.error('保存账单失败：', error)
    return { error: new Error(formatSupabaseError(error, '保存失败，请稍后重试。')) }
  }
  records.value = sortRecords([normalizeRecord(data), ...records.value])
  return { error: null }
}

const deleteRecord = async (id: string) => {
  if (!supabase) return { error: null }
  const { error } = await supabase.from('records').delete().eq('id', id)
  if (error) {
    console.error('删除账单失败：', error)
    return { error: new Error(formatSupabaseError(error, '删除失败，请稍后重试。')) }
  }
  records.value = records.value.filter((r) => r.id !== id)
  return { error: null }
}

watch(() => currentBook.value?.id, loadRecords, { immediate: true })

export function useRecords() {
  return { records, recordsLoading, loadRecords, addRecord, deleteRecord }
}
