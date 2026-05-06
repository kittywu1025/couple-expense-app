import type { FixedExpense, FixedExpenseRun, SplitPreset, SplitRule } from '../types'

export const getMonthLastDay = (year: number, month: number) => new Date(year, month, 0).getDate()

export const clampDayOfMonth = (year: number, month: number, dayOfMonth: number) =>
  Math.min(Math.max(1, dayOfMonth), getMonthLastDay(year, month))

export const formatMonthKey = (date: Date) =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`

export const getRunDateForMonth = (generatedMonth: string, dayOfMonth: number) => {
  const [year, month] = generatedMonth.split('-').map(Number)
  const day = clampDayOfMonth(year, month, dayOfMonth)
  return `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`
}

export const getExpenseRunMonth = (date: Date = new Date()) => formatMonthKey(date)

export const isMonthAlreadyGenerated = (runs: FixedExpenseRun[], fixedExpenseId: string, month: string) =>
  runs.some((run) => run.fixedExpenseId === fixedExpenseId && run.generatedMonth === month)

export const getFixedExpenseNextDate = (fixedExpense: FixedExpense, runs: FixedExpenseRun[], today = new Date()) => {
  let year = today.getFullYear()
  let month = today.getMonth() + 1
  let monthKey = `${year}-${String(month).padStart(2, '0')}`
  let candidate = getRunDateForMonth(monthKey, fixedExpense.dayOfMonth)

  if (candidate < fixedExpense.startDate) {
    const start = new Date(`${fixedExpense.startDate}T00:00:00`)
    year = start.getFullYear()
    month = start.getMonth() + 1
    monthKey = `${year}-${String(month).padStart(2, '0')}`
    candidate = getRunDateForMonth(monthKey, fixedExpense.dayOfMonth)
  }

  const todayKey = today.toISOString().slice(0, 10)
  const alreadyGenerated = isMonthAlreadyGenerated(runs, fixedExpense.id, monthKey)
  if (alreadyGenerated || candidate < todayKey) {
    const nextDate = new Date(year, month, 1)
    year = nextDate.getFullYear()
    month = nextDate.getMonth() + 1
    monthKey = `${year}-${String(month).padStart(2, '0')}`
    candidate = getRunDateForMonth(monthKey, fixedExpense.dayOfMonth)
  }

  if (fixedExpense.endDate && candidate > fixedExpense.endDate) {
    return null
  }

  return candidate
}

export const shouldGenerateFixedExpense = (fixedExpense: FixedExpense, runs: FixedExpenseRun[], today = new Date()) => {
  if (!fixedExpense.enabled) return false
  const month = getExpenseRunMonth(today)
  if (isMonthAlreadyGenerated(runs, fixedExpense.id, month)) return false

  const todayKey = today.toISOString().slice(0, 10)
  const runDate = getRunDateForMonth(month, fixedExpense.dayOfMonth)

  if (runDate < fixedExpense.startDate) return false
  if (fixedExpense.endDate && runDate > fixedExpense.endDate) return false
  return todayKey >= runDate
}

export const splitPresetFromSplit = (split: SplitRule, category: string): SplitPreset => {
  if (split.me === 100 || split.partner === 100) return 'payer-only'
  if (category === 'rent') return 'rent'
  return 'equal'
}
