import type { Expense, SupportedCurrency } from '../types'

export const SUPPORTED_CURRENCIES: Array<{
  code: SupportedCurrency
  label: string
  locale: string
}> = [
  { code: 'JPY', label: '日元', locale: 'ja-JP' },
  { code: 'CNY', label: '人民币', locale: 'zh-CN' },
]

const currencyMetaMap = SUPPORTED_CURRENCIES.reduce<Record<SupportedCurrency, { label: string; locale: string }>>(
  (result, item) => {
    result[item.code] = { label: item.label, locale: item.locale }
    return result
  },
  {
    JPY: { label: '日元', locale: 'ja-JP' },
    CNY: { label: '人民币', locale: 'zh-CN' },
  }
)

export const normalizeCurrency = (value?: string | null): SupportedCurrency => {
  const normalized = value?.toUpperCase() as SupportedCurrency | undefined
  return currencyMetaMap[normalized || 'JPY'] ? normalized || 'JPY' : 'JPY'
}

export const formatCurrency = (
  value: number,
  currency: SupportedCurrency,
  options?: Intl.NumberFormatOptions
) => {
  const digits = currency === 'JPY' ? 0 : 2
  const formatted = new Intl.NumberFormat(currencyMetaMap[currency].locale, {
    minimumFractionDigits: 0,
    maximumFractionDigits: digits,
    ...options,
  }).format(value)

  return `${currency} ${formatted}`
}

export const getExpenseAmountLabel = (expense: Expense) => {
  const baseAmount = formatCurrency(expense.amount, expense.baseCurrency)
  if (expense.originalCurrency === expense.baseCurrency) {
    return baseAmount
  }

  const originalAmount = formatCurrency(expense.originalAmount, expense.originalCurrency)
  return `${originalAmount} ≈ ${baseAmount}`
}
