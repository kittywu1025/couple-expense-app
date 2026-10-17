import { computed, ref, watch, watchEffect } from 'vue'
import { supabase } from '../lib/supabase'
import { demoBook, demoMembers, isDemoMode } from '../lib/demo'
import type { Book, BookMember, Gender } from '../types'
import { authDisplayName, authUser } from './useSupabaseAuth'
import { DEFAULT_CURRENCY, isCurrencyCode } from '../utils/currency'
import { activeCurrency } from '../utils/format'
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
  currency: isCurrencyCode(row.currency) ? row.currency : DEFAULT_CURRENCY,
  createdBy: String(row.created_by ?? ''),
  createdAt: String(row.created_at ?? ''),
})

const normalizeMember = (row: Record<string, unknown>): BookMember => ({
  id: String(row.id),
  bookId: String(row.book_id),
  userId: String(row.user_id),
  displayName: String(row.display_name || '未命名'),
  gender: row.gender === 'female' || row.gender === 'male' ? row.gender : null,
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
  for (const known of ['演示模式下不能退出账本', '邀请码不存在', '你已经在这个账本中', '这个账本已经满两人了', '邀请码生成失败']) {
    if (raw.includes(known)) return known
  }
  return fallback
}

const loadMembers = async (bookId: string) => {
  if (!supabase) return
  const { data, error } = await supabase
    .from('book_members')
    .select('id, book_id, user_id, display_name, gender, joined_at')
    .eq('book_id', bookId)
    .order('joined_at', { ascending: true })
  if (error) throw error
  members.value = (data ?? []).map(normalizeMember)
}

const loadBook = async () => {
  if (isDemoMode) {
    currentBook.value ??= { ...demoBook }
    if (!members.value.length) members.value = demoMembers.map((m) => ({ ...m }))
    return
  }
  if (!supabase || !authUser.value) {
    currentBook.value = null
    members.value = []
    return
  }

  booksLoading.value = true
  try {
    const { data, error } = await supabase
      .from('book_members')
      .select('book:books(id, invite_code, settle_day, default_ratio, currency, created_by, created_at)')
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

const createBook = (gender: Gender) =>
  runBookAction(async () => {
    if (!supabase) throw new Error('当前未配置 Supabase。')
    const { error } = await supabase.rpc('create_book', {
      p_display_name: authDisplayName.value,
      p_gender: gender,
    })
    if (error) throw error
    await loadBook()
  }, '创建账本失败，请稍后重试。')

const joinBook = (inviteCode: string, gender: Gender) =>
  runBookAction(async () => {
    if (!supabase) throw new Error('当前未配置 Supabase。')
    const { error } = await supabase.rpc('join_book', {
      p_invite_code: inviteCode.trim().toUpperCase(),
      p_display_name: authDisplayName.value,
      p_gender: gender,
    })
    if (error) throw error
    await loadBook()
  }, '加入账本失败，请稍后重试。')

const leaveBook = () =>
  runBookAction(async () => {
    if (isDemoMode) throw new Error('演示模式下不能退出账本')
    if (!supabase || !currentBook.value) return
    const { error } = await supabase.rpc('leave_book', { p_book_id: currentBook.value.id })
    if (error) throw error
    currentBook.value = null
    members.value = []
  }, '退出账本失败，请稍后重试。')

const updateBookSettings = (patch: Partial<Pick<Book, 'settleDay' | 'defaultRatio' | 'currency'>>) =>
  runBookAction(async () => {
    if (isDemoMode && currentBook.value) {
      currentBook.value = { ...currentBook.value, ...patch }
      return
    }
    if (!supabase || !currentBook.value) return
    const payload: Record<string, number | string> = {}
    if (patch.settleDay !== undefined) payload.settle_day = patch.settleDay
    if (patch.defaultRatio !== undefined) payload.default_ratio = patch.defaultRatio
    if (patch.currency !== undefined) payload.currency = patch.currency
    const { data, error } = await supabase
      .from('books')
      .update(payload)
      .eq('id', currentBook.value.id)
      .select()
      .single()
    if (error) throw error
    currentBook.value = normalizeBook(data)
  }, '保存设置失败，请稍后重试。')

const updateMyGender = (gender: Gender) =>
  runBookAction(async () => {
    const mine = members.value.find((m) => m.userId === authUser.value?.id)
    if (!mine) return
    if (!isDemoMode) {
      if (!supabase) return
      const { error } = await supabase.from('book_members').update({ gender }).eq('id', mine.id)
      if (error) throw error
    }
    members.value = members.value.map((m) => (m.id === mine.id ? { ...m, gender } : m))
  }, '保存性别失败，请稍后重试。')

watch(() => authUser.value?.id, loadBook, { immediate: true })
watch(
  () => currentBook.value?.currency,
  (code) => (activeCurrency.value = code ?? DEFAULT_CURRENCY),
  { immediate: true },
)

const me = computed(() => members.value.find((m) => m.userId === authUser.value?.id) ?? null)
const partner = computed(() => members.value.find((m) => m.userId !== authUser.value?.id) ?? null)
const myUid = computed(() => authUser.value?.id ?? '')
const partnerUid = computed(() => partner.value?.userId ?? '')

const PALETTE: Record<Gender, { color: string; text: string; bg: string }> = {
  female: { color: '#FF8FAB', text: '#D9577A', bg: '#FFF0F3' },
  male: { color: '#74C0FC', text: '#2F86C9', bg: '#EFF8FF' },
}
const opposite = (g: Gender): Gender => (g === 'female' ? 'male' : 'female')

/**
 * 我和对方的标识色调：跟着性别走（女粉 / 男蓝）。
 * 只有一方设置了性别时，另一方取相反色；都没设或同性时回到「我粉、对方蓝」。
 */
const tones = computed(() => {
  const mine = me.value?.gender ?? null
  const theirs = partner.value?.gender ?? null
  if (mine && theirs && mine !== theirs) return { me: mine, partner: theirs }
  if (mine && !theirs) return { me: mine, partner: opposite(mine) }
  if (!mine && theirs) return { me: opposite(theirs), partner: theirs }
  return { me: 'female' as Gender, partner: 'male' as Gender }
})

// 写到 CSS 变量，页面里的 var(--me) / var(--partner) 等自动跟随
watchEffect(() => {
  if (typeof document === 'undefined') return
  const root = document.documentElement.style
  for (const who of ['me', 'partner'] as const) {
    const p = PALETTE[tones.value[who]]
    root.setProperty(`--${who}`, p.color)
    root.setProperty(`--${who}-text`, p.text)
    root.setProperty(`--${who}-bg`, p.bg)
  }
})

/** 给定一人 uid，返回另一人 uid */
const otherUid = (uid: string) => (uid === myUid.value ? partnerUid.value : myUid.value)

const genderOf = (uid: string) => members.value.find((m) => m.userId === uid)?.gender ?? null

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
    genderOf,
    booksLoading,
    bookActionLoading,
    loadBook,
    createBook,
    joinBook,
    leaveBook,
    updateBookSettings,
    updateMyGender,
  }
}
