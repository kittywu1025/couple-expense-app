/**
 * 开发用测试数据：两个测试用户 yuri / remo，最近 30 天约 20 笔记录。
 * 只在开发模式（npm run dev）的「我的」页底部出现按钮。
 *
 * - 演示模式：直接把两个成员换成 yuri（我）和 remo（对方），记录全部替换成测试数据。
 * - 连真实 Supabase：没法在前端创建账号，只往当前账本里插入记录，
 *   付款人随机分给账本里的两个人（需要对方已经加入）。
 */
import type { NewRecord } from '../types'
import { toDateKey } from '../utils/format'
import { isDemoMode } from '../lib/demo'
import { useBooks } from '../composables/useBooks'
import { useRecords } from '../composables/useRecords'
import { updateProfile } from '../composables/useSupabaseAuth'

export const SEED_USERS = {
  a: { name: 'yuri', gender: 'female', color: 'pink' },
  b: { name: 'remo', gender: 'male', color: 'blue' },
} as const

interface Template {
  category: string
  sub: string | null
  min: number
  max: number
  /** 共同记录的概率 */
  shared: number
  notes?: string[]
}

const EXPENSES: Template[] = [
  { category: '饮食', sub: '外食', min: 800, max: 3500, shared: 0.8, notes: ['拉面', '回转寿司', '居酒屋', '烤肉', ''] },
  { category: '饮食', sub: '超市·便利店', min: 600, max: 6000, shared: 0.7, notes: ['周末囤货', '便利店夜宵', ''] },
  { category: '交通', sub: '巴士·电车', min: 200, max: 900, shared: 0.1 },
  { category: '交通', sub: '打车', min: 1200, max: 3200, shared: 0.6, notes: ['末班车错过了', ''] },
  { category: '固定开销', sub: '水电煤', min: 6000, max: 12000, shared: 1 },
  { category: '固定开销', sub: '手机·网络', min: 2500, max: 5000, shared: 0 },
  { category: '娱乐', sub: '出去玩·旅行', min: 3000, max: 18000, shared: 0.9, notes: ['水族馆', '温泉一日游', '电影', ''] },
  { category: '购物', sub: '网购', min: 1000, max: 8000, shared: 0.2 },
  { category: '购物', sub: '实体购物', min: 1500, max: 9000, shared: 0.3 },
  { category: '学习', sub: '书本·文具', min: 600, max: 3000, shared: 0 },
  { category: '医疗', sub: '药局', min: 400, max: 2000, shared: 0 },
]

/** 共同记录的「付款人份额」，含平摊、不同比例和请客 */
const RATIOS = [5, 5, 5, 5, 6, 4, 7, 3, 10, 0]

const pick = <T>(list: readonly T[]) => list[Math.floor(Math.random() * list.length)]
const between = (min: number, max: number) => Math.round((min + Math.random() * (max - min)) / 10) * 10
const daysAgo = (n: number) => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return toDateKey(d)
}

export const generateSeedRecords = (aUid: string, bUid: string, count = 20): NewRecord[] => {
  const out: NewRecord[] = [
    // 固定的几笔：房租平摊、两人各一笔工资
    { amount: 72000, kind: 'expense', type: 'shared', payerUid: aUid, ratio: 5, category: '固定开销', subCategory: '房租', note: '10 月房租', date: daysAgo(25) },
    { amount: 180000, kind: 'income', type: 'personal', payerUid: aUid, ratio: 10, category: '工资', subCategory: null, note: '打工', date: daysAgo(20) },
    { amount: 150000, kind: 'income', type: 'personal', payerUid: bUid, ratio: 10, category: '兼职', subCategory: null, note: null, date: daysAgo(18) },
  ]
  while (out.length < count) {
    const t = pick(EXPENSES)
    const shared = Math.random() < t.shared
    const payer = Math.random() < 0.5 ? aUid : bUid
    const note = t.notes ? pick(t.notes) : ''
    out.push({
      amount: between(t.min, t.max),
      kind: 'expense',
      type: shared ? 'shared' : 'personal',
      payerUid: payer,
      ratio: shared ? pick(RATIOS) : 10,
      category: t.category,
      subCategory: t.sub,
      note: note || null,
      date: daysAgo(Math.floor(Math.random() * 30)),
    })
  }
  return out
}

export const seedTestData = async () => {
  const { members, myUid, partnerUid } = useBooks()
  const { records, addRecordsBulk } = useRecords()

  if (isDemoMode) {
    const [mine, theirs] = [members.value.find((m) => m.userId === myUid.value), members.value.find((m) => m.userId !== myUid.value)]
    if (!mine || !theirs) return { error: new Error('演示账本没有两个成员') }
    members.value = members.value.map((m) =>
      m.userId === myUid.value
        ? { ...m, displayName: SEED_USERS.a.name, gender: SEED_USERS.a.gender, color: SEED_USERS.a.color }
        : { ...m, displayName: SEED_USERS.b.name, gender: SEED_USERS.b.gender, color: SEED_USERS.b.color },
    )
    await updateProfile({ nickname: SEED_USERS.a.name, gender: SEED_USERS.a.gender, color: SEED_USERS.a.color })
    records.value = []
    return addRecordsBulk(generateSeedRecords(mine.userId, theirs.userId))
  }

  if (!partnerUid.value) return { error: new Error('需要对方先加入账本，才能生成两人的测试数据') }
  return addRecordsBulk(generateSeedRecords(myUid.value, partnerUid.value))
}
