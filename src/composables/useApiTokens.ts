import { ref } from 'vue'
import { isDemoMode } from '../lib/demo'
import { supabase } from '../lib/supabase'
import { formatSupabaseError, useBooks } from './useBooks'

/** 给 agent 用的 API 密钥（明文只在生成时给一次，这里只有名字和前几位） */
export interface ApiToken {
  id: string
  name: string
  prefix: string
  createdAt: string
  lastUsedAt: string | null
}

const tokens = ref<ApiToken[]>([])
const loading = ref(false)
const { currentBook } = useBooks()

const normalize = (row: Record<string, unknown>): ApiToken => ({
  id: String(row.id),
  name: String(row.name ?? ''),
  prefix: String(row.prefix ?? ''),
  createdAt: String(row.created_at ?? ''),
  lastUsedAt: row.last_used_at ? String(row.last_used_at) : null,
})

const load = async () => {
  if (isDemoMode || !supabase) return
  loading.value = true
  const { data, error } = await supabase
    .from('api_tokens')
    .select('id, name, prefix, created_at, last_used_at')
    .is('revoked_at', null)
    .order('created_at', { ascending: false })
  loading.value = false
  if (!error) tokens.value = (data ?? []).map(normalize)
}

/** 生成密钥：返回明文，只有这一次能看到 */
const create = async (name: string): Promise<{ error: Error | null; token?: string }> => {
  const bookId = currentBook.value?.id
  if (!bookId) return { error: new Error('还没有加入账本。') }
  if (isDemoMode || !supabase) {
    const token = `cek_demo${crypto.randomUUID().replace(/-/g, '')}`
    tokens.value = [{ id: crypto.randomUUID(), name, prefix: token.slice(0, 10), createdAt: new Date().toISOString(), lastUsedAt: null }, ...tokens.value]
    return { error: null, token }
  }
  const { data, error } = await supabase.rpc('create_api_token', { p_book_id: bookId, p_name: name })
  if (error) return { error: new Error(formatSupabaseError(error, '生成失败，请稍后重试。')) }
  await load()
  return { error: null, token: String(data) }
}

const revoke = async (id: string) => {
  if (isDemoMode || !supabase) {
    tokens.value = tokens.value.filter((t) => t.id !== id)
    return { error: null }
  }
  const { error } = await supabase.rpc('revoke_api_token', { p_id: id })
  if (error) return { error: new Error(formatSupabaseError(error, '撤销失败，请稍后重试。')) }
  tokens.value = tokens.value.filter((t) => t.id !== id)
  return { error: null }
}

export const useApiTokens = () => ({ tokens, loading, load, create, revoke })
