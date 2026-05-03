import { readonly, ref } from 'vue'

const updateAvailable = ref(false)
const updateVersion = ref('')
let activateUpdateHandler: (() => void) | null = null

export const showPwaUpdate = (version: string, onActivate: () => void) => {
  updateVersion.value = version
  activateUpdateHandler = onActivate
  updateAvailable.value = true
}

export const dismissPwaUpdate = () => {
  updateAvailable.value = false
}

export const applyPwaUpdate = () => {
  activateUpdateHandler?.()
}

export const usePwaUpdate = () => ({
  updateAvailable: readonly(updateAvailable),
  updateVersion: readonly(updateVersion),
})
