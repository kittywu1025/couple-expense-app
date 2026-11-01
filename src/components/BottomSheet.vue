<script lang="ts">
/**
 * 叠放顺序：后打开的弹窗永远在上面（比如在账单详情上点删除，确认框要盖住详情）。
 * 所有弹窗共用这一个计数器。
 */
let layerSeq = 0
</script>

<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue'

const props = defineProps<{ open: boolean }>()

const emit = defineEmits<{ close: [] }>()

/** 下滑超过这个距离松手就关闭，否则弹回 */
const CLOSE_DISTANCE = 80

const sheet = ref<HTMLDivElement | null>(null)
const offset = ref(0)
const dragging = ref(false)
let startY = 0
let tracking = false
let moved = false

const layer = ref(0)
watch(
  () => props.open,
  (open) => {
    if (open) {
      offset.value = 0
      layer.value = ++layerSeq
    }
  },
  { immediate: true },
)
const zBase = () => 300 + layer.value * 2

const begin = (y: number, target: EventTarget | null) => {
  const el = sheet.value
  if (!el) return
  // 输入框里滑动不算拖拽；内容滚动到中间时也交给滚动
  if (target instanceof HTMLElement && target.closest('input, textarea, select, [data-no-sheet-drag]')) return
  if (el.scrollTop > 0) return
  startY = y
  tracking = true
  moved = false
}

const move = (y: number, e: Event) => {
  if (!tracking) return
  const dy = y - startY
  if (dy <= 0 && !dragging.value) return
  if (!dragging.value && dy < 6) return
  if (!dragging.value) window.getSelection()?.removeAllRanges()
  dragging.value = true
  moved = true
  offset.value = Math.max(0, dy)
  if (e.cancelable) e.preventDefault()
}

const end = () => {
  if (!tracking) return
  tracking = false
  if (!dragging.value) return
  dragging.value = false
  if (offset.value > CLOSE_DISTANCE) {
    emit('close')
  } else {
    offset.value = 0
  }
}

// 拖拽过就吞掉松手时那次 click，避免误点按钮
const swallowClick = (e: MouseEvent) => {
  if (!moved) return
  moved = false
  e.stopPropagation()
  e.preventDefault()
}

const onTouchStart = (e: TouchEvent) => begin(e.touches[0].clientY, e.target)
const onTouchMove = (e: TouchEvent) => move(e.touches[0].clientY, e)
const onMouseDown = (e: MouseEvent) => {
  begin(e.clientY, e.target)
  window.addEventListener('mousemove', onMouseMove)
  window.addEventListener('mouseup', onMouseUp)
}
const onMouseMove = (e: MouseEvent) => move(e.clientY, e)
const onMouseUp = () => {
  end()
  window.removeEventListener('mousemove', onMouseMove)
  window.removeEventListener('mouseup', onMouseUp)
}
onBeforeUnmount(onMouseUp)
</script>

<template>
  <Teleport to="body">
    <transition name="fade">
      <div
        v-if="open"
        class="backdrop"
        :style="{ opacity: 1 - Math.min(offset / 400, 0.6), zIndex: zBase() }"
        @click="emit('close')"
      />
    </transition>
    <transition name="sheet">
      <div
        v-if="open"
        ref="sheet"
        :class="['sheet', { dragging }]"
        role="dialog"
        aria-modal="true"
        :style="{ zIndex: zBase() + 1, ...(offset ? { transform: `translateY(${offset}px)` } : {}) }"
        @touchstart.passive="onTouchStart"
        @touchmove="onTouchMove"
        @touchend="end"
        @touchcancel="end"
        @mousedown="onMouseDown"
        @click.capture="swallowClick"
      >
        <div class="grabber-zone" aria-hidden="true"><div class="grabber" /></div>
        <slot />
      </div>
    </transition>
  </Teleport>
</template>

<style scoped>
.backdrop {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.32);
  z-index: 300;
}
.sheet {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  max-width: 560px;
  margin: 0 auto;
  max-height: 86vh;
  overflow-y: auto;
  overscroll-behavior: contain;
  background: var(--card);
  border-radius: 20px 20px 0 0;
  padding: 0 16px calc(16px + env(safe-area-inset-bottom, 0px));
  z-index: 301;
  transition: transform 0.26s cubic-bezier(0.2, 0.8, 0.2, 1);
}
.sheet.dragging {
  transition: none;
  user-select: none;
  -webkit-user-select: none;
}
.grabber-zone {
  padding: 8px 0 12px;
  cursor: grab;
}
.grabber {
  width: 36px;
  height: 5px;
  border-radius: 999px;
  background: #d1d1d6;
  margin: 0 auto;
}
.fade-enter-active,
.fade-leave-active {
  transition: opacity 0.2s ease;
}
.fade-enter-from,
.fade-leave-to {
  opacity: 0 !important;
}
.sheet-enter-from,
.sheet-leave-to {
  transform: translateY(100%) !important;
}
</style>
