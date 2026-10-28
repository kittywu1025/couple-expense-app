import { ref } from 'vue'

/**
 * 邀请链接：https://<站点>/?invite=ABC234
 * 对方打开链接 → 登录（Google 跳转会丢掉网址参数，所以先存到本机）→ 加入账本页自动填好邀请码。
 */
const KEY = 'couple-expense-pending-invite'
const CODE_RE = /^[A-Z0-9]{6}$/

const read = () => {
  try {
    return localStorage.getItem(KEY)
  } catch {
    return null
  }
}

export const pendingInvite = ref<string | null>(read())

/** 启动时调用：把网址里的邀请码存起来，并从地址栏去掉 */
export const captureInviteFromUrl = () => {
  if (typeof window === 'undefined') return
  const url = new URL(window.location.href)
  const code = url.searchParams.get('invite')?.trim().toUpperCase()
  if (!code) return
  if (CODE_RE.test(code)) {
    pendingInvite.value = code
    try {
      localStorage.setItem(KEY, code)
    } catch {
      // 存不了也没关系，至少这次打开还在内存里
    }
  }
  url.searchParams.delete('invite')
  window.history.replaceState(null, '', url.pathname + url.search + url.hash)
}

export const clearPendingInvite = () => {
  pendingInvite.value = null
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}

/**
 * 邀请链接永远指向正式站点：就算是在本机预览（localhost / 局域网 IP）里点的邀请，
 * 发出去的也是对方能打开的地址。可以用 VITE_PUBLIC_URL 覆盖。
 */
const PUBLIC_URL = ((import.meta.env.VITE_PUBLIC_URL as string | undefined) || 'https://couplecost.kittywu.fyi').replace(/\/+$/, '')

export const inviteLinkFor = (code: string) => `${PUBLIC_URL}/?invite=${code}`
