import { computed, ref } from 'vue'
import type { CurrencyCode } from '../types'
import { DEFAULT_CURRENCY, currencyInfo } from './currency'

/** 当前账本的货币，由 useBooks 同步 */
export const activeCurrency = ref<CurrencyCode>(DEFAULT_CURRENCY)
export const activeCurrencyInfo = computed(() => currencyInfo(activeCurrency.value))

export const formatMoney = (value: number) => {
  const { symbol, decimals } = activeCurrencyInfo.value
  // 日元等通常不带小数，但用户输入了小数就照实显示（最多两位）
  const hasFraction = Math.abs(value - Math.round(value)) > 0.004
  const text = value.toLocaleString('ja-JP', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: hasFraction ? Math.max(decimals, 2) : decimals,
  })
  return `${symbol}${text}`
}

export const toDateKey = (d: Date) => {
  const y = d.getFullYear()
  const m = String(d.getMonth() + 1).padStart(2, '0')
  const day = String(d.getDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

export const todayKey = () => toDateKey(new Date())

export const formatDateLabel = (key: string) => {
  const today = todayKey()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (key === today) return '今天'
  if (key === toDateKey(y)) return '昨天'
  const [, m, d] = key.split('-')
  return `${Number(m)}月${Number(d)}日`
}

const WEEKDAYS = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']

/** 'YYYY-MM-DD' → '周五' */
export const formatWeekday = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return WEEKDAYS[new Date(y, m - 1, d).getDay()]
}

/** 'YYYY-MM-DD' → '2026年10月17日 周六' */
export const formatFullDate = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return `${y}年${m}月${d}日 ${formatWeekday(key)}`
}
