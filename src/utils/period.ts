import { toDateKey } from './format'
import { currentPeriodMonth, periodRange, shiftMonth } from './settlement'

export type PeriodMode = 'week' | 'month' | 'year' | 'custom'

export const PERIOD_MODES: { key: PeriodMode; label: string }[] = [
  { key: 'week', label: '周' },
  { key: 'month', label: '月' },
  { key: 'year', label: '年' },
  { key: 'custom', label: '自定义' },
]

/** 统计时间范围：start 含，end 不含（YYYY-MM-DD） */
export interface DateRange {
  start: string
  end: string
}

export interface PeriodState {
  mode: PeriodMode
  /** 月视图：YYYY-MM（按结算日划分周期） */
  month: string
  /** 周视图：该周周一 */
  weekStart: string
  /** 年视图 */
  year: number
  /** 自定义：起止日期（都含） */
  customStart: string
  customEnd: string
}

export const parseKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number)
  return new Date(y, m - 1, d)
}

export const addDays = (key: string, days: number) => {
  const d = parseKey(key)
  d.setDate(d.getDate() + days)
  return toDateKey(d)
}

/** 一周从周一开始 */
export const mondayOf = (key: string) => {
  const d = parseKey(key)
  const offset = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - offset)
  return toDateKey(d)
}

export const initialPeriod = (settleDay: number): PeriodState => {
  const today = toDateKey(new Date())
  return {
    mode: 'month',
    month: currentPeriodMonth(settleDay),
    weekStart: mondayOf(today),
    year: new Date().getFullYear(),
    customStart: toDateKey(new Date(new Date().getFullYear(), new Date().getMonth(), 1)),
    customEnd: today,
  }
}

export const rangeOf = (p: PeriodState, settleDay: number): DateRange => {
  switch (p.mode) {
    case 'week':
      return { start: p.weekStart, end: addDays(p.weekStart, 7) }
    case 'year':
      return { start: `${p.year}-01-01`, end: `${p.year + 1}-01-01` }
    case 'custom':
      return { start: p.customStart, end: addDays(p.customEnd, 1) }
    default:
      return periodRange(p.month, settleDay)
  }
}

const md = (key: string) => {
  const d = parseKey(key)
  return `${d.getMonth() + 1}月${d.getDate()}日`
}

export const titleOf = (p: PeriodState) => {
  switch (p.mode) {
    case 'week':
      return `${md(p.weekStart)} – ${md(addDays(p.weekStart, 6))}`
    case 'year':
      return `${p.year}年`
    case 'custom':
      return `${md(p.customStart)} – ${md(p.customEnd)}`
    default: {
      const [y, m] = p.month.split('-').map(Number)
      return `${y}年${m}月`
    }
  }
}

/** 标题下的小字：月视图结算日不是 1 号时显示实际日期范围；周视图显示年份 */
export const subtitleOf = (p: PeriodState, settleDay: number) => {
  if (p.mode === 'month' && settleDay !== 1) {
    const r = rangeOf(p, settleDay)
    return `${md(r.start)} – ${md(addDays(r.end, -1))}`
  }
  if (p.mode === 'week') return `${parseKey(p.weekStart).getFullYear()}年`
  if (p.mode === 'custom') {
    const days = Math.round((parseKey(p.customEnd).getTime() - parseKey(p.customStart).getTime()) / 86400000) + 1
    return `共 ${days} 天`
  }
  return ''
}

/** 左右箭头：前后翻一个周期（自定义按同样天数平移） */
export const shiftPeriod = (p: PeriodState, dir: 1 | -1): PeriodState => {
  switch (p.mode) {
    case 'week':
      return { ...p, weekStart: addDays(p.weekStart, 7 * dir) }
    case 'year':
      return { ...p, year: p.year + dir }
    case 'custom': {
      const len = Math.round((parseKey(p.customEnd).getTime() - parseKey(p.customStart).getTime()) / 86400000) + 1
      return { ...p, customStart: addDays(p.customStart, len * dir), customEnd: addDays(p.customEnd, len * dir) }
    }
    default:
      return { ...p, month: shiftMonth(p.month, dir) }
  }
}

/** 下一个周期是否已经完全在未来（不让往后翻） */
export const isLatest = (p: PeriodState, settleDay: number) => {
  const next = rangeOf(shiftPeriod(p, 1), settleDay)
  return next.start > toDateKey(new Date())
}
