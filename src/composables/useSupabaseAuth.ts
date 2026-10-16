import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseEnabled, supabase } from '../lib/supabase'

export const authUser = ref<User | null>(null)
export const authSession = ref<Session | null>(null)
export const authLoading = ref(isSupabaseEnabled)
let authInitialized = false

const initAuth = () => {
  if (authInitialized) return
  authInitialized = true

  if (!supabase) {
    authLoading.value = false
    return
  }

  supabase.auth
    .getSession()
    .then(({ data, error }) => {
      if (error) throw error
      authSession.value = data.session
      authUser.value = data.session?.user ?? null
    })
    .catch((error) => {
      console.error('Supabase session 初始化失败：', error)
      authSession.value = null
      authUser.value = null
    })
    .finally(() => {
      authLoading.value = false
    })

  supabase.auth.onAuthStateChange((_, session) => {
    authSession.value = session
    authUser.value = session?.user ?? null
    authLoading.value = false
  })
}

/** Google 账号上的名字，取不到时退回邮箱前缀 */
export const authDisplayName = computed(() => {
  const user = authUser.value
  if (!user) return ''
  const meta = user.user_metadata ?? {}
  return String(meta.full_name || meta.name || user.email?.split('@')[0] || '我')
})

export function useSupabaseAuth() {
  initAuth()

  const signInWithGoogle = async () => {
    if (!supabase) return { error: new Error('当前未配置 Supabase。') }
    const { error } = await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: { redirectTo: window.location.origin + window.location.pathname },
    })
    return { error: error ? new Error('Google 登录失败，请稍后重试。') : null }
  }

  const signOut = async () => {
    if (!supabase) return { error: null }
    const { error } = await supabase.auth.signOut()
    if (!error) {
      authUser.value = null
      authSession.value = null
    }
    return { error }
  }

  return {
    authUser,
    authSession,
    authLoading,
    authDisplayName,
    isSupabaseEnabled,
    signInWithGoogle,
    signOut,
  }
}
