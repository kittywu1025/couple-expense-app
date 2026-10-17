import type { CurrencyCode } from '../types'

export interface CurrencyInfo {
  code: CurrencyCode
  name: string
  symbol: string
  decimals: number
}

export const CURRENCIES: CurrencyInfo[] = [
  { code: 'JPY', name: '日元', symbol: '¥', decimals: 0 },
  { code: 'CNY', name: '人民币', symbol: 'CN¥', decimals: 2 },
  { code: 'USD', name: '美元', symbol: '$', decimals: 2 },
  { code: 'KRW', name: '韩元', symbol: '₩', decimals: 0 },
  { code: 'TWD', name: '新台币', symbol: 'NT$', decimals: 0 },
  { code: 'HKD', name: '港币', symbol: 'HK$', decimals: 2 },
]

export const DEFAULT_CURRENCY: CurrencyCode = 'JPY'

export const currencyInfo = (code: string) =>
  CURRENCIES.find((c) => c.code === code) ?? CURRENCIES[0]

export const isCurrencyCode = (code: unknown): code is CurrencyCode =>
  CURRENCIES.some((c) => c.code === code)
