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

/** 个人资料详情页（从「我的」顶部卡片进入） */
export const profilePageOpen = ref(false)
export const openProfilePage = () => (profilePageOpen.value = true)
export const closeProfilePage = () => (profilePageOpen.value = false)

/** 固定扣款页（从「我的」进入） */
export const fixedPageOpen = ref(false)
export const openFixedPage = () => (fixedPageOpen.value = true)
export const closeFixedPage = () => (fixedPageOpen.value = false)

/** 收支日历（首页右上角） */
export const calendarPageOpen = ref(false)

/** 关于应用 / 结算算法说明（从「我的」进入） */
export const aboutPageOpen = ref(false)
export const rulesPageOpen = ref(false)

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
