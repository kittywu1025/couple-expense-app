<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { formatMoney } from '../utils/format'
import { haptic } from '../composables/useUi'

const props = defineProps<{ points: { label: string; value: number; count: number }[] }>()

const H = 120
const PAD_X = 16
const PAD_TOP = 26
const PAD_BOTTOM = 22

const wrap = ref<HTMLDivElement | null>(null)
const width = ref(320)
let observer: ResizeObserver | null = null

onMounted(() => {
  if (!wrap.value) return
  width.value = wrap.value.clientWidth || 320
  observer = new ResizeObserver(([entry]) => (width.value = entry.contentRect.width || 320))
  observer.observe(wrap.value)
})
onBeforeUnmount(() => observer?.disconnect())

const coords = computed(() => {
  const max = Math.max(...props.points.map((p) => p.value), 1)
  const step = (width.value - PAD_X * 2) / Math.max(props.points.length - 1, 1)
  return props.points.map((p, i) => ({
    ...p,
    x: PAD_X + i * step,
    y: PAD_TOP + (1 - p.value / max) * (H - PAD_TOP - PAD_BOTTOM),
  }))
})

// 线性插值：点与点之间直线连接，0 值稳稳落在底线上，不会因为平滑曲线冲到负数区域
const linePath = computed(() => coords.value.map((p, i) => `${i ? 'L' : 'M'}${p.x},${p.y}`).join(' '))

const areaPath = computed(() => {
  const c = coords.value
  if (!c.length) return ''
  const base = H - PAD_BOTTOM
  return `${linePath.value} L${c[c.length - 1].x},${base} L${c[0].x},${base} Z`
})

// ── 滑动选择某一天 ──
const active = ref(props.points.length - 1)
watch(
  () => props.points.length,
  (n) => (active.value = n - 1),
)
const dragging = ref(false)

const pick = (clientX: number) => {
  const el = wrap.value
  if (!el) return
  const x = clientX - el.getBoundingClientRect().left
  let best = 0
  coords.value.forEach((p, i) => {
    if (Math.abs(p.x - x) < Math.abs(coords.value[best].x - x)) best = i
  })
  if (best !== active.value) {
    active.value = best
    haptic(4)
  }
}

const onDown = (e: PointerEvent) => {
  dragging.value = true
  ;(e.currentTarget as Element).setPointerCapture?.(e.pointerId)
  pick(e.clientX)
}
const onMove = (e: PointerEvent) => {
  if (dragging.value) pick(e.clientX)
}
const onUp = () => (dragging.value = false)

const onKey = (e: KeyboardEvent) => {
  if (e.key === 'ArrowLeft') active.value = Math.max(0, active.value - 1)
  if (e.key === 'ArrowRight') active.value = Math.min(props.points.length - 1, active.value + 1)
}

const activePoint = computed(() => coords.value[active.value])
const tipStyle = computed(() => {
  const p = activePoint.value
  if (!p) return {}
  // 让气泡不超出左右边缘
  const half = 60
  const left = Math.min(Math.max(p.x, half), width.value - half)
  return { left: `${left}px` }
})
</script>

<template>
  <div
    ref="wrap"
    :class="['chart-wrap', { dragging }]"
    tabindex="0"
    role="slider"
    aria-label="最近 7 天每日开销，左右滑动查看"
    :aria-valuenow="active"
    :aria-valuetext="activePoint ? `${activePoint.label} ${formatMoney(activePoint.value)}` : ''"
    @pointerdown="onDown"
    @pointermove="onMove"
    @pointerup="onUp"
    @pointercancel="onUp"
    @keydown="onKey"
  >
    <div v-if="activePoint" class="tip" :style="tipStyle">
      <span class="tip-date">{{ activePoint.label }}</span>
      <span class="tip-value">{{ formatMoney(activePoint.value) }}</span>
      <span class="tip-count">{{ activePoint.count }} 笔</span>
    </div>

    <svg :viewBox="`0 0 ${width} ${H}`" :width="width" :height="H" class="chart">
      <defs>
        <linearGradient id="week-fill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#6C63FF" stop-opacity="0.28" />
          <stop offset="100%" stop-color="#6C63FF" stop-opacity="0" />
        </linearGradient>
      </defs>
      <path :d="areaPath" fill="url(#week-fill)" />
      <line
        v-if="activePoint"
        :x1="activePoint.x"
        :x2="activePoint.x"
        :y1="PAD_TOP - 6"
        :y2="H - PAD_BOTTOM"
        class="guide"
      />
      <path :d="linePath" fill="none" stroke="#6C63FF" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />
      <g v-for="(p, i) in coords" :key="i">
        <circle
          :cx="p.x"
          :cy="p.y"
          :r="i === active ? 5 : 3"
          :fill="i === active ? '#6C63FF' : '#fff'"
          :stroke="i === active ? '#fff' : '#6C63FF'"
          :stroke-width="i === active ? 2.5 : 2"
          class="dot"
        />
        <text :x="p.x" :y="H - 5" text-anchor="middle" :class="['label', { on: i === active }]">{{ p.label }}</text>
      </g>
    </svg>
  </div>
</template>

<style scoped>
.chart-wrap {
  position: relative;
  padding-top: 34px;
  touch-action: pan-y;
  user-select: none;
  -webkit-user-select: none;
  cursor: grab;
  outline: none;
}
.chart-wrap.dragging {
  cursor: grabbing;
}
.chart {
  display: block;
  overflow: visible;
}
.tip {
  position: absolute;
  top: 0;
  transform: translateX(-50%);
  display: flex;
  align-items: baseline;
  gap: 6px;
  padding: 4px 10px;
  border-radius: 999px;
  background: #6c63ff;
  color: #fff;
  white-space: nowrap;
  font-size: 12px;
  box-shadow: 0 4px 12px rgba(108, 99, 255, 0.35);
  transition: left 0.12s ease;
  pointer-events: none;
}
.dragging .tip {
  transition: none;
}
.tip-date {
  opacity: 0.85;
}
.tip-value {
  font-family: var(--mono);
  font-weight: 700;
  font-size: 13px;
}
.tip-count {
  opacity: 0.75;
  font-size: 11px;
}
.guide {
  stroke: #6c63ff;
  stroke-opacity: 0.35;
  stroke-width: 1.2;
  stroke-dasharray: 3 3;
}
.dot {
  transition: r 0.12s ease;
}
.label {
  font-size: 10px;
  fill: var(--text-faint);
}
.label.on {
  fill: #6c63ff;
  font-weight: 700;
}
</style>
