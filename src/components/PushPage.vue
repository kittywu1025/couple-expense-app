<script setup lang="ts">
import AppIcon from './AppIcon.vue'

/** 从右侧推入的全屏二级页：左上返回 + 标题 + 内容 */
defineProps<{ title: string; backLabel?: string }>()
defineEmits<{ back: [] }>()
</script>

<template>
  <div class="page">
    <header class="nav">
      <button class="back" aria-label="返回" @click="$emit('back')">
        <AppIcon name="chevronLeft" :size="22" :stroke="2.2" />{{ backLabel ?? '返回' }}
      </button>
      <h1>{{ title }}</h1>
      <span class="right"><slot name="right" /></span>
    </header>
    <div class="body">
      <slot />
    </div>
  </div>
</template>

<style scoped>
.page {
  position: fixed;
  inset: 0;
  z-index: 90;
  background: var(--bg);
  overflow-y: auto;
}
.nav {
  position: sticky;
  top: 0;
  z-index: 1;
  display: grid;
  grid-template-columns: 80px 1fr 80px;
  align-items: center;
  padding: calc(8px + env(safe-area-inset-top, 0px)) 8px 8px;
  background: rgba(245, 245, 247, 0.9);
  backdrop-filter: blur(16px);
}
.nav h1 {
  margin: 0;
  text-align: center;
  font-size: 17px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.back {
  display: flex;
  align-items: center;
  color: var(--primary);
  font-size: 16px;
  padding: 6px 4px;
}
.right {
  justify-self: end;
}
.body {
  max-width: 560px;
  margin: 0 auto;
  padding: 8px 16px calc(32px + env(safe-area-inset-bottom, 0px));
}
</style>
