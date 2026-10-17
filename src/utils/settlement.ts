import type { LedgerRecord } from '../types'
import { toDateKey } from './format'

/** ratio=0 或 10 视为请客，不产生债务 */
export const isTreat = (r: LedgerRecord) => r.type === 'shared' && (r.ratio === 0 || r.ratio === 10)

/** 请客的人：ratio=10 是付款人自己承担，ratio=0 是对方承担 */
export const treaterOf = (r: LedgerRecord, partnerUid: (uid: string) => string) =>
  r.ratio === 10 ? r.payerUid : partnerUid(r.payerUid)

/** 某用户在这笔记录中承担的份额 0-10 */
export const shareOf = (r: LedgerRecord, uid: string) => {
  if (r.type === 'personal') return r.payerUid === uid ? 10 : 0
  return r.payerUid === uid ? r.ratio : 10 - r.ratio
}

/** 非付款人需要付给付款人的金额 */
export const debtOf = (r: LedgerRecord) =>
  r.type !== 'shared' || isTreat(r) ? 0 : (r.amount * (10 - r.ratio)) / 10

/**
 * 结算周期：以 settleDay 为起点。month 为 'YYYY-MM'，
 * 周期 = [YYYY-MM-settleDay, 下月-settleDay)
 */
export const periodRange = (month: string, settleDay: number) => {
  const [y, m] = month.split('-').map(Number)
  const start = new Date(y, m - 1, settleDay)
  const end = new Date(y, m, settleDay)
  return { start: toDateKey(start), end: toDateKey(end) }
}

/** 今天所属的结算周期对应的 'YYYY-MM' */
export const currentPeriodMonth = (settleDay: number, now = new Date()) => {
  const d = new Date(now.getFullYear(), now.getMonth(), 1)
  if (now.getDate() < settleDay) d.setMonth(d.getMonth() - 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const shiftMonth = (month: string, delta: number) => {
  const [y, m] = month.split('-').map(Number)
  const d = new Date(y, m - 1 + delta, 1)
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
}

export const inPeriod = (r: LedgerRecord, range: { start: string; end: string }) =>
  r.date >= range.start && r.date < range.end
