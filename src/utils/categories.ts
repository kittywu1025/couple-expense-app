import type { RecordKind } from '../types'

export interface Category {
  key: string
  name: string
  icon: string
  color: string
  subs: { name: string; icon: string }[]
}

export const EXPENSE_CATEGORIES: Category[] = [
  {
    key: 'food', name: '饮食', icon: '🍜', color: '#FFB86B',
    subs: [{ name: '外食', icon: '🍱' }, { name: '超市·便利店', icon: '🛒' }],
  },
  {
    key: 'fixed', name: '固定开销', icon: '🏠', color: '#9D8CFF',
    subs: [{ name: '房租', icon: '🔑' }, { name: '水电煤', icon: '💡' }, { name: '手机·网络', icon: '📶' }],
  },
  {
    key: 'transport', name: '交通', icon: '🚃', color: '#5CC8FF',
    subs: [
      { name: '巴士·电车', icon: '🚌' }, { name: '打车', icon: '🚕' }, { name: '停车费', icon: '🅿️' },
      { name: '油费', icon: '⛽' }, { name: 'ETC', icon: '🛣️' },
    ],
  },
  {
    key: 'fun', name: '娱乐', icon: '🎡', color: '#FF8FAB',
    subs: [{ name: '出去玩·旅行', icon: '✈️' }],
  },
  {
    key: 'shopping', name: '购物', icon: '🛍️', color: '#FF7A7A',
    subs: [{ name: '网购', icon: '📦' }, { name: '实体购物', icon: '🏬' }],
  },
  {
    key: 'study', name: '学习', icon: '📚', color: '#6CD4A4',
    subs: [{ name: '学费', icon: '🎓' }, { name: '书本·文具', icon: '✏️' }],
  },
  {
    key: 'insurance', name: '保险', icon: '🛡️', color: '#7A9CFF',
    subs: [{ name: '医保', icon: '🏥' }, { name: '车险', icon: '🚗' }, { name: '其他保险', icon: '📄' }],
  },
  {
    key: 'medical', name: '医疗', icon: '💊', color: '#4FD1C5',
    subs: [{ name: '医院·诊所', icon: '🩺' }, { name: '药局', icon: '💊' }],
  },
  { key: 'other', name: '其他', icon: '✨', color: '#B0B3C0', subs: [] },
]

export const INCOME_CATEGORIES: Category[] = [
  { key: 'salary', name: '工资', icon: '💼', color: '#6CD4A4', subs: [] },
  { key: 'parttime', name: '兼职', icon: '🧑‍💻', color: '#5CC8FF', subs: [] },
  { key: 'bonus', name: '奖金', icon: '🎁', color: '#FFB86B', subs: [] },
  { key: 'gift', name: '红包', icon: '🧧', color: '#FF7A7A', subs: [] },
  { key: 'other-income', name: '其他', icon: '✨', color: '#B0B3C0', subs: [] },
]

export const categoriesFor = (kind: RecordKind) =>
  kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]

export const findCategory = (name: string) => allCategories.find((c) => c.name === name)

export const recordIcon = (category: string, subCategory?: string | null) => {
  const cat = findCategory(category)
  if (!cat) return '✨'
  return cat.subs.find((s) => s.name === subCategory)?.icon ?? cat.icon
}

export const recordColor = (category: string) => findCategory(category)?.color ?? '#B0B3C0'
