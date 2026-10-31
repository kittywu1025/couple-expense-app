import { onBeforeUnmount, ref, watch, type Ref } from 'vue'

const reduceMotion = () =>
  typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches

/**
 * 数字滚动：source 变化时，返回值在 duration 毫秒内平滑过渡过去（ease-out）。
 * 系统开启「减少动态效果」时直接跳到目标值。
 */
export function useTweened(source: Ref<number>, duration = 450) {
  const value = ref(source.value)
  let frame = 0

  watch(source, (to) => {
    cancelAnimationFrame(frame)
    const from = value.value
    if (reduceMotion() || from === to) {
      value.value = to
      return
    }
    const start = performance.now()
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - t) ** 3
      const mid = from + (to - from) * eased
      // 起止都是整数（日元等）时中间值也取整，滚动时不会闪出小数
      value.value = Number.isInteger(from) && Number.isInteger(to) ? Math.round(mid) : mid
      if (t < 1) frame = requestAnimationFrame(step)
      else value.value = to
    }
    frame = requestAnimationFrame(step)
  })

  onBeforeUnmount(() => cancelAnimationFrame(frame))
  return value
}
