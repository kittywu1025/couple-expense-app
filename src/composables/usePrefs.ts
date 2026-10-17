import { ref, watch, watchEffect } from 'vue'

/** 本机偏好设置（只存在这台设备上，不同步给对方） */
export type HomeCard = 'together' | 'mine' | 'income'

export const HOME_CARDS: { key: HomeCard; label: string }[] = [
  { key: 'together', label: '我们这个月花了' },
  { key: 'mine', label: '我这个月花了' },
  { key: 'income', label: '我这个月收入' },
]

/** 金额配色：默认支出绿、收入红；可以在设置里颠倒 */
export type AmountColors = 'expense-green' | 'expense-red'

export const AMOUNT_COLOR_OPTIONS: { key: AmountColors; label: string }[] = [
  { key: 'expense-green', label: '支出绿 · 收入红（默认）' },
  { key: 'expense-red', label: '支出红 · 收入绿' },
]

const GREEN = { main: '#2db87a', soft: '#9fdcc0' }
const RED = { main: '#ff3b30', soft: '#ffb3ae' }

const KEY = 'couple-expense-prefs'

interface Prefs {
  homeCard: HomeCard
  amountColors: AmountColors
}

const load = (): Prefs => {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return {
      homeCard: HOME_CARDS.some((c) => c.key === raw.homeCard) ? raw.homeCard : 'together',
      amountColors: raw.amountColors === 'expense-red' ? 'expense-red' : 'expense-green',
    }
  } catch {
    return { homeCard: 'together', amountColors: 'expense-green' }
  }
}

const initial = load()

/** 首页默认停在第几张卡片 */
export const homeCardPref = ref<HomeCard>(initial.homeCard)
/** 金额颜色方案 */
export const amountColorsPref = ref<AmountColors>(initial.amountColors)

watch([homeCardPref, amountColorsPref], ([homeCard, amountColors]) => {
  try {
    localStorage.setItem(KEY, JSON.stringify({ homeCard, amountColors }))
  } catch {
    // 无痕模式写不进去就算了，下次还是默认值
  }
})

// 写到 CSS 变量，全 App 的支出 / 收入颜色一起跟着变
watchEffect(() => {
  if (typeof document === 'undefined') return
  const [expense, income] = amountColorsPref.value === 'expense-red' ? [RED, GREEN] : [GREEN, RED]
  const root = document.documentElement.style
  root.setProperty('--expense', expense.main)
  root.setProperty('--expense-soft', expense.soft)
  root.setProperty('--income', income.main)
  root.setProperty('--income-soft', income.soft)
})
