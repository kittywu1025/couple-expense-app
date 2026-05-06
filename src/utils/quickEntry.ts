import type { SupportedCurrency } from '../types'

type QuickEntryIssue = 'missing-date' | 'missing-amount' | 'missing-title' | 'unsupported-income' | 'missing-rate'

export interface ParsedQuickEntry {
  source: string
  title: string
  date: string | null
  originalAmount: number | null
  originalCurrency: SupportedCurrency
  category: string
  issues: QuickEntryIssue[]
}

const DATE_PATTERNS = [
  {
    regex: /(\d{4})[/-](\d{1,2})[/-](\d{1,2})/,
    parse: (match: RegExpMatchArray) => formatDate(Number(match[1]), Number(match[2]), Number(match[3])),
  },
  {
    regex: /(\d{1,2})月(\d{1,2})日/,
    parse: (match: RegExpMatchArray, baseDate: Date) =>
      formatDate(baseDate.getFullYear(), Number(match[1]), Number(match[2])),
  },
  {
    regex: /(\d{1,2})\/(\d{1,2})/,
    parse: (match: RegExpMatchArray, baseDate: Date) =>
      formatDate(baseDate.getFullYear(), Number(match[1]), Number(match[2])),
  },
]

const INCOME_KEYWORDS = ['红包', '兼职', '家人打款', '工资', '收入']

const CATEGORY_KEYWORDS: Array<{ category: string; keywords: string[] }> = [
  { category: 'medical', keywords: ['药', '医院', '牙', '药店'] },
  { category: 'groceries', keywords: ['超市', '食材', '菜', '肉', '水果'] },
  { category: 'dining-out', keywords: ['外食', '饭', '拉面', '奶茶', '咖啡'] },
  { category: 'transport', keywords: ['电车', '公交', '交通', 'ic'] },
  { category: 'rent', keywords: ['房租', '家賃'] },
  { category: 'water', keywords: ['水费'] },
  { category: 'electricity', keywords: ['电费'] },
  { category: 'gas', keywords: ['煤气', 'ガス'] },
  { category: 'internet', keywords: ['网费', '网络'] },
  { category: 'study-books', keywords: ['书', '教材', '打印'] },
  { category: 'tuition', keywords: ['学费'] },
  { category: 'beauty', keywords: ['衣服', '美容', '化妆'] },
  { category: 'social', keywords: ['游戏', '电影', '展', '社交'] },
]

const formatDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`

const subtractDays = (baseDate: Date, days: number) => {
  const value = new Date(baseDate)
  value.setDate(value.getDate() - days)
  return formatDate(value.getFullYear(), value.getMonth() + 1, value.getDate())
}

const parseDateToken = (source: string, baseDate: Date) => {
  if (source.includes('今天')) {
    return {
      date: formatDate(baseDate.getFullYear(), baseDate.getMonth() + 1, baseDate.getDate()),
      nextSource: source.replace('今天', '').trim(),
    }
  }

  if (source.includes('昨天')) {
    return {
      date: subtractDays(baseDate, 1),
      nextSource: source.replace('昨天', '').trim(),
    }
  }

  for (const pattern of DATE_PATTERNS) {
    const matched = source.match(pattern.regex)
    if (matched) {
      return {
        date: pattern.parse(matched, baseDate),
        nextSource: source.replace(matched[0], '').trim(),
      }
    }
  }

  return {
    date: null,
    nextSource: source.trim(),
  }
}

const parseAmountToken = (source: string) => {
  const patterns: Array<{
    regex: RegExp
    currency: SupportedCurrency
    amountIndex: number
  }> = [
    { regex: /(CNY|人民币|元)\s*([0-9][0-9,]*(?:\.\d+)?)/i, currency: 'CNY', amountIndex: 2 },
    { regex: /([0-9][0-9,]*(?:\.\d+)?)\s*(CNY|人民币|元)/i, currency: 'CNY', amountIndex: 1 },
    { regex: /(JPY|日元|円)\s*([0-9][0-9,]*(?:\.\d+)?)/i, currency: 'JPY', amountIndex: 2 },
    { regex: /([0-9][0-9,]*(?:\.\d+)?)\s*(JPY|日元|円)/i, currency: 'JPY', amountIndex: 1 },
  ]

  for (const pattern of patterns) {
    const matched = source.match(pattern.regex)
    if (!matched) continue
    return {
      amount: Number(matched[pattern.amountIndex].replace(/,/g, '')),
      currency: pattern.currency,
      nextSource: source.replace(matched[0], '').trim(),
    }
  }

  const plainMatched = source.match(/([0-9][0-9,]*(?:\.\d+)?)(?!.*[0-9])/)
  if (plainMatched) {
    return {
      amount: Number(plainMatched[1].replace(/,/g, '')),
      currency: null,
      nextSource: source.replace(plainMatched[0], '').trim(),
    }
  }

  return {
    amount: null,
    currency: null,
    nextSource: source.trim(),
  }
}

const guessCategory = (title: string) => {
  const normalized = title.toLowerCase()
  const matched = CATEGORY_KEYWORDS.find((item) => item.keywords.some((keyword) => normalized.includes(keyword)))
  return matched?.category || 'misc'
}

const normalizeTitle = (value: string) =>
  value
    .replace(/^[：:、，,\s]+/, '')
    .replace(/[：:、，,\s]+$/, '')
    .replace(/\s+/g, ' ')
    .trim()

export function parseQuickExpenseText(input: string, options?: { baseDate?: Date; defaultCurrency?: SupportedCurrency }) {
  const baseDate = options?.baseDate ?? new Date()
  const defaultCurrency = options?.defaultCurrency ?? 'JPY'
  const parts = input
    .split(/[\n，,、；;]+/)
    .map((item) => item.trim())
    .filter(Boolean)

  const results: ParsedQuickEntry[] = []
  let sharedDate: string | null = null

  for (const part of parts) {
    const issues: QuickEntryIssue[] = []
    const dateResult = parseDateToken(part, baseDate)
    const amountResult = parseAmountToken(dateResult.nextSource)
    const date = dateResult.date || sharedDate
    if (dateResult.date) {
      sharedDate = dateResult.date
    }

    const title = normalizeTitle(amountResult.nextSource)
    const originalCurrency = amountResult.currency || defaultCurrency

    if (!date) {
      issues.push('missing-date')
    }
    if (!(amountResult.amount && amountResult.amount > 0)) {
      issues.push('missing-amount')
    }
    if (!title) {
      issues.push('missing-title')
    }
    if (INCOME_KEYWORDS.some((keyword) => title.includes(keyword))) {
      issues.push('unsupported-income')
    }
    if (originalCurrency !== defaultCurrency) {
      issues.push('missing-rate')
    }

    results.push({
      source: part,
      title,
      date,
      originalAmount: amountResult.amount && amountResult.amount > 0 ? amountResult.amount : null,
      originalCurrency,
      category: guessCategory(title),
      issues,
    })
  }

  return results
}

