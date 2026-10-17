<script setup lang="ts">
import AppIcon from './AppIcon.vue'
import type { IconName } from '../utils/icons'

withDefaults(defineProps<{ name: IconName; color: string; size?: number; solid?: boolean }>(), {
  size: 40,
  solid: false,
})
</script>

<template>
  <span
    class="cat-icon"
    :style="{
      width: size + 'px',
      height: size + 'px',
      background: solid ? color : color + '24',
      color: solid ? '#fff' : color,
    }"
  >
    <AppIcon :name="name" :size="Math.round(size * 0.5)" :stroke="solid ? 2 : 1.8" />
  </span>
</template>

<style scoped>
.cat-icon {
  border-radius: 50%;
  display: inline-grid;
  place-items: center;
  flex-shrink: 0;
  transition: background 0.2s, color 0.2s;
}
</style>
