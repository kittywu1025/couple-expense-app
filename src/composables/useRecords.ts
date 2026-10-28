import { computed, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { createDemoRecords, isDemoMode } from '../lib/demo'
import type { ConfirmStatus, LedgerRecord, NewRecord } from '../types'
import { newEntry, parseDiscussion, stampConfirm } from '../utils/confirm'
import { formatSupabaseError, useBooks } from './useBooks'
import { authUser } from './useSupabaseAuth'
import { setSyncWarning } from './useRuntimeStatus'

const records = ref<LedgerRecord[]>([])
const recordsLoading = ref(false)
/** 最近一次加载失败（有缓存时仍显示缓存，只在完全没数据时显示错误页） */
const recordsError = ref(false)

// ── 本地缓存：打开 App 先显示上次的数据，后台再拉最新的（stale-while-revalidate） ──
const CACHE_PREFIX = 'couple-expense-records:'
const readCache = (bookId: string): LedgerRecord[] | null => {
  try {
    const raw = localStorage.getItem(CACHE_PREFIX + bookId)
    // 旧缓存没有确认状态，当作已确认
    return raw
      ? (JSON.parse(raw) as LedgerRecord[]).map((r) => ({
          ...r,
          confirmStatus: r.confirmStatus ?? 'confirmed',
          lastEditedBy: r.lastEditedBy ?? r.createdBy,
          discussion: r.discussion ?? [],
        }))
      : null
  } catch {
    return null
  }
}
const writeCache = (bookId: string, list: LedgerRecord[]) => {
  try {
    localStorage.setItem(CACHE_PREFIX + bookId, JSON.stringify(list))
  } catch {
    // 空间不够或无痕模式就不缓存
  }
}

const normalizeRecord = (row: Record<string, unknown>): LedgerRecord => ({
  id: String(row.id),
  bookId: String(row.book_id),
  amount: Number(row.amount),
  kind: row.kind === 'income' ? 'income' : 'expense',
  type: row.type === 'shared' ? 'shared' : 'personal',
  payerUid: String(row.payer_uid),
  ratio: Number(row.ratio ?? 5),
  settledOnSpot: !!row.settled_on_spot,
  settledAt: row.settled_at ? String(row.settled_at) : null,
  category: String(row.category ?? '其他'),
  subCategory: row.sub_category ? String(row.sub_category) : null,
  note: row.note ? String(row.note) : null,
  date: String(row.date),
  createdBy: String(row.created_by),
  createdAt: String(row.created_at ?? ''),
  confirmStatus: row.confirm_status === 'pending' || row.confirm_status === 'disputed' ? row.confirm_status : 'confirmed',
  lastEditedBy: String(row.last_edited_by ?? row.created_by),
  discussion: parseDiscussion(row.discussion),
})

/** 改了这些才需要对方重新确认（只改备注不用） */
const CONTENT_KEYS: (keyof LedgerRecord)[] = ['amount', 'kind', 'type', 'payerUid', 'ratio', 'category', 'subCategory', 'date']
/** 演示模式：模拟数据库的确认守卫 */
const stampLocal = (next: LedgerRecord, prev: LedgerRecord | null, uid: string) =>
  stampConfirm(next, prev, uid, next.type === 'shared' && !!partner.value, CONTENT_KEYS)

const sortRecords = (list: LedgerRecord[]) =>
  [...list].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))

const { currentBook, partner } = useBooks()

const loadRecords = async () => {
  if (isDemoMode) {
    if (!records.value.length) records.value = sortRecords(createDemoRecords())
    return
  }
  const bookId = currentBook.value?.id
  if (!supabase || !bookId) {
    records.value = []
    return
  }

  // 先用缓存把页面填起来，避免每次打开都是骨架屏
  if (!records.value.length) {
    const cached = readCache(bookId)
    if (cached?.length) records.value = cached
  }

  recordsLoading.value = true
  recordsError.value = false
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
    recordsError.value = true
    setSyncWarning(formatSupabaseError(error, '账单读取失败，请检查网络后再试。'))
  } finally {
    recordsLoading.value = false
  }
}

const addRecord = async (input: NewRecord) => {
  const bookId = currentBook.value?.id
  const uid = authUser.value?.id
  if (isDemoMode && bookId && uid) {
    const local = stampLocal(
      {
        ...input,
        id: crypto.randomUUID(),
        bookId,
        createdBy: uid,
        createdAt: new Date().toISOString(),
        confirmStatus: 'confirmed',
        lastEditedBy: uid,
        discussion: [],
      },
      null,
      uid,
    )
    records.value = sortRecords([local, ...records.value])
    return { error: null }
  }
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
      settled_on_spot: !!input.settledOnSpot,
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

/** 批量插入（测试数据用） */
const addRecordsBulk = async (inputs: NewRecord[]) => {
  const bookId = currentBook.value?.id
  const uid = authUser.value?.id
  if (!bookId || !uid) return { error: new Error('还没有加入账本。') }
  if (isDemoMode || !supabase) {
    const now = Date.now()
    const local = inputs.map((input, i) =>
      stampLocal(
        {
          ...input,
          id: crypto.randomUUID(),
          bookId,
          createdBy: uid,
          createdAt: new Date(now - i * 1000).toISOString(),
          confirmStatus: 'confirmed',
          lastEditedBy: uid,
          discussion: [],
        },
        null,
        uid,
      ),
    )
    records.value = sortRecords([...local, ...records.value])
    return { error: null }
  }
  const { data, error } = await supabase
    .from('records')
    .insert(
      inputs.map((input) => ({
        book_id: bookId,
        amount: input.amount,
        kind: input.kind,
        type: input.type,
        payer_uid: input.payerUid,
        ratio: input.ratio,
        settled_on_spot: !!input.settledOnSpot,
        category: input.category,
        sub_category: input.subCategory,
        note: input.note,
        date: input.date,
        created_by: uid,
      })),
    )
    .select()
  if (error) {
    console.error('批量插入失败：', error)
    return { error: new Error(formatSupabaseError(error, '插入测试数据失败。')) }
  }
  records.value = sortRecords([...(data ?? []).map(normalizeRecord), ...records.value])
  return { error: null }
}

const updateRecord = async (id: string, input: NewRecord) => {
  if (isDemoMode || !supabase) {
    const uid = authUser.value?.id ?? ''
    records.value = sortRecords(
      records.value.map((r) => (r.id === id ? stampLocal({ ...r, ...input, settledOnSpot: !!input.settledOnSpot }, { ...r, settledOnSpot: !!r.settledOnSpot }, uid) : r)),
    )
    return { error: null }
  }

  const { data, error } = await supabase
    .from('records')
    .update({
      amount: input.amount,
      kind: input.kind,
      type: input.type,
      payer_uid: input.payerUid,
      ratio: input.ratio,
      settled_on_spot: !!input.settledOnSpot,
      category: input.category,
      sub_category: input.subCategory,
      note: input.note,
      date: input.date,
    })
    .eq('id', id)
    .select()
    .single()

  if (error) {
    console.error('更新账单失败：', error)
    return { error: new Error(formatSupabaseError(error, '保存失败，请稍后重试。')) }
  }
  const next = normalizeRecord(data)
  records.value = sortRecords(records.value.map((r) => (r.id === id ? next : r)))
  return { error: null }
}

const deleteRecord = async (id: string) => {
  if (isDemoMode || !supabase) {
    records.value = records.value.filter((r) => r.id !== id)
    return { error: null }
  }
  const { error } = await supabase.from('records').delete().eq('id', id)
  if (error) {
    console.error('删除账单失败：', error)
    return { error: new Error(formatSupabaseError(error, '删除失败，请稍后重试。')) }
  }
  records.value = records.value.filter((r) => r.id !== id)
  return { error: null }
}

/** 改确认状态，可以顺便追加一条留言（留言只用在单笔上） */
const setConfirm = async (ids: string[], status: ConfirmStatus, message?: { text: string; ratio?: number | null }) => {
  if (!ids.length) return { error: null }
  const uid = authUser.value?.id ?? ''
  const target = message ? records.value.find((r) => r.id === ids[0]) : undefined
  const discussion = target && message ? [...target.discussion, newEntry(uid, message.text, message.ratio)] : undefined
  if (!isDemoMode && supabase) {
    const { data, error } = await supabase
      .from('records')
      .update(discussion ? { confirm_status: status, discussion } : { confirm_status: status })
      .in('id', discussion ? ids.slice(0, 1) : ids)
      .select()
    if (error) {
      console.error('确认账单失败：', error)
      return { error: new Error(formatSupabaseError(error, '操作失败，请稍后重试。')) }
    }
    const next = new Map((data ?? []).map((row) => [String(row.id), normalizeRecord(row)]))
    records.value = records.value.map((r) => next.get(r.id) ?? r)
    return { error: null }
  }
  records.value = records.value.map((r) =>
    ids.includes(r.id) ? { ...r, confirmStatus: status, ...(discussion && r.id === target?.id ? { discussion } : {}) } : r,
  )
  return { error: null }
}

/** 对方记的共同账单：确认 / 有疑问（有疑问可以留言、提议比例） */
const respondRecords = (ids: string[], status: Exclude<ConfirmStatus, 'pending'>, message?: { text: string; ratio?: number | null }) =>
  setConfirm(ids, status, message)

/** 结清：先垫钱的人标记对方那份「已收到」/ 撤销（不用对方再确认） */
const setSettled = async (ids: string[], settled: boolean) => {
  const uid = authUser.value?.id ?? ''
  const own = records.value.filter((r) => ids.includes(r.id) && r.payerUid === uid).map((r) => r.id)
  if (!own.length) return { error: new Error('只有先垫钱的人能标记已收到') }
  if (!isDemoMode && supabase) {
    const { data, error } = await supabase.from('records').update({ settled_on_spot: settled }).in('id', own).select()
    if (error) {
      console.error('结清失败：', error)
      return { error: new Error(formatSupabaseError(error, '操作失败，请稍后重试。')) }
    }
    const next = new Map((data ?? []).map((row) => [String(row.id), normalizeRecord(row)]))
    records.value = records.value.map((r) => next.get(r.id) ?? r)
    return { error: null }
  }
  const at = settled ? new Date().toISOString() : null
  records.value = records.value.map((r) => (own.includes(r.id) ? { ...r, settledOnSpot: settled, settledAt: at } : r))
  return { error: null }
}

/** 记账人回复对方的疑问，重新请 TA 确认 */
const replyRecord = (id: string, text: string) => setConfirm([id], 'pending', { text })

watch(() => currentBook.value?.id, loadRecords, { immediate: true })

// 记录有变化就写缓存（演示模式不写）
watch(records, (list) => {
  const bookId = currentBook.value?.id
  if (bookId && !isDemoMode) writeCache(bookId, list)
})

/**
 * 隐私边界：共同记录两人都能看；个人记录（含收入）只有付款人自己能看。
 * 列表、日历、详情、收入统计都用这个；「我们一共花了多少」这类总额才用全部记录。
 */
export const isVisibleTo = (r: LedgerRecord, uid: string) => r.type === 'shared' || r.payerUid === uid
/** 对方的个人记录只能看、不能改删（共同记录两人都能改） */
export const canModify = (r: LedgerRecord, uid: string) => r.type === 'shared' || r.payerUid === uid || r.createdBy === uid
const visibleRecords = computed(() => records.value.filter((r) => isVisibleTo(r, authUser.value?.id ?? '')))

export function useRecords() {
  return { records, visibleRecords, recordsLoading, recordsError, loadRecords, addRecord, addRecordsBulk, updateRecord, deleteRecord, respondRecords, replyRecord, setSettled }
}
