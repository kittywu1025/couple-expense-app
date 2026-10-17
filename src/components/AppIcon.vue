<script setup lang="ts">
import { computed } from 'vue'
import { ICONS, type IconName } from '../utils/icons'

const props = withDefaults(defineProps<{ name: IconName; size?: number; stroke?: number }>(), {
  size: 22,
  stroke: 1.8,
})

const markup = computed(() => ICONS[props.name] ?? ICONS.sparkles)
</script>

<template>
  <!-- 图标内容来自本地常量 ICONS，不包含用户输入 -->
  <svg
    class="app-icon"
    :width="size"
    :height="size"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    :stroke-width="stroke"
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    v-html="markup"
  />
</template>

<style scoped>
.app-icon {
  display: block;
  flex-shrink: 0;
}
</style>
