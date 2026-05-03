import { computed, ref, watch } from 'vue'
import type { AppSettings, ExpenseCategory, SplitRule } from '../types'
import { loadJSON, saveJSON } from '../utils/storage'

const STORAGE_KEY = 'couple-expense-app-settings'

const createDefaultCategories = (): ExpenseCategory[] => [
  { id: 'rent', name: '房租', icon: '🏠' },
  { id: 'food', name: '餐饮', icon: '🍚' },
  { id: 'groceries', name: '买菜', icon: '🛒' },
  { id: 'utilities', name: '水电网', icon: '💡' },
  { id: 'transport', name: '交通', icon: '🚆' },
  { id: 'dating', name: '约会', icon: '🌷' },
  { id: 'entertainment', name: '娱乐', icon: '🎬' },
  { id: 'daily', name: '日用品', icon: '🧴' },
  { id: 'others', name: '其他', icon: '🧾' },
]

const normalizeSplit = (split?: Partial<SplitRule>, fallback?: SplitRule): SplitRule => {
  const meValue = Number(split?.me)
  const partnerValue = Number(split?.partner)

  if (Number.isFinite(meValue) && Number.isFinite(partnerValue) && meValue + partnerValue > 0) {
    const total = meValue + partnerValue
    return {
      me: Number(((meValue / total) * 100).toFixed(2)),
      partner: Number(((partnerValue / total) * 100).toFixed(2)),
    }
  }

  return fallback ?? { me: 50, partner: 50 }
}

const normalizeCategories = (categories?: ExpenseCategory[]): ExpenseCategory[] => {
  const seen = new Set<string>()
  const normalized = (categories ?? createDefaultCategories())
    .map((category) => ({
      id: category.id?.trim() || crypto.randomUUID(),
      name: category.name?.trim() || '未命名分类',
      icon: category.icon?.trim() || '🧾',
    }))
    .filter((category) => {
      if (seen.has(category.id)) return false
      seen.add(category.id)
      return true
    })

  if (!normalized.length) {
    return createDefaultCategories()
  }

  if (!normalized.some((category) => category.id === 'rent')) {
    normalized.unshift({ id: 'rent', name: '房租', icon: '🏠' })
  }

  if (!normalized.some((category) => category.id === 'others')) {
    normalized.push({ id: 'others', name: '其他', icon: '🧾' })
  }

  return normalized
}

const createDefaultSettings = (): AppSettings => ({
  meName: '我',
  partnerName: '另一半',
  defaultCurrency: 'JPY',
  defaultSplits: {
    standard: { me: 50, partner: 50 },
    rent: { me: 60, partner: 40 },
  },
  categories: createDefaultCategories(),
})

const normalizeSettings = (value?: Partial<AppSettings>): AppSettings => {
  const defaults = createDefaultSettings()

  return {
    meName: value?.meName?.trim() || defaults.meName,
    partnerName: value?.partnerName?.trim() || defaults.partnerName,
    defaultCurrency: value?.defaultCurrency || defaults.defaultCurrency,
    defaultSplits: {
      standard: normalizeSplit(value?.defaultSplits?.standard, defaults.defaultSplits.standard),
      rent: normalizeSplit(value?.defaultSplits?.rent, defaults.defaultSplits.rent),
    },
    categories: normalizeCategories(value?.categories),
  }
}

const settings = ref<AppSettings>(normalizeSettings(loadJSON<AppSettings>(STORAGE_KEY, createDefaultSettings())))

watch(
  settings,
  (value) => {
    saveJSON(STORAGE_KEY, normalizeSettings(value))
  },
  { deep: true }
)

export function useSettings() {
  const categoryMap = computed(() =>
    settings.value.categories.reduce<Record<string, ExpenseCategory>>((result, category) => {
      result[category.id] = category
      return result
    }, {})
  )

  return {
    settings,
    categoryMap,
    normalizeSplit,
  }
}
