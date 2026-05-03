import { ref } from 'vue'

export const appError = ref('')
export const syncWarning = ref('')

export const setAppError = (message: string) => {
  appError.value = message
}

export const clearAppError = () => {
  appError.value = ''
}

export const setSyncWarning = (message: string) => {
  syncWarning.value = message
}

export const clearSyncWarning = () => {
  syncWarning.value = ''
}

export function useRuntimeStatus() {
  return {
    appError,
    syncWarning,
    setAppError,
    clearAppError,
    setSyncWarning,
    clearSyncWarning,
  }
}
