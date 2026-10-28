import type { Book, BookMember, LedgerRecord, Loan, LoanRepayment } from '../types'
import { toDateKey } from '../utils/format'

/**
 * 演示模式：跳过登录，用本地假数据预览页面。
 * 在 .env.local 里设置 VITE_DEMO_MODE=true 开启，删掉这一行即恢复正常登录。
 */
export const isDemoMode = import.meta.env.VITE_DEMO_MODE === 'true'

export const DEMO_MY_UID = 'demo-me'
export const DEMO_PARTNER_UID = 'demo-partner'

export const demoUser = {
  id: DEMO_MY_UID,
  email: 'demo@example.com',
  user_metadata: { full_name: '小吴' },
}

export const demoBook: Book = {
  id: 'demo-book',
  inviteCode: 'DEMO26',
  settleDay: 1,
  defaultRatio: 5,
  currency: 'JPY',
  customCategories: [],
  createdBy: DEMO_MY_UID,
  createdAt: new Date().toISOString(),
}

export const demoMembers: BookMember[] = [
  { id: 'm1', bookId: demoBook.id, userId: DEMO_MY_UID, displayName: '小吴', gender: 'female', color: 'pink', joinedAt: '2026-10-01' },
  { id: 'm2', bookId: demoBook.id, userId: DEMO_PARTNER_UID, displayName: '阿健', gender: 'male', color: 'blue', joinedAt: '2026-10-02' },
]

const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toDateKey(d)
}

let seq = 0
const rec = (
  n: number,
  amount: number,
  category: string,
  subCategory: string | null,
  opts: Partial<LedgerRecord> = {},
): LedgerRecord => ({
  id: `demo-${++seq}`,
  bookId: demoBook.id,
  amount,
  kind: 'expense',
  type: 'shared',
  payerUid: DEMO_MY_UID,
  ratio: 5,
  category,
  subCategory,
  note: null,
  date: daysAgo(n),
  createdBy: opts.payerUid ?? DEMO_MY_UID,
  createdAt: new Date(Date.now() - n * 86400000 - seq * 1000).toISOString(),
  confirmStatus: 'confirmed',
  lastEditedBy: opts.payerUid ?? DEMO_MY_UID,
  discussion: [],
  ...opts,
})

export const createDemoRecords = (): LedgerRecord[] => [
  rec(0, 2380, '饮食', '外食', {
    note: '一兰拉面',
    confirmStatus: 'disputed',
    discussion: [{ by: DEMO_PARTNER_UID, text: '这顿不是说好你请吗～', ratio: 10, at: new Date().toISOString() }],
  }),
  rec(0, 640, '交通', '巴士·电车', { type: 'personal', ratio: 10 }),
  rec(1, 4280, '饮食', '超市·便利店', { payerUid: DEMO_PARTNER_UID, ratio: 6, note: '周末囤货', confirmStatus: 'pending' }),
  rec(2, 6800, '娱乐', '出去玩·旅行', { payerUid: DEMO_PARTNER_UID, ratio: 10, note: '水族馆门票' }),
  rec(2, 1500, '购物', '网购', { type: 'personal', payerUid: DEMO_PARTNER_UID, ratio: 10 }),
  rec(3, 3200, '饮食', '外食', { ratio: 10, note: '生日请吃饭' }),
  rec(4, 980, '医疗', '药局', { type: 'personal', ratio: 10 }),
  rec(5, 5200, '固定开销', '电费', { payerUid: DEMO_PARTNER_UID }),
  rec(5, 3700, '固定开销', '水费', { payerUid: DEMO_PARTNER_UID }),
  rec(6, 1850, '交通', '打车', { ratio: 7, payerUid: DEMO_PARTNER_UID, confirmStatus: 'pending' }),
  rec(8, 72000, '固定开销', '房租'),
  rec(10, 250000, '工资', null, { kind: 'income', type: 'personal', ratio: 10 }),
]

export const createDemoLoans = (): { loans: Loan[]; repayments: LoanRepayment[] } => {
  const base = { bookId: demoBook.id, note: null, createdAt: new Date().toISOString(), discussion: [] }
  return {
    loans: [
      {
        ...base,
        id: 'demo-loan-1',
        lenderUid: DEMO_PARTNER_UID,
        borrowerUid: DEMO_MY_UID,
        amount: 150000,
        currency: 'JPY',
        deleteRequestedBy: null,
        note: '学费先借一下',
        date: daysAgo(40),
        confirmStatus: 'confirmed',
        lastEditedBy: DEMO_MY_UID,
        createdBy: DEMO_MY_UID,
      },
      {
        ...base,
        id: 'demo-loan-2',
        lenderUid: DEMO_MY_UID,
        borrowerUid: DEMO_PARTNER_UID,
        amount: 30000,
        currency: 'JPY',
        // 演示：阿健申请删除这笔，等我同意
        deleteRequestedBy: DEMO_PARTNER_UID,
        note: '换手机',
        date: daysAgo(3),
        confirmStatus: 'confirmed',
        lastEditedBy: DEMO_PARTNER_UID,
        createdBy: DEMO_PARTNER_UID,
      },
    ],
    repayments: [
      {
        ...base,
        id: 'demo-repay-1',
        loanId: 'demo-loan-1',
        deleteRequestedBy: null,
        amount: 50000,
        date: daysAgo(10),
        confirmStatus: 'confirmed',
        lastEditedBy: DEMO_MY_UID,
        createdBy: DEMO_MY_UID,
      },
    ],
  }
}
