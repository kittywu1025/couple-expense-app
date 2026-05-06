import { computed, ref, watch } from 'vue'
import type { AppSettings, SplitRule } from '../types'
import { loadJSON, saveJSON } from '../utils/storage'
import { buildCategoryMap, getDefaultCategories, normalizeCategories } from '../utils/categories'

const STORAGE_KEY = 'couple-expense-app-settings'

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

const createDefaultSettings = (): AppSettings => ({
  meName: '我',
  partnerName: '另一半',
  defaultCurrency: 'JPY',
  defaultSplits: {
    standard: { me: 50, partner: 50 },
    rent: { me: 60, partner: 40 },
  },
  categories: getDefaultCategories(),
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
  const categoryMap = computed(() => buildCategoryMap(settings.value.categories))

  return {
    settings,
    categoryMap,
    normalizeSplit,
  }
}
