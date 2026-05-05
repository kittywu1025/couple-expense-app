import type { ExpenseCategory, RecordType } from '../types'

const buildCategory = (
  id: string,
  name: string,
  icon: string,
  recordType: RecordType,
  options?: Partial<ExpenseCategory>
): ExpenseCategory => ({
  id,
  name,
  icon,
  recordType,
  active: options?.active ?? true,
  isDefault: options?.isDefault ?? true,
})

export const DEFAULT_EXPENSE_CATEGORIES: ExpenseCategory[] = [
  buildCategory('dining-out', '外食', '🍚', 'expense'),
  buildCategory('groceries', '超市/食材', '🛒', 'expense'),
  buildCategory('transport', '交通', '🚆', 'expense'),
  buildCategory('rent', '房租', '🏠', 'expense'),
  buildCategory('water', '水费', '🚿', 'expense'),
  buildCategory('electricity', '电费', '💡', 'expense'),
  buildCategory('gas', '煤气费', '🔥', 'expense'),
  buildCategory('internet', '网费', '📶', 'expense'),
  buildCategory('daily-necessities', '日用品', '🧴', 'expense'),
  buildCategory('tuition', '学费', '🎓', 'expense'),
  buildCategory('study-books', '学习/书籍', '📚', 'expense'),
  buildCategory('medical', '医疗/药品', '💊', 'expense'),
  buildCategory('dating', '约会', '🌷', 'expense'),
  buildCategory('social', '娱乐/社交', '🎬', 'expense'),
  buildCategory('beauty', '服饰/美容', '👗', 'expense'),
  buildCategory('misc', '杂费', '🧾', 'expense'),
]

export const DEFAULT_INCOME_CATEGORIES: ExpenseCategory[] = [
  buildCategory('part-time', '兼职', '💼', 'income'),
  buildCategory('gift-money', '红包', '🧧', 'income'),
  buildCategory('family-support', '家人打款', '🏡', 'income'),
]

const LEGACY_CATEGORIES: ExpenseCategory[] = [
  buildCategory('utilities-legacy', '水电煤网', '💡', 'expense', { active: false, isDefault: false }),
]

const CANONICAL_DEFAULTS = [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES]
const DEFAULT_CATEGORY_MAP = CANONICAL_DEFAULTS.reduce<Record<string, ExpenseCategory>>((result, category) => {
  result[category.id] = category
  return result
}, {})

const LEGACY_ALIAS_MAP: Record<string, string> = {
  food: 'dining-out',
  餐饮: 'dining-out',
  groceries: 'groceries',
  买菜: 'groceries',
  utilities: 'utilities-legacy',
  '水电煤网': 'utilities-legacy',
  daily: 'daily-necessities',
  entertainment: 'social',
  dating: 'dating',
  others: 'misc',
}

export const normalizeCategoryId = (value?: string | null, fallbackType: RecordType = 'expense') => {
  const raw = value?.trim()
  if (!raw) {
    return getDefaultCategoryId(fallbackType)
  }

  return LEGACY_ALIAS_MAP[raw] || raw
}

export const getDefaultCategoryId = (recordType: RecordType) =>
  (recordType === 'income' ? DEFAULT_INCOME_CATEGORIES : DEFAULT_EXPENSE_CATEGORIES)[0].id

export const getDefaultCategories = () => [...DEFAULT_EXPENSE_CATEGORIES, ...DEFAULT_INCOME_CATEGORIES]

export const normalizeCategories = (categories?: ExpenseCategory[]) => {
  const merged = new Map<string, ExpenseCategory>()

  ;(categories ?? getDefaultCategories()).forEach((category) => {
    const normalizedId = normalizeCategoryId(category.id, category.recordType || 'expense')
    const fallback = DEFAULT_CATEGORY_MAP[normalizedId]
    const recordType = category.recordType || fallback?.recordType || 'expense'

    merged.set(normalizedId, {
      id: normalizedId,
      name: category.name?.trim() || fallback?.name || '未命名分类',
      icon: category.icon?.trim() || fallback?.icon || '🧾',
      recordType,
      active: normalizedId === 'utilities-legacy' ? false : category.active ?? true,
      isDefault: category.isDefault ?? Boolean(fallback),
    })
  })

  getDefaultCategories().forEach((category) => {
    if (!merged.has(category.id)) {
      merged.set(category.id, { ...category })
    }
  })

  return Array.from(merged.values()).sort((left, right) => {
    if (left.recordType !== right.recordType) {
      return left.recordType === 'expense' ? -1 : 1
    }

    const leftIndex = CANONICAL_DEFAULTS.findIndex((item) => item.id === left.id)
    const rightIndex = CANONICAL_DEFAULTS.findIndex((item) => item.id === right.id)

    if (leftIndex >= 0 && rightIndex >= 0) return leftIndex - rightIndex
    if (leftIndex >= 0) return -1
    if (rightIndex >= 0) return 1
    return left.name.localeCompare(right.name, 'zh-CN')
  })
}

export const buildCategoryMap = (categories: ExpenseCategory[]) => {
  const map = categories.reduce<Record<string, ExpenseCategory>>((result, category) => {
    result[category.id] = category
    return result
  }, {})

  LEGACY_CATEGORIES.forEach((category) => {
    if (!map[category.id]) {
      map[category.id] = category
    }
  })

  return map
}

export const isSharedExpenseCategory = (categoryId: string) =>
  ['rent', 'water', 'electricity', 'gas', 'internet', 'groceries', 'daily-necessities', 'dining-out', 'social', 'dating']
    .includes(categoryId)

export const isPersonalExpenseCategory = (categoryId: string) =>
  ['transport', 'tuition', 'study-books', 'medical', 'beauty', 'misc'].includes(categoryId)
