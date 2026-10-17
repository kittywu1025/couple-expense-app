import type { RecordKind } from '../types'
import type { IconName } from './icons'

export interface Category {
  key: string
  name: string
  icon: IconName
  color: string
  subs: { name: string; icon: IconName }[]
}

export const EXPENSE_CATEGORIES: Category[] = [
  {
    key: 'food', name: '饮食', icon: 'bowl', color: '#FFB86B',
    subs: [{ name: '外食', icon: 'utensils' }, { name: '超市·便利店', icon: 'cart' }],
  },
  {
    key: 'fixed', name: '固定开销', icon: 'home', color: '#9D8CFF',
    subs: [{ name: '房租', icon: 'building' }, { name: '水电煤', icon: 'utilities' }, { name: '手机·网络', icon: 'phone' }],
  },
  {
    key: 'transport', name: '交通', icon: 'route', color: '#5CC8FF',
    subs: [
      { name: '巴士·电车', icon: 'train' }, { name: '打车', icon: 'taxi' }, { name: '停车费', icon: 'parking' },
      { name: '油费', icon: 'fuel' }, { name: 'ETC', icon: 'etc' },
    ],
  },
  {
    key: 'fun', name: '娱乐', icon: 'ticket', color: '#FF8FAB',
    subs: [{ name: '出去玩·旅行', icon: 'plane' }],
  },
  {
    key: 'shopping', name: '购物', icon: 'bag', color: '#FF7A7A',
    subs: [{ name: '网购', icon: 'package' }, { name: '实体购物', icon: 'store' }],
  },
  {
    key: 'study', name: '学习', icon: 'book', color: '#6CD4A4',
    subs: [{ name: '学费', icon: 'cap' }, { name: '书本·文具', icon: 'pencil' }],
  },
  {
    key: 'insurance', name: '保险', icon: 'shield', color: '#7A9CFF',
    subs: [{ name: '医保', icon: 'shieldPlus' }, { name: '车险', icon: 'car' }, { name: '其他保险', icon: 'file' }],
  },
  {
    key: 'medical', name: '医疗', icon: 'medical', color: '#4FD1C5',
    subs: [{ name: '医院·诊所', icon: 'stethoscope' }, { name: '药局', icon: 'pill' }],
  },
  { key: 'other', name: '其他', icon: 'sparkles', color: '#B0B3C0', subs: [] },
]

export const INCOME_CATEGORIES: Category[] = [
  { key: 'salary', name: '工资', icon: 'briefcase', color: '#6CD4A4', subs: [] },
  { key: 'parttime', name: '兼职', icon: 'laptop', color: '#5CC8FF', subs: [] },
  { key: 'bonus', name: '奖金', icon: 'gift', color: '#FFB86B', subs: [] },
  { key: 'gift', name: '红包', icon: 'envelope', color: '#FF7A7A', subs: [] },
  { key: 'other-income', name: '其他', icon: 'sparkles', color: '#B0B3C0', subs: [] },
]

export const categoriesFor = (kind: RecordKind) =>
  kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

const allCategories = [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES]

export const findCategory = (name: string) => allCategories.find((c) => c.name === name)

export const recordIcon = (category: string, subCategory?: string | null): IconName => {
  const cat = findCategory(category)
  if (!cat) return 'sparkles'
  return cat.subs.find((s) => s.name === subCategory)?.icon ?? cat.icon
}

export const recordColor = (category: string) => findCategory(category)?.color ?? '#B0B3C0'
