import { computed, ref, watch } from 'vue'
import { supabase } from '../lib/supabase'
import type { Book, BookMember } from '../types'
import { authDisplayName, authUser } from './useSupabaseAuth'
import { setSyncWarning } from './useRuntimeStatus'

const currentBook = ref<Book | null>(null)
const members = ref<BookMember[]>([])
const booksLoading = ref(false)
const bookActionLoading = ref(false)

const normalizeBook = (row: Record<string, unknown>): Book => ({
  id: String(row.id),
  inviteCode: String(row.invite_code ?? ''),
  settleDay: Number(row.settle_day ?? 1),
  defaultRatio: Number(row.default_ratio ?? 5),
  createdBy: String(row.created_by ?? ''),
  createdAt: String(row.created_at ?? ''),
})

const normalizeMember = (row: Record<string, unknown>): BookMember => ({
  id: String(row.id),
  bookId: String(row.book_id),
  userId: String(row.user_id),
  displayName: String(row.display_name || '未命名'),
  joinedAt: String(row.joined_at ?? ''),
})

export const formatSupabaseError = (error: unknown, fallback: string) => {
  const raw =
    error && typeof error === 'object'
      ? ['message', 'details', 'hint']
          .map((k) => (error as Record<string, unknown>)[k])
          .filter((v) => typeof v === 'string' && v)
          .join(' | ')
      : typeof error === 'string'
        ? error
        : ''
  const text = raw.toLowerCase()

  if (!raw) return fallback
  if (text.includes('relation') && text.includes('does not exist')) {
    return '数据表还没有创建，请先在 Supabase 执行 SQL。'
  }
  if (text.includes('permission denied') || text.includes('row-level security')) {
    return '当前账号没有权限，请检查 Supabase RLS 策略。'
  }
  if (text.includes('network') || text.includes('fetch')) return '网络连接失败，请稍后重试。'
  for (const known of ['邀请码不存在', '你已经在这个账本中', '这个账本已经满两人了', '邀请码生成失败']) {
    if (raw.includes(known)) return known
  }
  return fallback
}

const loadMembers = async (bookId: string) => {
  if (!supabase) return
  const { data, error } = await supabase
    .from('book_members')
    .select('id, book_id, user_id, display_name, joined_at')
    .eq('book_id', bookId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  members.value = (data ?? []).map(normalizeMember)
}

const loadBook = async () => {
  if (!supabase || !authUser.value) {
    currentBook.value = null
    members.value = []
    return
  }

  booksLoading.value = true
  try {
    const { data, error } = await supabase
      .from('book_members')
      .select('book:books(id, invite_code, settle_day, default_ratio, created_by, created_at)')
      .eq('user_id', authUser.value.id)
      .order('joined_at', { ascending: true })
      .limit(1)
    if (error) throw error

    const raw = data?.[0]?.book as Record<string, unknown> | Record<string, unknown>[] | null | undefined
    const row = Array.isArray(raw) ? raw[0] : raw
    currentBook.value = row ? normalizeBook(row) : null
    if (currentBook.value) {
      await loadMembers(currentBook.value.id)
    } else {
      members.value = []
    }
  } catch (error) {
    console.error('加载账本失败：', error)
    currentBook.value = null
    members.value = []
    setSyncWarning(formatSupabaseError(error, '账本信息读取失败，请稍后重试。'))
  } finally {
    booksLoading.value = false
  }
}

const runBookAction = async (fn: () => Promise<void>, fallback: string) => {
  bookActionLoading.value = true
  try {
    await fn()
    return { error: null }
  } catch (error) {
    console.error(fallback, error)
    return { error: new Error(formatSupabaseError(error, fallback)) }
  } finally {
    bookActionLoading.value = false
  }
}

const createBook = () =>
  runBookAction(async () => {
    if (!supabase) throw new Error('当前未配置 Supabase。')
    const { error } = await supabase.rpc('create_book', { p_display_name: authDisplayName.value })
    if (error) throw error
    await loadBook()
  }, '创建账本失败，请稍后重试。')

const joinBook = (inviteCode: string) =>
  runBookAction(async () => {
    if (!supabase) throw new Error('当前未配置 Supabase。')
    const { error } = await supabase.rpc('join_book', {
      p_invite_code: inviteCode.trim().toUpperCase(),
      p_display_name: authDisplayName.value,
    })
    if (error) throw error
    await loadBook()
  }, '加入账本失败，请稍后重试。')

const leaveBook = () =>
  runBookAction(async () => {
    if (!supabase || !currentBook.value) return
    const { error } = await supabase.rpc('leave_book', { p_book_id: currentBook.value.id })
    if (error) throw error
    currentBook.value = null
    members.value = []
  }, '退出账本失败，请稍后重试。')

const updateBookSettings = (patch: Partial<Pick<Book, 'settleDay' | 'defaultRatio'>>) =>
  runBookAction(async () => {
    if (!supabase || !currentBook.value) return
    const payload: Record<string, number> = {}
    if (patch.settleDay !== undefined) payload.settle_day = patch.settleDay
    if (patch.defaultRatio !== undefined) payload.default_ratio = patch.defaultRatio
    const { data, error } = await supabase
      .from('books')
      .update(payload)
      .eq('id', currentBook.value.id)
      .select()
      .single()
    if (error) throw error
    currentBook.value = normalizeBook(data)
  }, '保存设置失败，请稍后重试。')

watch(() => authUser.value?.id, loadBook, { immediate: true })

const me = computed(() => members.value.find((m) => m.userId === authUser.value?.id) ?? null)
const partner = computed(() => members.value.find((m) => m.userId !== authUser.value?.id) ?? null)
const myUid = computed(() => authUser.value?.id ?? '')
const partnerUid = computed(() => partner.value?.userId ?? '')

/** 给定一人 uid，返回另一人 uid */
const otherUid = (uid: string) => (uid === myUid.value ? partnerUid.value : myUid.value)

const nameOf = (uid: string) => {
  if (uid === myUid.value) return me.value?.displayName ?? '我'
  return members.value.find((m) => m.userId === uid)?.displayName ?? 'TA'
}

export function useBooks() {
  return {
    currentBook,
    members,
    me,
    partner,
    myUid,
    partnerUid,
    otherUid,
    nameOf,
    booksLoading,
    bookActionLoading,
    loadBook,
    createBook,
    joinBook,
    leaveBook,
    updateBookSettings,
  }
}
