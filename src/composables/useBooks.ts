import { computed, ref, watch, watchEffect } from 'vue'
import { supabase } from '../lib/supabase'
import { demoBook, demoMembers, isDemoMode } from '../lib/demo'
import type { Book, BookMember, CustomCategory, Gender, MemberColor } from '../types'
import { customCategories } from '../utils/categories'
import { authDisplayName, authGender, authUser } from './useSupabaseAuth'
import { defaultColorFor, firstFreeColor, isMemberColor, swatchOf } from '../utils/palette'
import { DEFAULT_CURRENCY, isCurrencyCode } from '../utils/currency'
import { activeCurrency } from '../utils/format'
import { setSyncWarning } from './useRuntimeStatus'

const currentBook = ref<Book | null>(null)
const members = ref<BookMember[]>([])
const booksLoading = ref(false)
const bookActionLoading = ref(false)

const normalizeCustomCategories = (raw: unknown): CustomCategory[] => {
  if (!Array.isArray(raw)) return []
  return raw
    .filter((c): c is Record<string, unknown> => !!c && typeof c === 'object' && typeof c.name === 'string')
    .map((c) => ({
      key: String(c.key ?? c.name),
      name: String(c.name),
      icon: String(c.icon ?? 'sparkles'),
      color: String(c.color ?? '#B0B3C0'),
      kind: c.kind === 'income' ? ('income' as const) : ('expense' as const),
      subs: Array.isArray(c.subs)
        ? c.subs
            .filter((s): s is Record<string, unknown> => !!s && typeof s === 'object' && typeof s.name === 'string')
            .map((s) => ({ name: String(s.name), icon: String(s.icon ?? 'sparkles') }))
        : [],
    }))
}

const normalizeBook = (row: Record<string, unknown>): Book => ({
  id: String(row.id),
  inviteCode: String(row.invite_code ?? ''),
  settleDay: Number(row.settle_day ?? 1),
  defaultRatio: Number(row.default_ratio ?? 5),
  currency: isCurrencyCode(row.currency) ? row.currency : DEFAULT_CURRENCY,
  customCategories: normalizeCustomCategories(row.custom_categories),
  createdBy: String(row.created_by ?? ''),
  createdAt: String(row.created_at ?? ''),
})

const normalizeMember = (row: Record<string, unknown>): BookMember => ({
  id: String(row.id),
  bookId: String(row.book_id),
  userId: String(row.user_id),
  displayName: String(row.display_name || '未命名'),
  gender: row.gender === 'female' || row.gender === 'male' ? row.gender : null,
  color: isMemberColor(row.color) ? row.color : null,
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
  // 前端已更新、数据库还没执行对应的 SQL（缺列 / 缺函数）
  if (
    (text.includes('column') && (text.includes('does not exist') || text.includes('schema cache'))) ||
    (text.includes('function') && text.includes('does not exist'))
  ) {
    return '数据库还没更新，请在 Supabase 按顺序执行 supabase/migrations 里最新的 SQL。'
  }
  if (text.includes('permission denied') || text.includes('row-level security')) {
    return '当前账号没有权限，请检查 Supabase RLS 策略。'
  }
  if (text.includes('network') || text.includes('fetch')) return '网络连接失败，请稍后重试。'
  if (text.includes('idx_book_members_book_color')) return '对方已选择该颜色，请重新选择'
  for (const known of ['对方已选择该颜色，请重新选择', '性别注册后不可修改', '这个颜色对方在用了', '演示模式下不能退出账本', '邀请码不存在', '你已经在这个账本中', '这个账本已经满两人了', '邀请码生成失败', '自己记的账要等 TA 确认', '只有 TA 能确认这笔借款', '只有借出的人能确认还款', '只有先垫钱的人能标记已收到']) {
    if (raw.includes(known)) return known
  }
  // 不认识的错误把原文带上一小段，方便截图反馈
  return `${fallback}（${raw.slice(0, 80)}）`
}

const loadMembers = async (bookId: string) => {
  if (!supabase) return
  const { data, error } = await supabase
    .from('book_members')
    .select('id, book_id, user_id, display_name, gender, color, joined_at')
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
      .select('book:books(id, invite_code, settle_day, default_ratio, currency, custom_categories, created_by, created_at)')
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

const createBook = (gender: Gender, color: MemberColor) =>
  runBookAction(async () => {
    if (!supabase) throw new Error('当前未配置 Supabase。')
    const { error } = await supabase.rpc('create_book', {
      p_display_name: authDisplayName.value,
      p_gender: gender,
      p_color: color,
    })
    if (error) throw error
    await loadBook()
  }, '创建账本失败，请稍后重试。')

const joinBook = (inviteCode: string, gender: Gender, color: MemberColor) =>
  runBookAction(async () => {
    if (!supabase) throw new Error('当前未配置 Supabase。')
    const { error } = await supabase.rpc('join_book', {
      p_invite_code: inviteCode.trim().toUpperCase(),
      p_display_name: authDisplayName.value,
      p_gender: gender,
      p_color: color,
    })
    if (error) throw error
    await loadBook()
  }, '加入账本失败，请稍后重试。')

/** 加入前查看对方已经选了的颜色（撞色时让用户重选） */
const takenColorsForInvite = async (inviteCode: string): Promise<MemberColor[]> => {
  if (!supabase) return []
  const { data, error } = await supabase.rpc('invite_taken_colors', { p_invite_code: inviteCode.trim().toUpperCase() })
  if (error) {
    console.error('读取对方颜色失败：', error)
    return []
  }
  return ((data ?? []) as unknown[]).filter(isMemberColor)
}

const leaveBook = () =>
  runBookAction(async () => {
    if (isDemoMode) throw new Error('演示模式下不能退出账本')
    if (!supabase || !currentBook.value) return
    const { error } = await supabase.rpc('leave_book', { p_book_id: currentBook.value.id })
    if (error) throw error
    currentBook.value = null
    members.value = []
  }, '退出账本失败，请稍后重试。')

const updateBookSettings = (patch: Partial<Pick<Book, 'settleDay' | 'defaultRatio' | 'currency' | 'customCategories'>>) =>
  runBookAction(async () => {
    if (isDemoMode && currentBook.value) {
      currentBook.value = { ...currentBook.value, ...patch }
      return
    }
    if (!supabase || !currentBook.value) return
    const payload: Record<string, unknown> = {}
    if (patch.settleDay !== undefined) payload.settle_day = patch.settleDay
    if (patch.defaultRatio !== undefined) payload.default_ratio = patch.defaultRatio
    if (patch.currency !== undefined) payload.currency = patch.currency
    if (patch.customCategories !== undefined) payload.custom_categories = patch.customCategories
    const { data, error } = await supabase
      .from('books')
      .update(payload)
      .eq('id', currentBook.value.id)
      .select()
      .single()
    if (error) throw error
    currentBook.value = normalizeBook(data)
  }, '保存设置失败，请稍后重试。')

/** 性别注册后不可修改：只有还没设置过时才写入 */
const updateMyGender = (gender: Gender) =>
  runBookAction(async () => {
    const mine = members.value.find((m) => m.userId === authUser.value?.id)
    if (!mine) return
    if (mine.gender && mine.gender !== gender) throw new Error('性别注册后不可修改')
    if (!isDemoMode) {
      if (!supabase) return
      const { error } = await supabase.from('book_members').update({ gender }).eq('id', mine.id)
      if (error) throw error
    }
    members.value = members.value.map((m) => (m.id === mine.id ? { ...m, gender } : m))
  }, '保存性别失败，请稍后重试。')

const updateMyName = (displayName: string) =>
  runBookAction(async () => {
    const mine = members.value.find((m) => m.userId === authUser.value?.id)
    if (!mine) return
    if (!isDemoMode) {
      if (!supabase) return
      const { error } = await supabase.from('book_members').update({ display_name: displayName }).eq('id', mine.id)
      if (error) throw error
    }
    members.value = members.value.map((m) => (m.id === mine.id ? { ...m, displayName } : m))
  }, '保存昵称失败，请稍后重试。')

const updateMyColor = (color: MemberColor) =>
  runBookAction(async () => {
    const mine = members.value.find((m) => m.userId === authUser.value?.id)
    if (!mine) return
    const theirs = members.value.find((m) => m.userId !== authUser.value?.id)
    if (theirs?.color === color) throw new Error('对方已选择该颜色，请重新选择')
    if (!isDemoMode) {
      if (!supabase) return
      const { error } = await supabase.from('book_members').update({ color }).eq('id', mine.id)
      if (error) throw error
    }
    members.value = members.value.map((m) => (m.id === mine.id ? { ...m, color } : m))
  }, '保存颜色失败，请稍后重试。')

watch(() => authUser.value?.id, loadBook, { immediate: true })
watch(
  () => currentBook.value?.customCategories,
  (list) => (customCategories.value = list ?? []),
  { immediate: true },
)
watch(
  () => currentBook.value?.currency,
  (code) => (activeCurrency.value = code ?? DEFAULT_CURRENCY),
  { immediate: true },
)

const me = computed(() => members.value.find((m) => m.userId === authUser.value?.id) ?? null)
const partner = computed(() => members.value.find((m) => m.userId !== authUser.value?.id) ?? null)
const myUid = computed(() => authUser.value?.id ?? '')
const partnerUid = computed(() => partner.value?.userId ?? '')

/**
 * 我和对方的标识色：用各自选的颜色，没选过的按性别给默认色（女粉 / 男蓝）。
 * 万一撞色（老数据），对方自动换成下一个可用色，保证两人能区分。
 */
const tones = computed(() => {
  const mine: MemberColor = me.value?.color ?? defaultColorFor(me.value?.gender ?? authGender.value)
  const theirsWanted: MemberColor = partner.value?.color ?? defaultColorFor(partner.value?.gender ?? null)
  return { me: mine, partner: firstFreeColor(theirsWanted, mine) }
})

// 写到 CSS 变量，页面里的 var(--me) / var(--partner) 等自动跟随
watchEffect(() => {
  if (typeof document === 'undefined') return
  const root = document.documentElement.style
  for (const who of ['me', 'partner'] as const) {
    const p = swatchOf(tones.value[who])
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
    updateMyColor,
    updateMyName,
    takenColorsForInvite,
    tones,
  }
}
