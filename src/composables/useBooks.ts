import { computed, ref, watch } from 'vue'
import { supabase, isSupabaseEnabled } from '../lib/supabase'
import type { Book, BookRole } from '../types'
import { authUser } from './useSupabaseAuth'
import { clearSyncWarning, setSyncWarning } from './useRuntimeStatus'
import { loadJSON, saveJSON } from '../utils/storage'

const LOCAL_BOOK_STORAGE_KEY = 'couple-expense-app-local-book'
const ACTIVE_BOOK_STORAGE_KEY = 'couple-expense-app-active-book-id'

const localFallbackBook: Book = loadJSON<Book>(LOCAL_BOOK_STORAGE_KEY, {
  id: 'local-book',
  name: '本地账本',
  inviteCode: 'LOCAL01',
  createdBy: 'local',
  createdAt: new Date().toISOString(),
})

saveJSON(LOCAL_BOOK_STORAGE_KEY, localFallbackBook)

const books = ref<Book[]>(isSupabaseEnabled ? [] : [localFallbackBook])
const currentBookId = ref<string | null>(isSupabaseEnabled ? null : localFallbackBook.id)
const currentBookRole = ref<BookRole | null>(isSupabaseEnabled ? null : 'owner')
const booksLoading = ref(isSupabaseEnabled)
const bookActionLoading = ref(false)
const bookActionMessage = ref('')
const booksError = ref('')

const normalizeBook = (row: Record<string, unknown>): Book => ({
  id: String(row.id),
  name: String(row.name ?? '情侣账本'),
  inviteCode: String(row.invite_code ?? row.inviteCode ?? ''),
  createdBy: row.created_by ? String(row.created_by) : undefined,
  createdAt: row.created_at ? String(row.created_at) : undefined,
})

const formatSupabaseError = (error: unknown, fallback: string) => {
  if (!error) return fallback

  if (error instanceof Error && error.message) {
    const message = error.message.toLowerCase()
    if (message.includes('relation') && message.includes('does not exist')) {
      return '账本数据表还没有创建，请先在 Supabase 执行 SQL。'
    }
    if (message.includes('permission denied') || message.includes('row-level security')) {
      return '当前账号没有权限操作账本，请检查 Supabase RLS 策略。'
    }
    if (message.includes('network') || message.includes('fetch')) {
      return '网络连接失败，请稍后重试。'
    }
    return error.message
  }

  if (typeof error === 'object') {
    const errorRecord = error as Record<string, unknown>
    const message = typeof errorRecord.message === 'string' ? errorRecord.message : ''
    const details = typeof errorRecord.details === 'string' ? errorRecord.details : ''
    const hint = typeof errorRecord.hint === 'string' ? errorRecord.hint : ''
    const code = typeof errorRecord.code === 'string' ? errorRecord.code : ''
    const raw = [message, details, hint, code].filter(Boolean).join(' | ')
    const rawText = raw.toLowerCase()

    if (rawText.includes('relation') && rawText.includes('does not exist')) {
      return '账本数据表还没有创建，请先在 Supabase 执行 SQL。'
    }
    if (rawText.includes('permission denied') || rawText.includes('row-level security')) {
      return '当前账号没有权限操作账本，请检查 Supabase RLS 策略。'
    }
    if (rawText.includes('duplicate key')) {
      return '你已经在这个账本中。'
    }
    if (rawText.includes('邀请码不存在')) {
      return '邀请码不存在，请检查后重试。'
    }
    if (message) {
      return [message, details, hint, code].filter(Boolean).join(' | ')
    }
  }

  if (typeof error === 'string' && error.trim()) {
    return error
  }

  return fallback
}

const saveActiveBook = (bookId: string | null) => {
  currentBookId.value = bookId
  if (bookId) {
    saveJSON(ACTIVE_BOOK_STORAGE_KEY, bookId)
  }
}

const loadBooks = async () => {
  if (!supabase || !authUser.value?.id) {
    books.value = isSupabaseEnabled ? [] : [localFallbackBook]
    currentBookRole.value = isSupabaseEnabled ? null : 'owner'
    booksError.value = ''
    booksLoading.value = false
    if (!isSupabaseEnabled) {
      saveActiveBook(localFallbackBook.id)
    }
    return
  }

  booksLoading.value = true
  bookActionMessage.value = ''
  booksError.value = ''

  try {
    const { data, error } = await supabase
      .from('book_members')
      .select('role, book:books(id, name, invite_code, created_by, created_at)')
      .eq('user_id', authUser.value.id)
      .order('joined_at', { ascending: true })

    if (error) {
      throw error
    }

    const nextBooks = (data ?? [])
      .map((row) => {
        const rawBook = row.book as Record<string, unknown> | Record<string, unknown>[] | null
        const book = Array.isArray(rawBook) ? rawBook[0] : rawBook
        if (!book) return null
        return {
          book: normalizeBook(book),
          role: (row.role as BookRole) || 'member',
        }
      })
      .filter(Boolean) as Array<{ book: Book; role: BookRole }>

    books.value = nextBooks.map((item) => item.book)

    const persistedActiveId = loadJSON<string | null>(ACTIVE_BOOK_STORAGE_KEY, null)
    const fallbackId = nextBooks[0]?.book.id ?? null
    const matchedActive = nextBooks.find((item) => item.book.id === persistedActiveId)?.book.id
    saveActiveBook(matchedActive || fallbackId)
    currentBookRole.value =
      nextBooks.find((item) => item.book.id === currentBookId.value)?.role ?? null
    clearSyncWarning()
  } catch (error) {
    console.error('加载账本失败：', error)
    books.value = []
    currentBookRole.value = null
    saveActiveBook(null)
    booksError.value = formatSupabaseError(error, '账本信息读取失败，请稍后重试。')
    setSyncWarning(booksError.value)
  } finally {
    booksLoading.value = false
  }
}

const claimLegacyExpenses = async (bookId: string) => {
  if (!supabase || !authUser.value?.id) return

  await supabase
    .from('expenses')
    .update({ book_id: bookId })
    .eq('user_id', authUser.value.id)
    .is('book_id', null)
}

const createBook = async (name: string) => {
  if (!supabase || !authUser.value?.id) return { error: new Error('当前不是云端模式。'), data: null }

  bookActionLoading.value = true
  bookActionMessage.value = ''
  booksError.value = ''

  try {
    const { data, error } = await supabase.rpc('create_book_with_owner', {
      p_name: name.trim() || '我们的账本',
    })

    if (error) {
      throw error
    }

    const createdBook = normalizeBook(
      (Array.isArray(data) ? data[0] : data) as Record<string, unknown>
    )

    await claimLegacyExpenses(createdBook.id)
    await loadBooks()
    saveActiveBook(createdBook.id)
    currentBookRole.value = 'owner'
    booksError.value = ''
    clearSyncWarning()
    bookActionMessage.value = '账本已创建。'
    return { data: createdBook, error: null }
  } catch (error) {
    console.error('创建账本失败：', error)
    return {
      data: null,
      error: new Error(formatSupabaseError(error, '创建账本失败，请稍后重试。')),
    }
  } finally {
    bookActionLoading.value = false
  }
}

const joinBookByInvite = async (inviteCode: string) => {
  if (!supabase || !authUser.value?.id) return { error: new Error('当前不是云端模式。'), data: null }

  bookActionLoading.value = true
  bookActionMessage.value = ''
  booksError.value = ''

  try {
    const { data, error } = await supabase.rpc('join_book_by_invite', {
      p_invite_code: inviteCode.trim().toUpperCase(),
    })

    if (error) {
      throw error
    }

    const joinedBook = normalizeBook((Array.isArray(data) ? data[0] : data) as Record<string, unknown>)
    await loadBooks()
    saveActiveBook(joinedBook.id)
    currentBookRole.value = 'member'
    booksError.value = ''
    clearSyncWarning()
    bookActionMessage.value = '已加入情侣账本。'
    return { data: joinedBook, error: null }
  } catch (error) {
    console.error('加入账本失败：', error)
    return {
      data: null,
      error: new Error(formatSupabaseError(error, '加入账本失败，请稍后重试。')),
    }
  } finally {
    bookActionLoading.value = false
  }
}

watch(
  authUser,
  () => {
    loadBooks()
  },
  { immediate: true }
)

const currentBook = computed(() => books.value.find((book) => book.id === currentBookId.value) ?? null)
const needsBookSetup = computed(() => isSupabaseEnabled && !!authUser.value && !booksLoading.value && !currentBook.value)
const isLocalBookMode = computed(() => !isSupabaseEnabled)

export function useBooks() {
  return {
    books,
    booksError,
    currentBook,
    currentBookId,
    currentBookRole,
    booksLoading,
    bookActionLoading,
    bookActionMessage,
    needsBookSetup,
    isLocalBookMode,
    loadBooks,
    createBook,
    joinBookByInvite,
    saveActiveBook,
  }
}
