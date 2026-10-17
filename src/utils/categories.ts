import { ref } from 'vue'
import type { CustomCategory, RecordKind } from '../types'
import { ICONS, type IconName } from './icons'

export interface Category {
  key: string
  name: string
  icon: IconName
  color: string
  subs: { name: string; icon: IconName }[]
  /** 用户自建的分类，可以删除 */
  custom?: boolean
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

/** 当前账本的自定义分类（由 useBooks 同步） */
export const customCategories = ref<CustomCategory[]>([])

const isIcon = (v: string): v is IconName => v in ICONS

const toCategory = (c: CustomCategory): Category => ({
  key: c.key,
  name: c.name,
  icon: isIcon(c.icon) ? c.icon : 'sparkles',
  color: c.color,
  custom: true,
  subs: c.subs.map((s) => ({ name: s.name, icon: isIcon(s.icon) ? s.icon : 'sparkles' })),
})

/** 默认分类在前，自定义分类接在后面 */
export const categoriesFor = (kind: RecordKind): Category[] => [
  ...(kind === 'income' ? INCOME_CATEGORIES : EXPENSE_CATEGORIES),
  ...customCategories.value.filter((c) => c.kind === kind).map(toCategory),
]

export const findCategory = (name: string) =>
  [...EXPENSE_CATEGORIES, ...INCOME_CATEGORIES].find((c) => c.name === name) ??
  customCategories.value.filter((c) => c.name === name).map(toCategory)[0]

/** 新建分类时名字不能和已有分类（含默认）重复，避免账单归类混乱 */
export const isCategoryNameTaken = (name: string) => !!findCategory(name.trim())

export const recordIcon = (category: string, subCategory?: string | null): IconName => {
  const cat = findCategory(category)
  if (!cat) return 'sparkles'
  return cat.subs.find((s) => s.name === subCategory)?.icon ?? cat.icon
}

export const recordColor = (category: string) => findCategory(category)?.color ?? '#B0B3C0'

/** 自定义分类可选的图标 */
export const CATEGORY_ICON_CHOICES: IconName[] = [
  'bowl', 'utensils', 'cart', 'coffee', 'home', 'building', 'utilities', 'phone',
  'train', 'taxi', 'car', 'fuel', 'plane', 'ticket', 'gamepad', 'music',
  'bag', 'shirt', 'package', 'store', 'book', 'cap', 'pencil', 'scissors',
  'dumbbell', 'medical', 'pill', 'shield', 'paw', 'baby', 'heart', 'gift',
  'briefcase', 'laptop', 'envelope', 'wallet', 'sparkles',
]

/** 自定义分类可选的颜色（和默认分类同一套色调） */
export const CATEGORY_COLOR_CHOICES = [
  '#FFB86B', '#FF7A7A', '#FF8FAB', '#9D8CFF', '#7A9CFF',
  '#5CC8FF', '#4FD1C5', '#6CD4A4', '#F5C542', '#B0B3C0',
]
