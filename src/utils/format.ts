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

/** 智能日期：今天 / 昨天 / 前天 / 10月15日 / 跨年时 2025年12月31日 */
export const formatDateLabel = (key: string) => {
  const daysAgo = (n: number) => {
    const d = new Date()
    d.setDate(d.getDate() - n)
    return toDateKey(d)
  }
  if (key === daysAgo(0)) return '今天'
  if (key === daysAgo(1)) return '昨天'
  if (key === daysAgo(2)) return '前天'
  const [y, m, d] = key.split('-').map(Number)
  return y === new Date().getFullYear() ? `${m}月${d}日` : `${y}年${m}月${d}日`
}

/**
 * 紧凑金额：≥ 1 万显示成「¥1.2万」，用在格子、标注、小计这类地方；
 * 单笔账单和结算金额仍用 formatMoney 显示完整数字。
 */
export const formatMoneyShort = (value: number) => {
  const abs = Math.abs(value)
  if (abs < 10000) return formatMoney(value)
  const { symbol } = activeCurrencyInfo.value
  const wan = abs / 10000
  const text = wan >= 100 ? Math.round(wan).toString() : wan.toFixed(1).replace(/\.0$/, '')
  return `${value < 0 ? '-' : ''}${symbol}${text}万`
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
