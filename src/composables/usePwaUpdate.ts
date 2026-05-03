import { readonly, ref } from 'vue'

const updateAvailable = ref(false)
const updateVersion = ref('')
const updateMessage = ref('刷新后即可使用最新界面。')
const isApplyingUpdate = ref(false)

let currentRegistration: ServiceWorkerRegistration | null = null
let activateUpdateHandler: (() => void) | null = null

const setUpdateState = (visible: boolean, version = '', message = '刷新后即可使用最新界面。') => {
  updateAvailable.value = visible
  updateVersion.value = version
  updateMessage.value = message
}

export const registerPwaRegistration = (registration: ServiceWorkerRegistration) => {
  currentRegistration = registration
}

export const showPwaUpdate = (version: string, onActivate: () => void, message?: string) => {
  updateVersion.value = version
  updateMessage.value = message || '刷新后即可使用最新界面。'
  activateUpdateHandler = onActivate
  updateAvailable.value = true
}

export const dismissPwaUpdate = () => {
  updateAvailable.value = false
}

export const setPwaUpdated = () => {
  setUpdateState(false)
  isApplyingUpdate.value = false
}

export const checkForPwaUpdate = async () => {
  if (!('serviceWorker' in navigator) || !currentRegistration) {
    return false
  }

  await currentRegistration.update()

  if (currentRegistration.waiting) {
    showPwaUpdate(__APP_VERSION__, () => applyPwaUpdate())
    return true
  }

  return false
}

export const applyPwaUpdate = () => {
  if (!currentRegistration?.waiting) {
    updateAvailable.value = false
    return
  }

  if (typeof window !== 'undefined') {
    window.sessionStorage.setItem('pwa-updated', '1')
  }
  isApplyingUpdate.value = true
  activateUpdateHandler?.()
}

export const usePwaUpdate = () => ({
  updateAvailable: readonly(updateAvailable),
  updateVersion: readonly(updateVersion),
  updateMessage: readonly(updateMessage),
  isApplyingUpdate: readonly(isApplyingUpdate),
})
