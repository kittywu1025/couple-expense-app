import { ref, watch } from 'vue'
import type { CountdownSettings } from '../types'
import { loadJSON, saveJSON } from '../utils/storage'

const STORAGE_KEY = 'couple-expense-app-countdown'

export function useCountdown() {
  const settings = ref<CountdownSettings>(
    loadJSON<CountdownSettings>(STORAGE_KEY, {
      startedDate: '',
      birthday: '',
    })
  )

  watch(
    settings,
    (value) => {
      saveJSON(STORAGE_KEY, value)
    },
    { deep: true }
  )

  const setSettings = (value: CountdownSettings) => {
    settings.value = value
  }

  return {
    settings,
    setSettings,
  }
}
