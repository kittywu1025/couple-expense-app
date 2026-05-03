import { ref, watch } from 'vue'
import { loadJSON, saveJSON } from '../utils/storage'

const STORAGE_KEY = 'couple-expense-app-budget'

export function useBudget() {
  const budgetAmount = ref<number>(loadJSON<number>(STORAGE_KEY, 0))

  watch(
    budgetAmount,
    (value) => {
      saveJSON(STORAGE_KEY, value)
    },
    { deep: true }
  )

  return {
    budgetAmount,
  }
}
