import { computed, ref, watch } from 'vue'
import type { Chore } from '../types'
import { loadJSON, saveJSON } from '../utils/storage'

const STORAGE_KEY = 'couple-expense-app-chores'

export function useChores() {
  const chores = ref<Chore[]>(loadJSON<Chore[]>(STORAGE_KEY, []))

  watch(
    chores,
    (value) => {
      saveJSON(STORAGE_KEY, value)
    },
    { deep: true }
  )

  const totalPoints = computed(() => chores.value.reduce((sum, item) => sum + item.points, 0))
  const mePoints = computed(() => chores.value.filter((item) => item.performer === 'me').reduce((sum, item) => sum + item.points, 0))
  const partnerPoints = computed(() => chores.value.filter((item) => item.performer === 'partner').reduce((sum, item) => sum + item.points, 0))

  const addChore = (chore: Chore) => {
    chores.value = [chore, ...chores.value]
  }

  const toggleChoreDone = (choreId: string) => {
    chores.value = chores.value.map((item) =>
      item.id === choreId ? { ...item, done: !item.done } : item
    )
  }

  const deleteChore = (choreId: string) => {
    chores.value = chores.value.filter((item) => item.id !== choreId)
  }

  return {
    chores,
    addChore,
    toggleChoreDone,
    deleteChore,
    totalPoints,
    mePoints,
    partnerPoints,
  }
}
