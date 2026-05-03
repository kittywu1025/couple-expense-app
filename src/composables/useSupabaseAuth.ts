import { ref, onMounted } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseEnabled, supabase } from '../lib/supabase'
import { clearSyncWarning, setSyncWarning } from './useRuntimeStatus'

export const authUser = ref<User | null>(null)
export const authSession = ref<Session | null>(null)
export const authLoading = ref(isSupabaseEnabled)
let authInitialized = false

const toChineseAuthError = (message?: string | null) => {
  const text = (message || '').toLowerCase()

  if (!text) return '认证失败，请稍后重试。'
  if (text.includes('invalid login credentials')) return '邮箱或密码错误。'
  if (text.includes('email not confirmed')) return '邮箱尚未确认，请先前往邮箱完成确认。'
  if (text.includes('user already registered')) return '该邮箱已经注册，请直接登录。'
  if (text.includes('password should be at least')) return '密码至少需要 6 位。'
  if (text.includes('signup is disabled')) return '当前暂未开放注册。'
  if (text.includes('invalid email')) return '邮箱格式不正确。'
  if (text.includes('email rate limit exceeded')) return '邮件发送过于频繁，请稍后再试。'
  if (text.includes('too many requests')) return '请求过于频繁，请稍后再试。'
  if (text.includes('network')) return '网络异常，请检查连接后重试。'

  return '认证失败，请稍后重试。'
}

const getAuthErrorReason = (message?: string | null) => {
  const text = (message || '').toLowerCase()

  if (!text) return 'unknown'
  if (text.includes('user already registered') || text.includes('already exists')) return 'email_exists'
  if (text.includes('invalid login credentials')) return 'invalid_credentials'
  if (text.includes('email not confirmed')) return 'email_not_confirmed'
  if (text.includes('password should be at least')) return 'weak_password'
  if (text.includes('invalid email')) return 'invalid_email'
  if (text.includes('email rate limit exceeded') || text.includes('too many requests')) return 'rate_limited'
  if (text.includes('network')) return 'network'

  return 'unknown'
}

const isExistingSignupResponse = (data: { user?: User | null; session?: Session | null } | null) => {
  if (!data?.user || data.session) return false

  const identities = (data.user as User & { identities?: ArrayLike<unknown> | null }).identities
  return Array.isArray(identities) && identities.length === 0
}

export function useSupabaseAuth() {
  const refreshSession = async () => {
    if (!supabase) {
      authLoading.value = false
      authUser.value = null
      authSession.value = null
      clearSyncWarning()
      return
    }

    try {
      const { data, error } = await supabase.auth.getSession()
      if (error) {
        throw error
      }
      authUser.value = data.session?.user ?? null
      authSession.value = data.session
      clearSyncWarning()
    } catch (error) {
      console.error('Supabase session 初始化失败：', error)
      authUser.value = null
      authSession.value = null
      setSyncWarning('云端同步暂时不可用，当前已自动切换到本地数据。')
    } finally {
      authLoading.value = false
    }
  }

  const signInWithEmail = async (email: string, redirectTo?: string) => {
    if (!supabase) {
      return {
        data: null,
        error: new Error('当前未配置 Supabase，应用正使用本地模式。'),
      }
    }

    const { data, error } = await supabase.auth.signInWithOtp({
      email,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    })

    return {
      data,
      error: error ? new Error(toChineseAuthError(error.message)) : null,
      reason: error ? getAuthErrorReason(error.message) : null,
    }
  }

  const signInWithPassword = async (email: string, password: string) => {
    if (!supabase) {
      return {
        data: null,
        error: new Error('当前未配置 Supabase，应用正使用本地模式。'),
      }
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    return {
      data,
      error: error ? new Error(toChineseAuthError(error.message)) : null,
      reason: error ? getAuthErrorReason(error.message) : null,
    }
  }

  const signUpWithPassword = async (email: string, password: string, redirectTo?: string) => {
    if (!supabase) {
      return {
        data: null,
        error: new Error('当前未配置 Supabase，应用正使用本地模式。'),
      }
    }

    const { data, error } = await supabase.auth.signUp({
      email,
      password,
      options: redirectTo ? { emailRedirectTo: redirectTo } : undefined,
    })

    if (error) {
      return {
        data,
        error: new Error(toChineseAuthError(error.message)),
        reason: getAuthErrorReason(error.message),
      }
    }

    if (isExistingSignupResponse(data)) {
      return {
        data,
        error: null,
        reason: 'email_exists',
      }
    }

    return {
      data,
      error: null,
      reason: null,
    }
  }

  const signOut = async () => {
    if (!supabase) {
      authUser.value = null
      authSession.value = null
      return { error: null }
    }

    const { error } = await supabase.auth.signOut()
    if (!error) {
      authUser.value = null
      authSession.value = null
    }
    return { error }
  }

  const updatePassword = async (password: string) => {
    if (!supabase) {
      return {
        data: null,
        error: new Error('当前未配置 Supabase，应用正使用本地模式。'),
      }
    }

    const { data, error } = await supabase.auth.updateUser({
      password,
    })

    return {
      data,
      error: error ? new Error(toChineseAuthError(error.message)) : null,
      reason: error ? getAuthErrorReason(error.message) : null,
    }
  }

  if (!authInitialized) {
    authInitialized = true
    onMounted(() => {
      if (!supabase) {
        authLoading.value = false
        return
      }

      refreshSession()
      supabase.auth.onAuthStateChange((_, session) => {
        authUser.value = session?.user ?? null
        authSession.value = session
        authLoading.value = false
        clearSyncWarning()
      })
    })
  }

  return {
    authUser,
    authSession,
    authLoading,
    isSupabaseEnabled,
    signInWithEmail,
    signInWithPassword,
    signUpWithPassword,
    signOut,
    updatePassword,
    refreshSession,
  }
}
