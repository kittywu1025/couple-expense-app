import { onBeforeUnmount, onMounted, ref, type Ref } from 'vue'

/** 拉过这个距离松手就刷新 */
const TRIGGER = 64
/** 刷新时指示器停留的位置 */
const HOLD = 52
const MAX = 110

/**
 * 下拉刷新：页面在最顶部时往下拉，松手超过阈值就执行 onRefresh。
 * 有弹窗 / 二级页打开时不触发，避免和弹窗的下滑关闭冲突。
 */
export function usePullToRefresh(enabled: Ref<boolean>, onRefresh: () => Promise<unknown>) {
  const distance = ref(0)
  const refreshing = ref(false)
  const pulling = ref(false)
  let startY = 0
  let tracking = false

  const overlayOpen = () => !!document.querySelector('.sheet, .page, .add')

  const onStart = (e: TouchEvent) => {
    if (!enabled.value || refreshing.value || window.scrollY > 0 || overlayOpen()) return
    startY = e.touches[0].clientY
    tracking = true
  }

  const onMove = (e: TouchEvent) => {
    if (!tracking) return
    const dy = e.touches[0].clientY - startY
    if (dy <= 0) {
      distance.value = 0
      pulling.value = false
      return
    }
    if (window.scrollY > 0) {
      tracking = false
      return
    }
    pulling.value = true
    // 越拉越难拉，手感接近原生
    distance.value = Math.min(MAX, dy * 0.5)
    if (e.cancelable) e.preventDefault()
  }

  const onEnd = async () => {
    if (!tracking) return
    tracking = false
    pulling.value = false
    if (distance.value < TRIGGER) {
      distance.value = 0
      return
    }
    refreshing.value = true
    distance.value = HOLD
    navigator.vibrate?.(10)
    const started = Date.now()
    try {
      await onRefresh()
    } finally {
      // 太快结束会一闪而过，至少转半秒
      const wait = Math.max(0, 500 - (Date.now() - started))
      setTimeout(() => {
        refreshing.value = false
        distance.value = 0
      }, wait)
    }
  }

  onMounted(() => {
    window.addEventListener('touchstart', onStart, { passive: true })
    window.addEventListener('touchmove', onMove, { passive: false })
    window.addEventListener('touchend', onEnd)
    window.addEventListener('touchcancel', onEnd)
  })
  onBeforeUnmount(() => {
    window.removeEventListener('touchstart', onStart)
    window.removeEventListener('touchmove', onMove)
    window.removeEventListener('touchend', onEnd)
    window.removeEventListener('touchcancel', onEnd)
  })

  return { distance, refreshing, pulling, ready: () => distance.value >= TRIGGER }
}
