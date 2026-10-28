import type { LedgerRecord } from '../types'
import { bearOf, debtOf, isAgreed, isTreat, treaterOf } from './settlement'

/**
 * 统计口径（统计页、共同消费清单共用，改口径只改这里）：
 * - 共同支出 = 所有 type=shared 支出的 amount 之和
 * - AA 部分 = shared 里 ratio≠10 且 ratio≠0（不是请客）的 amount 之和
 * - 各自实付 = 该用户作为 payer_uid 的所有支出（个人 + 共同）amount 之和
 * - 其中 AA = 该用户付款的 AA 记录 amount 之和
 * - 还没被对方确认的共同记录不算 AA、不算请客，先全算付款人自己的（确认后才分摊）
 * - 已经结清的 AA 照常算各自承担，但不产生月末差额
 * 收入不计入以上任何一项。
 */
export interface PeriodStats {
  totalExpense: number
  sharedTotal: number
  aaTotal: number
  aaCount: number
  myTreats: number
  partnerTreats: number
  myPaid: number
  myAaPaid: number
  partnerPaid: number
  partnerAaPaid: number
  /** 我应付给对方 */
  iOwe: number
  /** 对方应付给我 */
  theyOwe: number
  /** 正数：我转给对方；负数：对方转给我 */
  diff: number
}

const sum = (list: LedgerRecord[]) => list.reduce((s, r) => s + r.amount, 0)

export const computeStats = (records: LedgerRecord[], myUid: string, otherUid: (uid: string) => string): PeriodStats => {
  const expenses = records.filter((r) => r.kind === 'expense')
  const shared = expenses.filter((r) => r.type === 'shared')
  const agreed = shared.filter(isAgreed)
  const aa = agreed.filter((r) => !isTreat(r))
  const treats = agreed.filter(isTreat)

  const mine = (r: LedgerRecord) => r.payerUid === myUid
  const iOwe = aa.filter((r) => !mine(r)).reduce((s, r) => s + debtOf(r), 0)
  const theyOwe = aa.filter(mine).reduce((s, r) => s + debtOf(r), 0)
  const myTreats = treats.filter((r) => treaterOf(r, otherUid) === myUid).length

  const stats: PeriodStats = {
    totalExpense: sum(expenses),
    sharedTotal: sum(shared),
    aaTotal: sum(aa),
    aaCount: aa.length,
    myTreats,
    partnerTreats: treats.length - myTreats,
    myPaid: sum(expenses.filter(mine)),
    myAaPaid: sum(aa.filter(mine)),
    partnerPaid: sum(expenses.filter((r) => !mine(r))),
    partnerAaPaid: sum(aa.filter((r) => !mine(r))),
    iOwe,
    theyOwe,
    diff: iOwe - theyOwe,
  }

  if (import.meta.env.DEV) {
    // 自洽检查：两人实付之和 = 总支出；AA ≤ 共同；两人 AA 实付之和 = AA 部分
    const eq = (a: number, b: number) => Math.abs(a - b) < 0.01
    if (!eq(stats.myPaid + stats.partnerPaid, stats.totalExpense)) console.warn('[stats] 实付之和 ≠ 总支出', stats)
    if (stats.aaTotal - stats.sharedTotal > 0.01) console.warn('[stats] AA 部分 > 共同支出', stats)
    if (!eq(stats.myAaPaid + stats.partnerAaPaid, stats.aaTotal)) console.warn('[stats] AA 实付之和 ≠ AA 部分', stats)
  }
  return stats
}

/** 某人在这笔共同记录里应承担的金额 */
export const owedBy = (r: LedgerRecord, uid: string) => (r.amount * bearOf(r, uid)) / 10
