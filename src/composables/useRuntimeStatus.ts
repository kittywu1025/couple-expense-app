import { toast } from './useToast'

const RUNTIME_TOAST_ID = 'runtime-error'
const SYNC_WARNING_TOAST_ID = 'sync-warning'

export const setAppError = (_message?: string) => {
  toast.error('页面出现问题，请刷新后重试。', {
    id: RUNTIME_TOAST_ID,
    title: '运行异常',
    duration: 5000,
  })
}

export const clearAppError = () => {
  toast.dismiss(RUNTIME_TOAST_ID)
}

export const setSyncWarning = (message: string) => {
  toast.warning(message, {
    id: SYNC_WARNING_TOAST_ID,
    title: '同步提醒',
    duration: 5000,
  })
}

export const clearSyncWarning = () => {
  toast.dismiss(SYNC_WARNING_TOAST_ID)
}

export function useRuntimeStatus() {
  return {
    setAppError,
    clearAppError,
    setSyncWarning,
    clearSyncWarning,
  }
}
