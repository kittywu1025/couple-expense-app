import type { Book, BookMember, LedgerRecord } from '../types'
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
  { id: 'm1', bookId: demoBook.id, userId: DEMO_MY_UID, displayName: '小吴', gender: null, color: null, joinedAt: '2026-10-01' },
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
  ...opts,
})

export const createDemoRecords = (): LedgerRecord[] => [
  rec(0, 2380, '饮食', '外食', { note: '一兰拉面' }),
  rec(0, 640, '交通', '巴士·电车', { type: 'personal', ratio: 10 }),
  rec(1, 4280, '饮食', '超市·便利店', { payerUid: DEMO_PARTNER_UID, ratio: 6, note: '周末囤货' }),
  rec(2, 6800, '娱乐', '出去玩·旅行', { payerUid: DEMO_PARTNER_UID, ratio: 10, note: '水族馆门票' }),
  rec(2, 1500, '购物', '网购', { type: 'personal', payerUid: DEMO_PARTNER_UID, ratio: 10 }),
  rec(3, 3200, '饮食', '外食', { ratio: 10, note: '生日请吃饭' }),
  rec(4, 980, '医疗', '药局', { type: 'personal', ratio: 10 }),
  rec(5, 8900, '固定开销', '水电煤', { payerUid: DEMO_PARTNER_UID }),
  rec(6, 1850, '交通', '打车', { ratio: 7 }),
  rec(8, 72000, '固定开销', '房租'),
  rec(10, 250000, '工资', null, { kind: 'income', type: 'personal', ratio: 10 }),
]
