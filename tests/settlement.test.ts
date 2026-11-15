import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { LedgerRecord } from '../src/types.ts'
import {
  currentPeriodMonth,
  debtOf,
  otherPart,
  partOf,
  payerPart,
  periodMonthOf,
  periodRange,
  unsettledByMonth,
} from '../src/utils/settlement.ts'
import { matchRecord } from '../src/utils/search.ts'

const ME = 'me'
const TA = 'ta'
let seq = 0
const rec = (over: Partial<LedgerRecord>): LedgerRecord => ({
  id: `r${++seq}`,
  bookId: 'b',
  amount: 1000,
  kind: 'expense',
  type: 'shared',
  payerUid: ME,
  ratio: 5,
  settledOnSpot: false,
  settledAt: null,
  paidClaimedAt: null,
  paidNudgedAt: null,
  editedAt: null,
  category: '饮食',
  subCategory: '外食',
  note: null,
  date: '2026-10-15',
  createdBy: ME,
  createdAt: '2026-10-15T00:00:00Z',
  confirmStatus: 'confirmed',
  lastEditedBy: ME,
  discussion: [],
  ...over,
})

test('两份加起来正好是总额（按金额分的小数比例）', () => {
  // 2200 里我付钱、我吃 800 → ratio = 800/2200*10
  const r = rec({ amount: 2200, ratio: (800 / 2200) * 10 })
  assert.equal(payerPart(r), 800)
  assert.equal(otherPart(r), 1400)
  assert.equal(partOf(r, ME) + partOf(r, TA), 2200)
  // 除不尽的也对得上
  const odd = rec({ amount: 1001, ratio: 3 })
  assert.equal(Math.round((payerPart(odd) + otherPart(odd)) * 100) / 100, 1001)
})

test('欠款：请客、已结清、没确认、个人的都不算', () => {
  assert.equal(debtOf(rec({ amount: 3000 })), 1500)
  assert.equal(debtOf(rec({ ratio: 10 })), 0) // 我请客
  assert.equal(debtOf(rec({ ratio: 0 })), 1000) // TA 全出、我先垫：TA 给我全额
  assert.equal(debtOf(rec({ settledOnSpot: true })), 0)
  assert.equal(debtOf(rec({ confirmStatus: 'disputed' })), 0)
  assert.equal(debtOf(rec({ type: 'personal', ratio: 10 })), 0)
})

test('结算周期：结算日 25 号', () => {
  assert.deepEqual(periodRange('2026-10', 25), { start: '2026-10-25', end: '2026-11-25' })
  assert.equal(periodMonthOf('2026-10-24', 25), '2026-09')
  assert.equal(periodMonthOf('2026-10-25', 25), '2026-10')
  assert.equal(periodMonthOf('2027-01-03', 25), '2026-12')
  assert.equal(currentPeriodMonth(1, new Date(2026, 0, 1)), '2026-01')
  assert.equal(currentPeriodMonth(5, new Date(2026, 0, 1)), '2025-12')
})

test('按月算账：两边合在一起算净额，新的月份在前', () => {
  const list = [
    rec({ date: '2026-10-03', amount: 2000 }), // TA 欠我 1000
    rec({ date: '2026-10-20', amount: 6000, payerUid: TA }), // 我欠 TA 3000
    rec({ date: '2026-11-02', amount: 500 }), // 11 月：TA 欠我 250
    rec({ date: '2026-11-02', amount: 900, settledOnSpot: true }), // 已结清，不算
    rec({ date: '2026-11-02', amount: 900, ratio: 10 }), // 请客，不算
    rec({ date: '2026-11-02', amount: 900, kind: 'income', type: 'personal' }),
  ]
  const months = unsettledByMonth(list, ME, 1)
  assert.deepEqual(
    months.map((m) => [m.month, m.receive.length, m.pay.length, m.net]),
    [
      ['2026-11', 1, 0, 250],
      ['2026-10', 1, 1, -2000],
    ],
  )
})

test('搜索：备注、分类、金额、范围', () => {
  const r = rec({ note: '一兰拉面', amount: 2380 })
  assert.ok(matchRecord(r, '拉面', 'all', ME))
  assert.ok(matchRecord(r, '外食 拉面', 'all', ME))
  assert.ok(matchRecord(r, '2,380', 'all', ME))
  assert.ok(matchRecord(r, '¥2380', 'shared', ME))
  assert.ok(!matchRecord(r, '寿司', 'all', ME))
  assert.ok(!matchRecord(r, '拉面', 'mine', ME))
  const hers = rec({ type: 'personal', payerUid: TA, note: '咖啡' })
  assert.ok(matchRecord(hers, '', 'partner', ME))
  assert.ok(!matchRecord(hers, '', 'mine', ME))
})
