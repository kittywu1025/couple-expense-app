<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ points: { label: string; value: number }[] }>()

const W = 300
const H = 96
const PAD_X = 12
const PAD_TOP = 14
const PAD_BOTTOM = 20

const coords = computed(() => {
  const max = Math.max(...props.points.map((p) => p.value), 1)
  const step = (W - PAD_X * 2) / Math.max(props.points.length - 1, 1)
  return props.points.map((p, i) => ({
    ...p,
    x: PAD_X + i * step,
    y: PAD_TOP + (1 - p.value / max) * (H - PAD_TOP - PAD_BOTTOM),
  }))
})

// 平滑曲线（Catmull-Rom 转 Bezier）
const linePath = computed(() => {
  const c = coords.value
  if (!c.length) return ''
  let d = `M${c[0].x},${c[0].y}`
  for (let i = 0; i < c.length - 1; i++) {
    const p0 = c[i - 1] ?? c[i]
    const p1 = c[i]
    const p2 = c[i + 1]
    const p3 = c[i + 2] ?? p2
    const cp1x = p1.x + (p2.x - p0.x) / 6
    const cp1y = p1.y + (p2.y - p0.y) / 6
    const cp2x = p2.x - (p3.x - p1.x) / 6
    const cp2y = p2.y - (p3.y - p1.y) / 6
    d += ` C${cp1x},${cp1y} ${cp2x},${cp2y} ${p2.x},${p2.y}`
  }
  return d
})

const areaPath = computed(() => {
  const c = coords.value
  if (!c.length) return ''
  const base = H - PAD_BOTTOM
  return `${linePath.value} L${c[c.length - 1].x},${base} L${c[0].x},${base} Z`
})
</script>

<template>
  <svg :viewBox="`0 0 ${W} ${H}`" class="chart" preserveAspectRatio="none" role="img" aria-label="最近 7 天每日开销">
    <defs>
      <linearGradient id="week-fill" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stop-color="#6C63FF" stop-opacity="0.28" />
        <stop offset="100%" stop-color="#6C63FF" stop-opacity="0" />
      </linearGradient>
    </defs>
    <path :d="areaPath" fill="url(#week-fill)" />
    <path :d="linePath" fill="none" stroke="#6C63FF" stroke-width="2.5" stroke-linecap="round" />
    <g v-for="(p, i) in coords" :key="i">
      <circle :cx="p.x" :cy="p.y" :r="i === coords.length - 1 ? 4 : 2.5" fill="#fff" stroke="#6C63FF" stroke-width="2" />
      <text :x="p.x" :y="H - 4" text-anchor="middle" class="label">{{ p.label }}</text>
    </g>
  </svg>
</template>

<style scoped>
.chart {
  width: 100%;
  height: 110px;
  display: block;
  overflow: visible;
}
.label {
  font-size: 9px;
  fill: var(--text-faint);
}
</style>
