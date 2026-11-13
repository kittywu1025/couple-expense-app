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
  paidClaimedAt: row.paid_claimed_at ? String(row.paid_claimed_at) : null,
  paidNudgedAt: row.paid_nudged_at ? String(row.paid_nudged_at) : null,
  editedAt: row.edited_at ? String(row.edited_at) : String(row.created_at ?? ''),
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
const CONTENT_KEYS: (keyof LedgerRecord)[] = ['amount', 'kind', 'type', 'payerUid', 'ratio']
/** 演示模式：模拟数据库的确认守卫 */
const stampLocal = (next: LedgerRecord, prev: LedgerRecord | null, uid: string) => {
  const stamped = stampConfirm(
    next,
    prev,
    uid,
    // 记了就入账；对方觉得不对再点「有疑问」
    false,
    CONTENT_KEYS,
  )
  const moneyChanged = !prev || CONTENT_KEYS.some((k) => prev[k] !== next[k])
  // 和数据库一致：记账人对「有疑问」的账单只改了分类 / 日期，也重新请对方确认
  const fixedDispute =
    !!prev &&
    !moneyChanged &&
    prev.confirmStatus === 'disputed' &&
    prev.lastEditedBy === uid &&
    (['category', 'subCategory', 'date'] as const).some((k) => prev[k] !== next[k])
  return {
    ...stamped,
    ...(fixedDispute ? { confirmStatus: 'pending' as const } : {}),
    // 钱变了：之前标的「已收到」不再对得上，取消结清
    ...(prev && moneyChanged ? { settledOnSpot: false, settledAt: null, paidClaimedAt: null, paidNudgedAt: null } : {}),
    editedAt: moneyChanged ? new Date().toISOString() : (prev?.editedAt ?? null),
  }
}

const sortRecords = (list: LedgerRecord[]) =>
  [...list].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))

const { currentBook } = useBooks()

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
    return { error: null, record: local }
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
  const record = normalizeRecord(data)
  records.value = sortRecords([record, ...records.value])
  return { error: null, record }
}

/** 一笔账单的内容（撤销删除时照原样再记一次） */
export const payloadOf = (r: LedgerRecord): NewRecord => ({
  amount: r.amount,
  kind: r.kind,
  type: r.type,
  payerUid: r.payerUid,
  ratio: r.ratio,
  settledOnSpot: !!r.settledOnSpot,
  category: r.category,
  subCategory: r.subCategory,
  note: r.note,
  date: r.date,
})

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
      // 结清只由 setSettled 改，编辑时保留原来的状态（钱变了的话 stampLocal 会取消结清）
      records.value.map((r) => (r.id === id ? stampLocal({ ...r, ...input, settledOnSpot: r.settledOnSpot }, r, uid) : r)),
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
    ids.includes(r.id)
      ? {
          ...r,
          confirmStatus: status,
          // 有疑问 / 等再看时不算入账，「我给了」的申请也作废（和数据库一致）
          ...(status === 'confirmed' ? {} : { paidClaimedAt: null, paidNudgedAt: null }),
          ...(discussion && r.id === target?.id ? { discussion } : {}),
        }
      : r,
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
  records.value = records.value.map((r) => (own.includes(r.id) ? { ...r, settledOnSpot: settled, settledAt: at, paidClaimedAt: null, paidNudgedAt: null } : r))
  return { error: null }
}

/**
 * 我说过「我给了」的账单（存在本机）：TA 点了「没收到」或者改了金额，申请会被清掉，
 * 靠这个发现「被退回来了」，提醒我再看一下。
 */
const claimKey = computed(() => `couple-expense-claims:${currentBook.value?.id ?? ''}:${authUser.value?.id ?? ''}`)
const readClaims = (key: string): string[] => {
  try {
    const list = JSON.parse(localStorage.getItem(key) ?? '[]')
    return Array.isArray(list) ? list.map(String) : []
  } catch {
    return []
  }
}
const myClaims = ref<string[]>([])
watch(claimKey, (key) => (myClaims.value = readClaims(key)), { immediate: true })
const saveClaims = (ids: string[]) => {
  myClaims.value = ids
  try {
    localStorage.setItem(claimKey.value, JSON.stringify(ids))
  } catch {
    // 存不了就只在这次打开时提醒
  }
}
// 结清了、删掉了的不用再记着
watch(records, (list) => {
  if (!list.length || !myClaims.value.length) return
  const keep = myClaims.value.filter((id) => list.some((r) => r.id === id && !r.settledOnSpot))
  if (keep.length !== myClaims.value.length) saveClaims(keep)
})
/** 我说给了、TA 没确认收到就退回来的（TA 说没收到，或者改了金额 / 比例） */
const bouncedClaims = computed(() =>
  records.value.filter(
    (r) =>
      myClaims.value.includes(r.id) &&
      !r.paidClaimedAt &&
      !r.settledOnSpot &&
      // 和「我该给 TA」同样的范围，首页的提醒才能在结清页里点掉
      r.kind === 'expense' &&
      r.type === 'shared' &&
      r.confirmStatus === 'confirmed' &&
      r.ratio !== 10,
  ),
)
const dismissBounced = () => saveClaims(myClaims.value.filter((id) => !bouncedClaims.value.some((r) => r.id === id)))

/** 没付钱的那位说「我给了」/ 撤回；先垫钱的人点「没收到」也是清掉 */
const setPaidClaim = async (ids: string[], claimed: boolean) => {
  const uid = authUser.value?.id ?? ''
  const target = records.value
    .filter((r) => ids.includes(r.id) && r.type === 'shared' && !r.settledOnSpot && (!claimed || r.payerUid !== uid))
    .map((r) => r.id)
  if (!target.length) return { error: new Error('只有没付钱的那位能说已经给了') }
  if (!isDemoMode && supabase) {
    const { data, error } = await supabase
      .from('records')
      .update({ paid_claimed_at: claimed ? new Date().toISOString() : null })
      .in('id', target)
      .select()
    if (error) {
      console.error('结清申请失败：', error)
      return { error: new Error(formatSupabaseError(error, '操作失败，请稍后重试。')) }
    }
    const next = new Map((data ?? []).map((row) => [String(row.id), normalizeRecord(row)]))
    records.value = records.value.map((r) => next.get(r.id) ?? r)
  } else {
    const at = claimed ? new Date().toISOString() : null
    records.value = records.value.map((r) => (target.includes(r.id) ? { ...r, paidClaimedAt: at, paidNudgedAt: null } : r))
  }
  // 记下我说过给了的；我自己撤回的就不算被退回
  const mine = records.value.filter((r) => target.includes(r.id) && r.payerUid !== uid).map((r) => r.id)
  if (claimed) saveClaims([...new Set([...myClaims.value, ...mine])])
  else saveClaims(myClaims.value.filter((id) => !mine.includes(id)))
  return { error: null }
}

/** 「提醒 TA」：说了我给了 12 小时对方还没确认，可以提醒；之后每 12 小时最多一次 */
export const NUDGE_GAP_MS = 12 * 3600 * 1000
export const nudgeReadyAt = (r: LedgerRecord) =>
  r.paidClaimedAt ? new Date(r.paidNudgedAt ?? r.paidClaimedAt).getTime() + NUDGE_GAP_MS : Infinity
const nudgeClaims = async (ids: string[]) => {
  const uid = authUser.value?.id ?? ''
  const now = Date.now()
  const target = records.value
    .filter((r) => ids.includes(r.id) && r.payerUid !== uid && r.paidClaimedAt && !r.settledOnSpot && nudgeReadyAt(r) <= now)
    .map((r) => r.id)
  if (!target.length) return { error: new Error('12 小时内只能提醒一次') }
  if (!isDemoMode && supabase) {
    const { data, error } = await supabase.from('records').update({ paid_nudged_at: new Date().toISOString() }).in('id', target).select()
    if (error) return { error: new Error(formatSupabaseError(error, '提醒失败，请稍后重试。')) }
    const next = new Map((data ?? []).map((row) => [String(row.id), normalizeRecord(row)]))
    records.value = records.value.map((r) => next.get(r.id) ?? r)
    return { error: null }
  }
  const at = new Date().toISOString()
  records.value = records.value.map((r) => (target.includes(r.id) ? { ...r, paidNudgedAt: at } : r))
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
 * 隐私边界：两个人的账单（包括 TA 的个人记录）都能在列表、日历里看到；
 * 统计和首页数字只算共同的 + 自己的，不汇总 TA 的个人消费和收入。
 */
/** 对方的个人记录只能看、不能改删（共同记录两人都能改） */
export const canModify = (r: LedgerRecord, uid: string) => r.type === 'shared' || r.payerUid === uid || r.createdBy === uid

export function useRecords() {
  return { records, recordsLoading, recordsError, loadRecords, addRecord, addRecordsBulk, updateRecord, deleteRecord, respondRecords, replyRecord, setSettled, setPaidClaim, bouncedClaims, dismissBounced, nudgeClaims }
}
