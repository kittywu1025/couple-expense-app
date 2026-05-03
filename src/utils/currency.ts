import type { Expense, SupportedCurrency } from '../types'

export const SUPPORTED_CURRENCIES: Array<{
  code: SupportedCurrency
  label: string
  locale: string
}> = [
  { code: 'JPY', label: '日元', locale: 'ja-JP' },
  { code: 'CNY', label: '人民币', locale: 'zh-CN' },
  { code: 'USD', label: '美元', locale: 'en-US' },
  { code: 'KRW', label: '韩元', locale: 'ko-KR' },
  { code: 'EUR', label: '欧元', locale: 'de-DE' },
]

const currencyMetaMap = SUPPORTED_CURRENCIES.reduce<Record<SupportedCurrency, { label: string; locale: string }>>(
  (result, item) => {
    result[item.code] = { label: item.label, locale: item.locale }
    return result
  },
  {
    JPY: { label: '日元', locale: 'ja-JP' },
    CNY: { label: '人民币', locale: 'zh-CN' },
    USD: { label: '美元', locale: 'en-US' },
    KRW: { label: '韩元', locale: 'ko-KR' },
    EUR: { label: '欧元', locale: 'de-DE' },
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
) =>
  new Intl.NumberFormat(currencyMetaMap[currency].locale, {
    style: 'currency',
    currency,
    maximumFractionDigits: currency === 'JPY' || currency === 'KRW' ? 0 : 2,
    ...options,
  }).format(value)

export const getExpenseAmountLabel = (expense: Expense) => {
  const baseAmount = formatCurrency(expense.amount, expense.baseCurrency)
  if (expense.originalCurrency === expense.baseCurrency) {
    return baseAmount
  }

  const originalAmount = formatCurrency(expense.originalAmount, expense.originalCurrency)
  return `${originalAmount} ${expense.originalCurrency} ≈ ${baseAmount} ${expense.baseCurrency}`
}
