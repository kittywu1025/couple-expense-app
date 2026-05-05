import { readonly, ref } from 'vue'

export type ToastType = 'success' | 'error' | 'warning' | 'info'

export interface ToastAction {
  label: string
  onClick: () => void | Promise<void>
  kind?: 'primary' | 'secondary' | 'text'
  disabled?: boolean
}

export interface ToastItem {
  id: string
  type: ToastType
  title?: string
  message: string
  duration: number
  dismissible: boolean
  actions: readonly ToastAction[]
}

interface ToastOptions {
  id?: string
  title?: string
  duration?: number
  dismissible?: boolean
  actions?: ToastAction[]
}

const DEFAULT_DURATION = 2800

const toasts = ref<ToastItem[]>([])
const toastTimers = new Map<string, ReturnType<typeof setTimeout>>()

const clearToastTimer = (id: string) => {
  const timer = toastTimers.get(id)
  if (!timer) return
  clearTimeout(timer)
  toastTimers.delete(id)
}

export const dismissToast = (id: string) => {
  clearToastTimer(id)
  toasts.value = toasts.value.filter((toast) => toast.id !== id)
}

const scheduleToastDismiss = (toast: ToastItem) => {
  clearToastTimer(toast.id)
  if (toast.duration <= 0) return

  toastTimers.set(
    toast.id,
    window.setTimeout(() => {
      dismissToast(toast.id)
    }, toast.duration)
  )
}

export const showToast = (type: ToastType, message: string, options: ToastOptions = {}) => {
  const id = options.id || crypto.randomUUID()
  const nextToast: ToastItem = {
    id,
    type,
    title: options.title,
    message,
    duration: options.duration ?? DEFAULT_DURATION,
    dismissible: options.dismissible ?? true,
    actions: options.actions ?? [],
  }

  const existingIndex = toasts.value.findIndex((toast) => toast.id === id)
  if (existingIndex >= 0) {
    toasts.value.splice(existingIndex, 1, nextToast)
  } else {
    toasts.value = [...toasts.value, nextToast]
  }

  if (typeof window !== 'undefined') {
    scheduleToastDismiss(nextToast)
  }

  return id
}

export const toast = {
  success: (message: string, options?: ToastOptions) => showToast('success', message, options),
  error: (message: string, options?: ToastOptions) => showToast('error', message, options),
  warning: (message: string, options?: ToastOptions) => showToast('warning', message, options),
  info: (message: string, options?: ToastOptions) => showToast('info', message, options),
  dismiss: dismissToast,
}

export const useToast = () => ({
  toasts: readonly(toasts),
  showToast,
  dismissToast,
  toast,
})
