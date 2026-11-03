import type { LedgerRecord } from '../types'
import { formatMoney, toDateKey } from './format'

/** 请客：付钱的人全出，不产生欠款 */
export const isTreat = (r: LedgerRecord) => r.type === 'shared' && r.ratio === 10

/** 请客的人就是付钱的人 */
export const treaterOf = (r: LedgerRecord, _partnerUid?: (uid: string) => string) => r.payerUid

/**
 * 付钱的人一分不出、对方全出：比如在国外 TA 说请客，但我的卡汇率好、我先刷，TA 再转给我。
 * 不算请客，对方那份就是全额，照常进结清。
 */
export const isFullyOwed = (r: LedgerRecord) => r.type === 'shared' && r.ratio === 0

/** 某用户在这笔记录中承担的份额 0-10 */
export const shareOf = (r: LedgerRecord, uid: string) => {
  if (r.type === 'personal') return r.payerUid === uid ? 10 : 0
  return r.payerUid === uid ? r.ratio : 10 - r.ratio
}

const round2 = (n: number) => Math.round(n * 100) / 100

/** 按金额分的账单（比如 2200 里我吃了 800）：ratio 存的是小数，不是整成 */
export const isAmountSplit = (r: Pick<LedgerRecord, 'type' | 'ratio'>) => r.type === 'shared' && !Number.isInteger(r.ratio)

/** 付款人那份的钱：取整到分，另一份用总额减，两份加起来正好是总额 */
export const payerPart = (r: Pick<LedgerRecord, 'amount' | 'ratio'>) => round2((r.amount * r.ratio) / 10)
/** 没付钱那位的那份（结清、月末差额都按这个） */
export const otherPart = (r: Pick<LedgerRecord, 'amount' | 'ratio'>) => round2(r.amount - payerPart(r))

/** 某用户在这笔记录里承担的钱 */
export const partOf = (r: LedgerRecord, uid: string) => {
  if (r.type === 'personal') return r.payerUid === uid ? r.amount : 0
  return r.payerUid === uid ? payerPart(r) : otherPart(r)
}

/** 按金额分的显示：「我 ¥800 · TA ¥1,400」 */
export const amountSplitText = (r: LedgerRecord, uid: string, partnerName = 'TA') =>
  `我 ${formatMoney(partOf(r, uid))} · ${partnerName} ${formatMoney(r.amount - partOf(r, uid))}`

/**
 * 记这笔的人是 actor 时，另一个人要承担几成（0-10）
 */
export const partnerShareFor = (r: Pick<LedgerRecord, 'payerUid' | 'ratio'>, actor: string) =>
  r.payerUid === actor ? 10 - r.ratio : r.ratio

/**
 * 共同记录记了就入账；对方点了「有疑问」退回的（或者回复后等对方再看的）先全算付款人自己的，算「未入账」。
 * 显示比例时仍用记的 ratio（shareOf / isTreat），算钱时用 bearOf / debtOf。
 */
export const isAgreed = (r: LedgerRecord) => r.type !== 'shared' || r.confirmStatus === 'confirmed'

/** 算钱用：某用户实际承担的份额 0-10（没确认的共同记录全算付款人的） */
export const bearOf = (r: LedgerRecord, uid: string) => (isAgreed(r) ? shareOf(r, uid) : r.payerUid === uid ? 10 : 0)
/** 算钱用：某用户实际承担的钱（没确认的共同记录全算付款人的） */
export const bearAmount = (r: LedgerRecord, uid: string) => (isAgreed(r) ? partOf(r, uid) : r.payerUid === uid ? r.amount : 0)

/** 非付款人需要付给付款人的金额（没确认的、已经结清的都不算） */
export const debtOf = (r: LedgerRecord) =>
  r.type !== 'shared' || !isAgreed(r) || r.settledOnSpot || isTreat(r) ? 0 : otherPart(r)

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

/** 这一天属于哪个结算周期（'YYYY-MM'，按结算日划分） */
export const periodMonthOf = (dateKey: string, settleDay: number) => {
  const [y, m, d] = dateKey.split('-').map(Number)
  return currentPeriodMonth(settleDay, new Date(y, m - 1, d))
}

/** 「10月」；不是今年的写「2025年10月」 */
export const periodMonthLabel = (month: string, now = new Date()) => {
  const [y, m] = month.split('-').map(Number)
  return y === now.getFullYear() ? `${m}月` : `${y}年${m}月`
}

/** 还要结清的 AA：两个人都确认过、不是请客、还没结清 */
export const isUnsettledAA = (r: LedgerRecord) =>
  r.kind === 'expense' && r.type === 'shared' && isAgreed(r) && !isTreat(r) && !r.settledOnSpot

export interface UnsettledMonth {
  month: string
  /** 我先垫的：TA 那份等我收 */
  receive: LedgerRecord[]
  /** TA 先垫的：我那份等 TA 收 */
  pay: LedgerRecord[]
  /** 正数：TA 净给我；负数：我净给 TA */
  net: number
}

/** 还没结清的 AA 按结算周期分组，新的月份在前 */
export const unsettledByMonth = (records: LedgerRecord[], myUid: string, settleDay: number): UnsettledMonth[] => {
  const map = new Map<string, UnsettledMonth>()
  for (const r of records) {
    if (!isUnsettledAA(r)) continue
    const month = periodMonthOf(r.date, settleDay)
    const g = map.get(month) ?? { month, receive: [], pay: [], net: 0 }
    if (r.payerUid === myUid) {
      g.receive.push(r)
      g.net += otherPart(r)
    } else {
      g.pay.push(r)
      g.net -= otherPart(r)
    }
    map.set(month, g)
  }
  return [...map.values()].map((g) => ({ ...g, net: round2(g.net) })).sort((a, b) => b.month.localeCompare(a.month))
}
