import { computed, ref } from 'vue'
import type { Session, User } from '@supabase/supabase-js'
import { isSupabaseEnabled, supabase } from '../lib/supabase'
import { demoUser, isDemoMode } from '../lib/demo'
import type { Gender, MemberColor } from '../types'
import { isMemberColor } from '../utils/palette'

export const authUser = ref<User | null>(null)
export const authSession = ref<Session | null>(null)
export const authLoading = ref(isSupabaseEnabled)
let authInitialized = false

const initAuth = () => {
  if (authInitialized) return
  authInitialized = true

  if (isDemoMode) {
    authUser.value = demoUser as unknown as User
    authLoading.value = false
    return
  }

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
  // 用户在个人资料里改过的昵称优先，其次是 Google 账号名
  return String(meta.nickname || meta.full_name || meta.name || user.email?.split('@')[0] || '我')
})

/** 注册时选择的性别，存在 Supabase 用户资料（user_metadata）里 */
export const authGender = computed<Gender | null>(() => {
  const g = authUser.value?.user_metadata?.gender
  return g === 'female' || g === 'male' ? g : null
})

/** 注册时选的标识色，加入账本时作为首选（被对方占用会自动换） */
export const authColor = computed<MemberColor | null>(() => {
  const c = authUser.value?.user_metadata?.color
  return isMemberColor(c) ? c : null
})

export const updateProfile = async (patch: { gender?: Gender; color?: MemberColor; nickname?: string }) => {
  const user = authUser.value
  if (!user) return { error: new Error('请先登录') }
  if (isDemoMode || !supabase) {
    authUser.value = { ...user, user_metadata: { ...user.user_metadata, ...patch } }
    return { error: null }
  }
  const { data, error } = await supabase.auth.updateUser({ data: patch })
  if (error) {
    console.error('保存性别失败：', error)
    return { error: new Error('保存失败，请稍后重试。') }
  }
  if (data.user) authUser.value = data.user
  return { error: null }
}

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
      // 退出登录时清掉本机的账单缓存，换人登录不会看到上一个人的数据
      try {
        Object.keys(localStorage)
          .filter((k) => k.startsWith('couple-expense-records:'))
          .forEach((k) => localStorage.removeItem(k))
      } catch {
        // ignore
      }
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
    authGender,
    authColor,
    updateProfile,
    isSupabaseEnabled,
    signInWithGoogle,
    signOut,
  }
}
