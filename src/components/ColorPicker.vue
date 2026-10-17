<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { MemberColor } from '../types'
import { MEMBER_COLORS } from '../utils/palette'

defineProps<{
  modelValue: MemberColor | null
  /** 对方已经在用的颜色，不能选 */
  taken?: MemberColor | null
  takenLabel?: string
}>()
defineEmits<{ 'update:modelValue': [MemberColor]; blocked: [] }>()
</script>

<template>
  <div class="swatches" role="radiogroup" aria-label="标识颜色">
    <button
      v-for="c in MEMBER_COLORS"
      :key="c.key"
      type="button"
      role="radio"
      :aria-checked="modelValue === c.key"
      :aria-label="c.name + (taken === c.key ? `（${takenLabel ?? '对方'}在用）` : '')"
      :class="['swatch', { on: modelValue === c.key, taken: taken === c.key }]"
      :style="{ '--c': c.color }"
      @click="taken === c.key ? $emit('blocked') : $emit('update:modelValue', c.key)"
    >
      <span class="dot">
        <AppIcon v-if="modelValue === c.key" name="check" :size="16" :stroke="3" />
        <small v-else-if="taken === c.key" class="ta">{{ (takenLabel ?? 'TA').slice(0, 1) }}</small>
      </span>
    </button>
  </div>
</template>

<style scoped>
.swatches {
  display: grid;
  grid-template-columns: repeat(8, 1fr);
  gap: 6px;
}
.swatch {
  display: grid;
  place-items: center;
  aspect-ratio: 1;
  border-radius: 50%;
  transition: transform 0.12s;
}
.swatch:active {
  transform: scale(0.9);
}
.dot {
  width: 100%;
  max-width: 34px;
  aspect-ratio: 1;
  border-radius: 50%;
  background: var(--c);
  color: #fff;
  display: grid;
  place-items: center;
  transition: box-shadow 0.15s;
}
.swatch.on .dot {
  box-shadow: 0 0 0 3px #fff, 0 0 0 5px var(--c);
}
.swatch.taken .dot {
  opacity: 0.35;
  background-image: repeating-linear-gradient(45deg, transparent 0 4px, rgba(255, 255, 255, 0.6) 4px 6px);
}
.ta {
  font-size: 11px;
  font-weight: 700;
}
</style>
