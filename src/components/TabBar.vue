<script setup lang="ts">
import type { TabKey } from '../types'

defineProps<{ modelValue: TabKey }>()
defineEmits<{ 'update:modelValue': [TabKey]; add: [] }>()

const tabs: { key: TabKey; label: string; icon: string }[] = [
  { key: 'home', label: '首页', icon: '⌂' },
  { key: 'stats', label: '统计', icon: '◔' },
  { key: 'me', label: '我的', icon: '☺' },
]
</script>

<template>
  <nav class="tabbar">
    <button
      v-for="tab in tabs"
      :key="tab.key"
      :class="['tab', { active: modelValue === tab.key }]"
      @click="$emit('update:modelValue', tab.key)"
    >
      <span class="icon">{{ tab.icon }}</span>
      <span class="label">{{ tab.label }}</span>
    </button>
  </nav>
  <button class="fab" aria-label="记一笔" @click="$emit('add')">＋</button>
</template>

<style scoped>
.tabbar {
  position: fixed;
  left: 0;
  right: 0;
  bottom: 0;
  display: flex;
  justify-content: space-around;
  padding: 6px 0 calc(6px + env(safe-area-inset-bottom, 0px));
  background: rgba(255, 255, 255, 0.94);
  backdrop-filter: blur(16px);
  border-top: 1px solid var(--line);
  z-index: 50;
}
.tab {
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  color: var(--text-faint);
  padding: 4px 0;
}
.tab.active {
  color: var(--primary);
}
.icon {
  font-size: 22px;
  line-height: 1;
}
.label {
  font-size: 11px;
}
.fab {
  position: fixed;
  right: 20px;
  bottom: calc(76px + env(safe-area-inset-bottom, 0px));
  width: 56px;
  height: 56px;
  border-radius: 50%;
  background: var(--primary);
  color: #fff;
  font-size: 30px;
  line-height: 56px;
  box-shadow: 0 10px 24px rgba(108, 99, 255, 0.4);
  z-index: 60;
}
.fab:active {
  transform: scale(0.94);
}
</style>
