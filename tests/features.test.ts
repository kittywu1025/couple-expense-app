import { test } from 'node:test'
import assert from 'node:assert/strict'
import type { LedgerRecord } from '../src/types.ts'
import { noteSuggestions } from '../src/utils/noteSuggest.ts'
import { recordsToCsv } from '../src/utils/exportCsv.ts'
import { compareRangeOf, compareWordOf, initialPeriod, type PeriodState } from '../src/utils/period.ts'

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

test('常用备注：同子分类优先、按次数排、带最近一次的金额、TA 的个人记录不联想', () => {
  const list = [
    rec({ note: '一兰拉面', amount: 980, date: '2026-10-01' }),
    rec({ note: '一兰拉面', amount: 1200, date: '2026-10-09' }),
    rec({ note: '麦当劳', amount: 700, date: '2026-10-10' }),
    rec({ note: '超市便当', subCategory: '买菜', amount: 500, date: '2026-10-11' }),
    rec({ note: 'TA 的奶茶', type: 'personal', payerUid: TA }),
    rec({ note: '工资', kind: 'income', category: '饮食' }),
  ]
  const s = noteSuggestions(list, { kind: 'expense', category: '饮食', sub: '外食', myUid: ME })
  assert.deepEqual(
    s.map((x) => x.text),
    ['一兰拉面', '麦当劳', '超市便当'],
  )
  assert.equal(s[0].amount, 1200)
  assert.equal(s[0].count, 2)
  // 正在输入：只留包含的，一模一样的不再提示
  assert.deepEqual(
    noteSuggestions(list, { kind: 'expense', category: '饮食', sub: '外食', myUid: ME, typed: '拉' }).map((x) => x.text),
    ['一兰拉面'],
  )
  assert.equal(noteSuggestions(list, { kind: 'expense', category: '饮食', sub: '外食', myUid: ME, typed: '一兰拉面' }).length, 0)
})

test('导出 CSV：TA 的个人记录不导出，按日期排，逗号和引号转义，承担金额对得上', () => {
  const csv = recordsToCsv(
    [
      rec({ date: '2026-10-20', amount: 3000, ratio: 7, note: '寿司, "大份"' }),
      rec({ date: '2026-10-05', type: 'personal', amount: 500, ratio: 10 }),
      rec({ date: '2026-10-06', type: 'personal', payerUid: TA, amount: 800, ratio: 10 }),
      rec({ date: '2026-10-07', payerUid: TA, amount: 2000, ratio: 5, settledOnSpot: true }),
    ],
    { myUid: ME, nameOf: (u) => (u === ME ? '小猫' : '小狗'), partnerName: '小狗' },
  )
  assert.ok(csv.startsWith('﻿日期,'))
  const lines = csv.slice(1).split('\r\n')
  assert.equal(lines.length, 4)
  assert.equal(lines[1], '2026-10-05,支出,个人,饮食,外食,500,小猫,500,,,')
  assert.equal(lines[2], '2026-10-07,支出,共同,饮食,外食,2000,小狗,1000,1000,已结清,')
  assert.equal(lines[3], '2026-10-20,支出,共同,饮食,外食,3000,小猫,2100,900,未结清,"寿司, ""大份"""')
})

test('统计对比：没过完的月份对上个月同样天数，过完的对整月', () => {
  const p: PeriodState = { ...initialPeriod(1), mode: 'month', month: '2026-11' }
  assert.deepEqual(compareRangeOf(p, 1, '2026-11-15'), { start: '2026-10-01', end: '2026-10-16' })
  assert.equal(compareWordOf(p, 1, '2026-11-15'), '上个月同期')
  // 3 月 31 日对 2 月：不超过 2 月本身
  const mar: PeriodState = { ...p, month: '2027-03' }
  assert.deepEqual(compareRangeOf(mar, 1, '2027-03-31'), { start: '2027-02-01', end: '2027-03-01' })
  // 看以前的月份：整月对整月
  const oct: PeriodState = { ...p, month: '2026-10' }
  assert.deepEqual(compareRangeOf(oct, 1, '2026-11-15'), { start: '2026-09-01', end: '2026-10-01' })
  assert.equal(compareWordOf(oct, 1, '2026-11-15'), '上个月')
  // 结算日 25 号：11 月周期是 10/25–11/24
  const s25: PeriodState = { ...p, month: '2026-11' }
  const r = compareRangeOf(s25, 25, '2026-11-01')
  assert.equal(r.end > r.start, true)
})
