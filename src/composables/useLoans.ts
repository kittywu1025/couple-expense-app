import { computed, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import { createDemoLoans, isDemoMode } from '../lib/demo'
import type { ConfirmStatus, Loan, LoanRepayment } from '../types'
import { isCurrencyCode } from '../utils/currency'
import { formatSupabaseError, useBooks } from './useBooks'
import { authUser } from './useSupabaseAuth'
import { newEntry, parseDiscussion, stampConfirm } from '../utils/confirm'

const loans = ref<Loan[]>([])
const repayments = ref<LoanRepayment[]>([])
const loading = ref(false)

const { currentBook, partner } = useBooks()

const confirmOf = (row: Record<string, unknown>) => ({
  confirmStatus: (row.confirm_status === 'confirmed' || row.confirm_status === 'disputed' ? row.confirm_status : 'pending') as ConfirmStatus,
  lastEditedBy: String(row.last_edited_by ?? row.created_by),
  discussion: parseDiscussion(row.discussion),
})

const normalizeLoan = (row: Record<string, unknown>): Loan => ({
  id: String(row.id),
  bookId: String(row.book_id),
  lenderUid: String(row.lender_uid),
  borrowerUid: String(row.borrower_uid),
  amount: Number(row.amount),
  currency: isCurrencyCode(row.currency) ? row.currency : (currentBook.value?.currency ?? 'JPY'),
  deleteRequestedBy: row.delete_requested_by ? String(row.delete_requested_by) : null,
  note: row.note ? String(row.note) : null,
  date: String(row.date),
  createdBy: String(row.created_by),
  createdAt: String(row.created_at ?? ''),
  ...confirmOf(row),
})

const normalizeRepayment = (row: Record<string, unknown>): LoanRepayment => ({
  id: String(row.id),
  loanId: String(row.loan_id),
  bookId: String(row.book_id),
  amount: Number(row.amount),
  note: row.note ? String(row.note) : null,
  date: String(row.date),
  createdBy: String(row.created_by),
  createdAt: String(row.created_at ?? ''),
  ...confirmOf(row),
})

const byDateDesc = <T extends { date: string; createdAt: string }>(list: T[]) =>
  [...list].sort((a, b) => (a.date === b.date ? b.createdAt.localeCompare(a.createdAt) : b.date.localeCompare(a.date)))

const load = async () => {
  const bookId = currentBook.value?.id
  if (isDemoMode) {
    if (!loans.value.length) {
      const demo = createDemoLoans()
      loans.value = demo.loans
      repayments.value = demo.repayments
    }
    return
  }
  if (!bookId || !supabase) {
    loans.value = []
    repayments.value = []
    return
  }
  loading.value = true
  const [l, r] = await Promise.all([
    supabase.from('loans').select('*').eq('book_id', bookId),
    supabase.from('loan_repayments').select('*').eq('book_id', bookId),
  ])
  loading.value = false
  if (l.error || r.error) {
    // 表还没建（没执行 SQL）时静默，不影响记账
    console.warn('读取借款失败：', l.error ?? r.error)
    return
  }
  loans.value = byDateDesc((l.data ?? []).map(normalizeLoan))
  repayments.value = byDateDesc((r.data ?? []).map(normalizeRepayment))
}

export interface LoanInput {
  lenderUid: string
  borrowerUid: string
  amount: number
  currency: Loan['currency']
  note: string | null
  date: string
}

const addLoan = async (input: LoanInput) => {
  const bookId = currentBook.value?.id
  const uid = authUser.value?.id
  if (!bookId || !uid) return { error: new Error('还没有加入账本。') }
  if (isDemoMode || !supabase) {
    const local: Loan = {
      ...input,
      id: crypto.randomUUID(),
      bookId,
      createdBy: uid,
      createdAt: new Date().toISOString(),
      // 借款记了就算，不用对方确认
      confirmStatus: 'confirmed',
      lastEditedBy: uid,
      discussion: [],
      deleteRequestedBy: null,
    }
    loans.value = byDateDesc([local, ...loans.value])
    return { error: null }
  }
  const { data, error } = await supabase
    .from('loans')
    .insert({
      book_id: bookId,
      lender_uid: input.lenderUid,
      borrower_uid: input.borrowerUid,
      amount: input.amount,
      currency: input.currency,
      note: input.note,
      date: input.date,
      created_by: uid,
    })
    .select()
    .single()
  if (error) return { error: new Error(formatSupabaseError(error, '保存失败，请稍后重试。')) }
  loans.value = byDateDesc([normalizeLoan(data), ...loans.value])
  return { error: null }
}

/** 申请删除 / 撤回申请 / 不同意：都是改 delete_requested_by */
const setDeleteRequest = async (id: string, by: string | null) => {
  if (!isDemoMode && supabase) {
    const { data, error } = await supabase.from('loans').update({ delete_requested_by: by }).eq('id', id).select().single()
    if (error) return { error: new Error(formatSupabaseError(error, '操作失败，请稍后重试。')) }
    const next = normalizeLoan(data)
    loans.value = loans.value.map((l) => (l.id === id ? next : l))
    return { error: null }
  }
  loans.value = loans.value.map((l) => (l.id === id ? { ...l, deleteRequestedBy: by } : l))
  return { error: null }
}
const requestDeleteLoan = (id: string) => setDeleteRequest(id, authUser.value?.id ?? null)
const cancelDeleteLoan = (id: string) => setDeleteRequest(id, null)

/** 同意对方的删除申请：真正删掉（还款记录一起删） */
const removeLoan = async (id: string) => {
  if (!isDemoMode && supabase) {
    // RLS 不允许时 delete 不报错只是删 0 行，用 select 判断
    const { data, error } = await supabase.from('loans').delete().eq('id', id).select('id')
    if (error) return { error: new Error(formatSupabaseError(error, '删除失败，请稍后重试。')) }
    if (!data?.length) return { error: new Error('要先由一个人申请删除，另一个人同意才能删') }
  }
  loans.value = loans.value.filter((l) => l.id !== id)
  repayments.value = repayments.value.filter((r) => r.loanId !== id)
  return { error: null }
}

const addRepayment = async (loanId: string, input: { amount: number; date: string; note: string | null }) => {
  const bookId = currentBook.value?.id
  const uid = authUser.value?.id
  if (!bookId || !uid) return { error: new Error('还没有加入账本。') }
  if (isDemoMode || !supabase) {
    const local: LoanRepayment = {
      ...input,
      id: crypto.randomUUID(),
      loanId,
      bookId,
      createdBy: uid,
      createdAt: new Date().toISOString(),
      confirmStatus: 'pending',
      lastEditedBy: uid,
      discussion: [],
    }
    repayments.value = byDateDesc([stampConfirm(local, null, uid, !!partner.value, []), ...repayments.value])
    return { error: null }
  }
  const { data, error } = await supabase
    .from('loan_repayments')
    .insert({ loan_id: loanId, book_id: bookId, amount: input.amount, date: input.date, note: input.note, created_by: uid })
    .select()
    .single()
  if (error) return { error: new Error(formatSupabaseError(error, '保存失败，请稍后重试。')) }
  repayments.value = byDateDesc([normalizeRepayment(data), ...repayments.value])
  return { error: null }
}

const removeRepayment = async (id: string) => {
  if (!isDemoMode && supabase) {
    const { data, error } = await supabase.from('loan_repayments').delete().eq('id', id).select('id')
    if (error) return { error: new Error(formatSupabaseError(error, '删除失败，请稍后重试。')) }
    if (!data?.length) return { error: new Error('TA 已经确认过的还款，只有借出的人能删') }
  }
  repayments.value = repayments.value.filter((r) => r.id !== id)
  return { error: null }
}

/** 确认 / 有疑问 / 回复：借款和还款共用；留言只用在单笔上 */
const respond = async (table: 'loans' | 'loan_repayments', ids: string[], status: ConfirmStatus, text?: string) => {
  if (!ids.length) return { error: null }
  const list = table === 'loans' ? loans : repayments
  const target = text ? list.value.find((x) => x.id === ids[0]) : undefined
  const discussion = target && text ? [...target.discussion, newEntry(authUser.value?.id ?? '', text)] : undefined
  if (discussion) ids = ids.slice(0, 1)
  if (!isDemoMode && supabase) {
    const { data, error } = await supabase
      .from(table)
      .update(discussion ? { confirm_status: status, discussion } : { confirm_status: status })
      .in('id', ids)
      .select()
    if (error) return { error: new Error(formatSupabaseError(error, '操作失败，请稍后重试。')) }
    const normalize = table === 'loans' ? normalizeLoan : normalizeRepayment
    const next = new Map((data ?? []).map((row) => [String(row.id), normalize(row)]))
    list.value = list.value.map((x) => next.get(x.id) ?? x) as typeof list.value
    return { error: null }
  }
  list.value = list.value.map((x) =>
    ids.includes(x.id) ? { ...x, confirmStatus: status, ...(discussion ? { discussion } : {}) } : x,
  ) as typeof list.value
  return { error: null }
}
const respondLoans = (ids: string[], status: Exclude<ConfirmStatus, 'pending'>, text?: string) => respond('loans', ids, status, text)
const respondRepayments = (ids: string[], status: Exclude<ConfirmStatus, 'pending'>, text?: string) =>
  respond('loan_repayments', ids, status, text)
/** 记账人回复对方的疑问，重新请 TA 确认 */
const replyLoan = (id: string, text: string) => respond('loans', [id], 'pending', text)
const replyRepayment = (id: string, text: string) => respond('loan_repayments', [id], 'pending', text)

/** 每笔借款的还款进度：只有对方确认过的还款才算「已还」 */
const progress = computed(() => {
  const map = new Map<string, { repaid: number; pending: number; remaining: number; settled: boolean; items: LoanRepayment[] }>()
  for (const l of loans.value) {
    const items = repayments.value.filter((r) => r.loanId === l.id)
    const repaid = items.filter((r) => r.confirmStatus === 'confirmed').reduce((s, r) => s + r.amount, 0)
    const pending = items.filter((r) => r.confirmStatus === 'pending').reduce((s, r) => s + r.amount, 0)
    const remaining = Math.max(0, Math.round((l.amount - repaid) * 100) / 100)
    map.set(l.id, { repaid, pending, remaining, settled: remaining === 0, items })
  }
  return map
})

watch(
  () => currentBook.value?.id,
  async (id) => {
    if (!isDemoMode) {
      loans.value = []
      repayments.value = []
    }
    if (id) await load()
  },
  { immediate: true },
)

export function useLoans() {
  return { loans, repayments, loading, progress, load, addLoan, removeLoan, requestDeleteLoan, cancelDeleteLoan, addRepayment, removeRepayment, respondLoans, respondRepayments, replyLoan, replyRepayment }
}
