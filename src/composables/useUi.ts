import { ref } from 'vue'
import type { LedgerRecord } from '../types'

/** 记账页是否打开（FAB / 空状态按钮 / 编辑共用） */
export const addSheetOpen = ref(false)
/** 正在编辑的记录；为 null 时是新增 */
export const editingRecord = ref<LedgerRecord | null>(null)

export const openAddSheet = () => {
  editingRecord.value = null
  addSheetOpen.value = true
}
export const openEditSheet = (record: LedgerRecord) => {
  editingRecord.value = record
  addSheetOpen.value = true
}
export const closeAddSheet = () => {
  addSheetOpen.value = false
  editingRecord.value = null
}

interface ConfirmOptions {
  title: string
  message?: string
  confirmText?: string
  danger?: boolean
}

interface ConfirmState extends ConfirmOptions {
  resolve: (ok: boolean) => void
}

export const confirmState = ref<ConfirmState | null>(null)

/** iOS 风格的底部确认弹窗，替代 window.confirm */
export const confirmAction = (options: ConfirmOptions) =>
  new Promise<boolean>((resolve) => {
    confirmState.value?.resolve(false)
    confirmState.value = { confirmText: '确定', ...options, resolve }
  })

export const settleConfirm = (ok: boolean) => {
  confirmState.value?.resolve(ok)
  confirmState.value = null
}

/** 轻微震动反馈，不支持的设备上静默忽略 */
export const haptic = (ms = 8) => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    // ignore
  }
}
